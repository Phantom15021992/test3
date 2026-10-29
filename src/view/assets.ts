import type { CellLevel, ColorId, Tile } from '../core/board';

// Фишки рисуются картинками: у каждого цвета свой фрукт, а уровень виден по числу/размеру
// фрукта (1 вишня → 2 → 3), поэтому кольца-маркеры уровня им не нужны.
// ColorId: 0 арбуз (красный), 1 лайм (зелёный), 2 черника (синий),
// 3 вишня (фиолетовый), 4 банан (оранжевый).
const ICON_COLORS = 5;
const LEVELS: readonly CellLevel[] = [1, 2, 3];

export function tileTextureKey(tile: Tile): string | null {
  return tile.color < ICON_COLORS ? `tile${tile.color}_${tile.level}` : null;
}

export const TILE_ICONS: readonly { key: string; path: string }[] = Array.from(
  { length: ICON_COLORS },
  (_, color: ColorId) =>
    LEVELS.map((level) => ({
      key: `tile${color}_${level}`,
      path: `assets/tiles/tile${color}_${level}.png`,
    })),
).flat();
