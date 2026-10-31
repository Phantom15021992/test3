import { describe, expect, it, vi } from 'vitest';
import { createGameStats } from '../../src/core/gameStats';
import type { Level } from '../../src/core/level';
import { LevelSession } from '../../src/core/levelSession';
import { sendLevelResult, toLevelRow, type LevelResult } from '../../src/storage/levelResults';

const result = (): LevelResult => ({
  levelId: 17,
  outcome: 'lost',
  stars: 0,
  movesMade: 20,
  movesLeft: 0,
  goalsPercent: 75,
  shuffles: 1,
  durationSec: 90,
  starsSpent: 3,
  stats: createGameStats(),
  device: 'touch',
  screenWidth: 400,
  screenHeight: 800,
  version: 'abc1234',
});

const level: Level = {
  id: 1,
  title: 'Проба',
  hint: '',
  layout: ['....', '....', '....', '....'],
  colors: 4,
  moves: 10,
  goals: [
    { kind: 'level2', count: 4 },
    { kind: 'level3', count: 2 },
  ],
  stars: [
    { kind: 'movesLeft', count: 1 },
    { kind: 'movesLeft', count: 2 },
  ],
};

describe('запись попытки уровня', () => {
  it('столбцы как в таблице level_results, без имени и IP', () => {
    const row = toLevelRow(result());
    expect(row).toMatchObject({ level_id: 17, outcome: 'lost', goals_percent: 75, stars_spent: 3 });
    expect(Object.keys(row)).not.toEqual(expect.arrayContaining(['name']));
    expect(Object.keys(row)).not.toEqual(expect.arrayContaining(['ip']));
  });

  it('ошибка сети игре не мешает', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('нет связи'));
    await expect(
      sendLevelResult({ url: 'https://example.test', key: 'k' }, result(), fetchFn),
    ).resolves.toBeUndefined();
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain('/rest/v1/level_results');
  });

  it('процент целей усредняется, а покупки попадают в статистику', () => {
    const session = new LevelSession(5, level, 3);
    session.progress.level2 = 2;
    session.progress.level3 = 2;
    expect(session.goalsPercent).toBe(75);
    expect(session.buy('bomb')).not.toBeNull();
    expect(session.stats.bought.bomb).toBe(1);
    expect(session.stats.pointsSpent).toBe(0);
  });
});
