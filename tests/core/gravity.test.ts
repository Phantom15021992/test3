import { describe, expect, it } from 'vitest';
import { applyGravity, refill, removeCells } from '../../src/core/gravity';
import { createRng } from '../../src/core/rng';
import { parseBoard } from '../helpers/parseBoard';

describe('removeCells', () => {
  it('убирает фишки, но не дыры', () => {
    const board = parseBoard(`R1 # G1`);
    const next = removeCells(board, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);
    expect(next).toEqual(parseBoard(`. # G1`));
  });
});

describe('applyGravity', () => {
  it('фишки падают вниз, порядок в столбце сохраняется', () => {
    const { board, falls } = applyGravity(
      parseBoard(`
        R1 G1
        B1 .
        .  Y1
      `),
    );
    expect(board).toEqual(
      parseBoard(`
        .  .
        R1 G1
        B1 Y1
      `),
    );
    expect(falls).toEqual([
      { from: { row: 1, col: 0 }, to: { row: 2, col: 0 } },
      { from: { row: 0, col: 0 }, to: { row: 1, col: 0 } },
      { from: { row: 0, col: 1 }, to: { row: 1, col: 1 } },
    ]);
  });

  it('фишки пролетают сквозь дыры', () => {
    const { board } = applyGravity(
      parseBoard(`
        R1
        #
        .
      `),
    );
    expect(board).toEqual(
      parseBoard(`
        .
        #
        R1
      `),
    );
  });

  it('ничего не двигает, если пустот нет', () => {
    expect(applyGravity(parseBoard(`R1 G1`)).falls).toEqual([]);
  });
});

describe('refill', () => {
  it('заполняет все пустые клетки фишками 1 уровня и не трогает дыры', () => {
    const { board, spawns } = refill(
      parseBoard(`
        .  #
        R2 .
      `),
      4,
      createRng(1),
    );
    expect(board[0]?.[1]).toEqual({ kind: 'hole' });
    expect(board[1]?.[0]).toEqual({ kind: 'tile', color: 0, level: 2 });
    expect(spawns.map((s) => s.to)).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 1 },
    ]);
    for (const { tile } of spawns) {
      expect(tile.level).toBe(1);
      expect(tile.color).toBeLessThan(4);
    }
  });
});
