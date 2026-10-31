import type { DifficultyId } from '../core/config';
import type { GameStats } from '../core/gameStats';
import type { RemoteConfig } from './remoteLeaderboard';

// Анонимная запись каждой доигранной партии в Supabase (таблица game_results,
// см. supabase/game_results.sql) — для анализа. Имени и IP здесь нет.
// Отправка «выстрелил и забыл»: ошибка сети не мешает игре и ни на что не влияет.

export interface GameResult {
  difficulty: DifficultyId;
  score: number;
  movesMade: number;
  durationSec: number;
  finalePoints: number;
  shuffles: number;
  stats: GameStats;
  device: 'touch' | 'desktop';
  screenWidth: number;
  screenHeight: number;
  version: string;
}

/** Столбцы таблицы game_results (snake_case, как в базе) */
export function toRow(result: GameResult): Record<string, string | number> {
  const { stats } = result;
  return {
    difficulty: result.difficulty,
    score: result.score,
    moves_made: result.movesMade,
    duration_sec: result.durationSec,
    finale_points: result.finalePoints,
    shuffles: result.shuffles,
    level2_created: stats.level2Created,
    level3_created: stats.level3Created,
    specials_from_matches: stats.specialsFromMatches,
    specials_activated: stats.specialsActivated,
    bought_bomb: stats.bought.bomb,
    bought_rocket: stats.bought.rocket,
    bought_manipulator: stats.bought.manipulator,
    bought_rainbow: stats.bought.rainbow,
    points_spent: stats.pointsSpent,
    device: result.device,
    screen_width: result.screenWidth,
    screen_height: result.screenHeight,
    version: result.version,
  };
}

export function sendGameResult(
  config: RemoteConfig,
  result: GameResult,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  return sendRow(config, 'game_results', toRow(result), fetchFn);
}

/** Добавляет строку анонимной статистики */
export async function sendRow(
  config: RemoteConfig,
  table: string,
  row: Record<string, string | number>,
  fetchFn: typeof fetch,
): Promise<void> {
  try {
    await fetchFn(`${config.url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
      // Запрос доходит до сервера, даже если игрок сразу закрыл вкладку
      keepalive: true,
    });
  } catch {
    // Статистика не важнее игры: молча пропускаем
  }
}
