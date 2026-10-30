import { describe, expect, it, vi } from 'vitest';
import { createGameStats, recordPurchase } from '../../src/core/gameStats';
import { sendGameResult, type GameResult } from '../../src/storage/gameResults';

const config = { url: 'https://demo.supabase.co', key: 'public-key' };

function result(): GameResult {
  const stats = createGameStats();
  recordPurchase(stats, 'rocket', 300);
  stats.level2Created = 12;
  return {
    difficulty: 'hard',
    score: 4200,
    movesMade: 35,
    durationSec: 312,
    finalePoints: 650,
    shuffles: 1,
    stats,
    device: 'touch',
    screenWidth: 390,
    screenHeight: 844,
    version: 'abc1234',
  };
}

describe('запись партии для анализа', () => {
  it('отправляет все показатели партии без имени игрока', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 201 }));
    await sendGameResult(config, result(), fetchFn);

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://demo.supabase.co/rest/v1/game_results');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      difficulty: 'hard',
      score: 4200,
      moves_made: 35,
      duration_sec: 312,
      finale_points: 650,
      shuffles: 1,
      level2_created: 12,
      level3_created: 0,
      specials_from_matches: 0,
      specials_activated: 0,
      bought_bomb: 0,
      bought_rocket: 1,
      bought_manipulator: 0,
      bought_rainbow: 0,
      points_spent: 300,
      device: 'touch',
      screen_width: 390,
      screen_height: 844,
      version: 'abc1234',
    });
    expect('name' in body).toBe(false);
  });

  it('ошибка сети не роняет игру', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(sendGameResult(config, result(), fetchFn)).resolves.toBeUndefined();
  });
});
