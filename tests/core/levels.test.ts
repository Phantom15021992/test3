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
