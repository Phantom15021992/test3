import { describe, expect, it, vi } from 'vitest';
import { fetchTop, requestTicket, submitAndFetch } from '../../src/storage/remoteLeaderboard';

const config = { url: 'https://demo.supabase.co', key: 'public-key' };

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const rows = [
  { id: 7, name: 'Аня', score: 900, created_at: '2026-10-30T10:00:00Z' },
  { id: 3, name: 'Боря', score: 500, created_at: '2026-10-29T10:00:00Z' },
];

describe('общая таблица лидеров (Supabase)', () => {
  it('запрашивает десятку нужной сложности по очкам и времени, с публичным ключом', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(rows));
    const entries = await fetchTop(config, 'hard', 10, fetchFn);

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const query = new URL(url).searchParams;
    expect(url.startsWith('https://demo.supabase.co/rest/v1/leaderboard?')).toBe(true);
    expect(query.get('difficulty')).toBe('eq.hard');
    expect(query.get('order')).toBe('score.desc,created_at.asc');
    expect(query.get('limit')).toBe('10');
    expect((init.headers as Record<string, string>).apikey).toBe('public-key');
    expect(entries).toEqual([
      { id: 7, name: 'Аня', score: 900, playedAt: Date.parse('2026-10-30T10:00:00Z') },
      { id: 3, name: 'Боря', score: 500, playedAt: Date.parse('2026-10-29T10:00:00Z') },
    ]);
  });

  it('пропускает строки неожиданного вида', async () => {
    const fetchFn = vi.fn(async () => jsonResponse([...rows, { id: 'x', name: 1 }]));
    expect(await fetchTop(config, 'kids', 10, fetchFn)).toHaveLength(2);
  });

  const submission = { ticketId: 'ticket', name: 'Боря', actions: [] };

  it('в функцию уходят билет, имя и журнал, очков в запросе нет; место — по номеру записи', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ entryId: 3, score: 500 }))
      .mockResolvedValueOnce(jsonResponse(rows));
    const { entries, rank, accepted, reason } = await submitAndFetch(
      config,
      'medium',
      submission,
      fetchFn,
    );

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://demo.supabase.co/functions/v1/game');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      action: 'finish',
      id: 'ticket',
      name: 'Боря',
      actions: [],
    });
    expect(entries).toHaveLength(2);
    expect(rank).toBe(1);
    expect(accepted).toBe(true);
    expect(reason).toBeNull();
  });

  it('результат вне десятки — места нет', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ entryId: 99, score: 10 }))
      .mockResolvedValueOnce(jsonResponse(rows));
    expect((await submitAndFetch(config, 'medium', submission, fetchFn)).rank).toBeNull();
  });

  it.each(['limit', 'invalid'] as const)(
    'результат не принят (%s) — таблица всё равно приходит',
    async (reason) => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ reason }))
        .mockResolvedValueOnce(jsonResponse(rows));
      const result = await submitAndFetch(config, 'medium', submission, fetchFn);
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe(reason);
      expect(result.rank).toBeNull();
      expect(result.entries).toHaveLength(2);
    },
  );

  it('билет на партию: id и seed с сервера', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ id: 'ticket', seed: 123 }));
    expect(await requestTicket(config, 'hard', fetchFn)).toEqual({ id: 'ticket', seed: 123 });
  });

  it('сервер недоступен — партия идёт без билета', async () => {
    const offline = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await requestTicket(config, 'hard', offline)).toBeNull();
    const refused = vi.fn(async () => jsonResponse({ error: 'limit' }, 429));
    expect(await requestTicket(config, 'hard', refused)).toBeNull();
  });

  it('ошибка сервера — исключение (игра покажет локальную таблицу)', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ message: 'нет' }, 401));
    await expect(fetchTop(config, 'easy', 10, fetchFn)).rejects.toThrow('401');
  });
});
