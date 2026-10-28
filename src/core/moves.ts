import {
  cloneBoard,
  getCell,
  isPiece,
  isTile,
  type Board,
  type Cell,
  type Position,
} from './board';
import { findMatches } from './match';
import { activationSwapTarget, isCombo } from './specials';

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
 * Допустимый обмен соседних клеток: две спецфишки (комбо), ракета/бомба с любой клеткой
 * (срабатывает) или обмен, после которого появляется совпадение — двух фишек или фишки
 * с манипулятором (манипулятор просто переезжает). Радугу и мега-бомбу с фишкой не меняют.
 */
export function isValidSwap(board: Board, a: Position, b: Position): boolean {
  if (!areAdjacent(a, b)) return false;
  if (isCombo(board, a, b) || activationSwapTarget(board, a, b) !== null) return true;
  if (!isMovable(getCell(board, a)) || !isMovable(getCell(board, b))) return false;
  if (!isTile(getCell(board, a)) && !isTile(getCell(board, b))) return false;
  return findMatches(swapCells(board, a, b)).length > 0;
}

/** Что можно двигать обычным обменом: фишки и манипулятор */
function isMovable(cell: Cell | undefined): boolean {
  return isTile(cell) || (isPiece(cell) && cell.type === 'manipulator');
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
