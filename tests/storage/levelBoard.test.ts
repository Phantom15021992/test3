import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  betterResult,
  fetchLevelBoard,
  loadCampaignName,
  localBest,
  normalizeCampaignName,
  parseBoard,
  playerId,
  rememberBest,
  saveCampaignName,
  submitLevelBoard,
} from '../../src/storage/levelBoard';

const config = { url: 'https://example.test', key: 'public-key' };

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
});

describe('таблица лидеров уровня', () => {
  it('порядок: больше звёзд, потом меньше ходов, потом больше очков', () => {
    const base = { stars: 2, moves: 20, score: 1000 };
    expect(betterResult({ ...base, stars: 3, moves: 40 }, base)).toBe(true);
    expect(betterResult({ ...base, moves: 18, score: 10 }, base)).toBe(true);
    expect(betterResult({ ...base, score: 1500 }, base)).toBe(true);
    expect(betterResult({ ...base, moves: 21, score: 9000 }, base)).toBe(false);
    expect(betterResult(base, base)).toBe(false);
  });

  it('ник: пробелы обрезаются, не длиннее 16 символов, пустой — не ник; запоминается', () => {
    expect(normalizeCampaignName('  Вася  ')).toBe('Вася');
    expect(normalizeCampaignName('   ')).toBeNull();
    expect(normalizeCampaignName('a'.repeat(30))).toHaveLength(16);
    expect(loadCampaignName()).toBe('');
    saveCampaignName('Вася');
    expect(loadCampaignName()).toBe('Вася');
  });

  it('id игрока создаётся один раз и потом тот же', () => {
    const id = playerId();
    expect(id.length).toBeGreaterThanOrEqual(8);
    expect(playerId()).toBe(id);
  });

  it('лучший итог на устройстве не затирается худшим', () => {
    rememberBest(5, { stars: 2, moves: 20, score: 1000 });
    rememberBest(5, { stars: 1, moves: 10, score: 5000 });
    expect(localBest(5)).toEqual({ stars: 2, moves: 20, score: 1000 });
    rememberBest(5, { stars: 2, moves: 15, score: 100 });
    expect(localBest(5)).toEqual({ stars: 2, moves: 15, score: 100 });
    expect(localBest(6)).toBeNull();
  });

  it('ответ сервера проверяется: чужое — null', () => {
    const row = { rank: 1, name: 'Вася', stars: 3, moves: 12, score: 900, me: true };
    expect(parseBoard([row])).toEqual([row]);
    expect(parseBoard([{ ...row, stars: '3' }])).toBeNull();
    expect(parseBoard({ rows: [] })).toBeNull();
  });

  it('отправка и чтение вызывают функции базы с id игрока, но без лишнего', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      return new Response('[]', { status: 200 });
    }) as unknown as typeof fetch;
    await submitLevelBoard(config, 7, 'Вася', { stars: 3, moves: 12, score: 900 }, fetchFn);
    await fetchLevelBoard(config, 7, fetchFn);
    expect(calls[0]!.url).toContain('/rest/v1/rpc/level_board_submit');
    expect(calls[0]!.body).toEqual({
      p_level: 7,
      p_player: playerId(),
      p_name: 'Вася',
      p_stars: 3,
      p_moves: 12,
      p_score: 900,
    });
    expect(calls[1]!.url).toContain('/rest/v1/rpc/level_board_read');
    expect(calls[1]!.body).toEqual({ p_level: 7, p_player: playerId() });
  });
});
