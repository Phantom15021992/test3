import { describe, expect, it } from 'vitest';
import { parseLevel, type Level } from '../../src/core/level';
import { LevelSession } from '../../src/core/levelSession';

function level(overrides: Partial<Level> = {}): Level {
  return {
    id: 1,
    title: 'Золото',
    hint: '',
    layout: ['......', '.JJJJ.', '.JJbb.', '......'],
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

/** Где спрятано золото: льдины со слитками и сундуки с сокровищами */
function goldSpots(session: LevelSession): string[] {
  const spots: string[] = [];
  session.board.forEach((line, row) =>
    line.forEach((cell, col) => {
      if (session.iceStyle[row]![col] === 'gold') spots.push(`лёд ${row},${col}`);
      if (cell?.kind === 'box' && cell.treasure) spots.push(`сундук ${row},${col}`);
    }),
  );
  return spots;
}

describe('спрятанное золото', () => {
  it('ровно hiddenGold мест с золотом среди льда 2 уровня и сундуков, остальные — пустышки', () => {
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
      parseLevel(level({ hiddenGold: undefined, goals: [{ kind: 'ice', count: 3 }] })),
    );
    expect(tiles(new LevelSession(7, parseLevel(level())))).toBe(tiles(plain));
  });

  it('цель «золото» считает спрятанное; больше мест, чем льдин и сундуков, — ошибка', () => {
    expect(() => parseLevel(level({ goals: [{ kind: 'gold', count: 4 }] }))).toThrow('больше');
    expect(() => parseLevel(level({ hiddenGold: 9 }))).toThrow('hiddenGold');
  });
});
