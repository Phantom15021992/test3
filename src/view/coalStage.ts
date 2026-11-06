// Без Phaser: стадия считается и проверяется в тестах без браузера
import { COAL_MAX_LAYERS } from '../core/config';

/**
 * Стадия картинки угля по доле снятых слоёв: целая глыба (start слоёв) — стадия 1, последний слой —
 * стадия 9, между ними стадии делятся поровну (у глыбы из 3 слоёв — 1, 5, 9)
 */
export function coalStage(layers: number, start: number = COAL_MAX_LAYERS): number {
  if (start <= 1) return 1;
  const stage = 1 + Math.round(((start - layers) * (COAL_MAX_LAYERS - 1)) / (start - 1));
  return Math.min(COAL_MAX_LAYERS, Math.max(1, stage));
}
