import {
  allPositions,
  cloneBoard,
  getCell,
  isPiece,
  isTile,
  setCell,
  type Board,
  type Cell,
  type Position,
} from './board';
import { findMatches } from './match';
import type { Rng } from './rng';
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
 * Допустимый обмен соседних клеток: две спецфишки (комбо), ракета/бомба/мега-бомба с любой клеткой
 * (срабатывает) или обмен, после которого появляется совпадение — двух фишек или фишки
 * с манипулятором (манипулятор просто переезжает). Радугу с фишкой не меняют.
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

/** Есть ли ход обычными фишками: обмен двух соседних фишек, дающий совпадение */
export function hasTileMove(board: Board): boolean {
  return findPossibleMoves(board).some(
    ({ from, to }) => isTile(getCell(board, from)) && isTile(getCell(board, to)),
  );
}

const SHUFFLE_ATTEMPTS = 100;
const RECOLOR_ATTEMPTS = 500;

/**
 * Перемешивает поле, когда ходов обычными фишками нет. Переставляются все фишки, ячейки
 * и спецфишки (дыры на месте). Результат — без готовых совпадений и с ходом фишками.
 * Если такую перестановку найти не удалось — отдельные фишки 1 уровня меняют цвет,
 * пока ход не появится (уровни выше и спецфишки не перекрашиваются).
 */
export function shuffleBoard(board: Board, colorCount: number, rng: Rng): Board {
  const positions = allPositions(board).filter((pos) => getCell(board, pos) !== null);
  const cells = positions.map((pos) => getCell(board, pos)!);

  let candidate = board;
  for (let attempt = 0; attempt < SHUFFLE_ATTEMPTS; attempt++) {
    candidate = cloneBoard(board);
    const order = shuffled(cells, rng);
    positions.forEach((pos, i) => setCell(candidate, pos, { ...order[i]! }));
    if (findMatches(candidate).length === 0 && hasTileMove(candidate)) return candidate;
  }

  // Перестановкой не вышло (например, на поле почти одни ячейки высоких уровней)
  const result = findMatches(candidate).length === 0 ? candidate : cloneBoard(board);
  const level1 = positions.filter((pos) => {
    const cell = getCell(result, pos);
    return cell?.kind === 'tile' && cell.level === 1;
  });
  for (let i = 0; i < RECOLOR_ATTEMPTS && level1.length > 0 && !hasTileMove(result); i++) {
    const pos = level1[rng.int(level1.length)]!;
    const before = getCell(result, pos)!;
    setCell(result, pos, { kind: 'tile', color: rng.int(colorCount), level: 1 });
    if (findMatches(result).length > 0) setCell(result, pos, before);
  }
  return result;
}

/** Перемешивание Фишера — Йетса через детерминированный ГСЧ */
function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
