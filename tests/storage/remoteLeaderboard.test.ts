import { describe, expect, it, vi } from 'vitest';
import {
  fetchRecords,
  fetchTop,
  requestTicket,
  submitAndFetch,
  wakeGameServer,
} from '../../src/storage/remoteLeaderboard';

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
    expect(query.get('apikey')).toBe('public-key');
    // Свои заголовки вызвали бы лишний предварительный запрос CORS
    expect(init.headers).toBeUndefined();
    expect(entries).toEqual([
      { id: 7, name: 'Аня', score: 900, playedAt: Date.parse('2026-10-30T10:00:00Z') },
      { id: 3, name: 'Боря', score: 500, playedAt: Date.parse('2026-10-29T10:00:00Z') },
    ]);
  });

  it('рекорды всех сложностей приходят одним запросом: первая строка сложности — лучшая', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse([
        { ...rows[0], difficulty: 'hard' },
        { ...rows[1], difficulty: 'kids' },
        { id: 1, name: 'Вася', score: 100, created_at: rows[0]!.created_at, difficulty: 'hard' },
      ]),
    );
    const records = await fetchRecords(config, fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url] = fetchFn.mock.calls[0] as unknown as [string];
    const query = new URL(url).searchParams;
    expect(query.get('order')).toBe('score.desc,created_at.asc');
    expect(query.get('limit')).toBe('50');
    expect(query.has('difficulty')).toBe(false);
    expect(records.hard?.name).toBe('Аня');
    expect(records.kids?.name).toBe('Боря');
    expect(records.easy).toBeUndefined();
  });

  it('пробуждение функции не ломает игру, даже если сервер недоступен', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(() => wakeGameServer(config, fetchFn)).not.toThrow();
    await Promise.resolve();
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://demo.supabase.co/functions/v1/smooth-handler');
    expect(init.method).toBe('POST');
    expect(init.headers).toBeUndefined();
  });

  it('пропускает строки неожиданного вида', async () => {
    const fetchFn = vi.fn(async () => jsonResponse([...rows, { id: 'x', name: 1 }]));
    expect(await fetchTop(config, 'kids', 10, fetchFn)).toHaveLength(2);
  });

  const submission = { ticketId: 'ticket', name: 'Боря', actions: [] };

  it('в функцию уходят билет, имя и журнал, очков в запросе нет; место — по номеру записи', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(rows))
      .mockResolvedValueOnce(jsonResponse({ entryId: 3, score: 500 }))
      .mockResolvedValueOnce(jsonResponse(rows));
    const { entries, rank, accepted, reason } = await submitAndFetch(
      config,
      'medium',
      submission,
      fetchFn,
    );

    const [url, init] = fetchFn.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://demo.supabase.co/functions/v1/smooth-handler');
    expect(init.method).toBe('POST');
    expect(init.headers).toBeUndefined();
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
      .mockResolvedValueOnce(jsonResponse(rows))
      .mockResolvedValueOnce(jsonResponse({ entryId: 99, score: 10 }))
      .mockResolvedValueOnce(jsonResponse(rows));
    expect((await submitAndFetch(config, 'medium', submission, fetchFn)).rank).toBeNull();
  });

  it.each(['limit', 'invalid'] as const)(
    'результат не принят (%s) — таблица всё равно приходит',
    async (reason) => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(rows))
        .mockResolvedValueOnce(jsonResponse({ reason }))
        .mockResolvedValueOnce(jsonResponse(rows));
      const result = await submitAndFetch(config, 'medium', submission, fetchFn);
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe(reason);
      expect(result.rank).toBeNull();
      expect(result.entries).toHaveLength(2);
    },
  );

  it('чтение: обрыв связи повторяется, и таблица приходит со следующей попытки', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(rows));
    expect(await fetchTop(config, 'kids', 10, fetchFn)).toHaveLength(2);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('чтение: ответ сервера с ошибкой не повторяется', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ message: 'нет' }, 401));
    await expect(fetchTop(config, 'kids', 10, fetchFn)).rejects.toThrow('401');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('билет: обрыв связи повторяется', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse({ id: 'ticket', seed: 123 }));
    expect(await requestTicket(config, 'hard', fetchFn)).toEqual({ id: 'ticket', seed: 123 });
  });

  it('результат записан, а таблица не прочиталась — это не потеря связи', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(rows))
      .mockResolvedValueOnce(jsonResponse({ entryId: 3, score: 500 }))
      .mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await submitAndFetch(config, 'medium', submission, fetchFn);
    expect(result).toEqual({ entries: null, rank: null, accepted: true, reason: null });
  });

  it('запись не повторяется: билет гасится один раз', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(rows))
      .mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(submitAndFetch(config, 'medium', submission, fetchFn)).rejects.toThrow('fetch');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('если подготовительное чтение не удалось, запись всё равно отправляется', async () => {
    const urls: string[] = [];
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      if (String(url).includes('/rest/v1/') && urls.length <= 4) throw new TypeError('offline');
      return String(url).includes('/functions/')
        ? jsonResponse({ entryId: 3, score: 500 })
        : jsonResponse(rows);
    });
    const { accepted } = await submitAndFetch(config, 'medium', submission, fetchFn);
    expect(accepted).toBe(true);
  });

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
