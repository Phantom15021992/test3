// Боты для оценки сложности уровней (npm run levels и npm run levels:tune).
//
// Новичок ходит случайно — это нижняя граница. Опытный на каждом ходу пробует доступные ходы
// и выбирает самый полезный для целей уровня; будущие фишки он не подглядывает (оценка идёт на
// отдельном ГСЧ), но и наперёд не планирует, поэтому внимательный человек играет не хуже него.

import {
  allPositions,
  cloneBoard,
  getCell,
  isTile,
  posKey,
  setCell,
  type Board,
  type ColorId,
  type Position,
} from '../src/core/board';
import { aimedPiece, isBonusTarget, type AimedBonus } from '../src/core/bonus';
import type { Level, StarTaskKind } from '../src/core/level';
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
/** Сколько клеток примерять для покупной бомбы */
const MAX_AIM_CELLS = 30;
/** Ценность хода, который продвигает цель: всё ниже — только очки и объединения */
const GOAL_PROGRESS = 50;
/** Наперёд на два хода бот думает, когда препятствий цели осталось не больше стольких */
const LOOKAHEAD_TARGETS = 3;
const LOOKAHEAD_MOVES = 10;

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
  /** После каждого хода: очки и счётчики задач на звёзды — по ним подгоняются условия звёзд */
  track: { score: number[]; level2: number[]; level3: number[]; item: number[] };
  /** Сколько спецфишек куплено */
  bought: number;
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
function moveValue(
  session: LevelSession,
  move: PlayerMove,
  rng: Rng,
  start: Board = session.board,
): number {
  const { board, steps } = runMove(start, move, {
    colorCount: session.level.colors,
    rng,
    campaign: true,
  });
  const need = (kind: string) =>
    session.level.goals.some((goal) => goal.kind === kind && session.goalValue(goal) < goal.count);
  // Цели выполнены — уровень идёт до конца ходов, и бот добирает задачи на звёзды
  const star = (kind: StarTaskKind) =>
    session.goalsDone &&
    session.level.stars.some(
      (task) => task.kind === kind && session.starTaskValue(task) < task.count,
    );
  // Камни бьются только взрывом, а взрывы дают объединения высоких уровней
  const wantsHighLevels =
    need('level3') || need('megaBomb') || need('rainbow') || need('stone') || star('level3');
  const iced = new Set<string>();
  let value = (itemRows(board) - itemRows(session.board)) * 40;

  const scoreStep = (step: ResolveStep) => {
    if (step.kind === 'clear') {
      value += step.points * (star('score') ? 0.5 : 0.05) + (step.items ?? 0) * 800;
      value += (step.stones ?? 0) * (need('stone') ? 120 : 15);
      value += (step.boxes ?? 0) * (need('box') ? 70 : 5);
      value += (step.links?.length ?? 0) * (need('chain') ? 70 : 5);
      // Удар по углю: слой снят; разбитая глыба — цель
      for (const hit of step.coal ?? []) value += need('coal') ? (hit.layers === 0 ? 400 : 70) : 5;
      for (const pos of step.cells) {
        const hits = session.ice[pos.row]?.[pos.col] ?? 0;
        if (hits > 0 && !iced.has(posKey(pos))) {
          iced.add(posKey(pos));
          // Последний удар ломает льдину — он ценнее, чем снятый слой
          const gold = session.iceStyle[pos.row]?.[pos.col] === 'gold';
          const worth = (need('ice') ? 60 : 0) + (need('gold') && gold ? 80 : 0);
          value += hits === 1 ? worth : worth / 2;
        }
      }
    }
    if (step.kind !== 'transform') return;
    for (const { cell } of step.placements) {
      if (cell?.kind === 'tile' && cell.level === 2) {
        value += need('level2') || star('level2') ? 70 : wantsHighLevels ? 20 : 2;
      }
      if (cell?.kind === 'tile' && cell.level === 3) value += wantsHighLevels ? 90 : 4;
      if (cell?.kind === 'piece' && cell.type === 'megaBomb') value += need('megaBomb') ? 400 : 50;
      if (cell?.kind === 'piece' && cell.type === 'rainbow') value += need('rainbow') ? 400 : 50;
    }
  };
  steps.forEach(scoreStep);
  return value;
}

