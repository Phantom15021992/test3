import { describe, expect, it, vi } from 'vitest';
import { sendLevelMoves, toMovesRow } from '../../src/storage/levelMoves';

const moves = {
  levelId: 15,
  version: 'abc1234',
  seed: 4294967295,
  wallet: 7,
  outcome: 'lost',
  movesMade: 2,
  actions: [
    { type: 'aim', bonus: 'bomb', at: { row: 1, col: 2 } },
    { type: 'fire', at: { row: 1, col: 2 } },
  ],
} as const;

describe('ходы попытки уровня', () => {
  it('журнал уходит массивом JSON, а не строкой', async () => {
    expect(toMovesRow(moves)).toEqual({
      level_id: 15,
      version: 'abc1234',
      seed: 4294967295,
      wallet: 7,
      outcome: 'lost',
      moves_made: 2,
      actions: moves.actions,
    });
    const fetchFn = vi.fn(() => Promise.resolve(new Response(null, { status: 201 })));
    await sendLevelMoves({ url: 'https://x.supabase.co', key: 'k' }, moves, fetchFn);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/rest/v1/level_moves');
    expect(JSON.parse(init.body as string).actions).toEqual(moves.actions);
  });

  it('ошибка сети игре не мешает', async () => {
    const fetchFn = vi.fn(() => Promise.reject(new Error('offline')));
    await expect(
      sendLevelMoves({ url: 'https://x.supabase.co', key: 'k' }, moves, fetchFn),
    ).resolves.toBeUndefined();
  });
});
