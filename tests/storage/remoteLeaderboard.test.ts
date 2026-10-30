import { describe, expect, it, vi } from 'vitest';
import { fetchTop, submitAndFetch } from '../../src/storage/remoteLeaderboard';

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

  it('отправляет только сложность, имя и очки, место — по номеру новой записи', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ id: 3 }], 201))
      .mockResolvedValueOnce(jsonResponse(rows));
    const { entries, rank } = await submitAndFetch(config, 'medium', 'Боря', 500, fetchFn);

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      difficulty: 'medium',
      name: 'Боря',
      score: 500,
    });
    expect(entries).toHaveLength(2);
    expect(rank).toBe(1);
  });

  it('результат вне десятки — места нет', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ id: 99 }], 201))
      .mockResolvedValueOnce(jsonResponse(rows));
    expect((await submitAndFetch(config, 'medium', 'Вася', 10, fetchFn)).rank).toBeNull();
  });

  it('база не сохранила запись (частая отправка) — результат не принят, таблица всё равно приходит', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([], 201))
      .mockResolvedValueOnce(jsonResponse(rows));
    const result = await submitAndFetch(config, 'medium', 'Вася', 500, fetchFn);
    expect(result.accepted).toBe(false);
    expect(result.rank).toBeNull();
    expect(result.entries).toHaveLength(2);
  });

  it('принятая запись помечается как принятая', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ id: 3 }], 201))
      .mockResolvedValueOnce(jsonResponse(rows));
    expect((await submitAndFetch(config, 'medium', 'Боря', 500, fetchFn)).accepted).toBe(true);
  });

  it('ошибка сервера — исключение (игра покажет локальную таблицу)', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ message: 'нет' }, 401));
    await expect(fetchTop(config, 'easy', 10, fetchFn)).rejects.toThrow('401');
  });
});
