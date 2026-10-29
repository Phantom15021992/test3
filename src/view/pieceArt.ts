import Phaser from 'phaser';
import type { Piece } from '../core/board';
import { DEMO_COLOR_COUNT } from '../core/config';
import {
  BOMB_CORE_COLOR,
  MANIPULATOR_COLOR,
  MANIPULATOR_MARK_COLOR,
  MEGA_BOMB_COLOR,
  MEGA_BOMB_RING_COLOR,
  SPECIAL_BODY_COLOR,
  SPECIAL_MARK_COLOR,
  TILE_COLORS,
} from './palette';

/**
 * Рисует спецфишку в g с центром в (0, 0). Возвращает дополнительные объекты (подписи),
 * которые нужно положить в тот же контейнер.
 */
export function drawPiece(
  scene: Phaser.Scene,
  g: Phaser.GameObjects.Graphics,
  piece: Piece,
  radius: number,
): Phaser.GameObjects.GameObject[] {
  switch (piece.type) {
    case 'rocket': {
      g.fillStyle(SPECIAL_BODY_COLOR);
      g.fillCircle(0, 0, radius);
      // Полоса с наконечниками вдоль направления удара
      const len = radius * 0.55;
      const head = radius * 0.32;
      g.fillStyle(SPECIAL_MARK_COLOR);
      if (piece.direction === 'row') {
        g.fillRect(-len, -4, len * 2, 8);
        g.fillTriangle(len + head, 0, len, -head, len, head);
        g.fillTriangle(-len - head, 0, -len, -head, -len, head);
      } else {
        g.fillRect(-4, -len, 8, len * 2);
        g.fillTriangle(0, len + head, -head, len, head, len);
        g.fillTriangle(0, -len - head, -head, -len, head, -len);
      }
      return [];
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
      // Сектора — только цвета, которые есть в игре
      const colors = TILE_COLORS.slice(0, DEMO_COLOR_COUNT);
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
