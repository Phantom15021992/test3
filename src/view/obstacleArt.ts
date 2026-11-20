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
  | 'ice-cracked';

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
];

/**
 * Картинка льда по виду и оставшимся ударам (у льда две прочности, по просьбе владельца): тонкий лёд — целый
 * и исчезает с одного удара; крепкий — целый, после удара треснувший, потом исчезает
 */
export function iceImage(style: IceStyle, hits: number): ObstacleImage {
  if (style === 'classic') return 'ice-thin';
  return hits >= iceHits(style) ? 'ice-thick' : 'ice-cracked';
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

/** Самородок — последняя картинка угля с золотом: та же глыба последней стадии, перекрашенная в золото */
const GOLD_COAL_KEY = 'obstacle-coal-gold';

/** Перекрашивает последнюю стадию угля в золото: светлота пикселя → от тёмного золота к яркому */
function ensureGoldCoal(scene: Phaser.Scene): void {
  if (scene.textures.exists(GOLD_COAL_KEY)) return;
  const source = scene.textures.get(coalKey(COAL_MAX_LAYERS)).getSourceImage() as HTMLImageElement;
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  const dark = [122, 74, 0];
  const bright = [255, 222, 92];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    // Уголь почти чёрный: светлоту растягиваем, чтобы грани самородка читались
    const light = Math.min(1, ((d[i]! + d[i + 1]! + d[i + 2]!) / 3 / 255) * 2.4 + 0.15);
    for (let k = 0; k < 3; k++) d[i + k] = dark[k]! + (bright[k]! - dark[k]!) * light;
  }
  ctx.putImageData(image, 0, 0);
  scene.textures.addCanvas(GOLD_COAL_KEY, canvas);
}

/**
 * Глыба угля: картинка стадии во всю глыбу 4×4, с каждой стадией меньше. У угля с золотом последний слой —
 * самородок (по просьбе владельца)
 */
export function setCoalArt(
  image: Phaser.GameObjects.Image,
  layers: number,
  cellSize: number,
  start: number = COAL_MAX_LAYERS,
  gold = false,
): void {
  const stage = coalStage(layers, start);
  const size = cellSize * COAL_SIZE * (1 - (stage - 1) * COAL_SHRINK);
  // Последний слой (как бы мало слоёв ни задал уровень) — самородок
  if (gold && layers <= 1) {
    ensureGoldCoal(image.scene);
    image.setTexture(GOLD_COAL_KEY).setDisplaySize(size, size);
    return;
  }
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
