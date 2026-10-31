import Phaser from 'phaser';
import type { Piece } from '../core/board';
import type { BonusType } from '../core/bonus';
import { BONUS_TIERS } from '../core/config';
import { drawPiece } from '../view/pieceArt';
import {
  BONUS_READY_COLOR,
  UI_MUTED_TEXT_COLOR,
  UI_PANEL_COLOR,
  UI_TEXT_COLOR,
} from '../view/palette';

const BUTTON_RADIUS = 34;
const LOCKED_ALPHA = 0.35;

// Иконка на кнопке: у ракеты направление станет известно только при покупке
const BONUS_ICONS: Record<BonusType, Piece> = {
  bomb: { kind: 'piece', type: 'bomb' },
  rocket: { kind: 'piece', type: 'rocket', direction: 'row' },
  manipulator: { kind: 'piece', type: 'manipulator' },
  rainbow: { kind: 'piece', type: 'rainbow' },
};

interface ShopButton {
  cost: number;
  container: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Graphics;
  costText: Phaser.GameObjects.Text;
  pulse: Phaser.Tweens.Tween | null;
}

// Ряд кнопок над полем: спецфишки, которые можно купить: за очки счёта или, в кампании, за звёзды.
// Кнопка, на которую хватает, подсвечена и пульсирует.
export class BonusShop {
  private readonly buttons: ShopButton[];
  private budget = 0;
  private enabled = true;

  constructor(
    private readonly scene: Phaser.Scene,
    left: number,
    right: number,
    y: number,
    onBuy: (type: BonusType) => void,
    forStars = false,
  ) {
    const step = (right - left) / BONUS_TIERS.length;
    this.buttons = BONUS_TIERS.map((tier, i) => {
      const { type } = tier;
      const cost = forStars ? tier.stars : tier.cost;
      const x = left + step * (i + 0.5);
      const circle = scene.add.graphics();
      circle.fillStyle(UI_PANEL_COLOR);
      circle.fillCircle(0, 0, BUTTON_RADIUS);
      const icon = drawPiece(scene, BONUS_ICONS[type], BUTTON_RADIUS * 0.62);
      const ring = scene.add.graphics();
      ring.lineStyle(4, BONUS_READY_COLOR);
      ring.strokeCircle(0, 0, BUTTON_RADIUS);
      const hit = scene.add
        .zone(0, 0, BUTTON_RADIUS * 2, BUTTON_RADIUS * 2)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (this.enabled && this.budget >= cost) onBuy(type);
        });
      const container = scene.add.container(x, y, [circle, icon, ring, hit]);
      const costText = scene.add
        .text(x, y + BUTTON_RADIUS + 16, forStars ? `${cost} ★` : String(cost), {
          fontFamily: 'sans-serif',
          fontSize: '22px',
          color: UI_MUTED_TEXT_COLOR,
        })
        .setOrigin(0.5);
      return { cost, container, ring, costText, pulse: null };
    });
    this.update(0, true);
  }

  update(budget: number, enabled: boolean): void {
    this.budget = budget;
    this.enabled = enabled;
    for (const button of this.buttons) {
      const ready = budget >= button.cost;
      button.container.setAlpha(ready ? 1 : LOCKED_ALPHA);
      button.ring.setVisible(ready);
      button.costText.setColor(ready ? UI_TEXT_COLOR : UI_MUTED_TEXT_COLOR);
      if (ready && enabled && !button.pulse) {
        button.pulse = this.scene.tweens.add({
          targets: button.container,
          scale: 1.1,
          duration: 450,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      } else if ((!ready || !enabled) && button.pulse) {
        button.pulse.stop();
        button.pulse = null;
        button.container.setScale(1);
      }
    }
  }
}
