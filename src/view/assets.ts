import type { CellLevel, ColorId, Tile } from '../core/board';

// Фишки с картинками: у жёлтого цвета каждый уровень — своя иконка
// (молоко → масло → сыр), чтобы объединение было видно по самой фишке.
// Остальные цвета рисуются кружками.
const YELLOW: ColorId = 3;

export const TILE_ICONS: readonly {
  color: ColorId;
  level: CellLevel;
  key: string;
  path: string;
}[] = [
  { color: YELLOW, level: 1, key: 'yellow1', path: 'assets/tiles/yellow1.png' }, // молоко
  { color: YELLOW, level: 2, key: 'yellow2', path: 'assets/tiles/yellow2.png' }, // масло
  { color: YELLOW, level: 3, key: 'yellow3', path: 'assets/tiles/yellow3.png' }, // сыр
];

/** Ключ текстуры для фишки или null, если фишка рисуется кружком */
export function tileTextureKey(tile: Tile): string | null {
  return TILE_ICONS.find((i) => i.color === tile.color && i.level === tile.level)?.key ?? null;
}
