import Phaser from 'phaser';
import { UI_BUTTON_COLOR } from '../view/palette';

const SIZE = 72;
const DISABLED_ALPHA = 0.3;

// Круглая кнопка со стрелкой влево или вправо
export class ArrowButton {
  private readonly container: Phaser.GameObjects.Container;
  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    direction: 'left' | 'right',
    onClick: () => void,
  ) {
    const g = scene.add.graphics();
    g.fillStyle(UI_BUTTON_COLOR);
    g.fillCircle(0, 0, SIZE / 2);
    g.fillStyle(0xffffff);
    const s = direction === 'left' ? -1 : 1;
    // Стрелка: наконечник + хвост
    g.fillTriangle(s * 18, 0, s * 2, -16, s * 2, 16);
    g.fillRect(direction === 'left' ? 2 : -16, -5, 14, 10);

    const hit = scene.add
      .zone(0, 0, SIZE, SIZE)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (this.enabled) onClick();
      });

    this.container = scene.add.container(x, y, [g, hit]);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.container.setAlpha(enabled ? 1 : DISABLED_ALPHA);
  }
}
