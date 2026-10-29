import Phaser from 'phaser';
import type { Piece, PieceType } from '../core/board';

// Все спецфишки рисуются картинками из public/assets/pieces (грузятся в BootScene).

const textureKey = (type: PieceType) => `piece-${type}`;

const PIECE_TYPES: readonly PieceType[] = ['rocket', 'bomb', 'rainbow', 'megaBomb', 'manipulator'];

export const PIECE_IMAGE_FILES: readonly { key: string; path: string }[] = PIECE_TYPES.map(
  (type) => ({ key: textureKey(type), path: `assets/pieces/${type}.png` }),
);

/**
 * Размер картинки относительно радиуса фишки: ракета узкая и высокая, поэтому крупнее
 * по своей длинной стороне; мега-бомба чуть больше обычной, чтобы их не путали.
 */
const SIZE_BY_TYPE: Readonly<Record<PieceType, number>> = {
  rocket: 2.3,
  bomb: 2.1,
  rainbow: 2.2,
  megaBomb: 2.4,
  manipulator: 2.2,
};

/** Картинка спецфишки с центром в (0, 0) */
export function drawPiece(
  scene: Phaser.Scene,
  piece: Piece,
  radius: number,
): Phaser.GameObjects.Image {
  const image = scene.add.image(0, 0, textureKey(piece.type));
  image.setScale((radius * SIZE_BY_TYPE[piece.type]) / Math.max(image.width, image.height));
  // Картинка ракеты стоит вертикально — для удара по строке поворачиваем её набок
  if (piece.type === 'rocket' && piece.direction === 'row') image.setAngle(90);
  return image;
}
