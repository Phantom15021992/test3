import {
  allPositions,
  cloneBoard,
  getCell,
  isTile,
  posKey,
  samePos,
  setCell,
  type Board,
  type Cell,
  type ColorId,
  type Position,
} from './board';
import {
  BASE_POINTS_PER_TILE,
  LEVEL2_SCORE_MULTIPLIER,
  LEVEL2_BIG_MATCH_POINTS,
  MATCH_REWARDS,
  LEVEL3_SCORE_MULTIPLIER_BY_MATCH_SIZE,
  MANIPULATOR_FINALE_POINTS,
  MEGA_BOMB_SIZE,
} from './config';
import { applyGravity, refill, removeCells, type Fall, type Spawn } from './gravity';
import { findMatches, type MatchGroup } from './match';
import { swapCells } from './moves';
import type { Rng } from './rng';
import {
  activationSwapTarget,
  comboEffect,
  expandChain,
  hitPoints,
  isCombo,
  squareArea,
  tilesOfColor,
} from './specials';

// Разбор хода целиком: эффект хода → совпадения → удаление → падение → заполнение → …
//
// Это генератор: он отдаёт шаги для анимации по одному. На шаге 'choice' он останавливается,
// и вызывающий передаёт выбор игрока через next(option).
// Сейчас совпадения выбора не требуют, но шаг оставлен — он понадобится, если выбор вернётся.

export type Move =
  /** Обычный ход или комбо двух спецфишек. color — только для мега-бомбы + радуги */
  | { type: 'swap'; from: Position; to: Position; color?: ColorId }
  | { type: 'rainbow'; at: Position; color: ColorId }
  | { type: 'megaBomb'; at: Position }
  | { type: 'manipulator'; at: Position; a: Position; b: Position }
  /** Конец партии: все спецфишки на поле срабатывают на месте */
  | { type: 'finale' };

export type ChoiceOption = 'bomb' | 'rainbow' | 'merge' | 'score';

export interface Placement {
  pos: Position;
  cell: Cell;
}

export type ResolveStep =
  | { kind: 'swap'; a: Position; b: Position }
  /** Клетки заменяются новыми: созданные спецфишки, объединённые ячейки, превращения в комбо */
  | { kind: 'transform'; placements: Placement[] }
  | { kind: 'clear'; cells: Position[]; points: number }
  | { kind: 'drop'; falls: Fall[]; spawns: Spawn[] }
  | { kind: 'choice'; group: MatchGroup; options: readonly [ChoiceOption, ChoiceOption] };

export interface ResolveResult {
  board: Board;
  score: number;
}

export interface ResolveContext {
  colorCount: number;
  rng: Rng;
}

/** Защита от бесконечного цикла при ошибке в логике */
const MAX_WAVES = 1000;

