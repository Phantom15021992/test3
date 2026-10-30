import { DIFFICULTIES, LEADERBOARD_SIZE, type DifficultyId } from '../core/config';
import type { GameAction } from '../core/session';
import type { LeaderboardEntry } from './leaderboard';

// Общая таблица лидеров в Supabase (таблица public.leaderboard, см. supabase/leaderboard.sql).
// Читаем напрямую через REST API (библиотека Supabase для этого не нужна), а записывает только
// серверная функция supabase/functions/smooth-handler: она сама проигрывает партию и считает очки.
// Ключ — публичный (anon / publishable): права ограничены правилами в базе, его можно
// держать в коде игры. Секретный ключ (service_role / secret) сюда класть нельзя.

export interface RemoteConfig {
  url: string;
  key: string;
}

// На части устройств новое соединение с Supabase зависает без ответа и ошибки, а следующая
// попытка проходит. Поэтому зависший запрос обрываем и повторяем сами (см. AGENTS.md).
const READ_ATTEMPTS = 4;
const READ_TIMEOUT_MS = 4000;
/** Билет ждём дольше: функция после простоя просыпается секундами */
const TICKET_ATTEMPTS = 3;
const TICKET_TIMEOUT_MS = 8000;
/**
 * Запись не повторяем: билет гасится один раз, и повтор отклонился бы, даже если первая попытка
 * прошла. Ждём долго: функция могла уснуть за партию, а потом ещё проигрывает её целиком.
 */
const SUBMIT_TIMEOUT_MS = 20000;
const RETRY_PAUSE_MS = 300;

type FetchFn = typeof fetch;

/** Сервер ответил ошибкой: связь есть, повторять незачем */
class ServerAnswerError extends Error {}

/** Выполняет запрос, обрывая зависшую попытку и повторяя при обрыве связи */
async function withRetries<T>(
  attempts: number,
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await run(controller.signal);
    } catch (error) {
      if (error instanceof ServerAnswerError || attempt >= attempts) throw error;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
  }
}

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

/**
 * Чтение таблицы лидеров. Ключ — в адресе, а не в заголовке: без своих заголовков браузеру
 * не нужен предварительный запрос CORS, и ответ приходит на один запрос раньше.
 */
async function readLeaderboard(
  config: RemoteConfig,
  query: URLSearchParams,
  fetchFn: FetchFn,
): Promise<unknown> {
  query.set('apikey', config.key);
  return withRetries(READ_ATTEMPTS, READ_TIMEOUT_MS, async (signal) => {
    const response = await fetchFn(`${config.url}/rest/v1/leaderboard?${query}`, { signal });
    if (!response.ok) {
      throw new ServerAnswerError(`Сервер таблицы лидеров ответил ${response.status}`);
    }
    return response.json();
  });
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
  const data = await readLeaderboard(config, query, fetchFn);
  return Array.isArray(data) ? data.filter(isRow).map(toEntry) : [];
}

/**
 * Лучший результат каждой сложности — одним запросом. В таблице не больше десятки на сложность,
 * поэтому все строки помещаются в ответ, а первая строка сложности и есть её рекорд.
 */
export async function fetchRecords(
  config: RemoteConfig,
  fetchFn: FetchFn = fetch,
): Promise<Partial<Record<DifficultyId, RemoteEntry>>> {
  const query = new URLSearchParams({
    select: 'id,name,score,created_at,difficulty',
    order: 'score.desc,created_at.asc',
    limit: String(LEADERBOARD_SIZE * DIFFICULTIES.length),
  });
  const data = await readLeaderboard(config, query, fetchFn);
  const records: Partial<Record<DifficultyId, RemoteEntry>> = {};
  for (const row of Array.isArray(data) ? data : []) {
    if (!isRow(row)) continue;
    const { difficulty } = row as Row & { difficulty?: DifficultyId };
    if (difficulty && !records[difficulty]) records[difficulty] = toEntry(row);
  }
  return records;
}

/**
 * Будит серверную функцию, пока игрок выбирает сложность: после простоя её первый ответ
 * занимает секунды, и без этого их пришлось бы ждать при запуске партии.
 */
export function wakeGameServer(config: RemoteConfig, fetchFn: FetchFn = fetch): void {
  fetchFn(gameServerUrl(config), { method: 'POST', body: '{"action":"ping"}' }).catch(() => {
    // Не проснулась — партия всё равно попросит билет как обычно
  });
}

/** Билет на партию: seed поля выдаёт сервер, чтобы результат можно было проверить */
export interface GameTicket {
  id: string;
  seed: number;
}

export type RejectReason = 'limit' | 'invalid';

const gameServerUrl = (config: RemoteConfig) => `${config.url}/functions/v1/smooth-handler`;

/** Запрос к серверной функции игры (supabase/functions/smooth-handler) */
async function callGameServer(
  config: RemoteConfig,
  body: unknown,
  fetchFn: FetchFn,
  limits: { attempts: number; timeoutMs: number },
): Promise<Record<string, unknown>> {
  return withRetries(limits.attempts, limits.timeoutMs, async (signal) => {
    const response = await fetchFn(gameServerUrl(config), {
      method: 'POST',
      signal,
      // Без своих заголовков: иначе нужен предварительный запрос CORS (см. readLeaderboard).
      // Функция разобрана как JSON и без Content-Type, а ключ ей не нужен
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new ServerAnswerError(`Сервер игры ответил ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  });
}

/** Билет на новую партию; null — сервер недоступен (партия пойдёт только на этом устройстве) */
export async function requestTicket(
  config: RemoteConfig,
  difficulty: DifficultyId,
  fetchFn: FetchFn = fetch,
): Promise<GameTicket | null> {
  try {
    const { id, seed } = await callGameServer(config, { action: 'start', difficulty }, fetchFn, {
      attempts: TICKET_ATTEMPTS,
      timeoutMs: TICKET_TIMEOUT_MS,
    });
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
  // Сначала чтение с повторами: оно поднимает соединение, и запись, которую повторять нельзя,
  // идёт уже по рабочему. Не вышло — всё равно пробуем записать
  await fetchTop(config, difficulty, 1, fetchFn).catch(() => []);
  const answer = await callGameServer(
    config,
    { action: 'finish', id: ticketId, name, actions },
    fetchFn,
    { attempts: 1, timeoutMs: SUBMIT_TIMEOUT_MS },
  );
  const accepted = typeof answer.entryId === 'number';
  const entries = await fetchTop(config, difficulty, LEADERBOARD_SIZE, fetchFn);
  const rank = accepted ? entries.findIndex((entry) => entry.id === answer.entryId) : -1;
  const reason = accepted ? null : answer.reason === 'limit' ? 'limit' : 'invalid';
  return { entries, rank: rank >= 0 ? rank : null, accepted, reason };
}
