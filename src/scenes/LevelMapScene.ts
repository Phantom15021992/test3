import Phaser from 'phaser';
import { FLOOR_SIZE, floorOf } from '../core/level';
import { FLOORS } from '../levels';
import { floorWallet, isLevelOpen, loadLevelStars } from '../storage/progress';
import { levelNumber } from '../ui/levelText';
import { TransferDialog } from '../ui/TransferDialog';
import {
  createMenuButton,
  MENU_BUTTON_GAP,
  MENU_BUTTON_HEIGHT,
  menuButtonLabel,
} from '../ui/menuButton';
import { HIGHLIGHT_COLOR, UI_MUTED_TEXT_COLOR, UI_TEXT_COLOR } from '../view/palette';

const TITLE_Y = 80;
const WALLET_Y = 150;
const ARROW_OFFSET = 230;
const FIRST_ROW_Y = 260;
const ROW_STEP = 150;
const COLUMN_STEP = 290;
const COLUMNS = 2;
const CELL_WIDTH = 270;
const CELL_HEIGHT = 120;
const MAX_STARS = 3;
const LOCKED_ALPHA = 0.35;

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

// Карта кампании: этажи листаются стрелками, уровни открываются строго по порядку.
export class LevelMapScene extends Phaser.Scene {
  private floor = 1;

  constructor() {
    super('LevelMap');
  }

  init(data: { floor?: number }): void {
    this.floor = data.floor ?? lastOpenFloor();
  }

  create(): void {
    const centerX = this.scale.width / 2;
    this.add
      .text(centerX, TITLE_Y, `Этаж ${this.floor}`, {
        fontFamily: 'sans-serif',
        fontSize: '56px',
        color: UI_TEXT_COLOR,
      })
      .setOrigin(0.5);
    this.add
      .text(centerX, WALLET_Y, `Звёзды этажа: ★ ${floorWallet(this.floor)}`, {
        fontFamily: 'sans-serif',
        fontSize: '30px',
        color: hex(HIGHLIGHT_COLOR),
      })
      .setOrigin(0.5);
    this.addArrow(centerX - ARROW_OFFSET, '‹', this.floor - 1);
    this.addArrow(centerX + ARROW_OFFSET, '›', this.floor + 1);

    const stars = loadLevelStars();
    const levels = FLOORS[this.floor - 1] ?? [];
    levels.forEach((level, i) => {
      const column = i % COLUMNS;
      const x = centerX + (column - (COLUMNS - 1) / 2) * COLUMN_STEP;
      const y = FIRST_ROW_Y + Math.floor(i / COLUMNS) * ROW_STEP;
      const earned = stars[level.id] ?? 0;
      const open = isLevelOpen(level.id, stars);

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
        () => {
          if (open) this.scene.start('Game', { level });
        },
        CELL_WIDTH,
        CELL_HEIGHT,
      ).setAlpha(open ? 1 : LOCKED_ALPHA);
    });

    const rows = Math.ceil(FLOOR_SIZE / COLUMNS);
    const backY = FIRST_ROW_Y + rows * ROW_STEP + MENU_BUTTON_GAP / 2 + MENU_BUTTON_HEIGHT / 2 - 60;
    createMenuButton(this, centerX, backY, [menuButtonLabel(this, 'Назад')], () =>
      this.scene.start('Menu'),
    );
    createMenuButton(
      this,
      centerX,
      backY + MENU_BUTTON_HEIGHT + MENU_BUTTON_GAP / 2,
      [menuButtonLabel(this, 'Перенос прогресса')],
      () => new TransferDialog(this, () => this.scene.restart({})).show(),
    );
  }

  private addArrow(x: number, label: string, floor: number): void {
    if (floor < 1 || floor > FLOORS.length) return;
    this.add
      .text(x, TITLE_Y, label, {
        fontFamily: 'sans-serif',
        fontSize: '84px',
        color: UI_MUTED_TEXT_COLOR,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.scene.restart({ floor }));
  }
}

/** Этаж самого дальнего открытого уровня: на него карта открывается по умолчанию */
function lastOpenFloor(): number {
  const stars = loadLevelStars();
  const open = FLOORS.flat().filter((level) => isLevelOpen(level.id, stars));
  return floorOf(open[open.length - 1]?.id ?? 1);
}
