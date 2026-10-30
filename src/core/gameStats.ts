import type { BonusType } from './bonus';
import type { ResolveStep } from './resolve';

// Статистика партии для анализа (таблица game_results в Supabase).
// Копится из шагов разбора хода и покупок — сцене остаётся только передавать их сюда.

export interface GameStats {
  level2Created: number;
  level3Created: number;
  /** Спецфишки, появившиеся из совпадений (не купленные) */
  specialsFromMatches: number;
  /** Сколько спецфишек сработало: обменом, тапом, задетых взрывом, в финале */
  specialsActivated: number;
  bought: Record<BonusType, number>;
  pointsSpent: number;
}

export function createGameStats(): GameStats {
  return {
    level2Created: 0,
    level3Created: 0,
    specialsFromMatches: 0,
    specialsActivated: 0,
    bought: { bomb: 0, rocket: 0, manipulator: 0, rainbow: 0 },
    pointsSpent: 0,
  };
}

export function recordStep(stats: GameStats, step: ResolveStep): void {
  if (step.kind === 'clear') {
    stats.specialsActivated += step.pieces;
    return;
  }
  if (step.kind !== 'transform') return;
  for (const { cell } of step.placements) {
    if (cell?.kind === 'tile' && cell.level === 2) stats.level2Created++;
    if (cell?.kind === 'tile' && cell.level === 3) stats.level3Created++;
    if (cell?.kind === 'piece') stats.specialsFromMatches++;
  }
}

export function recordPurchase(stats: GameStats, type: BonusType, cost: number): void {
  stats.bought[type]++;
  stats.pointsSpent += cost;
}
