import { LEADERBOARD_SIZE, type DifficultyId } from '../core/config';
import type { GameAction } from '../core/session';
import type { LeaderboardEntry } from './leaderboard';

// Общая таблица лидеров в Supabase (таблица public.leaderboard, см. supabase/leaderboard.sql).
// Читаем напрямую через REST API (библиотека Supabase для этого не нужна), а записывает только
// серверная функция supabase/functions/game: она сама проигрывает партию и считает очки.
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

/** Билет на партию: seed поля выдаёт сервер, чтобы результат можно было проверить */
export interface GameTicket {
  id: string;
  seed: number;
}

export type RejectReason = 'limit' | 'invalid';

/** Запрос к серверной функции игры (supabase/functions/game) */
async function callGameServer(
  config: RemoteConfig,
  body: unknown,
  fetchFn: FetchFn,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchFn(`${config.url}/functions/v1/game`, {
      method: 'POST',
      signal: controller.signal,
      headers: { apikey: config.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Сервер игры ответил ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

/** Билет на новую партию; null — сервер недоступен (партия пойдёт только на этом устройстве) */
export async function requestTicket(
  config: RemoteConfig,
  difficulty: DifficultyId,
  fetchFn: FetchFn = fetch,
): Promise<GameTicket | null> {
  try {
    const { id, seed } = await callGameServer(config, { action: 'start', difficulty }, fetchFn);
    return typeof id === 'string' && typeof seed === 'number' ? { id, seed } : null;
  } catch {
    return null;
  }
}

/**
 * Отправляет журнал партии: очки считает и записывает сервер, браузер их не передаёт.
 * Возвращает свежую десятку и место игрока (null — не в десятке).
 * accepted: false — результат не принят, reason объясняет почему.
 */
export async function submitAndFetch(
  config: RemoteConfig,
  difficulty: DifficultyId,
  submission: { ticketId: string; name: string; actions: readonly GameAction[] },
  fetchFn: FetchFn = fetch,
): Promise<{
  entries: RemoteEntry[];
  rank: number | null;
  accepted: boolean;
  reason: RejectReason | null;
}> {
  const { ticketId, name, actions } = submission;
  const answer = await callGameServer(
    config,
    { action: 'finish', id: ticketId, name, actions },
    fetchFn,
  );
  const accepted = typeof answer.entryId === 'number';
  const entries = await fetchTop(config, difficulty, LEADERBOARD_SIZE, fetchFn);
  const rank = accepted ? entries.findIndex((entry) => entry.id === answer.entryId) : -1;
  const reason = accepted ? null : answer.reason === 'limit' ? 'limit' : 'invalid';
  return { entries, rank: rank >= 0 ? rank : null, accepted, reason };
}
