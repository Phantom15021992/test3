import { describe, expect, it } from 'vitest';
import { findMatches, type MatchGroup } from '../../src/core/match';
import { parseBoard } from '../helpers/parseBoard';

const single = (text: string): MatchGroup => {
  const groups = findMatches(parseBoard(text));
  expect(groups).toHaveLength(1);
  return groups[0]!;
};

const shapeOf = (text: string) => {
  const group = single(text);
  if (group.level !== 1) throw new Error('ожидалась группа 1 уровня');
  return group.shape;
};

describe('findMatches: 1 уровень', () => {
  it('нет совпадений', () => {
    expect(
      findMatches(
        parseBoard(`
          R1 G1 R1
          G1 R1 G1
          R1 G1 R1
        `),
      ),
    ).toEqual([]);
  });

  it('3 в ряд по горизонтали и вертикали', () => {
    expect(shapeOf(`R1 R1 R1 G1`)).toBe('line3');
    expect(
      shapeOf(`
        R1 G1
        R1 B1
        R1 G1
      `),
    ).toBe('line3');
  });

  it('4 в ряд', () => {
    expect(shapeOf(`R1 R1 R1 R1 G1`)).toBe('line4');
  });

  it('5 и 6 в ряд дают line5', () => {
    expect(shapeOf(`R1 R1 R1 R1 R1`)).toBe('line5');
    expect(shapeOf(`R1 R1 R1 R1 R1 R1`)).toBe('line5');
  });

  it('L, T и крест из 5 фишек дают lt', () => {
    expect(
      shapeOf(`
        R1 G1 B1
        R1 B1 G1
        R1 R1 R1
      `),
    ).toBe('lt');
    expect(
      shapeOf(`
        R1 R1 R1
        G1 R1 G1
        B1 R1 B1
      `),
    ).toBe('lt');
    expect(
      shapeOf(`
        G1 R1 G1
        R1 R1 R1
        G1 R1 G1
      `),
    ).toBe('lt');
  });

  it('L/T с длинным лучом даёт line5', () => {
    expect(
      shapeOf(`
        R1 G1 B1 G1
        R1 B1 G1 B1
        R1 R1 R1 R1
      `),
    ).toBe('line5');
  });

  it('квадрат 2×2', () => {
    const group = single(`
      R1 R1 G1
      R1 R1 B1
    `);
    expect(group).toMatchObject({ level: 1, shape: 'square' });
    expect(group.cells).toHaveLength(4);
  });

  it('квадрат важнее примыкающей линии и сливается с ней в одну группу', () => {
    const group = single(`
      R1 R1 R1
      R1 R1 G1
    `);
    expect(group).toMatchObject({ shape: 'square' });
    expect(group.cells).toHaveLength(5);
  });

  it('фишки разных уровней не совпадают', () => {
    expect(findMatches(parseBoard(`R1 R1 R2`))).toEqual([]);
  });

  it('дыры и пустые клетки разрывают линию', () => {
    expect(findMatches(parseBoard(`R1 R1 # R1 R1 . R1`))).toEqual([]);
  });

  it('находит несколько независимых групп', () => {
    const groups = findMatches(
      parseBoard(`
        R1 R1 R1
        G1 B1 G1
        B1 B1 B1
      `),
    );
    expect(groups.map((g) => g.color).sort()).toEqual([0, 2]);
  });
});

describe('findMatches: 2–3 уровень', () => {
  it('размер группы 3, 4, 5', () => {
    expect(single(`B2 B2 B2`)).toMatchObject({ level: 2, size: 3 });
    expect(single(`B2 B2 B2 B2`)).toMatchObject({ level: 2, size: 4 });
    expect(single(`R3 R3 R3 R3 R3`)).toMatchObject({ level: 3, size: 5 });
  });

  it('L/T считается по количеству ячеек', () => {
    expect(
      single(`
        G2 R1 B1
        G2 B1 R1
        G2 G2 G2
      `),
    ).toMatchObject({ level: 2, size: 5 });
  });

  it('группа из 6+ ячеек считается как 5', () => {
    expect(single(`R3 R3 R3 R3 R3 R3`)).toMatchObject({ level: 3, size: 5 });
  });

  it('квадрат 2×2 из ячеек 2 уровня не является совпадением', () => {
    expect(
      findMatches(
        parseBoard(`
          R2 R2
          R2 R2
        `),
      ),
    ).toEqual([]);
  });
});
