import { FLOOR_SIZE } from '../core/level';

// Прогресс по уровням в localStorage этого браузера: лучшее число звёзд на каждый уровень
// и сколько звёзд потрачено на каждом этаже.
// Хранилище может быть недоступно — тогда игра работает дальше, просто без сохранения.

const STARS_KEY = 'match3.levelStars';
const SPENT_KEY = 'match3.floorSpent';

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
