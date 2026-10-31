import {
  allPositions,
  getCell,
  isChained,
  isPiece,
  isTile,
  posKey,
  type Board,
  type Cell,
  type ColorId,
  type Piece,
  type Position,
} from './board';
import {
  BASE_POINTS_PER_TILE,
  BOMB_BOMB_SIZE,
  BOMB_SIZE,
  LEVEL2_SCORE_MULTIPLIER,
  LEVEL3_HIT_MULTIPLIER,
  MEGA_BOMB_BOMB_SIZE,
  MEGA_BOMB_ROCKET_WIDTH,
  MEGA_BOMB_SIZE,
  ROCKET_BOMB_WIDTH,
} from './config';
import type { Rng } from './rng';

// Действие спецфишек: зоны поражения, цепные реакции, комбо при обмене двух спецфишек.

// ---------- Зоны ----------

/** Квадрат size×size с центром в center, обрезанный по краям поля; без дыр */
export function squareArea(board: Board, center: Position, size: number): Position[] {
  const half = Math.floor(size / 2);
  return allPositions(board).filter(
    (p) => Math.abs(p.row - center.row) <= half && Math.abs(p.col - center.col) <= half,
  );
}

/** Полосы шириной width: строки и/или столбцы с центром в center */
export function bandArea(
  board: Board,
  center: Position,
  width: number,
  bands: { rows: boolean; cols: boolean },
): Position[] {
  const half = Math.floor(width / 2);
  return allPositions(board).filter(
    (p) =>
      (bands.rows && Math.abs(p.row - center.row) <= half) ||
      (bands.cols && Math.abs(p.col - center.col) <= half),
  );
}

export function tilesOfColor(board: Board, color: ColorId, onlyLevel1 = false): Position[] {
  return allPositions(board).filter((p) => {
    const cell = getCell(board, p);
    if (!isTile(cell) || cell.color !== color) return false;
    return !onlyLevel1 || (cell.level === 1 && !isChained(cell));
  });
}

/** Самый частый цвет на поле; при равенстве — с меньшим индексом */
export function mostFrequentColor(board: Board): ColorId | null {
  const counts = new Map<ColorId, number>();
  for (const cell of board.flat()) {
    if (isTile(cell)) counts.set(cell.color, (counts.get(cell.color) ?? 0) + 1);
  }
  let best: ColorId | null = null;
  for (const [color, count] of counts) {
    if (
      best === null ||
      count > counts.get(best)! ||
      (count === counts.get(best) && color < best)
    ) {
      best = color;
    }
  }
  return best;
}

/** Что задевает спецфишка, когда срабатывает (в том числе когда её задело) */
function activationArea(board: Board, pos: Position, cell: Cell): Position[] {
  if (!isPiece(cell)) return [];
  switch (cell.type) {
    case 'rocket': {
      const rows = cell.direction === 'row';
      return bandArea(board, pos, 1, { rows, cols: !rows });
    }
    case 'bomb':
      return squareArea(board, pos, BOMB_SIZE);
    case 'megaBomb':
      return squareArea(board, pos, MEGA_BOMB_SIZE);
    case 'rainbow': {
      const color = mostFrequentColor(board);
      return color === null ? [] : tilesOfColor(board, color);
    }
    case 'manipulator':
      // Просто исчезает
      return [];
  }
}

// ---------- Цепная реакция ----------

/**
 * Расширяет набор уничтожаемых клеток: каждая задетая спецфишка срабатывает и задевает свою зону.
 * Клетки из preActivated уничтожаются, но своё действие не применяют (уже сработали иначе).
 */
export function expandChain(
  board: Board,
  initial: Position[],
  preActivated: ReadonlySet<string> = new Set(),
): Position[] {
  const destroyed = new Map<string, Position>();
  const queue = [...initial];
  while (queue.length > 0) {
    const pos = queue.shift()!;
    const key = posKey(pos);
    if (destroyed.has(key)) continue;
    const cell = getCell(board, pos);
    // Корону взрывы не задевают: иначе её нельзя было бы донести до дна
    if (cell == null || cell.kind === 'hole' || cell.kind === 'item') continue;
    destroyed.set(key, pos);
    if (!preActivated.has(key)) queue.push(...activationArea(board, pos, cell));
  }
  return [...destroyed.values()];
}

// ---------- Очки ----------

/** Очки за клетку, уничтоженную не в совпадении (взрывом, ракетой, радугой) */
export function hitPoints(cell: Cell | undefined): number {
  if (!isTile(cell) || isChained(cell)) return 0;
  if (cell.level === 2) return BASE_POINTS_PER_TILE * LEVEL2_SCORE_MULTIPLIER;
  if (cell.level === 3) return BASE_POINTS_PER_TILE * LEVEL3_HIT_MULTIPLIER;
  return BASE_POINTS_PER_TILE;
}

// ---------- Комбо ----------

type ComboKind = 'rocket' | 'bomb' | 'rainbow' | 'megaBomb';

