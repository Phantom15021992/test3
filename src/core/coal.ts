import { cloneBoard, getCell, isCoal, posKey, type Board, type Position } from './board';
import { COAL_SIZE } from './config';

// Уголь — глыба 2×2 со слоями. Совпадение рядом снимает столько слоёв, какого уровня его фишки
// (1, 2 или 3), взрыв — один слой. Слоёв не осталось — глыба исчезает целиком.

/** Удар по глыбе: где она и сколько слоёв у неё осталось после удара (0 — разбита) */
export interface CoalHit {
  top: number;
  left: number;
  layers: number;
}

const SIDES = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
] as const;

/** Левый верхний угол глыбы, в которую входит клетка */
function blockOf(board: Board, pos: Position): Position | null {
  const cell = getCell(board, pos);
  return isCoal(cell) ? { row: cell.top, col: cell.left } : null;
}

/** Глыбы, которых касается по стороне хотя бы одна клетка */
export function coalAround(board: Board, cells: readonly Position[]): Position[] {
  return coalIn(
    board,
    cells.flatMap(({ row, col }) => SIDES.map(([dr, dc]) => ({ row: row + dr, col: col + dc }))),
  );
}

/** Глыбы, в которые попадает хотя бы одна клетка */
export function coalIn(board: Board, cells: readonly Position[]): Position[] {
  const found = new Map<string, Position>();
  for (const pos of cells) {
    const block = blockOf(board, pos);
    if (block) found.set(posKey(block), block);
  }
  return [...found.values()];
}

/** Снимает слои с глыб (ключ — левый верхний угол); разбитая глыба освобождает свои клетки */
export function hitCoal(
  board: Board,
  blows: ReadonlyMap<string, { block: Position; layers: number }>,
): { board: Board; hits: CoalHit[] } {
  if (blows.size === 0) return { board, hits: [] };
  const next = cloneBoard(board);
  const hits: CoalHit[] = [];
  for (const { block, layers } of blows.values()) {
    const cell = getCell(next, block);
    if (!isCoal(cell)) continue;
    const left = Math.max(0, cell.layers - layers);
    for (let row = block.row; row < block.row + COAL_SIZE; row++) {
      for (let col = block.col; col < block.col + COAL_SIZE; col++) {
        next[row]![col] = left > 0 ? { ...cell, layers: left } : null;
      }
    }
    hits.push({ top: block.row, left: block.col, layers: left });
  }
  return { board: next, hits };
}

/** Добавляет удар по глыбам к уже накопленным */
export function addBlows(
  blows: Map<string, { block: Position; layers: number }>,
  blocks: readonly Position[],
  layers: number,
): void {
  for (const block of blocks) {
    const key = posKey(block);
    const prev = blows.get(key);
    blows.set(key, { block, layers: (prev?.layers ?? 0) + layers });
  }
}

export function hasCoal(board: Board): boolean {
  return board.some((line) => line.some(isCoal));
}
