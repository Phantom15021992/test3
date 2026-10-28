import { cloneBoard, type Board, type Position, type Tile } from './board';
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
    if (kind === 'tile' || kind === 'piece') next[row]![col] = null;
  }
  return next;
}

/** Фишки падают вниз по столбцам; дыры пропускаются — фишка пролетает сквозь них */
export function applyGravity(board: Board): { board: Board; falls: Fall[] } {
  const next = cloneBoard(board);
  const falls: Fall[] = [];
  const cols = next[0]?.length ?? 0;

  for (let col = 0; col < cols; col++) {
    // Клетки столбца без дыр, снизу вверх
    const slots: number[] = [];
    for (let row = next.length - 1; row >= 0; row--) {
      if (next[row]?.[col]?.kind !== 'hole') slots.push(row);
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