export function* resolveMove(
  board: Board,
  move: Move,
  ctx: ResolveContext,
): Generator<ResolveStep, ResolveResult, ChoiceOption | undefined> {
  let current = board;
  let score = 0;
  // Клетки, куда переместились фишки — там появляются созданные спецфишки (только в первой волне)
  let landing: Position[] = [];

  /** Уничтожает клетки с цепной реакцией; pointsOverride — очки клеток из совпадений */
  function* destroy(
    initial: Position[],
    preActivated?: ReadonlySet<string>,
    pointsOverride?: ReadonlyMap<string, number>,
  ): Generator<ResolveStep, void, ChoiceOption | undefined> {
    const cells = expandChain(current, initial, preActivated);
    if (cells.length === 0) return;
    const points = cells.reduce(
      (sum, pos) => sum + (pointsOverride?.get(posKey(pos)) ?? hitPoints(getCell(current, pos))),
      0,
    );
    score += points;
    current = removeCells(current, cells);
    yield { kind: 'clear', cells, points };
  }

  function* place(placements: Placement[]): Generator<ResolveStep, void, ChoiceOption | undefined> {
    if (placements.length === 0) return;
    current = cloneBoard(current);
    for (const { pos, cell } of placements) setCell(current, pos, cell);
    yield { kind: 'transform', placements };
  }

  // ---------- Эффект самого хода ----------

  switch (move.type) {
    case 'swap': {
      const combo = isCombo(current, move.from, move.to);
      const fireAt = activationSwapTarget(current, move.from, move.to);
      current = swapCells(current, move.from, move.to);
      yield { kind: 'swap', a: move.from, b: move.to };
      if (combo) {
        const effect = comboEffect(current, move.to, move.from, ctx.rng, move.color);
        yield* place(effect.conversions);
        yield* destroy(effect.initial, effect.preActivated);
      } else if (fireAt) {
        // Ракета/бомба срабатывает там, куда её передвинули
        yield* destroy([fireAt]);
      } else {
        landing = [move.to, move.from];
      }
      break;
    }
    case 'rainbow': {
      const initial = [move.at, ...tilesOfColor(current, move.color)];
      yield* destroy(initial, new Set([posKey(move.at)]));
      break;
    }
    case 'megaBomb': {
      yield* destroy(squareArea(current, move.at, MEGA_BOMB_SIZE), new Set([posKey(move.at)]));
      break;
    }
    case 'manipulator': {
      current = removeCells(current, [move.at]);
      yield { kind: 'clear', cells: [move.at], points: 0 };
      current = swapCells(current, move.a, move.b);
      yield { kind: 'swap', a: move.a, b: move.b };
      landing = [move.b, move.a];
      break;
    }
    case 'finale': {
      yield* destroy(...finaleBlast(current, ctx.rng));
      break;
    }
  }

  // ---------- Каскады ----------

  for (let wave = 0; wave < MAX_WAVES; wave++) {
    const groups = findMatches(current);
    if (groups.length === 0) {
      if (!hasEmpty(current)) return { board: current, score };
    } else {
      const removal: Position[] = [];
      const placements: Placement[] = [];
      const points = new Map<string, number>();

      for (const group of groups) {
        const outcome = groupOutcome(group, pickSpot(group, landing));
        removal.push(...group.cells);
        spreadPoints(group.cells, outcome.points, points);
        placements.push(...outcome.placements);
      }

      yield* destroy(removal, undefined, points);
      yield* place(placements);
    }

    landing = [];
    const fallen = applyGravity(current);
    const filled = refill(fallen.board, ctx.colorCount, ctx.rng);
    current = filled.board;
    yield { kind: 'drop', falls: fallen.falls, spawns: filled.spawns };
  }

  throw new Error(`Каскад не завершился за ${MAX_WAVES} волн`);
}

function hasEmpty(board: Board): boolean {
  return board.some((line) => line.includes(null));
}

interface GroupOutcome {
  /** Очки за всю группу */
  points: number;
  placements: Placement[];
}

// Совпадение сразу превращается в награду из MATCH_REWARDS (объединённые ячейки или спецфишки),
// и вся группа приносит очки. Вторая награда, если их две, встаёт в соседнюю клетку группы.
function groupOutcome(group: MatchGroup, spot: Position): GroupOutcome {
  const size = Math.min(group.cells.length, 5) as 3 | 4 | 5;
  const reward = MATCH_REWARDS[group.level][size];
  const cells = reward.count === 2 ? [spot, neighborInGroup(group, spot)] : [spot];
  const cell: Cell =
    reward.kind === 'tiles'
      ? { kind: 'tile', color: group.color, level: reward.level }
      : { kind: 'piece', type: reward.type };
  return { points: groupPoints(group, size), placements: cells.map((pos) => ({ pos, cell })) };
}

function groupPoints(group: MatchGroup, size: 3 | 4 | 5): number {
  const cells = group.cells.length;
  if (group.level === 1) return cells * BASE_POINTS_PER_TILE;
  if (group.level === 2) {
    return size === 5
      ? LEVEL2_BIG_MATCH_POINTS
      : cells * BASE_POINTS_PER_TILE * LEVEL2_SCORE_MULTIPLIER;
  }
  return cells * BASE_POINTS_PER_TILE * LEVEL3_SCORE_MULTIPLIER_BY_MATCH_SIZE[size];
}

