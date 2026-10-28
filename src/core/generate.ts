import { cloneBoard, getCell, type Board, type ColorId, type Position } from './board';
import { findMatches } from './match';
import { hasPossibleMove } from './moves';
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
      row[c] = { kind: 'tile', color: pool[rng.int(pool.length)]!, level: 1 };
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
