import type { ColorId } from '../core/board';

// Иконки фишек: по одной на ColorId, порядок совпадает с TILE_COLORS
const TILE_ICON_COUNT = 6;

export function tileTextureKey(color: ColorId): string {
  return `tile${color}`;
}

export const TILE_ICONS: readonly { key: string; path: string }[] = Array.from(
  { length: TILE_ICON_COUNT },
  (_, color) => ({ key: tileTextureKey(color), path: `assets/tiles/tile${color}.png` }),
);
