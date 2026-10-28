import { describe, expect, it } from 'vitest';
import { findPossibleMoves, isValidSwap, swapCells } from '../../src/core/moves';
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
