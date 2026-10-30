import { describe, expect, it } from 'vitest';
import { LevelSession } from '../../src/core/levelSession';
import { findPossibleMoves } from '../../src/core/moves';
import { CHAPTER_ONE, levelAfter } from '../../src/levels';

describe('первая глава', () => {
  it('10 уровней с номерами по порядку', () => {
    expect(CHAPTER_ONE.map((level) => level.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it.each(CHAPTER_ONE.map((level) => [level.id, level] as const))(
    'уровень %i: на разных seed поле собирается и на нём есть ход',
    (_, level) => {
      for (let seed = 1; seed <= 5; seed++) {
        const session = new LevelSession(seed, level);
        expect(findPossibleMoves(session.board).length).toBeGreaterThan(0);
      }
    },
  );

  it('на первом этаже из препятствий только лёд и дыры', () => {
    const symbols = CHAPTER_ONE.flatMap((level) => [...level.layout.join('')]);
    expect(new Set(symbols)).toEqual(new Set(['.', '#', 'i']));
  });

  it('следующий уровень идёт по порядку, у последнего его нет', () => {
    expect(levelAfter(1)?.id).toBe(2);
    expect(levelAfter(10)).toBeUndefined();
  });
});
