import Phaser from 'phaser';

// Препятствия и лёд рисуются картинками из public/assets/obstacles (грузятся в BootScene).

export type ObstacleImage = 'stone' | 'box' | 'crown' | 'ice' | 'chain';

const textureKey = (name: ObstacleImage) => `obstacle-${name}`;

const NAMES: readonly ObstacleImage[] = ['stone', 'box', 'crown', 'ice', 'chain'];

export const OBSTACLE_IMAGE_FILES: readonly { key: string; path: string }[] = NAMES.map((name) => ({
  key: textureKey(name),
  path: `assets/obstacles/${name}.png`,
}));

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
