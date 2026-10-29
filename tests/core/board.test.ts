import { describe, expect, it } from 'vitest';
import { cloneBoard, createEmptyBoard, hasPieces } from '../../src/core/board';
import { parseBoard } from '../helpers/parseBoard';

describe('board', () => {
  it('createEmptyBoard создаёт поле нужного размера из пустых клеток', () => {
    const board = createEmptyBoard(3, 4);
    expect(board).toHaveLength(3);
    expect(board.every((row) => row.length === 4 && row.every((c) => c === null))).toBe(true);
  });

  it('cloneBoard не разделяет клетки с исходным полем', () => {
    const board = parseBoard(`
      R1 G2
      #  .
    `);
    const copy = cloneBoard(board);
    expect(copy).toEqual(board);
    expect(copy[0]?.[0]).not.toBe(board[0]?.[0]);
  });

  it('parseBoard понимает цвет, уровень, пустые клетки и дыры', () => {
    const board = parseBoard(`
      R1 B3
      .  #
    `);
    expect(board).toEqual([
      [
        { kind: 'tile', color: 0, level: 1 },
        { kind: 'tile', color: 2, level: 3 },
      ],
      [null, { kind: 'hole' }],
    ]);
  });
});

describe('hasPieces', () => {
  it('замечает любую спецфишку, дыры и пустые клетки не считаются', () => {
    expect(hasPieces(parseBoard('R1 # .'))).toBe(false);
    expect(hasPieces(parseBoard('R1 M .'))).toBe(true);
  });
});
