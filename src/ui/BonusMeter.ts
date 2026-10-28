import Phaser from 'phaser';
import { nextBonus, type BonusType } from '../core/bonus';
import { BONUS_METER_MAX, BONUS_TIERS } from '../core/config';
import { drawPiece } from '../view/pieceArt';
import {
  BONUS_BAR_BG_COLOR,
  BONUS_BAR_FILL_COLOR,
  BONUS_READY_COLOR,
  UI_MUTED_TEXT_COLOR,
  UI_PANEL_COLOR,
  UI_TEXT_COLOR,
} from '../view/palette';

const BAR_HEIGHT = 36;
const BUTTON_RADIUS = 30;
const BUTTON_GAP = 62; // от центра шкалы до центров кнопок
const FILL_DURATION_MS = 250;
const LOCKED_ALPHA = 0.35;

// Родительный падеж — для подписи «ещё N до …»
const BONUS_NAMES: Record<BonusType, string> = {
  bomb: 'бомбы',
  rocket: 'ракеты',
  manipulator: 'манипулятора',
  rainbow: 'радуги',
};

// Иконка на кнопке: у ракеты направление станет известно только при выдаче
const BONUS_ICONS: Record<BonusType, Parameters<typeof drawPiece>[2]> = {
  bomb: { kind: 'piece', type: 'bomb' },
  rocket: { kind: 'piece', type: 'rocket', direction: 'row' },
  manipulator: { kind: 'piece', type: 'manipulator' },
  rainbow: { kind: 'piece', type: 'rainbow' },
};

interface BonusButton {
  type: BonusType;
  cost: number;
  container: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Graphics;
  costText: Phaser.GameObjects.Text;
  pulse: Phaser.Tweens.Tween | null;
}

// Шкала бонусов над полем: полоса с отметками цен и кнопки спецфишек под отметками.
// Подпись на полосе говорит, сколько осталось до ближайшего бонуса.
export class BonusMeter {
  private readonly fill: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly buttons: BonusButton[];
  private shown = 0;
  private fillTween: Phaser.Tweens.Tween | null = null;
  private value = 0;
  private enabled = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly left: number,
    private readonly right: number,
    private readonly y: number,
    onTake: (type: BonusType) => void,
  ) {
    const width = right - left;
    const bg = scene.add.graphics();
    bg.fillStyle(BONUS_BAR_BG_COLOR);
    bg.fillRoundedRect(left, y - BAR_HEIGHT / 2, width, BAR_HEIGHT, BAR_HEIGHT / 2);
    this.fill = scene.add.graphics();

    // Отметки цен на полосе
    const ticks = scene.add.graphics();
    ticks.lineStyle(3, UI_PANEL_COLOR);
    for (const { cost } of BONUS_TIERS.slice(0, -1)) {
      const x = this.xOf(cost);
      ticks.lineBetween(x, y - BAR_HEIGHT / 2, x, y + BAR_HEIGHT / 2);
    }

    this.label = scene.add
      .text(left + width / 2, y, '', {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: UI_TEXT_COLOR,
        stroke: '#1b1f2e',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.buttons = BONUS_TIERS.map(({ cost, type }) => {
      const x = Math.min(this.xOf(cost), right - BUTTON_RADIUS);
      const by = y + BUTTON_GAP;
      const circle = scene.add.graphics();
      circle.fillStyle(UI_PANEL_COLOR);
      circle.fillCircle(0, 0, BUTTON_RADIUS);
      const icon = scene.add.graphics();
      const extras = drawPiece(scene, icon, BONUS_ICONS[type], BUTTON_RADIUS * 0.62);
      const ring = scene.add.graphics();
      ring.lineStyle(4, BONUS_READY_COLOR);
      ring.strokeCircle(0, 0, BUTTON_RADIUS);
      const hit = scene.add
        .zone(0, 0, BUTTON_RADIUS * 2, BUTTON_RADIUS * 2)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (this.enabled && this.value >= cost) onTake(type);
        });
      const container = scene.add.container(x, by, [circle, icon, ...extras, ring, hit]);
      const costText = scene.add
        .text(x, by + BUTTON_RADIUS + 14, String(cost), {
          fontFamily: 'sans-serif',
          fontSize: '20px',
          color: UI_MUTED_TEXT_COLOR,
        })
        .setOrigin(0.5);
      return { type, cost, container, ring, costText, pulse: null };
    });

    this.update(0, true);
  }

  update(value: number, enabled: boolean): void {
    this.value = value;
    this.enabled = enabled;

    const next = nextBonus(value);
    this.label.setText(
      next
        ? `${value} / ${BONUS_METER_MAX} · ещё ${next.remaining} до ${BONUS_NAMES[next.type]}`
        : `${value} / ${BONUS_METER_MAX} · шкала заполнена`,
    );

    this.fillTween?.stop();
    this.fillTween = this.scene.tweens.addCounter({
      from: this.shown,
      to: value,
      duration: FILL_DURATION_MS,
      onUpdate: (tween) => this.drawFill(tween.getValue() ?? value),
    });

    for (const button of this.buttons) {
      const ready = value >= button.cost;
      button.container.setAlpha(ready ? 1 : LOCKED_ALPHA);
      button.ring.setVisible(ready);
      button.costText.setColor(ready ? UI_TEXT_COLOR : UI_MUTED_TEXT_COLOR);
      if (ready && enabled && !button.pulse) {
        // Доступный бонус «дышит», чтобы его заметили
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

  private drawFill(value: number): void {
    this.shown = value;
    const width = ((this.right - this.left) * value) / BONUS_METER_MAX;
    this.fill.clear();
    if (width <= 0) return;
    this.fill.fillStyle(BONUS_BAR_FILL_COLOR);
    // Скругление не больше половины ширины, иначе узкая полоса рисуется криво
    const radius = Math.min(BAR_HEIGHT / 2, width / 2);
    this.fill.fillRoundedRect(this.left, this.y - BAR_HEIGHT / 2, width, BAR_HEIGHT, radius);
  }

  private xOf(cost: number): number {
    return this.left + ((this.right - this.left) * cost) / BONUS_METER_MAX;
  }
}
