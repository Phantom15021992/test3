import Phaser from 'phaser';
import type { Piece } from '../core/board';
import {
  BOMB_CORE_COLOR,
  MANIPULATOR_COLOR,
  MANIPULATOR_MARK_COLOR,
  MEGA_BOMB_COLOR,
  MEGA_BOMB_RING_COLOR,
  SPECIAL_BODY_COLOR,
  TILE_COLORS,
} from './palette';

/** Картинки спецфишек: ключ текстуры и путь к файлу (грузятся в BootScene) */
export const PIECE_TEXTURES = { rocket: 'piece-rocket' } as const;
export const PIECE_IMAGE_FILES: readonly { key: string; path: string }[] = [
  { key: PIECE_TEXTURES.rocket, path: 'assets/pieces/rocket.png' },
];

/**
 * Рисует спецфишку в g с центром в (0, 0). Возвращает дополнительные объекты (подписи),
 * которые нужно положить в тот же контейнер.
 */
export function drawPiece(
  scene: Phaser.Scene,
  g: Phaser.GameObjects.Graphics,
  piece: Piece,
  radius: number,
  /** Сколько цветов в игре — столько секторов у радуги */
  colorCount = TILE_COLORS.length,
): Phaser.GameObjects.GameObject[] {
  switch (piece.type) {
    case 'rocket': {
      // Картинка ракеты стоит вертикально — для удара по строке поворачиваем её набок
      const size = radius * 2.3;
      const image = scene.add.image(0, 0, PIECE_TEXTURES.rocket);
      image.setScale(size / image.height);
      if (piece.direction === 'row') image.setAngle(90);
      return [image];
    }
    case 'bomb': {
      g.fillStyle(BOMB_CORE_COLOR);
      g.fillCircle(0, 0, radius * 0.85);
      g.lineStyle(3, SPECIAL_BODY_COLOR);
      g.strokeCircle(0, 0, radius * 0.85);
      // Фитиль с искрой
      g.fillStyle(SPECIAL_BODY_COLOR);
      g.fillRect(radius * 0.35, -radius * 0.95, radius * 0.22, radius * 0.4);
      g.fillStyle(MEGA_BOMB_RING_COLOR);
      g.fillCircle(radius * 0.46, -radius * 1.0, radius * 0.16);
      return [];
    }
    case 'rainbow': {
      const colors = TILE_COLORS.slice(0, colorCount);
      const step = (Math.PI * 2) / colors.length;
      colors.forEach((color, i) => {
        g.fillStyle(color);
        g.slice(0, 0, radius, i * step, (i + 1) * step);
        g.fillPath();
      });
      g.fillStyle(0xffffff);
      g.fillCircle(0, 0, radius * 0.3);
      return [];
    }
    case 'megaBomb': {
      g.fillStyle(MEGA_BOMB_COLOR);
      g.fillCircle(0, 0, radius);
      g.lineStyle(4, MEGA_BOMB_RING_COLOR);
      g.strokeCircle(0, 0, radius - 3);
      g.strokeCircle(0, 0, radius * 0.55);
      g.fillStyle(MEGA_BOMB_RING_COLOR);
      g.fillCircle(0, 0, radius * 0.2);
      return [];
    }
    case 'manipulator': {
      g.fillStyle(MANIPULATOR_COLOR);
      g.fillRoundedRect(-radius, -radius, radius * 2, radius * 2, radius * 0.4);
      const label = scene.add
        .text(0, 0, '⇄', {
          fontFamily: 'sans-serif',
          fontSize: `${Math.round(radius * 1.3)}px`,
          color: `#${MANIPULATOR_MARK_COLOR.toString(16).padStart(6, '0')}`,
        })
        .setOrigin(0.5);
      return [label];
    }
  }
}
