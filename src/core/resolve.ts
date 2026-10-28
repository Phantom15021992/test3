import {
  cloneBoard,
  getCell,
  posKey,
  samePos,
  setCell,
  type Board,
  type Cell,
  type ColorId,
  type Position,
  type Tile,
} from './board';
import {
  BASE_POINTS_PER_TILE,
  LEVEL2_SCORE_MULTIPLIER,
  LEVEL3_SCORE_MULTIPLIER_BY_MATCH_SIZE,
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

export type Move =
  /** Обычный ход или комбо двух спецфишек. color — только для мега-бомбы + радуги */
  | { type: 'swap'; from: Position; to: Position; color?: ColorId }
  | { type: 'rainbow'; at: Position; color: ColorId }
  | { type: 'megaBomb'; at: Position }
  | { type: 'manipulator'; at: Position; a: Position; b: Position };

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
        const spot = pickSpot(group, landing);
        const options = choiceOptions(group);
        let option: ChoiceOption | undefined;
        if (options) {
          const answer = yield { kind: 'choice', group, options };
          option = answer && options.includes(answer) ? answer : options[0];
        }
        const outcome = groupOutcome(group, spot, option);
        removal.push(...group.cells);
        for (const pos of group.cells) points.set(posKey(pos), outcome.pointsPerCell);
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

/** Какой выбор нужен игроку для группы, или null — если результат однозначен */
function choiceOptions(group: MatchGroup): readonly [ChoiceOption, ChoiceOption] | null {
  if (group.level === 1) {
    if (group.shape === 'lt') return ['bomb', 'merge'];
    if (group.shape === 'line5') return ['rainbow', 'merge'];
    return null;
  }
  return group.level === 2 ? ['score', 'merge'] : null;
}

interface GroupOutcome {
  pointsPerCell: number;
  placements: Placement[];
}

function groupOutcome(group: MatchGroup, spot: Position, option?: ChoiceOption): GroupOutcome {
  const color = group.color;
  const tile = (level: Tile['level']): Tile => ({ kind: 'tile', color, level });
  const at = (cell: Cell): Placement[] => [{ pos: spot, cell }];
  const merged = (level: Tile['level'], count: number): Placement[] => {
    const cells = [spot];
    if (count === 2) cells.push(neighborInGroup(group, spot));
    return cells.map((pos) => ({ pos, cell: tile(level) }));
  };

  if (group.level === 1) {
    const base = BASE_POINTS_PER_TILE;
    if (option === 'merge') return { pointsPerCell: 0, placements: merged(2, 2) };
    switch (group.shape) {
      case 'line3':
        return { pointsPerCell: base, placements: [] };
      case 'line4':
        return {
          pointsPerCell: base,
          placements: at({ kind: 'piece', type: 'rocket', direction: lineDirection(group) }),
        };
      case 'square':
        return { pointsPerCell: base, placements: at({ kind: 'piece', type: 'manipulator' }) };
      case 'lt':
        return { pointsPerCell: base, placements: at({ kind: 'piece', type: 'bomb' }) };
      case 'line5':
        return { pointsPerCell: base, placements: at({ kind: 'piece', type: 'rainbow' }) };
    }
  }

  if (group.level === 2) {
    if (option === 'merge')
      return { pointsPerCell: 0, placements: merged(3, group.size === 5 ? 2 : 1) };
    return { pointsPerCell: BASE_POINTS_PER_TILE * LEVEL2_SCORE_MULTIPLIER, placements: [] };
  }

  const pointsPerCell = BASE_POINTS_PER_TILE * LEVEL3_SCORE_MULTIPLIER_BY_MATCH_SIZE[group.size];
  if (group.size === 4)
    return { pointsPerCell, placements: at({ kind: 'piece', type: 'megaBomb' }) };
  if (group.size === 5)
    return { pointsPerCell, placements: at({ kind: 'piece', type: 'rainbow' }) };
  return { pointsPerCell, placements: [] };
}

function lineDirection(group: MatchGroup): 'row' | 'col' {
  const row = group.cells[0]!.row;
  return group.cells.every((p) => p.row === row) ? 'row' : 'col';
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
