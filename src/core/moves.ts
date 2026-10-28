import { cloneBoard, getCell, isTile, type Board, type Position } from './board';
import { findMatches } from './match';
import { isCombo } from './specials';

export interface SwapMove {
  from: Position;
  to: Position;
}

export function areAdjacent(a: Position, b: Position): boolean {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

export function swapCells(board: Board, a: Position, b: Position): Board {
  const next = cloneBoard(board);
  const rowA = next[a.row];
  const rowB = next[b.row];
  if (!rowA || !rowB || a.col >= rowA.length || b.col >= rowB.length) {
    throw new Error('Обмен за пределами поля');
  }
  [rowA[a.col], rowB[b.col]] = [rowB[b.col]!, rowA[a.col]!];
  return next;
}

/**
 * Допустимый обмен соседних клеток: две спецфишки (комбо) или две фишки, после обмена
 * которых появляется совпадение. Радугу, мега-бомбу и манипулятор с обычной фишкой не меняют.
 */
export function isValidSwap(board: Board, a: Position, b: Position): boolean {
  if (!areAdjacent(a, b)) return false;
  if (isCombo(board, a, b)) return true;
  if (!isTile(getCell(board, a)) || !isTile(getCell(board, b))) return false;
  return findMatches(swapCells(board, a, b)).length > 0;
}

export function findPossibleMoves(board: Board): SwapMove[] {
  const moves: SwapMove[] = [];
  board.forEach((row, r) =>
    row.forEach((_, c) => {
      const from = { row: r, col: c };
      for (const to of [
        { row: r, col: c + 1 },
        { row: r + 1, col: c },
      ]) {
        if (isValidSwap(board, from, to)) moves.push({ from, to });
      }
    }),
  );
  return moves;
}

export function hasPossibleMove(board: Board): boolean {
  return findPossibleMoves(board).length > 0;
}
