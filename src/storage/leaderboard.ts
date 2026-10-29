import { LEADERBOARD_SIZE, PLAYER_NAME_MAX_LENGTH, type DifficultyId } from '../core/config';

// Таблицы лидеров в localStorage этого браузера — своя для каждой сложности.
// Хранилище может быть недоступно (приватный режим, запрет сайта) — тогда игра работает
// дальше, просто без сохранения.

export interface LeaderboardEntry {
  name: string;
  score: number;
  /** Когда сыграна партия (мс) — при равных очках выше тот, кто набрал их раньше */
  playedAt: number;
}

const entriesKey = (difficulty: DifficultyId) => `match3.leaderboard.${difficulty}`;
const LAST_NAME_KEY = 'match3.lastName';
export const DEFAULT_PLAYER_NAME = 'Игрок';

export function normalizeName(name: string): string {
  const trimmed = name.trim().slice(0, PLAYER_NAME_MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : DEFAULT_PLAYER_NAME;
}

/**
 * Добавляет результат и оставляет лучшие LEADERBOARD_SIZE.
 * rank — место нового результата (с 0), или null, если он в таблицу не попал.
 */
export function insertEntry(
  entries: readonly LeaderboardEntry[],
  entry: LeaderboardEntry,
): { entries: LeaderboardEntry[]; rank: number | null } {
  const sorted = [...entries, entry].sort((a, b) => b.score - a.score || a.playedAt - b.playedAt);
  const top = sorted.slice(0, LEADERBOARD_SIZE);
  const rank = top.indexOf(entry);
  return { entries: top, rank: rank >= 0 ? rank : null };
}

function isEntry(value: unknown): value is LeaderboardEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === 'string' && typeof v.score === 'number' && typeof v.playedAt === 'number'
  );
}

export function loadLeaderboard(difficulty: DifficultyId): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(entriesKey(difficulty));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export function saveLeaderboard(
  difficulty: DifficultyId,
  entries: readonly LeaderboardEntry[],
): void {
  try {
    localStorage.setItem(entriesKey(difficulty), JSON.stringify(entries));
  } catch {
    // Без хранилища таблица живёт только до перезагрузки
  }
}

export function loadLastName(): string {
  try {
    return localStorage.getItem(LAST_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveLastName(name: string): void {
  try {
    localStorage.setItem(LAST_NAME_KEY, name);
  } catch {
    // Не страшно: в следующий раз поле имени будет пустым
  }
}
