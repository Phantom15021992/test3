import Phaser from 'phaser';
import { COAL_MAX_LAYERS, COAL_SIZE } from '../core/config';
import type { Box } from '../core/board';
import { iceHits, type IceStyle } from '../core/level';
import { coalStage } from './coalStage';

// Препятствия и лёд рисуются картинками из public/assets/obstacles (грузятся в BootScene).

export type ObstacleImage =
  | 'stone'
  | 'chest-chained'
  | 'chest-closed'
  | 'chest-treasure'
  | 'chest-empty'
  | 'crown'
  | 'ice-thin'
  | 'ice-thick'
  | 'ice-cracked'
  | 'ice-gold'
  | 'ice-gold-cracked';

const textureKey = (name: ObstacleImage) => `obstacle-${name}`;

const NAMES: readonly ObstacleImage[] = [
  'stone',
  'chest-chained',
  'chest-closed',
  'chest-treasure',
  'chest-empty',
  'crown',
  'ice-thin',
  'ice-thick',
  'ice-cracked',
  'ice-gold',
  'ice-gold-cracked',
];

/**
 * Картинка льда по виду и оставшимся ударам. Весь новый лёд начинается со 2 уровня: слитки под ним
 * не видны, после удара он становится льдом 1 уровня — простым или со слитками. С этапом трещин
 * (iceCracks у уровня) последний удар остаётся льду с трещинами
 */
export function iceImage(style: IceStyle, hits: number, cracks: boolean): ObstacleImage {
  // Обычный лёд (1 удар) — это лёд 1 уровня: та же картинка, весь лёд в одном стиле
  if (style === 'classic') return 'ice-thin';
  if (hits >= iceHits(style, cracks)) return 'ice-thick';
  const cracked = cracks && hits === 1;
  if (style === 'gold') return cracked ? 'ice-gold-cracked' : 'ice-gold';
  return cracked ? 'ice-cracked' : 'ice-thin';
}

/**
 * Уголь рисуется по стадиям 1–9: чем меньше осталось слоёв, тем дальше стадия и меньше глыба.
 * Глыба на уровне всегда начинается с самой большой картинки, сколько бы слоёв ни задал уровень
 */
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

/** Глыба угля: картинка стадии во всю глыбу 4×4, с каждой стадией меньше */
export function setCoalArt(
  image: Phaser.GameObjects.Image,
  layers: number,
  cellSize: number,
  start: number = COAL_MAX_LAYERS,
): void {
  const stage = coalStage(layers, start);
  const size = cellSize * COAL_SIZE * (1 - (stage - 1) * COAL_SHRINK);
  image.setTexture(coalKey(stage)).setDisplaySize(size, size);
}

/** Часть клетки, которую занимает картинка: между соседними остаётся зазор */
const CELL_FILL = 0.92;
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

/** Картинка сундука по стадии: в цепях → закрытый → открытый (с сокровищами или пустой) */
export function chestImage(box: Box): ObstacleImage {
  if ((box.links ?? 0) > 0) return 'chest-chained';
  if (!box.open) return 'chest-closed';
  return box.treasure ? 'chest-treasure' : 'chest-empty';
}

/** Сколько звеньев цепи на сундуке — подпись в углу клетки, если звеньев больше одного */
export function chestParts(
  scene: Phaser.Scene,
  box: Box,
  cellSize: number,
): Phaser.GameObjects.GameObject[] {
  const parts: Phaser.GameObjects.GameObject[] = [obstacleImage(scene, chestImage(box), cellSize)];
  const links = box.links ?? 0;
  if (links > 1) {
    parts.push(
      scene.add
        .text(cellSize * 0.42, cellSize * 0.42, String(links), {
          fontFamily: 'Arial, sans-serif',
          fontSize: `${Math.round(cellSize * 0.32)}px`,
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#2b2f3a',
          strokeThickness: Math.max(2, Math.round(cellSize * 0.06)),
        })
        .setOrigin(1, 1),
    );
  }
  return parts;
}
