import type { LevelAction } from '../core/levelSession';
import type { LevelOutcome } from './levelResults';
import { sendRow } from './gameResults';
import type { RemoteConfig } from './remoteLeaderboard';

// Ходы попытки уровня (таблица level_moves, см. supabase/level_moves.sql): по seed, звёздам на начало
// и журналу попытка проигрывается заново, и ходы человека сравниваются с ходами бота
// (scripts/humanMoves.ts). Имени и IP нет. Ошибка отправки игре не мешает.

export interface LevelMoves {
  levelId: number;
  version: string;
  seed: number;
  wallet: number;
  outcome: LevelOutcome;
  movesMade: number;
  actions: readonly LevelAction[];
}

/** Столбцы таблицы level_moves (snake_case, как в базе) */
export function toMovesRow(moves: LevelMoves): Record<string, unknown> {
  return {
    level_id: moves.levelId,
    version: moves.version,
    seed: moves.seed,
    wallet: moves.wallet,
    outcome: moves.outcome,
    moves_made: moves.movesMade,
    actions: moves.actions,
  };
}

export function sendLevelMoves(
  config: RemoteConfig,
  moves: LevelMoves,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  return sendRow(config, 'level_moves', toMovesRow(moves), fetchFn);
}