/** Делит очки группы по клеткам (остаток — первой клетке), чтобы сумма совпала точно */
function spreadPoints(cells: Position[], total: number, into: Map<string, number>): void {
  const share = Math.floor(total / cells.length);
  cells.forEach((pos, i) => {
    into.set(posKey(pos), share + (i === 0 ? total - share * cells.length : 0));
  });
}

/**
 * Финальный взрыв: ракеты, бомбы и мега-бомбы срабатывают как обычно, радуга убирает
 * случайный цвет из тех, что есть на поле, манипулятор просто исчезает и даёт очки.
 * Возвращает аргументы для destroy: стартовые клетки, уже сработавшие, очки-исключения.
 */
function finaleBlast(
  board: Board,
  rng: Rng,
): [Position[], ReadonlySet<string>, ReadonlyMap<string, number>] {
  const initial: Position[] = [];
  const preActivated = new Set<string>();
  const points = new Map<string, number>();
  const colors = [...new Set(board.flat().flatMap((cell) => (isTile(cell) ? [cell.color] : [])))];

  for (const pos of allPositions(board)) {
    const cell = getCell(board, pos);
    if (cell?.kind !== 'piece') continue;
    initial.push(pos);
    if (cell.type === 'rainbow') {
      preActivated.add(posKey(pos));
      const color = colors[rng.int(colors.length)];
      if (color !== undefined) initial.push(...tilesOfColor(board, color));
    } else if (cell.type === 'manipulator') {
      preActivated.add(posKey(pos));
      points.set(posKey(pos), MANIPULATOR_FINALE_POINTS);
    }
  }
  return [initial, preActivated, points];
}

/**
 * Где появится созданная фишка: на месте сдвинутой фишки, если она в группе;
 * иначе (каскад) — в середине линии или на пересечении у L/T.
 */
export function pickSpot(group: MatchGroup, landing: Position[]): Position {
  const landed = landing.find((pos) => group.cells.some((c) => samePos(c, pos)));
  if (landed) return landed;

  const sorted = [...group.cells].sort((a, b) => a.row - b.row || a.col - b.col);
  const sameRow = sorted.every((p) => p.row === sorted[0]!.row);
  const sameCol = sorted.every((p) => p.col === sorted[0]!.col);
  if (sameRow || sameCol) return sorted[Math.floor((sorted.length - 1) / 2)]!;

  const has = (row: number, col: number) => sorted.some((p) => p.row === row && p.col === col);
  const crossing = sorted.find(
    (p) =>
      (has(p.row, p.col - 1) || has(p.row, p.col + 1)) &&
      (has(p.row - 1, p.col) || has(p.row + 1, p.col)),
  );
  return crossing ?? sorted[0]!;
}

/** Соседняя со spot клетка группы — для второй объединённой ячейки */
function neighborInGroup(group: MatchGroup, spot: Position): Position {
  const offsets = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const;
  for (const [dr, dc] of offsets) {
    const pos = { row: spot.row + dr, col: spot.col + dc };
    if (group.cells.some((c) => samePos(c, pos))) return pos;
  }
  return group.cells.find((c) => !samePos(c, spot))!;
}

/** Прогоняет ход до конца, отвечая на выборы по порядку (для тестов и автоигры) */
export function runMove(
  board: Board,
  move: Move,
  ctx: ResolveContext,
  answers: ChoiceOption[] = [],
): ResolveResult & { steps: ResolveStep[] } {
  const steps: ResolveStep[] = [];
  const gen = resolveMove(board, move, ctx);
  let answerIndex = 0;
  let next = gen.next();
  while (!next.done) {
    steps.push(next.value);
    next = gen.next(next.value.kind === 'choice' ? answers[answerIndex++] : undefined);
  }
  return { ...next.value, steps };
}
