import { PLAYER_NAME_MAX_LENGTH } from '../core/config';
import { withRetries, type RemoteConfig } from './remoteLeaderboard';

// Таблица лидеров уровней кампании (таблица level_board, см. supabase/level_board.sql): ник, звёзды,
// ходы и очки лучшей победы каждого игрока на уровне. Игрок узнаётся по случайному id из этого браузера,
// поэтому смена ника не плодит новые строки. Итог сервер не проверяет (так решил владелец).

const NAME_KEY = 'match3.campaignName';
const PLAYER_KEY = 'match3.playerId';
const BEST_KEY = 'match3.levelBest';
const ATTEMPTS = 3;
const TIMEOUT_MS = 8000;
/** Сколько лучших строк уровня показывать */
export const LEVEL_BOARD_SIZE = 10;

export interface LevelBoardRow {
  rank: number;
  name: string;
  stars: number;
  moves: number;
  score: number;
  /** Строка этого игрока */
  me: boolean;
}

/** Итог победы на уровне: так он и сравнивается с другими */
export interface LevelBoardResult {
  stars: number;
  moves: number;
  score: number;
}

/**
 * Лучше ли итог a, чем b: больше звёзд, при равенстве — меньше ходов, потом — больше очков
 * (как в таблице на сервере)
 */
export function betterResult(a: LevelBoardResult, b: LevelBoardResult): boolean {
  if (a.stars !== b.stars) return a.stars > b.stars;
  if (a.moves !== b.moves) return a.moves < b.moves;
  return a.score > b.score;
}

/** Ник кампании; пустая строка — ещё не вводили */
export function loadCampaignName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Ник без лишних пробелов и не длиннее, чем помещается в таблицу; пустой — null */
export function normalizeCampaignName(name: string): string | null {
  const trimmed = name.trim().slice(0, PLAYER_NAME_MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

export function saveCampaignName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Без хранилища ник спросим снова при следующем заходе в кампанию
  }
}

/** Случайный id игрока: создаётся один раз и живёт в этом браузере */
export function playerId(): string {
  try {
    const known = localStorage.getItem(PLAYER_KEY);
    if (known && known.length >= 8) return known;
  } catch {
    // Без хранилища id будет новым при каждом заходе
  }
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    localStorage.setItem(PLAYER_KEY, id);
  } catch {
    // См. выше
  }
  return id;
}

function loadBest(): Record<string, LevelBoardResult> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}');
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, LevelBoardResult>)
      : {};
  } catch {
    return {};
  }
}

/** Лучший итог этого игрока на уровне — на случай, когда сервер недоступен */
export function localBest(levelId: number): LevelBoardResult | null {
  const best = loadBest()[levelId];
  return best && typeof best.stars === 'number' ? best : null;
}

/** Запоминает итог, если он лучше прошлого; возвращает лучший */
export function rememberBest(levelId: number, result: LevelBoardResult): LevelBoardResult {
  const all = loadBest();
  const old = all[levelId];
  const best = old && !betterResult(result, old) ? old : result;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify({ ...all, [levelId]: best }));
  } catch {
    // Без хранилища лучший итог живёт до перезагрузки
  }
  return best;
}

function isRow(value: unknown): value is LevelBoardRow {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.rank === 'number' &&
    typeof v.name === 'string' &&
    typeof v.stars === 'number' &&
    typeof v.moves === 'number' &&
    typeof v.score === 'number' &&
    typeof v.me === 'boolean'
  );
}

/** Ответ сервера → строки таблицы; что-то не то — null */
export function parseBoard(value: unknown): LevelBoardRow[] | null {
  return Array.isArray(value) && value.every(isRow) ? value : null;
}

/** Вызов функции базы: JSON с заголовком, поэтому с предварительным запросом CORS, как перенос прогресса */
async function call(
  config: RemoteConfig,
  name: string,
  args: unknown,
  fetchFn: typeof fetch,
): Promise<LevelBoardRow[] | null> {
  const data = await withRetries(ATTEMPTS, TIMEOUT_MS, async (signal) => {
    const response = await fetchFn(`${config.url}/rest/v1/rpc/${name}?apikey=${config.key}`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error(`База ответила ${response.status}`);
    return response.json() as Promise<unknown>;
  });
  return parseBoard(data);
}

/** Отправляет победу и возвращает таблицу уровня */
export function submitLevelBoard(
  config: RemoteConfig,
  levelId: number,
  name: string,
  result: LevelBoardResult,
  fetchFn: typeof fetch = fetch,
): Promise<LevelBoardRow[] | null> {
  return call(
    config,
    'level_board_submit',
    {
      p_level: levelId,
      p_player: playerId(),
      p_name: name,
      p_stars: result.stars,
      p_moves: result.moves,
      p_score: result.score,
    },
    fetchFn,
  );
}

/** Таблица уровня без отправки — после поражения */
export function fetchLevelBoard(
  config: RemoteConfig,
  levelId: number,
  fetchFn: typeof fetch = fetch,
): Promise<LevelBoardRow[] | null> {
  return call(config, 'level_board_read', { p_level: levelId, p_player: playerId() }, fetchFn);
}
