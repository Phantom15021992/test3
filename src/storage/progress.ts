import { FLOOR_SIZE } from '../core/level';

// Прогресс по уровням в localStorage этого браузера: лучшее число звёзд на каждый уровень
// и сколько звёзд потрачено на каждом этаже.
// Хранилище может быть недоступно — тогда игра работает дальше, просто без сохранения.

const STARS_KEY = 'match3.levelStars';
const SPENT_KEY = 'match3.floorSpent';
const MAX_LEVEL_STARS = 3;
const MAX_FLOOR_SPENT = FLOOR_SIZE * MAX_LEVEL_STARS;

export type LevelStars = Readonly<Record<number, number>>;

function loadRecord(key: string): LevelStars {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as LevelStars) : {};
  } catch {
    return {};
  }
}

export function loadLevelStars(): LevelStars {
  return loadRecord(STARS_KEY);
}

/** Кошелёк этажа: заработано на его уровнях минус потрачено. Со звёздами других этажей не смешан */
export function floorWallet(floor: number): number {
  const stars = loadLevelStars();
  const first = (floor - 1) * FLOOR_SIZE + 1;
  const ids = Array.from({ length: FLOOR_SIZE }, (_, i) => first + i);
  const earned = ids.reduce((sum, id) => sum + (stars[id] ?? 0), 0);
  return earned - (loadRecord(SPENT_KEY)[floor] ?? 0);
}

/** Уровни открываются строго по порядку: нужен пройденный предыдущий */
export function isLevelOpen(levelId: number, stars: LevelStars): boolean {
  return levelId === 1 || (stars[levelId - 1] ?? 0) > 0;
}

/** Весь прогресс кампании: копия для переноса на другое устройство */
export interface ProgressCopy {
  stars: LevelStars;
  spent: LevelStars;
}

export function exportProgress(): ProgressCopy {
  return { stars: loadLevelStars(), spent: loadRecord(SPENT_KEY) };
}

function parseRecord(value: unknown, max: number): LevelStars | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  const valid = entries.every(
    ([key, count]) =>
      /^[1-9][0-9]*$/.test(key) &&
      Number.isInteger(count) &&
      (count as number) >= 0 &&
      (count as number) <= max,
  );
  return valid ? (value as LevelStars) : null;
}

/** Копия приходит с сервера, а сохранить её мог кто угодно: без проверки в прогресс не попадёт */
export function parseProgress(value: unknown): ProgressCopy | null {
  if (typeof value !== 'object' || value === null) return null;
  const { stars, spent } = value as Record<string, unknown>;
  const parsedStars = parseRecord(stars, MAX_LEVEL_STARS);
  const parsedSpent = parseRecord(spent, MAX_FLOOR_SPENT);
  return parsedStars && parsedSpent ? { stars: parsedStars, spent: parsedSpent } : null;
}

function bestOf(a: LevelStars, b: LevelStars): LevelStars {
  const best: Record<number, number> = { ...a };
  for (const [key, count] of Object.entries(b)) {
    const id = Number(key);
    best[id] = Math.max(best[id] ?? 0, count);
  }
  return best;
}

/** Прогресс устройств складывается: от каждого уровня и этажа берётся большее, ничего не теряется */
export function mergeProgress(copy: ProgressCopy): void {
  const local = exportProgress();
  try {
    localStorage.setItem(STARS_KEY, JSON.stringify(bestOf(local.stars, copy.stars)));
    localStorage.setItem(SPENT_KEY, JSON.stringify(bestOf(local.spent, copy.spent)));
  } catch {
    // Без хранилища прогресс живёт только до перезагрузки
  }
}

/** Вызывается только при победе: потраченное на проигранном уровне возвращается */
export function spendFloorStars(floor: number, stars: number): void {
  if (stars === 0) return;
  const spent = loadRecord(SPENT_KEY);
  try {
    localStorage.setItem(
      SPENT_KEY,
      JSON.stringify({ ...spent, [floor]: (spent[floor] ?? 0) + stars }),
    );
  } catch {
    // Без хранилища прогресс живёт только до перезагрузки
  }
}

/** Запоминает результат; худшая попытка не затирает лучшую */
export function saveLevelStars(levelId: number, stars: number): void {
  const current = loadLevelStars();
  if ((current[levelId] ?? 0) >= stars) return;
  try {
    localStorage.setItem(STARS_KEY, JSON.stringify({ ...current, [levelId]: stars }));
  } catch {
    // Без хранилища прогресс живёт только до перезагрузки
  }
}
