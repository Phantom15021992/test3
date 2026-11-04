import {
  cloneBoard,
  isCoal,
  isFixed,
  isPiece,
  isTile,
  type Board,
  type Cell,
  type Position,
  type Tile,
} from './board';
import { hasCoal } from './coal';
import type { Rng } from './rng';

export interface Fall {
  from: Position;
  to: Position;
}

export interface Spawn {
  to: Position;
  tile: Tile;
  /** Появилась прямо на месте: под углём, куда нечему скатиться */
  inPlace?: true;
}

/** Одно падение: фишки падают (или скатываются наискосок) и появляются новые */
export interface Drop {
  falls: Fall[];
  spawns: Spawn[];
}

export function removeCells(board: Board, cells: Position[]): Board {
  const next = cloneBoard(board);
  for (const { row, col } of cells) {
    const kind = next[row]?.[col]?.kind;
    if (kind === 'tile' || kind === 'piece' || kind === 'stone' || kind === 'box') {
      next[row]![col] = null;
    }
  }
  return next;
}

/**
 * Всё падает вниз по столбцам; неподвижные клетки пропускаются — сквозь них пролетают.
 * Уголь делит столбец на части: над ним фишки ложатся на него, под ним падают сами по себе
 */
export function applyGravity(board: Board): { board: Board; falls: Fall[] } {
  const next = cloneBoard(board);
  const falls: Fall[] = [];
  const cols = next[0]?.length ?? 0;

  for (let col = 0; col < cols; col++) {
    // Клетки части столбца без неподвижных, снизу вверх
    let slots: number[] = [];
    const settleSlots = () => {
      let target = 0;
      for (const row of slots) {
        const cell = next[row]![col]!;
        if (cell === null) continue;
        const toRow = slots[target++]!;
        if (toRow !== row) {
          next[toRow]![col] = cell;
          next[row]![col] = null;
          falls.push({ from: { row, col }, to: { row: toRow, col } });
        }
      }
      slots = [];
    };
    for (let row = next.length - 1; row >= 0; row--) {
      const cell = next[row]?.[col];
      if (isCoal(cell)) settleSlots();
      else if (!isFixed(cell)) slots.push(row);
    }
    settleSlots();
  }

  return { board: next, falls };
}

/** Короны на настоящем дне: в самой нижней клетке столбца (дыры клетками не считаются) */
export function itemsOnBottom(board: Board): Position[] {
  const arrived: Position[] = [];
  const cols = board[0]?.length ?? 0;
  for (let col = 0; col < cols; col++) {
    for (let row = board.length - 1; row >= 0; row--) {
      const kind = board[row]?.[col]?.kind;
      if (kind === 'hole') continue;
      if (kind === 'item') arrived.push({ row, col });
      break;
    }
  }
  return arrived;
}

/**
 * Заполняет пустые клетки новыми фишками 1 уровня; совпадения допускаются — из них каскады.
 * only — какие клетки заполнять (по умолчанию все пустые)
 */
export function refill(
  board: Board,
  colorCount: number,
  rng: Rng,
  only?: (pos: Position) => boolean,
  inPlace = false,
): { board: Board; spawns: Spawn[] } {
  const next = cloneBoard(board);
  const spawns: Spawn[] = [];
  next.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell !== null || (only && !only({ row: r, col: c }))) return;
      const tile: Tile = { kind: 'tile', color: rng.int(colorCount), level: 1 };
      row[c] = tile;
      spawns.push(
        inPlace ? { to: { row: r, col: c }, tile, inPlace } : { to: { row: r, col: c }, tile },
      );
    }),
  );
  return { board: next, spawns };
}

/** Защита от зацикливания заполнения под углём */
const MAX_SETTLE_ROUNDS = 200;

/**
 * Падение и заполнение после удаления клеток. Без угля — одно падение, как всегда. С углём новые
 * фишки падают только туда, куда сверху не мешает уголь; под углём фишки скатываются наискосок
 * из соседних столбцов, а куда скатиться нечему — новые фишки появляются прямо на месте
 */
export function settle(
  board: Board,
  colorCount: number,
  rng: Rng,
): { board: Board; drops: Drop[] } {
  if (!hasCoal(board)) {
    const fallen = applyGravity(board);
    const filled = refill(fallen.board, colorCount, rng);
    return { board: filled.board, drops: [{ falls: fallen.falls, spawns: filled.spawns }] };
  }
  let current = board;
  const drops: Drop[] = [];
  for (let round = 0; round < MAX_SETTLE_ROUNDS; round++) {
    const fallen = applyGravity(current);
    const open = openFromTop(fallen.board);
    const filled = refill(fallen.board, colorCount, rng, ({ row, col }) => open[row]![col]!);
    current = filled.board;
    if (fallen.falls.length > 0 || filled.spawns.length > 0) {
      drops.push({ falls: fallen.falls, spawns: filled.spawns });
    }
    if (!current.some((line) => line.includes(null))) break;
    const slid = slideDiagonally(current);
    if (slid.falls.length > 0) {
      current = slid.board;
      drops.push({ falls: slid.falls, spawns: [] });
      continue;
    }
    const placed = refill(current, colorCount, rng, undefined, true);
    current = placed.board;
    drops.push({ falls: [], spawns: placed.spawns });
    break;
  }
  return { board: current, drops };
}

/** Клетки, до которых новые фишки долетают сверху: выше по столбцу нет угля */
function openFromTop(board: Board): boolean[][] {
  const open = board.map((line) => line.map(() => false));
  const cols = board[0]?.length ?? 0;
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < board.length && !isCoal(board[row]![col]); row++) {
      open[row]![col] = true;
    }
  }
  return open;
}

/** Что может скатиться наискосок: всё, что падает */
function canSlide(cell: Cell | undefined): boolean {
  if (cell == null) return false;
  return isTile(cell) || isPiece(cell) || cell.kind === 'stone' || cell.kind === 'item';
}

/** Пустые клетки снизу вверх забирают фишку сверху слева, иначе сверху справа */
function slideDiagonally(board: Board): { board: Board; falls: Fall[] } {
  const next = cloneBoard(board);
  const falls: Fall[] = [];
  const moved = new Set<string>();
  for (let row = next.length - 1; row > 0; row--) {
    next[row]!.forEach((cell, col) => {
      if (cell !== null) return;
      for (const dc of [-1, 1]) {
        const from = { row: row - 1, col: col + dc };
        const key = `${from.row},${from.col}`;
        if (moved.has(key) || !canSlide(next[from.row]![from.col])) continue;
        next[row]![col] = next[from.row]![from.col]!;
        next[from.row]![from.col] = null;
        moved.add(`${row},${col}`);
        falls.push({ from, to: { row, col } });
        return;
      }
    });
  }
  return { board: next, falls };
}
