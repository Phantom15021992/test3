// Боты для оценки сложности уровней (npm run levels и npm run levels:tune).
//
// Новичок ходит случайно — это нижняя граница. Опытный на каждом ходу пробует доступные ходы
// и выбирает самый полезный для целей уровня; будущие фишки он не подглядывает (оценка идёт на
// отдельном ГСЧ), но и наперёд не планирует, поэтому внимательный человек играет не хуже него.

import { allPositions, getCell, posKey, type Board, type Position } from '../src/core/board';
import { BONUS_TIERS } from '../src/core/config';
import type { Level } from '../src/core/level';
import { LevelSession } from '../src/core/levelSession';
import { findPossibleMoves } from '../src/core/moves';
import { runMove, type ResolveStep } from '../src/core/resolve';
import { createRng, type Rng } from '../src/core/rng';
import type { PlayerMove } from '../src/core/session';
import { comboNeedsColor, mostFrequentColor } from '../src/core/specials';

export type Bot = 'novice' | 'expert' | 'buyer';

export const BOTS: readonly Bot[] = ['novice', 'expert', 'buyer'];
/** Сколько ходов оценивать за раз: перебор всех на поле 10×10 слишком долгий */
const MAX_CANDIDATES = 40;

export interface GameResult {
  won: boolean;
  /** Сколько ходов ушло на цели; при поражении — весь лимит */
  movesUsed: number;
  /** По каждой цели: на каком ходу достигнуто 1, 2, 3… её единиц */
  reached: number[][];
  stars: number;
  movesLeft: number;
  /** Какая доля целей выполнена: показывает, насколько близко было поражение */
  done: number;
}

function candidates(session: LevelSession): PlayerMove[] {
  const { board } = session;
  const color = mostFrequentColor(board) ?? 0;
  const moves: PlayerMove[] = findPossibleMoves(board).map(({ from, to }) =>
    comboNeedsColor(board, from, to)
      ? { type: 'swap', from, to, color }
      : { type: 'swap', from, to },
  );
  for (const at of allPositions(board)) {
    const cell = getCell(board, at);
    if (cell?.kind !== 'piece') continue;
    if (cell.type === 'rocket' || cell.type === 'bomb' || cell.type === 'megaBomb') {
      moves.push({ type: 'fire', at });
    }
    if (cell.type === 'rainbow') moves.push({ type: 'rainbow', at, color });
  }
  return moves;
}

function itemRows(board: Board): number {
  return allPositions(board)
    .filter((pos) => getCell(board, pos)?.kind === 'item')
    .reduce((sum: number, pos: Position) => sum + pos.row, 0);
}

/** Насколько ход приближает к целям; очки — лишь слабая подсказка при равенстве */
function moveValue(session: LevelSession, move: PlayerMove, rng: Rng): number {
  const { board, steps } = runMove(session.board, move, {
    colorCount: session.level.colors,
    rng,
  });
  const need = (kind: string) =>
    session.level.goals.some((goal) => goal.kind === kind && session.goalValue(goal) < goal.count);
  // Камни бьются только взрывом, а взрывы дают объединения высоких уровней
  const wantsHighLevels = need('level3') || need('megaBomb') || need('rainbow') || need('stone');
  const iced = new Set<string>();
  let value = (itemRows(board) - itemRows(session.board)) * 40;

  const scoreStep = (step: ResolveStep) => {
    if (step.kind === 'clear') {
      value += step.points * 0.05 + (step.items ?? 0) * 800;
      value += (step.stones ?? 0) * (need('stone') ? 120 : 15);
      value += (step.boxes ?? 0) * (need('box') ? 70 : 5);
      value += (step.links?.length ?? 0) * (need('chain') ? 70 : 5);
      for (const pos of step.cells) {
        if (session.ice[pos.row]?.[pos.col] && !iced.has(posKey(pos))) {
          iced.add(posKey(pos));
          value += need('ice') ? 60 : 0;
        }
      }
    }
    if (step.kind !== 'transform') return;
    for (const { cell } of step.placements) {
      if (cell?.kind === 'tile' && cell.level === 2) {
        value += need('level2') ? 70 : wantsHighLevels ? 20 : 2;
      }
      if (cell?.kind === 'tile' && cell.level === 3) value += wantsHighLevels ? 90 : 4;
      if (cell?.kind === 'piece' && cell.type === 'megaBomb') value += need('megaBomb') ? 400 : 50;
      if (cell?.kind === 'piece' && cell.type === 'rainbow') value += need('rainbow') ? 400 : 50;
    }
  };
  steps.forEach(scoreStep);
  return value;
}

function pickMove(session: LevelSession, bot: Bot, rng: Rng): PlayerMove | null {
  const moves = candidates(session);
  if (moves.length === 0) return null;
  if (bot === 'novice') return moves[rng.int(moves.length)]!;
  // Перемешиваем, чтобы отбор не предпочитал верх поля
  for (let i = moves.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [moves[i], moves[j]] = [moves[j]!, moves[i]!];
  }
  // Ходы рядом с короной перебираем первыми: иначе отбор мог бы выбросить как раз их
  const crowns = allPositions(session.board).filter(
    (pos) => getCell(session.board, pos)?.kind === 'item',
  );
  const nearCrown = (move: PlayerMove) =>
    move.type === 'swap' &&
    crowns.some((pos) => Math.abs(pos.col - move.from.col) + Math.abs(pos.col - move.to.col) <= 2);
  moves.sort((x, y) => Number(nearCrown(y)) - Number(nearCrown(x)));
  let best = moves[0]!;
  let bestValue = -Infinity;
  for (const move of moves.slice(0, MAX_CANDIDATES)) {
    const value = moveValue(session, move, createRng(rng.int(2 ** 31)));
    if (value > bestValue) {
      bestValue = value;
      best = move;
    }
  }
  return best;
}

/** Тратит звёзды сразу на самое дорогое, что может применить */
function buyBest(session: LevelSession): void {
  const affordable = BONUS_TIERS.filter(
    (tier) => tier.type !== 'manipulator' && tier.stars <= session.starsLeft,
  );
  const tier = affordable[affordable.length - 1];
  if (tier && session.buy(tier.type)) session.shuffleIfStuck();
}

function finish(steps: Generator<ResolveStep, void, undefined>): void {
  let next = steps.next();
  while (!next.done) next = steps.next();
}

export function play(level: Level, seed: number, bot: Bot, wallet = 0): GameResult {
  const session = new LevelSession(seed, level, wallet);
  const rng = createRng(seed ^ 0x5bd1e995);
  const reached = level.goals.map((): number[] => []);
  while (!session.isOver) {
    if (bot === 'buyer') buyBest(session);
    const move = pickMove(session, bot, rng);
    if (!move) break;
    finish(session.play(move));
    session.shuffleIfStuck();
    level.goals.forEach((goal, i) => {
      const line = reached[i]!;
      while (line.length < Math.min(session.progress[goal.kind], goal.count)) {
        line.push(session.moves);
      }
    });
  }
  const shares = level.goals.map((goal) => session.goalValue(goal) / goal.count);
  return {
    won: session.goalsDone,
    movesUsed: session.moves,
    reached,
    stars: session.stars,
    movesLeft: session.goalsDone ? session.movesLeft : 0,
    done: shares.reduce((sum, share) => sum + share, 0) / shares.length,
  };
}
