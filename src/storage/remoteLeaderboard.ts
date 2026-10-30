import { LEADERBOARD_SIZE, type DifficultyId } from '../core/config';
import type { LeaderboardEntry } from './leaderboard';

// Общая таблица лидеров в Supabase (таблица public.leaderboard, см. supabase/leaderboard.sql).
// Работаем напрямую через REST API: библиотека Supabase для двух запросов не нужна.
// Ключ — публичный (anon / publishable): права ограничены правилами в базе, его можно
// держать в коде игры. Секретный ключ (service_role / secret) сюда класть нельзя.

export interface RemoteConfig {
  url: string;
  key: string;
}

/** Сколько ждать ответа сервера, прежде чем показать локальную таблицу */
const REQUEST_TIMEOUT_MS = 6000;

type FetchFn = typeof fetch;

/** Настройки из переменных окружения сборки; null — общая таблица не подключена */
export function remoteConfig(): RemoteConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_KEY;
  return url && key ? { url: url.replace(/\/+$/, ''), key } : null;
}

interface Row {
  id: number;
  name: string;
  score: number;
  created_at: string;
}

export interface RemoteEntry extends LeaderboardEntry {
  id: number;
}

function isRow(value: unknown): value is Row {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'number' &&
    typeof v.name === 'string' &&
    typeof v.score === 'number' &&
    typeof v.created_at === 'string'
  );
}

function toEntry(row: Row): RemoteEntry {
  return { id: row.id, name: row.name, score: row.score, playedAt: Date.parse(row.created_at) };
}

async function request(
  config: RemoteConfig,
  path: string,
  init: RequestInit,
  fetchFn: FetchFn,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchFn(`${config.url}/rest/v1/${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    if (!response.ok) throw new Error(`Сервер таблицы лидеров ответил ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Лучшие результаты сложности: по очкам, при равенстве — кто раньше */
export async function fetchTop(
  config: RemoteConfig,
  difficulty: DifficultyId,
  limit = LEADERBOARD_SIZE,
  fetchFn: FetchFn = fetch,
): Promise<RemoteEntry[]> {
  const query = new URLSearchParams({
    select: 'id,name,score,created_at',
    difficulty: `eq.${difficulty}`,
    order: 'score.desc,created_at.asc',
    limit: String(limit),
  });
  const data = await request(config, `leaderboard?${query}`, { method: 'GET' }, fetchFn);
  return Array.isArray(data) ? data.filter(isRow).map(toEntry) : [];
}

/**
 * Отправляет результат и возвращает свежую десятку и место игрока в ней
 * (null — если в десятку он не попал).
 * accepted: false — база не сохранила запись (с этого IP отправляли чаще раза в минуту
 * или он заблокирован, см. supabase/rate_limit.sql): в ответе тогда нет новой строки.
 */
export async function submitAndFetch(
  config: RemoteConfig,
  difficulty: DifficultyId,
  name: string,
  score: number,
  fetchFn: FetchFn = fetch,
): Promise<{ entries: RemoteEntry[]; rank: number | null; accepted: boolean }> {
  const inserted = await request(
    config,
    'leaderboard?select=id',
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ difficulty, name, score }),
    },
    fetchFn,
  );
  const id = Array.isArray(inserted)
    ? (inserted[0] as { id?: unknown } | undefined)?.id
    : undefined;
  const accepted = typeof id === 'number';
  const entries = await fetchTop(config, difficulty, LEADERBOARD_SIZE, fetchFn);
  const rank = accepted ? entries.findIndex((entry) => entry.id === id) : -1;
  return { entries, rank: rank >= 0 ? rank : null, accepted };
}
