import type Phaser from 'phaser';
import type { DifficultyId } from '../core/config';
import { remoteConfig, requestTicket } from '../storage/remoteLeaderboard';

/** ?seed=123 в адресе — одинаковое поле при каждом запуске (для отладки) */
export function debugSeed(): number | null {
  const seed = Number(new URLSearchParams(window.location.search).get('seed'));
  return Number.isFinite(seed) && seed > 0 ? seed : null;
}

/** Запускает партию: сначала берёт у сервера билет, без связи партия идёт только на устройстве */
export async function startGame(scene: Phaser.Scene, difficulty: DifficultyId): Promise<void> {
  const config = remoteConfig();
  // Партия с выбранным вручную полем в общую таблицу не попадает
  const ticket = config && debugSeed() === null ? await requestTicket(config, difficulty) : null;
  scene.scene.start('Game', { difficulty, ticket });
}
