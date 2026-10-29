import Phaser from 'phaser';
import { DIFFICULTIES, type Difficulty } from '../core/config';
import { loadLeaderboard } from '../storage/leaderboard';
import {
  HIGHLIGHT_COLOR,
  TILE_COLORS,
  UI_BUTTON_COLOR,
  UI_MUTED_TEXT_COLOR,
  UI_PANEL_COLOR,
  UI_TEXT_COLOR,
} from '../view/palette';

const BUTTON_WIDTH = 560;
const BUTTON_HEIGHT = 120;
const BUTTON_STEP = 150;
const FIRST_BUTTON_Y = 420;
const DOT_RADIUS = 9;

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

// Стартовое меню: выбор сложности. На кнопке — сколько цветов (кружками) и рекорд этой сложности.
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    const centerX = this.scale.width / 2;
    this.add
      .text(centerX, 200, 'Три в ряд', {
        fontFamily: 'sans-serif',
        fontSize: '64px',
        color: UI_TEXT_COLOR,
      })
      .setOrigin(0.5);
    this.add
      .text(centerX, 290, 'Выберите сложность', {
        fontFamily: 'sans-serif',
        fontSize: '34px',
        color: UI_MUTED_TEXT_COLOR,
      })
      .setOrigin(0.5);

    DIFFICULTIES.forEach((difficulty, i) => {
      this.addButton(centerX, FIRST_BUTTON_Y + i * BUTTON_STEP, difficulty);
    });
  }

  private addButton(x: number, y: number, difficulty: Difficulty): void {
    const left = -BUTTON_WIDTH / 2 + 36;
    const bg = this.add.graphics();
    // Тёмная кнопка с цветной обводкой — чтобы кружки цветов (в том числе синий) были видны
    bg.fillStyle(UI_PANEL_COLOR);
    bg.fillRoundedRect(-BUTTON_WIDTH / 2, -BUTTON_HEIGHT / 2, BUTTON_WIDTH, BUTTON_HEIGHT, 24);
    bg.lineStyle(3, UI_BUTTON_COLOR);
    bg.strokeRoundedRect(-BUTTON_WIDTH / 2, -BUTTON_HEIGHT / 2, BUTTON_WIDTH, BUTTON_HEIGHT, 24);

    const name = this.add
      .text(left, -18, difficulty.name, {
        fontFamily: 'sans-serif',
        fontSize: '40px',
        color: UI_TEXT_COLOR,
      })
      .setOrigin(0, 0.5);

    // Цвета этой сложности — сразу видно, сколько их будет на поле
    const dots = this.add.graphics();
    TILE_COLORS.slice(0, difficulty.colors).forEach((color, i) => {
      dots.fillStyle(color);
      dots.fillCircle(left + DOT_RADIUS + i * (DOT_RADIUS * 2 + 8), 28, DOT_RADIUS);
    });

    const best = loadLeaderboard(difficulty.id)[0];
    const record = this.add
      .text(BUTTON_WIDTH / 2 - 36, 0, best ? `Рекорд\n${best.score}` : '', {
        fontFamily: 'sans-serif',
        fontSize: '26px',
        color: hex(HIGHLIGHT_COLOR),
        align: 'right',
      })
      .setOrigin(1, 0.5);

    const hit = this.add
      .zone(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.scene.start('Game', { difficulty: difficulty.id }));

    this.add.container(x, y, [bg, name, dots, record, hit]);
  }
}
