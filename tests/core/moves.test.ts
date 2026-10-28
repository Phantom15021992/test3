import { describe, expect, it } from 'vitest';
import { getCell, setCell, type Board } from '../../src/core/board';
import { findMatches } from '../../src/core/match';
import {
  findPossibleMoves,
  hasTileMove,
  isValidSwap,
  shuffleBoard,
  swapCells,
} from '../../src/core/moves';
import { createRng } from '../../src/core/rng';
import { parseBoard } from '../helpers/parseBoard';

describe('moves', () => {
  const board = parseBoard(`
    R1 G1 R1 R1
    G1 B1 G1 B1
    B1 G1 B1 G1
  `);

  it('swapCells меняет клетки и не трогает исходное поле', () => {
    const next = swapCells(board, { row: 0, col: 0 }, { row: 0, col: 1 });
    expect(next[0]?.[0]).toEqual(board[0]?.[1]);
    expect(next[0]?.[1]).toEqual(board[0]?.[0]);
    expect(board[0]?.[0]).toMatchObject({ color: 0 });
  });

  it('обмен, дающий совпадение, допустим', () => {
    expect(isValidSwap(board, { row: 0, col: 0 }, { row: 0, col: 1 })).toBe(true);
  });

  it('обмен без совпадения недопустим', () => {
    expect(isValidSwap(board, { row: 1, col: 0 }, { row: 2, col: 0 })).toBe(false);
  });

  it('обмен не соседних клеток или по диагонали недопустим', () => {
    expect(isValidSwap(board, { row: 0, col: 0 }, { row: 0, col: 2 })).toBe(false);
    expect(isValidSwap(board, { row: 0, col: 1 }, { row: 1, col: 0 })).toBe(false);
  });

  it('с дырой и пустой клеткой меняться нельзя', () => {
    const withHole = parseBoard(`
      # R1 R1
      R1 G1 B1
    `);
    expect(isValidSwap(withHole, { row: 0, col: 0 }, { row: 1, col: 0 })).toBe(false);
    const withEmpty = parseBoard(`. R1 R1`);
    expect(isValidSwap(withEmpty, { row: 0, col: 0 }, { row: 0, col: 1 })).toBe(false);
  });

  it('findPossibleMoves находит все ходы', () => {
    const moves = findPossibleMoves(
      parseBoard(`
        R1 G1 R1 R1
        B1 Y1 G1 B1
      `),
    );
    expect(moves).toEqual([{ from: { row: 0, col: 0 }, to: { row: 0, col: 1 } }]);
  });
});

// Застрявшее поле из реальной партии: ни одного хода обычными фишками
const stuck = () =>
  parseBoard(`
    Y1 Y1 G1 B1 P1 Y1 B1 G1
    R1 R1 B1 Y1 R1 Y2 G1 Y1
    B1 G1 P1 Y1 P2 P1 R1 B2
    R2 P1 O1 B1 R1 R2 G1 G1
    B1 O2 Y1 P2 B1 P2 R1 P1
    Y1 G1 P1 B2 G1 O2 O1 Y2
    Y1 B1 Y1 O2 O1 Y1 P1 R1
    R1 O1 P1 B1 Y1 B1 R2 O1
  `);

const census = (board: Board) =>
  board
    .flat()
    .map((cell) => JSON.stringify(cell))
    .sort();

describe('hasTileMove', () => {
  it('застрявшее поле — ходов нет', () => {
    expect(hasTileMove(stuck())).toBe(false);
  });

  it('спецфишка ходом обычными фишками не считается', () => {
    const board = parseBoard(`
      R1 G1 *
      G1 R1 B1
    `);
    expect(findPossibleMoves(board).length).toBeGreaterThan(0);
    expect(hasTileMove(board)).toBe(false);
  });
});

describe('shuffleBoard', () => {
  it('переставляет все клетки: без совпадений, с ходом, тот же набор фишек и спецфишек', () => {
    const board = stuck();
    setCell(board, { row: 0, col: 0 }, { kind: 'piece', type: 'bomb' });
    const result = shuffleBoard(board, 6, createRng(3));
    expect(findMatches(result)).toEqual([]);
    expect(hasTileMove(result)).toBe(true);
    expect(census(result)).toEqual(census(board));
  });

  it('дыры остаются на месте', () => {
    const board = stuck();
    setCell(board, { row: 3, col: 3 }, { kind: 'hole' });
    const result = shuffleBoard(board, 6, createRng(7));
    expect(getCell(result, { row: 3, col: 3 })).toEqual({ kind: 'hole' });
    expect(hasTileMove(result)).toBe(true);
  });

  it('если ход получить невозможно — поле без совпадений, ячейки 2–3 уровня не перекрашены', () => {
    // Всего две фишки 1 уровня, остальные — ячейки разных цветов и уровней: трёх одинаковых
    // не собрать ни перестановкой, ни перекрашиванием
    const board = parseBoard(`
      R1 G1 B2 Y2
      P3 O3 R2 G3
    `);
    const result = shuffleBoard(board, 6, createRng(1));
    expect(findMatches(result)).toEqual([]);
    expect(hasTileMove(result)).toBe(false);
    const higher = (b: Board) => census(b).filter((cell) => !cell.includes('"level":1'));
    expect(higher(result)).toEqual(higher(board));
  });

  it('перекрашивание находит ход, когда хватает фишек 1 уровня', () => {
    const board = parseBoard(`
      R1 G1 B1 Y2
      P1 O1 R2 G3
    `);
    const result = shuffleBoard(board, 6, createRng(2));
    expect(findMatches(result)).toEqual([]);
    expect(hasTileMove(result)).toBe(true);
  });

  it('одинаковый seed — одинаковое перемешивание', () => {
    expect(shuffleBoard(stuck(), 6, createRng(9))).toEqual(shuffleBoard(stuck(), 6, createRng(9)));
  });
});
