// Прогресс по уровням в localStorage этого браузера: лучшее число звёзд на каждый уровень.
// Хранилище может быть недоступно — тогда игра работает дальше, просто без сохранения.

const STARS_KEY = 'match3.levelStars';

export type LevelStars = Readonly<Record<number, number>>;

export function loadLevelStars(): LevelStars {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STARS_KEY) ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as LevelStars) : {};
  } catch {
    return {};
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
