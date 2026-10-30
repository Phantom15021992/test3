import Phaser from 'phaser';
import { CHAPTER_ONE } from '../levels';
import { loadLevelStars } from '../storage/progress';
import { levelNumber } from '../ui/levelText';
import {
  createMenuButton,
  MENU_BUTTON_GAP,
  MENU_BUTTON_HEIGHT,
  menuButtonLabel,
} from '../ui/menuButton';
import { HIGHLIGHT_COLOR, UI_TEXT_COLOR } from '../view/palette';

const TITLE_Y = 110;
const FIRST_ROW_Y = 240;
const ROW_STEP = 150;
const COLUMN_STEP = 290;
const COLUMNS = 2;
const CELL_WIDTH = 270;
const CELL_HEIGHT = 120;
const MAX_STARS = 3;

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

// Карта уровней главы: все уровни открыты, начать можно с любого.
export class LevelMapScene extends Phaser.Scene {
  constructor() {
    super('LevelMap');
  }

  create(): void {
    const centerX = this.scale.width / 2;
    this.add
      .text(centerX, TITLE_Y, 'Глава 1', {
        fontFamily: 'sans-serif',
        fontSize: '56px',
        color: UI_TEXT_COLOR,
      })
      .setOrigin(0.5);

    const stars = loadLevelStars();
    CHAPTER_ONE.forEach((level, i) => {
      const column = i % COLUMNS;
      const x = centerX + (column - (COLUMNS - 1) / 2) * COLUMN_STEP;
      const y = FIRST_ROW_Y + Math.floor(i / COLUMNS) * ROW_STEP;
      const earned = stars[level.id] ?? 0;

      const number = this.add
        .text(0, -20, levelNumber(level), {
          fontFamily: 'sans-serif',
          fontSize: '42px',
          color: UI_TEXT_COLOR,
        })
        .setOrigin(0.5);
      const rating = this.add
        .text(0, 28, '★'.repeat(earned) + '☆'.repeat(MAX_STARS - earned), {
          fontFamily: 'sans-serif',
          fontSize: '28px',
          color: hex(HIGHLIGHT_COLOR),
        })
        .setOrigin(0.5);
      createMenuButton(
        this,
        x,
        y,
        [number, rating],
        () => this.scene.start('Game', { level }),
        CELL_WIDTH,
        CELL_HEIGHT,
      );
    });

    const rows = Math.ceil(CHAPTER_ONE.length / COLUMNS);
    const backY = FIRST_ROW_Y + rows * ROW_STEP + MENU_BUTTON_GAP / 2 + MENU_BUTTON_HEIGHT / 2 - 60;
    createMenuButton(this, centerX, backY, [menuButtonLabel(this, 'Назад')], () =>
      this.scene.start('Menu'),
    );
  }
}
