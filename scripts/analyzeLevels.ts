// Анализ сложности уровней: боты играют каждый уровень много раз.
// Запуск: npm run levels [-- <партий на уровень> [номер уровня]]
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
import { CHAPTER_ONE } from '../src/levels';

// Скрипт запускается в Node (vite-node), а типов Node в проекте нет
declare const process: { argv: string[] };

type Bot = 'novice' | 'expert' | 'buyer';

const BOTS: readonly Bot[] = ['novice', 'expert', 'buyer'];
/** Сколько ходов оценивать за раз: перебор всех на поле 10×10 слишком долгий */
const MAX_CANDIDATES = 40;

interface GameResult {
  won: boolean;
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
  const wantsHighLevels = need('level3') || need('megaBomb') || need('rainbow');
  const iced = new Set<string>();
  let value = (itemRows(board) - itemRows(session.board)) * 40;

  const scoreStep = (step: ResolveStep) => {
    if (step.kind === 'clear') {
      value += step.points * 0.05 + (step.stones ?? 0) * 70 + (step.items ?? 0) * 800;
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

function buyBest(session: LevelSession): void {
  const affordable = BONUS_TIERS.filter(
    (tier) => tier.type !== 'manipulator' && tier.cost <= session.score,
  );
  const tier = affordable[affordable.length - 1];
  if (tier && session.buy(tier.type)) session.shuffleIfStuck();
}

function finish(steps: Generator<ResolveStep, void, undefined>): void {
  let next = steps.next();
  while (!next.done) next = steps.next();
}

function play(level: Level, seed: number, bot: Bot): GameResult {
  const session = new LevelSession(seed, level);
  const rng = createRng(seed ^ 0x5bd1e995);
  while (!session.isOver) {
    if (bot === 'buyer') buyBest(session);
    const move = pickMove(session, bot, rng);
    if (!move) break;
    finish(session.play(move));
    session.shuffleIfStuck();
  }
  const shares = level.goals.map((goal) => session.goalValue(goal) / goal.count);
  return {
    won: session.goalsDone,
    stars: session.stars,
    movesLeft: session.goalsDone ? session.movesLeft : 0,
    done: shares.reduce((sum, share) => sum + share, 0) / shares.length,
  };
}

const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;
const average = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;

const games = Number(process.argv[2]) || 40;
const only = Number(process.argv[3]);

console.log(`Партий на уровень и бота: ${games}\n`);
console.log(
  'ур | ходов | новичок | опытный | с покупками | запас опытн. | запас покуп. | ★★★ | цели проигр.',
);
for (const level of CHAPTER_ONE) {
  if (only && level.id !== only) continue;
  const results = BOTS.map((bot) =>
    Array.from({ length: games }, (_, i) => play(level, 1000 * level.id + i + 1, bot)),
  );
  const [novice, expert, buyer] = results as [GameResult[], GameResult[], GameResult[]];
  const wins = (list: GameResult[]) => list.filter((game) => game.won).length;
  const wonExpert = expert.filter((game) => game.won);
  const lostExpert = expert.filter((game) => !game.won);
  console.log(
    [
      String(level.id).padStart(2),
      String(level.moves).padStart(5),
      percent(wins(novice), games).padStart(7),
      percent(wins(expert), games).padStart(7),
      percent(wins(buyer), games).padStart(11),
      average(wonExpert.map((game) => game.movesLeft))
        .toFixed(1)
        .padStart(12),
      average(buyer.filter((game) => game.won).map((game) => game.movesLeft))
        .toFixed(1)
        .padStart(12),
      percent(expert.filter((game) => game.stars === 3).length, games).padStart(3),
      lostExpert.length > 0 ? percent(average(lostExpert.map((game) => game.done)), 1) : '—',
    ].join(' | '),
  );
}
