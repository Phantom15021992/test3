import { describe, expect, it } from 'vitest';
import { FLOOR_SIZE, floorOf } from '../../src/core/level';
import { LevelSession } from '../../src/core/levelSession';
import { findPossibleMoves } from '../../src/core/moves';
import { FLOORS, LEVELS, levelAfter } from '../../src/levels';

describe('кампания', () => {
  it('в каждом этаже по 10 уровней, номера идут подряд', () => {
    expect(LEVELS.map((level) => level.id)).toEqual(LEVELS.map((_, i) => i + 1));
    for (const floor of FLOORS) expect(floor).toHaveLength(FLOOR_SIZE);
    expect(floorOf(10)).toBe(1);
    expect(floorOf(11)).toBe(2);
  });

  it.each(LEVELS.map((level) => [level.id, level] as const))(
    'уровень %i: на разных seed поле собирается и на нём есть ход',
    (_, level) => {
      for (let seed = 1; seed <= 5; seed++) {
        const session = new LevelSession(seed, level);
        expect(findPossibleMoves(session.board).length).toBeGreaterThan(0);
      }
    },
  );

  it('поле не больше 10×10', () => {
    for (const level of LEVELS) {
      expect(level.layout.length).toBeLessThanOrEqual(10);
      expect(level.layout[0]!.length).toBeLessThanOrEqual(10);
    }
  });

  it('уровни с целью на ячейки 2 уровня идут на поле от 8×8', () => {
    const levels = LEVELS.filter((level) => level.goals.some((goal) => goal.kind === 'level2'));
    expect(levels.length).toBeGreaterThan(0);
    for (const level of levels) {
      expect(level.layout.length).toBeGreaterThanOrEqual(8);
      expect(level.layout[0]!.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('лёд не лежит в просветах тоньше 3 клеток', () => {
    const solid = (layout: readonly string[], row: number, col: number) =>
      [0, 1, 2].every((i) => [0, 1, 2].every((j) => (layout[row + i]?.[col + j] ?? '#') !== '#'));
    for (const { id, layout } of LEVELS) {
      layout.forEach((line, row) =>
        [...line].forEach((symbol, col) => {
          if (symbol !== 'i') return;
          const offsets = [0, 1, 2];
          const thick = offsets.some((i) => offsets.some((j) => solid(layout, row - i, col - j)));
          expect(thick, `уровень ${id}, клетка ${row},${col}`).toBe(true);
        }),
      );
    }
  });

  it('кольцо — поле 10×10 с дырой 2×2 ровно в центре', () => {
    const rings = LEVELS.filter((level) => level.title === 'Кольцо');
    expect(rings.length).toBeGreaterThan(0);
    for (const { layout } of rings) {
      expect(layout).toHaveLength(10);
      const holes = layout.flatMap((line, row) =>
        [...line].flatMap((symbol, col) => (symbol === '#' ? [`${row},${col}`] : [])),
      );
      expect(holes).toEqual(['4,4', '4,5', '5,4', '5,5']);
    }
  });

  it('на первом этаже из препятствий только лёд и дыры', () => {
    const symbols = FLOORS[0]!.flatMap((level) => [...level.layout.join('')]);
    expect(new Set(symbols)).toEqual(new Set(['.', '#', 'i']));
  });

  it('следующий уровень идёт по порядку, у последнего его нет', () => {
    expect(levelAfter(1)?.id).toBe(2);
    expect(levelAfter(10)?.id).toBe(11);
    expect(levelAfter(LEVELS.length)).toBeUndefined();
  });
});
