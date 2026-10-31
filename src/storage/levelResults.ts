import type { GameStats } from '../core/gameStats';
import { sendRow } from './gameResults';
import type { RemoteConfig } from './remoteLeaderboard';

// Анонимная запись каждой попытки уровня кампании (таблица level_results, см.
// supabase/campaign.sql): по ней видно настоящую сложность уровней, а не только оценку бота.
// Имени и IP здесь нет. Ошибка отправки игре не мешает.

export type LevelOutcome = 'won' | 'lost' | 'left';

export interface LevelResult {
  levelId: number;
  outcome: LevelOutcome;
  stars: number;
  movesMade: number;
  movesLeft: number;
  goalsPercent: number;
  shuffles: number;
  durationSec: number;
  starsSpent: number;
  stats: GameStats;
  device: 'touch' | 'desktop';
  screenWidth: number;
  screenHeight: number;
  version: string;
}

/** Столбцы таблицы level_results (snake_case, как в базе) */
export function toLevelRow(result: LevelResult): Record<string, string | number> {
  const { bought } = result.stats;
  return {
    level_id: result.levelId,
    outcome: result.outcome,
    stars: result.stars,
    moves_made: result.movesMade,
    moves_left: result.movesLeft,
    goals_percent: result.goalsPercent,
    shuffles: result.shuffles,
    duration_sec: result.durationSec,
    stars_spent: result.starsSpent,
    bought_bomb: bought.bomb,
    bought_rocket: bought.rocket,
    bought_manipulator: bought.manipulator,
    bought_rainbow: bought.rainbow,
    device: result.device,
    screen_width: result.screenWidth,
    screen_height: result.screenHeight,
    version: result.version,
  };
}

export function sendLevelResult(
  config: RemoteConfig,
  result: LevelResult,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  return sendRow(config, 'level_results', toLevelRow(result), fetchFn);
}
