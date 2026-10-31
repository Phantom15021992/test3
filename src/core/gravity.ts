import { cloneBoard, isChained, isFixed, type Board, type Position, type Tile } from './board';
import type { Rng } from './rng';

export interface Fall {
  from: Position;
  to: Position;
}

export interface Spawn {
  to: Position;
  tile: Tile;
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

/** Снимает по звену цепи с фишек; когда звеньев не осталось, фишка снова обычная */
export function loosenChains(board: Board, cells: Position[]): Board {
  const next = cloneBoard(board);
  for (const { row, col } of cells) {
    const cell = next[row]?.[col];
    if (cell?.kind !== 'tile' || !isChained(cell)) continue;
    const left = cell.chain! - 1;
    next[row]![col] =
      left > 0 ? { ...cell, chain: left } : { kind: 'tile', color: cell.color, level: cell.level };
  }
  return next;
}

/** Всё падает вниз по столбцам; неподвижные клетки пропускаются — сквозь них пролетают */
export function applyGravity(board: Board): { board: Board; falls: Fall[] } {
  const next = cloneBoard(board);
  const falls: Fall[] = [];
  const cols = next[0]?.length ?? 0;

  for (let col = 0; col < cols; col++) {
    // Клетки столбца без неподвижных, снизу вверх
    const slots: number[] = [];
    for (let row = next.length - 1; row >= 0; row--) {
      if (!isFixed(next[row]?.[col])) slots.push(row);
    }

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

/** Заполняет пустые клетки новыми фишками 1 уровня; совпадения допускаются — из них каскады */
export function refill(
  board: Board,
  colorCount: number,
  rng: Rng,
): { board: Board; spawns: Spawn[] } {
  const next = cloneBoard(board);
  const spawns: Spawn[] = [];
  next.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell !== null) return;
      const tile: Tile = { kind: 'tile', color: rng.int(colorCount), level: 1 };
      row[c] = tile;
      spawns.push({ to: { row: r, col: c }, tile });
    }),
  );
  return { board: next, spawns };
}