export function comboKind(cell: Cell | undefined): ComboKind | null {
  return isPiece(cell) && cell.type !== 'manipulator' ? cell.type : null;
}

/** Обмен двух спецфишек (манипулятор в комбо не участвует) */
export function isCombo(board: Board, a: Position, b: Position): boolean {
  return comboKind(getCell(board, a)) !== null && comboKind(getCell(board, b)) !== null;
}

/** Спецфишки, которые срабатывают от обмена с соседней клеткой */
function firesOnSwap(cell: Cell | undefined): boolean {
  return (
    isPiece(cell) && (cell.type === 'rocket' || cell.type === 'bomb' || cell.type === 'megaBomb')
  );
}

/**
 * Ракета, бомба или мега-бомба меняется с соседней клеткой, которая не даёт комбо
 * (обычная фишка или манипулятор), — и срабатывает там, куда её передвинули.
 * Возвращает клетку срабатывания уже после обмена, или null.
 */
export function activationSwapTarget(board: Board, a: Position, b: Position): Position | null {
  if (isCombo(board, a, b)) return null;
  const cellA = getCell(board, a);
  const cellB = getCell(board, b);
  if (!isSwappable(cellA) || !isSwappable(cellB)) return null;
  if (firesOnSwap(cellA)) return b;
  if (firesOnSwap(cellB)) return a;
  return null;
}

/** С чем спецфишку можно поменять, чтобы она сработала: только с тем, что само двигается */
function isSwappable(cell: Cell | undefined): boolean {
  return (isTile(cell) && !isChained(cell)) || isPiece(cell);
}

/** Нужен ли игроку выбор цвета для комбо (мега-бомба + радуга) */
export function comboNeedsColor(board: Board, a: Position, b: Position): boolean {
  const kinds = [comboKind(getCell(board, a)), comboKind(getCell(board, b))];
  return kinds.includes('megaBomb') && kinds.includes('rainbow');
}

export interface ComboEffect {
  /** Клетки, превращённые в спецфишки перед срабатыванием (радуга + ракета/бомба и т.п.) */
  conversions: { pos: Position; cell: Piece }[];
  initial: Position[];
  preActivated: Set<string>;
}

/**
 * Эффект комбо. Поле — уже после обмена; center — клетка, куда игрок передвинул фишку.
 * color нужен только для мега-бомбы + радуги.
 */
export function comboEffect(
  board: Board,
  center: Position,
  other: Position,
  rng: Rng,
  color?: ColorId,
): ComboEffect {
  const cellA = getCell(board, center);
  const cellB = getCell(board, other);
  const kinds = [comboKind(cellA), comboKind(cellB)].sort().join('+');
  // Сами спецфишки комбо уничтожаются, но своё обычное действие не применяют
  const preActivated = new Set([posKey(center), posKey(other)]);
  const base = [center, other];
  const effect = (initial: Position[], conversions: ComboEffect['conversions'] = []) => ({
    conversions,
    initial: [...base, ...initial],
    preActivated,
  });

  switch (kinds) {
    case 'rocket+rocket':
      return effect(bandArea(board, center, 1, { rows: true, cols: true }));
    case 'bomb+rocket':
      return effect(bandArea(board, center, ROCKET_BOMB_WIDTH, { rows: true, cols: true }));
    case 'bomb+bomb':
      return effect(squareArea(board, center, BOMB_BOMB_SIZE));
    case 'rainbow+rainbow':
    case 'megaBomb+megaBomb':
      return effect(allPositions(board));
    case 'megaBomb+rocket':
      return effect(bandArea(board, center, MEGA_BOMB_ROCKET_WIDTH, { rows: true, cols: true }));
    case 'bomb+megaBomb':
      return effect(squareArea(board, center, MEGA_BOMB_BOMB_SIZE));
    case 'rainbow+rocket':
    case 'bomb+rainbow': {
      // Спецфишки бесцветные — превращается самый частый цвет на поле
      const target = mostFrequentColor(board);
      if (target === null) return effect([]);
      return convertColor(board, target, kinds === 'bomb+rainbow' ? 'bomb' : 'rocket', rng, effect);
    }
    case 'megaBomb+rainbow': {
      if (color === undefined) throw new Error('Для комбо мега-бомба + радуга нужен цвет');
      return convertColor(board, color, 'bomb', rng, effect);
    }
  }
  throw new Error(`Неизвестное комбо: ${kinds}`);
}

/** Все фишки 1 уровня цвета становятся спецфишками и срабатывают */
function convertColor(
  board: Board,
  color: ColorId,
  into: 'rocket' | 'bomb',
  rng: Rng,
  effect: (initial: Position[], conversions: ComboEffect['conversions']) => ComboEffect,
): ComboEffect {
  const targets = tilesOfColor(board, color, true);
  const conversions = targets.map((pos) => ({
    pos,
    cell: (into === 'bomb'
      ? { kind: 'piece', type: 'bomb' }
      : { kind: 'piece', type: 'rocket', direction: rng.int(2) === 0 ? 'row' : 'col' }) as Piece,
  }));
  return effect(targets, conversions);
}
