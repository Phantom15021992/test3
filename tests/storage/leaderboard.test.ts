import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAYER_NAME,
  insertEntry,
  loadLeaderboard,
  normalizeName,
  saveLeaderboard,
  type LeaderboardEntry,
} from '../../src/storage/leaderboard';

const entry = (score: number, playedAt = score): LeaderboardEntry => ({
  name: `p${score}`,
  score,
  playedAt,
});

describe('таблица лидеров', () => {
  it('результаты по убыванию очков, место нового результата', () => {
    const { entries, rank } = insertEntry([entry(500), entry(100)], entry(300));
    expect(entries.map((e) => e.score)).toEqual([500, 300, 100]);
    expect(rank).toBe(1);
  });

  it('хранит только 10 лучших; слабый результат в таблицу не попадает', () => {
    const full = Array.from({ length: 10 }, (_, i) => entry((i + 1) * 100));
    const strong = insertEntry(full, entry(550));
    expect(strong.entries).toHaveLength(10);
    expect(strong.entries.at(-1)!.score).toBe(200);
    expect(strong.rank).toBe(5);
    const weak = insertEntry(full, entry(50));
    expect(weak.rank).toBeNull();
    expect(weak.entries).toHaveLength(10);
  });

  it('при равных очках выше тот, кто набрал их раньше', () => {
    const { rank } = insertEntry([entry(300, 1)], entry(300, 2));
    expect(rank).toBe(1);
  });

  it('имя обрезается до 16 символов, пустое — «Игрок»', () => {
    expect(normalizeName('  Очень-очень длинное имя  ')).toBe('Очень-очень длин');
    expect(normalizeName('   ')).toBe(DEFAULT_PLAYER_NAME);
  });
});

describe('хранилище таблицы лидеров', () => {
  it('без localStorage (как в тестах под Node) таблица просто пустая, без ошибок', () => {
    expect(loadLeaderboard('medium')).toEqual([]);
    expect(() => saveLeaderboard('medium', [])).not.toThrow();
  });
});