/** Клетки препятствий, которые ещё нужны целям уровня */
function goalTargets(session: LevelSession): Position[] {
  const need = (kind: string) =>
    session.level.goals.some((goal) => goal.kind === kind && session.goalValue(goal) < goal.count);
  return allPositions(session.board).filter((pos) => {
    const cell = getCell(session.board, pos);
    return (
      (need('ice') && (session.ice[pos.row]?.[pos.col] ?? 0) > 0) ||
      (need('gold') &&
        (session.ice[pos.row]?.[pos.col] ?? 0) > 0 &&
        session.iceStyle[pos.row]?.[pos.col] === 'gold') ||
      (need('chain') && cell?.kind === 'tile' && (cell.chain ?? 0) > 0) ||
      (need('box') && cell?.kind === 'box') ||
      (need('stone') && cell?.kind === 'stone') ||
      (need('coal') && cell?.kind === 'coal')
    );
  });
}

function shuffled<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

interface Pick {
  move: PlayerMove;
  value: number;
}

export function pickMove(session: LevelSession, bot: Bot, rng: Rng): Pick | null {
  const moves = candidates(session);
  if (moves.length === 0) return null;
  if (bot === 'novice') return { move: moves[rng.int(moves.length)]!, value: 0 };
  // Перемешиваем, чтобы отбор не предпочитал верх поля
  shuffled(moves, rng);
  // Ходы рядом с короной и с оставшимися препятствиями цели перебираем первыми: иначе отбор мог
  // выбросить как раз их, и последняя цепь в углу ждала бы десятки ходов, а человек бьёт в неё сразу
  const crowns = allPositions(session.board).filter(
    (pos) => getCell(session.board, pos)?.kind === 'item',
  );
  const targets = goalTargets(session);
  const distance = (move: PlayerMove) => {
    if (move.type !== 'swap') return Infinity;
    const { from, to } = move;
    if (crowns.some((pos) => Math.abs(pos.col - from.col) + Math.abs(pos.col - to.col) <= 2)) {
      return 0;
    }
    return Math.min(
      ...targets.map((pos) =>
        Math.min(
          Math.abs(pos.row - from.row) + Math.abs(pos.col - from.col),
          Math.abs(pos.row - to.row) + Math.abs(pos.col - to.col),
        ),
      ),
    );
  };
  const order = new Map(moves.map((move) => [move, distance(move)]));
  moves.sort((x, y) => order.get(x)! - order.get(y)!);
  let best = moves[0]!;
  let bestValue = -Infinity;
  for (const move of moves.slice(0, MAX_CANDIDATES)) {
    const value = moveValue(session, move, createRng(rng.int(2 ** 31)));
    if (value > bestValue) {
      bestValue = value;
      best = move;
    }
  }
  // Ни один ход не продвигает цель, а препятствий осталось мало (последняя цепь в углу): человек
  // готовит её за два хода. Ходы рядом с препятствиями примеряются вместе с лучшим следующим
  if (bestValue < GOAL_PROGRESS && targets.length > 0 && targets.length <= LOOKAHEAD_TARGETS) {
    for (const move of moves.slice(0, LOOKAHEAD_MOVES)) {
      const value = lookahead(session, move, targets, createRng(rng.int(2 ** 31)));
      if (value > bestValue) {
        bestValue = value;
        best = move;
      }
    }
  }
  return { move: best, value: bestValue };
}

/** Ход и лучший за ним ход рядом с препятствиями цели; второй ход — со скидкой, он ещё не сделан */
function lookahead(session: LevelSession, move: PlayerMove, targets: Position[], rng: Rng): number {
  const first = runMove(session.board, move, {
    colorCount: session.level.colors,
    rng,
    campaign: true,
  });
  const near = (pos: Position) =>
    targets.some((target) => Math.abs(target.row - pos.row) + Math.abs(target.col - pos.col) <= 1);
  let next = 0;
  for (const { from, to } of findPossibleMoves(first.board)) {
    if (!near(from) && !near(to)) continue;
    const swap: PlayerMove = { type: 'swap', from, to };
    next = Math.max(next, moveValue(session, swap, rng, first.board));
  }
  return moveValue(session, move, rng) + next * 0.5;
}

type Purchase =
  | { kind: 'aim'; bonus: AimedBonus; at: Position; value: number }
  | { kind: 'rainbow'; color: ColorId; value: number };

/** Ценность бомбы или ракеты в клетке: примеряется на копии поля */
function aimValue(session: LevelSession, bonus: AimedBonus, at: Position, rng: Rng): number {
  const board = cloneBoard(session.board);
  setCell(board, at, aimedPiece(bonus));
  return moveValue(session, { type: 'fire', at }, createRng(rng.int(2 ** 31)), board);
}

