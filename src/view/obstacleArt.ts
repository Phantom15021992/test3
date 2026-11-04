import Phaser from 'phaser';
import { COAL_MAX_LAYERS, COAL_SIZE } from '../core/config';
import { iceHits, type IceStyle } from '../core/level';

// Препятствия и лёд рисуются картинками из public/assets/obstacles (грузятся в BootScene).

export type ObstacleImage =
  | 'stone'
  | 'box'
  | 'crown'
  | 'ice'
  | 'ice-thin'
  | 'ice-thick'
  | 'ice-cracked'
  | 'ice-gold'
  | 'ice-gold-cracked'
  | 'chain';

const textureKey = (name: ObstacleImage) => `obstacle-${name}`;

const NAMES: readonly ObstacleImage[] = [
  'stone',
  'box',
  'crown',
  'ice',
  'ice-thin',
  'ice-thick',
  'ice-cracked',
  'ice-gold',
  'ice-gold-cracked',
  'chain',
];

/**
 * Картинка льда по виду и оставшимся ударам. Весь новый лёд начинается со 2 уровня: слитки под ним
 * не видны, после удара он становится льдом 1 уровня — простым или со слитками. С этапом трещин
 * (iceCracks у уровня) последний удар остаётся льду с трещинами
 */
export function iceImage(style: IceStyle, hits: number, cracks: boolean): ObstacleImage {
  if (style === 'classic') return 'ice';
  if (hits >= iceHits(style, cracks)) return 'ice-thick';
  const cracked = cracks && hits === 1;
  if (style === 'gold') return cracked ? 'ice-gold-cracked' : 'ice-gold';
  return cracked ? 'ice-cracked' : 'ice-thin';
}

/** Уголь рисуется по стадиям 1–9: чем меньше осталось слоёв, тем дальше стадия и меньше глыба */
const coalKey = (stage: number) => `obstacle-coal-${stage}`;

export const OBSTACLE_IMAGE_FILES: readonly { key: string; path: string }[] = [
  ...NAMES.map((name) => ({ key: textureKey(name), path: `assets/obstacles/${name}.png` })),
  ...Array.from({ length: COAL_MAX_LAYERS }, (_, i) => ({
    key: coalKey(i + 1),
    path: `assets/obstacles/coal-${i + 1}.png`,
  })),
];

/** На сколько уменьшается глыба угля с каждой стадией */
const COAL_SHRINK = 0.065;

/** Стадия картинки угля по оставшимся слоям: 9 слоёв — стадия 1, 1 слой — стадия 9 */
export function coalStage(layers: number): number {
  return Math.min(COAL_MAX_LAYERS, Math.max(1, COAL_MAX_LAYERS + 1 - layers));
}

/** Глыба угля: картинка стадии во всю глыбу 4×4, с каждой стадией меньше */
export function setCoalArt(
  image: Phaser.GameObjects.Image,
  layers: number,
  cellSize: number,
): void {
  const stage = coalStage(layers);
  const size = cellSize * COAL_SIZE * (1 - (stage - 1) * COAL_SHRINK);
  image.setTexture(coalKey(stage)).setDisplaySize(size, size);
}

/** Часть клетки, которую занимает картинка: между соседними остаётся зазор */
const CELL_FILL = 0.92;
/** Отрезок цепи длиннее клетки, чтобы лечь по диагонали из угла в угол */
const CHAIN_LENGTH = 1.3;
/** Звенья лежат крест-накрест: сколько их, столько и полос */
const CHAIN_ANGLES: readonly number[] = [45, -45, 0];
export const CHAIN_NAME = 'chain';

export function obstacleImage(
  scene: Phaser.Scene,
  name: ObstacleImage,
  cellSize: number,
  x = 0,
  y = 0,
): Phaser.GameObjects.Image {
  const size = cellSize * CELL_FILL;
  return scene.add.image(x, y, textureKey(name)).setDisplaySize(size, size);
}

/** Цепь поверх фишки; по имени её находит вид, когда звено снято */
export function chainImages(
  scene: Phaser.Scene,
  links: number,
  cellSize: number,
): Phaser.GameObjects.Image[] {
  return CHAIN_ANGLES.slice(0, links).map((angle) => {
    const image = scene.add.image(0, 0, textureKey('chain'));
    const scale = (cellSize * CHAIN_LENGTH) / image.height;
    return image.setScale(scale).setAngle(angle).setName(CHAIN_NAME);
  });
}
