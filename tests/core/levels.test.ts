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

  it('поле — от 8×8', () => {
    for (const level of LEVELS) {
      expect(level.layout.length).toBeGreaterThanOrEqual(8);
      expect(level.layout[0]!.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('льда, сундуков и золота на поле ровно столько, сколько в цели: лишних нет', () => {
    // Лёд и сундуки со слитками и сокровищами считаются и в золото, поэтому без своей цели
    // на поле может быть только золото
    const symbols = [
      ['ice', 'iJg', 'iJ'],
      ['box', 'bt123uvw', 'b123'],
      ['gold', 'gtuvw', 'gtuvw'],
    ] as const;
    for (const { id, layout, goals } of LEVELS) {
      const count = (chars: string) => [...layout.join('')].filter((s) => chars.includes(s)).length;
      for (const [kind, all, own] of symbols) {
        const goal = goals.find((g) => g.kind === kind)?.count;
        if (goal === undefined) expect(count(own), `уровень ${id}, ${kind}`).toBe(0);
        else expect(count(all), `уровень ${id}, ${kind}`).toBe(goal);
      }
    }
  });

  it('с коронами: на поле одна или две, цель — все; звёзды — за очки и ячейки', () => {
    for (const { id, layout, goals, stars } of LEVELS) {
      const crowns = layout.join('').split('o').length - 1;
      if (crowns === 0) continue;
      expect([1, 2], `уровень ${id}`).toContain(crowns);
      expect(goals.find((goal) => goal.kind === 'item')?.count, `уровень ${id}`).toBe(crowns);
      expect(
        stars.map((task) => task.kind),
        `уровень ${id}`,
      ).not.toContain('item');
    }
  });

  it('цветов 3, четыре — только на сплошном поле без дыр', () => {
    for (const { id, layout, colors } of LEVELS) {
      const solid = !layout.join('').includes('#');
      expect(colors, `уровень ${id}`).toBeLessThanOrEqual(solid ? 4 : 3);
    }
  });

  it('лёд не лежит в просветах тоньше 3 клеток', () => {
    const solid = (layout: readonly string[], row: number, col: number) =>
      [0, 1, 2].every((i) => [0, 1, 2].every((j) => (layout[row + i]?.[col + j] ?? '#') !== '#'));
    for (const { id, layout } of LEVELS) {
      layout.forEach((line, row) =>
        [...line].forEach((symbol, col) => {
          if (!'iJg'.includes(symbol)) return;
          const offsets = [0, 1, 2];
          const thick = offsets.some((i) => offsets.some((j) => solid(layout, row - i, col - j)));
          expect(thick, `уровень ${id}, клетка ${row},${col}`).toBe(true);
        }),
      );
    }
  });

  it('сундуки в цепях стоят не ближе 3 клеток друг от друга', () => {
    for (const { id, layout } of LEVELS) {
      const chains = layout.flatMap((line, row) =>
        [...line].flatMap((symbol, col) => ('123uvw'.includes(symbol) ? [{ row, col }] : [])),
      );
      chains.forEach((a, i) => {
        for (const b of chains.slice(i + 1)) {
          const distance = Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
          expect(
            distance,
            `уровень ${id}, клетки ${a.row},${a.col} и ${b.row},${b.col}`,
          ).toBeGreaterThanOrEqual(3);
          expect(a.row, `уровень ${id}: две цепи в строке ${a.row}`).not.toBe(b.row);
        }
      });
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
