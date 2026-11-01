import { describe, expect, it } from 'vitest';
import { findRun, levelHash, parseLevelNumber, type BotRun } from '../../scripts/botStats';
import type { Level } from '../../src/core/level';

const level: Level = {
  id: 40,
  title: 'Восьмёрка',
  hint: '',
  layout: ['....', '....'],
  colors: 4,
  moves: 27,
  goals: [{ kind: 'chain', count: 5 }],
  stars: [
    { kind: 'movesLeft', count: 1 },
    { kind: 'movesLeft', count: 6 },
  ],
};

const run = (overrides: Partial<BotRun>): BotRun => ({
  date: '2026-11-01T00:00:00.000Z',
  commit: 'abc1234',
  engine: 'e1',
  levelId: 40,
  number: '4-10',
  hash: 'h1',
  moves: 27,
  colors: 4,
  games: 100,
  novice: 2,
  expert: 25,
  buyer: 70,
  threeStars: 10,
  leftExpert: 5,
  leftBuyer: 10,
  lostGoals: 60,
  ...overrides,
});

describe('версия уровня', () => {
  it('хеш не зависит от порядка полей', () => {
    const shuffled = Object.fromEntries(Object.entries(level).reverse()) as unknown as Level;
    expect(levelHash(shuffled)).toBe(levelHash(level));
  });

  it('любая правка уровня даёт новый хеш', () => {
    expect(levelHash({ ...level, moves: 28 })).not.toBe(levelHash(level));
    expect(levelHash({ ...level, goals: [{ kind: 'chain', count: 6 }] })).not.toBe(
      levelHash(level),
    );
  });
});

describe('поиск замера', () => {
  it('берёт самый свежий замер того же уровня и той же логики', () => {
    const runs = [run({ expert: 10 }), run({ expert: 20 })];
    expect(findRun(runs, 'h1', 'e1', 100)?.expert).toBe(20);
  });

  it('другой уровень или логика — пересчёт', () => {
    expect(findRun([run({})], 'h2', 'e1', 100)).toBeUndefined();
    expect(findRun([run({})], 'h1', 'e2', 100)).toBeUndefined();
  });

  it('замер на меньшем числе партий не подходит, на большем подходит', () => {
    expect(findRun([run({ games: 50 })], 'h1', 'e1', 100)).toBeUndefined();
    expect(findRun([run({ games: 200 })], 'h1', 'e1', 100)?.games).toBe(200);
  });
});

describe('номер уровня', () => {
  it('этаж-место переводится в id', () => {
    expect(parseLevelNumber('4-10', 10)).toBe(40);
    expect(parseLevelNumber('1-1', 10)).toBe(1);
  });

  it('неверный номер отклоняется', () => {
    expect(parseLevelNumber('4-11', 10)).toBeNull();
    expect(parseLevelNumber('abc', 10)).toBeNull();
  });
});
