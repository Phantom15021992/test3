import {
  allPositions,
  cloneBoard,
  getCell,
  isTile,
  type Board,
  type ColorId,
  type Position,
} from './board';
import { findMatches } from './match';
import { hasPossibleMove, hasTileMove } from './moves';
import type { Rng } from './rng';

const MAX_ATTEMPTS = 100;

/**
 * Заполняет пустые клетки шаблона фишками 1 уровня так, чтобы на старте
 * не было готовых совпадений и был хотя бы один ход. Дыры и уже стоящие фишки не трогает.
 */
export function generateStartBoard(template: Board, colorCount: number, rng: Rng): Board {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const board = fillOnce(template, colorCount, rng);
    if (findMatches(board).length === 0 && hasPossibleMove(board)) return board;
  }
  throw new Error(`Не удалось сгенерировать поле за ${MAX_ATTEMPTS} попыток`);
}

function fillOnce(template: Board, colorCount: number, rng: Rng): Board {
  const board = cloneBoard(template);
  board.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell !== null) return;
      const pos = { row: r, col: c };
      const allowed = range(colorCount).filter((color) => !wouldMatch(board, pos, color));
      // Если подходящих цветов нет — ставим любой, итоговая проверка отбросит попытку
      const pool = allowed.length > 0 ? allowed : range(colorCount);
      const color = pool[rng.int(pool.length)]!;
      row[c] = { kind: 'tile', color, level: 1 };
    }),
  );
  return board;
}

/** Заполняем сверху вниз слева направо, поэтому смотрим только на соседей слева и сверху */
function wouldMatch(board: Board, { row, col }: Position, color: ColorId): boolean {
  const is = (r: number, c: number) => {
    const cell = getCell(board, { row: r, col: c });
    return cell?.kind === 'tile' && cell.level === 1 && cell.color === color;
  };
  return (
    (is(row, col - 1) && is(row, col - 2)) ||
    (is(row - 1, col) && is(row - 2, col)) ||
    (is(row, col - 1) && is(row - 1, col) && is(row - 1, col - 1))
  );
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

/** Сколько попыток раскладки уровней, прежде чем вернуть поле без подъёма */
const LEVEL_SPREAD_ATTEMPTS = 50;

/**
 * Стартовое поле с уже собранными ячейками (тестовый уровень): доля фишек 1 уровня поднимается
 * до 2 и 3 уровня в случайных клетках. Готовых совпадений по-прежнему нет — поднятая ячейка, которая
 * собрала бы совпадение (в том числе квадрат 2×2), меняет цвет, — и есть хотя бы один ход обычными фишками
 */
export function withLevels(
  board: Board,
  colorCount: number,
  shares: Readonly<Partial<Record<2 | 3, number>>>,
  rng: Rng,
): Board {
  const tiles = allPositions(board).filter((pos) => {
    const cell = getCell(board, pos);
    return isTile(cell) && cell.level === 1;
  });
  const count2 = Math.round(tiles.length * (shares[2] ?? 0));
  const count3 = Math.round(tiles.length * (shares[3] ?? 0));
  for (let attempt = 0; attempt < LEVEL_SPREAD_ATTEMPTS; attempt++) {
    const result = cloneBoard(board);
    const order = [...tiles];
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    order.slice(0, count2 + count3).forEach((pos, i) => {
      const cell = getCell(result, pos);
      if (isTile(cell)) result[pos.row]![pos.col] = { ...cell, level: i < count2 ? 2 : 3 };
    });
    if (fixMatches(result, colorCount, rng) && hasTileMove(result)) return result;
  }
  return board;
}

/** Перекрашивает клетки совпадений, пока совпадений не останется; false — не вышло */
function fixMatches(board: Board, colorCount: number, rng: Rng): boolean {
  for (let round = 0; round < board.length * (board[0]?.length ?? 0); round++) {
    const group = findMatches(board)[0];
    if (!group) return true;
    const pos = group.cells[rng.int(group.cells.length)]!;
    const cell = getCell(board, pos);
    if (!isTile(cell)) return false;
    const colors = Array.from({ length: colorCount }, (_, c) => c).filter((c) => c !== cell.color);
    const free = colors.filter((color) => {
      board[pos.row]![pos.col] = { ...cell, color };
      const clash = findMatches(board).some((g) =>
        g.cells.some((c) => c.row === pos.row && c.col === pos.col),
      );
      board[pos.row]![pos.col] = cell;
      return !clash;
    });
    const color = (free.length > 0 ? free : colors)[
      rng.int(free.length > 0 ? free.length : colors.length)
    ]!;
    board[pos.row]![pos.col] = { ...cell, color };
  }
  return findMatches(board).length === 0;
}