/** Самая полезная покупка, которая по карману; манипулятор бот не применяет */
function bestPurchase(session: LevelSession, rng: Rng, onlyBombs = false): Purchase | null {
  const { board } = session;
  const cells = shuffled(
    allPositions(board).filter((pos) => isBonusTarget(board, pos)),
    rng,
  );
  const options: Purchase[] = [];
  const aim = (bonus: AimedBonus, at: Position) => {
    options.push({ kind: 'aim', bonus, at, value: aimValue(session, bonus, at, rng) });
  };
  if (session.canBuy('bomb')) {
    cells.slice(0, MAX_AIM_CELLS).forEach((at) => aim('bomb', at));
  }
  if (!onlyBombs && session.canBuy('rocket')) {
    // Ракета бьёт по всей строке: достаточно одной клетки в каждой
    const rows = new Set(cells.map((pos) => pos.row));
    rows.forEach((row) =>
      aim(
        'rocket',
        cells.find((pos) => pos.row === row)!,
      ),
    );
  }
  if (!onlyBombs && session.canBuy('rainbow')) {
    const colors = new Set(
      allPositions(board).flatMap((pos) => {
        const cell = getCell(board, pos);
        return isTile(cell) ? [cell.color] : [];
      }),
    );
    colors.forEach((color) => {
      const move: PlayerMove = { type: 'boughtRainbow', color };
      const value = moveValue(session, move, createRng(rng.int(2 ** 31)));
      options.push({ kind: 'rainbow', color, value });
    });
  }
  return options.reduce<Purchase | null>(
    (best, option) => (!best || option.value > best.value ? option : best),
    null,
  );
}

function applyPurchase(session: LevelSession, purchase: Purchase): PlayerMove | null {
  if (purchase.kind === 'rainbow') {
    return session.payBonus('rainbow') ? { type: 'boughtRainbow', color: purchase.color } : null;
  }
  return session.aimBonus(purchase.bonus, purchase.at) ? { type: 'fire', at: purchase.at } : null;
}

function finish(steps: Generator<ResolveStep, void, undefined>): void {
  let next = steps.next();
  while (!next.done) next = steps.next();
}

/**
 * bombs — замер «сколько бомб нужно»: опытный бот покупает только бомбы, не больше стольких
 * (лимит правил снят), звёзд без ограничения
 */
export function play(level: Level, seed: number, bot: Bot, wallet = 0, bombs?: number): GameResult {
  const session =
    bombs === undefined
      ? new LevelSession(seed, level, wallet)
      : new LevelSession(seed, level, 1000, { bomb: bombs, rocket: 0, manipulator: 0, rainbow: 0 });
  const rng = createRng(seed ^ 0x5bd1e995);
  const reached = level.goals.map((): number[] => []);
  const track: GameResult['track'] = { score: [], level2: [], level3: [], item: [] };
  let bought = 0;
  while (!session.isOver) {
    const pick = pickMove(session, bot, rng);
    // Покупка и есть ход, поэтому бот берёт её, когда она полезнее лучшего обычного хода
    const purchase =
      bot === 'buyer' || bombs !== undefined
        ? bestPurchase(session, rng, bombs !== undefined)
        : null;
    const purchased =
      purchase && purchase.value > (pick?.value ?? -Infinity)
        ? applyPurchase(session, purchase)
        : null;
    if (purchased) bought++;
    const move = purchased ?? pick?.move;
    if (!move) break;
    finish(session.play(move));
    session.shuffleIfStuck();
    track.score.push(session.score);
    track.level2.push(session.progress.level2);
    track.level3.push(session.progress.level3);
    track.item.push(session.progress.item);
    level.goals.forEach((goal, i) => {
      const line = reached[i]!;
      while (line.length < Math.min(session.progress[goal.kind], goal.count)) {
        line.push(session.moves);
      }
    });
  }
  // Уровень кончился — спецфишки на поле срабатывают в финале, итог считается после него, как в игре
  finish(session.campaignFinale());
  const shares = level.goals.map((goal) => session.goalValue(goal) / goal.count);
  return {
    won: session.goalsDone,
    movesUsed: session.moves,
    reached,
    stars: session.stars,
    movesLeft: session.goalsDone ? session.movesLeft : 0,
    done: shares.reduce((sum, share) => sum + share, 0) / shares.length,
    track,
    bought,
  };
}
