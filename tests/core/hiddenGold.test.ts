import { describe, expect, it } from 'vitest';
import { parseLevel, type Level } from '../../src/core/level';
import { LevelSession } from '../../src/core/levelSession';

function level(overrides: Partial<Level> = {}): Level {
  return {
    id: 1,
    title: 'Золото',
    hint: '',
    layout: ['......', '.JbbJ.', '.bb11.', '......'],
    colors: 3,
    moves: 20,
    goals: [{ kind: 'gold', count: 3 }],
    stars: [
      { kind: 'level3', count: 10 },
      { kind: 'level3', count: 15 },
    ],
    hiddenGold: 3,
    ...overrides,
  };
}

/** Где спрятано золото: только сундуки с сокровищами (во льду золота больше нет) */
function goldSpots(session: LevelSession): string[] {
  const spots: string[] = [];
  session.board.forEach((line, row) =>
    line.forEach((cell, col) => {
      if (cell?.kind === 'box' && cell.treasure) spots.push(`${row},${col}`);
    }),
  );
  return spots;
}

describe('спрятанное золото', () => {
  it('ровно hiddenGold сундуков с золотом, остальные — пустышки; лёд золота не прячет', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(goldSpots(new LevelSession(seed, parseLevel(level())))).toHaveLength(3);
    }
  });

  it('где золото — решает seed попытки; поле фишек от этого не меняется', () => {
    const layouts = new Set(
      [1, 2, 3, 4, 5, 6].map((seed) =>
        goldSpots(new LevelSession(seed, parseLevel(level()))).join(';'),
      ),
    );
    expect(layouts.size).toBeGreaterThan(1);
    const tiles = (session: LevelSession) =>
      JSON.stringify(
        session.board.map((line) => line.map((cell) => cell?.kind === 'tile' && cell)),
      );
    const plain = new LevelSession(
      7,
      parseLevel(level({ hiddenGold: undefined, goals: [{ kind: 'ice', count: 2 }] })),
    );
    expect(tiles(new LevelSession(7, parseLevel(level())))).toBe(tiles(plain));
  });

  it('цель «золото» считает спрятанное; больше мест, чем сундуков без сокровищ, — ошибка', () => {
    expect(() => parseLevel(level({ goals: [{ kind: 'gold', count: 4 }] }))).toThrow('больше');
    expect(() => parseLevel(level({ hiddenGold: 7 }))).toThrow('hiddenGold');
  });
});
