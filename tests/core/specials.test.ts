import { describe, expect, it } from 'vitest';
import { isValidSwap } from '../../src/core/moves';
import { expandChain, hitPoints, mostFrequentColor } from '../../src/core/specials';
import { parseBoard } from '../helpers/parseBoard';

describe('expandChain', () => {
  it('задетая радуга убирает самый частый цвет', () => {
    const board = parseBoard(`
      -  B1 @
      G1 B1 G1
      G1 G1 Y1
    `);
    expect(mostFrequentColor(board)).toBe(1);
    const cells = expandChain(board, [{ row: 0, col: 0 }]);
    // строка 0 (ракета) + все зелёные (радуга)
    expect(cells).toHaveLength(3 + 4);
  });

  it('задетый манипулятор просто исчезает', () => {
    const board = parseBoard(`- M G1`);
    expect(expandChain(board, [{ row: 0, col: 0 }])).toHaveLength(3);
  });

  it('дыры не уничтожаются', () => {
    const board = parseBoard(`- # G1`);
    expect(expandChain(board, [{ row: 0, col: 0 }])).toHaveLength(2);
  });
});

describe('hitPoints', () => {
  it('очки за клетку по уровню; спецфишки очков не дают', () => {
    const [l1, l2, l3, rainbow, rocket] = parseBoard(`R1 R2 R3 @ -`)[0]!;
    expect([l1, l2, l3, rainbow, rocket].map(hitPoints)).toEqual([10, 50, 150, 0, 0]);
  });
});

describe('isValidSwap со спецфишками', () => {
  const board = parseBoard(`
    -  *  @  X
    B1 Y1 P1 M
  `);
  const p = (row: number, col: number) => ({ row, col });

  it('две спецфишки — всегда допустимое комбо', () => {
    expect(isValidSwap(board, p(0, 0), p(0, 1))).toBe(true);
    expect(isValidSwap(board, p(0, 2), p(0, 3))).toBe(true);
  });

  it('ракету и бомбу можно поменять с обычной фишкой', () => {
    expect(isValidSwap(board, p(0, 0), p(1, 0))).toBe(true);
    expect(isValidSwap(board, p(1, 1), p(0, 1))).toBe(true);
  });

  it('радугу можно сдвинуть, только если обмен даёт совпадение', () => {
    expect(isValidSwap(board, p(0, 2), p(1, 2))).toBe(false);
    const withMatch = parseBoard(`
      R1 R1 @
      G1 B1 R1
    `);
    expect(isValidSwap(withMatch, p(0, 2), p(1, 2))).toBe(true);
    expect(isValidSwap(withMatch, p(1, 2), p(0, 2))).toBe(true);
  });

  it('мега-бомбу можно поменять с любой соседней клеткой, в том числе с манипулятором', () => {
    const withTile = parseBoard(`
      X  R1
      G1 B1
    `);
    expect(isValidSwap(withTile, p(0, 0), p(0, 1))).toBe(true);
    expect(isValidSwap(withTile, p(1, 0), p(0, 0))).toBe(true);
    expect(isValidSwap(board, p(0, 3), p(1, 3))).toBe(true);
  });

  it('манипулятор можно сдвинуть, только если обмен даёт совпадение', () => {
    expect(isValidSwap(board, p(1, 3), p(1, 2))).toBe(false);
    const withMatch = parseBoard(`
      R1 R1 M
      G1 B1 R1
    `);
    expect(isValidSwap(withMatch, p(0, 2), p(1, 2))).toBe(true);
    expect(isValidSwap(withMatch, p(1, 2), p(0, 2))).toBe(true);
  });
});
