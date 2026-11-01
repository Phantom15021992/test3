import Phaser from 'phaser';
import type { CellLevel, PieceType } from '../core/board';
import {
  BOMB_BOMB_SIZE,
  BOMB_SIZE,
  MEGA_BOMB_BOMB_SIZE,
  MEGA_BOMB_ROCKET_WIDTH,
  MEGA_BOMB_SIZE,
  ROCKET_BOMB_WIDTH,
} from '../core/config';
import {
  UI_BUTTON_COLOR,
  UI_MUTED_TEXT_COLOR,
  UI_PANEL_COLOR,
  UI_TEXT_COLOR,
} from '../view/palette';
import { figureValue, MATCH_FIGURES, type MatchFigure } from './matchFigures';
import { drawFigure, drawRuleIcon } from './ruleArt';

const PADDING = 16;
const COLUMN_GAP = 30;
/** Колонки одной ширины и высоты: вся панель делится пополам */
const COLUMN_WIDTH = 311;
const HEADER_HEIGHT = 44;
const SPECIAL_ROW_HEIGHT = 46;
const LEVELS_HEADER_HEIGHT = 30;
const FIGURE_ROW_HEIGHT = 51;
const FIGURE_COLUMN_WIDTH = 68;
const FIGURE_CELL = 11;
const FIGURE_ICON_SIZE = 22;
const FIGURE_ICON_STEP = 24;
const LEVEL_COLUMN_WIDTH = 81;
const FIGURE_ICON_Y = -11;
const FIGURE_POINTS_Y = 15;
const NOTE_ROW_HEIGHT = 32;
const LEFT_NOTE_ROW_HEIGHT = 28;
/** Отступ над заметками: левая колонка заканчивается вровень с правой */
const NOTES_GAP = 12;
const SPECIAL_ICON_SIZE = 32;
const COMBO_ICON_STEP = 38;
const FONT_HEADER = '28px';
const FONT_ROW = '19px';
const FONT_NOTE = '20px';
const FONT_POINTS = '17px';
const LEVELS: readonly CellLevel[] = [1, 2, 3];

const square = (size: number) => `${size}×${size}`;

const SPECIALS: readonly { type: PieceType; text: string }[] = [
  { type: 'rocket', text: 'Ракета: строка или столбец' },
  { type: 'bomb', text: `Бомба: взрыв ${square(BOMB_SIZE)}` },
  { type: 'megaBomb', text: `Мега-бомба: взрыв ${square(MEGA_BOMB_SIZE)}` },
  { type: 'rainbow', text: 'Радуга: клик, затем цвет' },
  { type: 'manipulator', text: 'Манипулятор: клик, 2 клетки' },
];

const COMBOS: readonly { pair: readonly [PieceType, PieceType]; text: string }[] = [
  { pair: ['rocket', 'rocket'], text: 'крест: строка + столбец' },
  {
    pair: ['rocket', 'bomb'],
    text: `${ROCKET_BOMB_WIDTH} строки + ${ROCKET_BOMB_WIDTH} столбца`,
  },
  { pair: ['bomb', 'bomb'], text: `взрыв ${square(BOMB_BOMB_SIZE)}` },
  { pair: ['rainbow', 'rocket'], text: 'частый цвет → ракеты' },
  { pair: ['rainbow', 'bomb'], text: 'частый цвет → бомбы' },
  { pair: ['rainbow', 'rainbow'], text: 'всё поле' },
  {
    pair: ['megaBomb', 'rocket'],
    text: `${MEGA_BOMB_ROCKET_WIDTH} строк + ${MEGA_BOMB_ROCKET_WIDTH} столбцов`,
  },
  { pair: ['megaBomb', 'bomb'], text: `взрыв ${square(MEGA_BOMB_BOMB_SIZE)}` },
  { pair: ['megaBomb', 'megaBomb'], text: 'всё поле' },
  { pair: ['megaBomb', 'rainbow'], text: 'цвет на выбор → бомбы' },
];

/** Как применять спецфишки: одиночное нажатие их только выделяет */
const ACTIVATION_NOTE = 'Взрывные: 2 клика или сдвиг';

const NOTES = [
  'Поворот фигуры не важен',
  'Другие из 5+ — как линия 5',
  'Радуга при сдвиге',
  'с совпадением остаётся',
];

export const RULES_PANEL_HEIGHT =
  PADDING * 2 +
  HEADER_HEIGHT * 2 +
  NOTE_ROW_HEIGHT +
  SPECIAL_ROW_HEIGHT * (SPECIALS.length + COMBOS.length);

// Панель экрана правил: слева — что дают фигуры, справа — спецфишки и их комбо.
// Числа берутся из config и подсчёта очков игры, поэтому правила не расходятся с игрой.
export class RulesPanel {
  constructor(
    private readonly scene: Phaser.Scene,
    left: number,
    top: number,
    width: number,
  ) {
    const panel = scene.add.graphics();
    panel.fillStyle(UI_PANEL_COLOR);
    panel.fillRoundedRect(left, top, width, RULES_PANEL_HEIGHT, 20);

    const contentTop = top + PADDING;
    // Черта между колонками: без неё очки слева сливаются со значками справа
    const dividerX = left + PADDING + COLUMN_WIDTH + COLUMN_GAP / 2;
    panel.lineStyle(2, UI_BUTTON_COLOR, 0.6);
    panel.lineBetween(dividerX, top + PADDING, dividerX, top + RULES_PANEL_HEIGHT - PADDING);
    this.drawFigures(left + PADDING, contentTop);
    this.drawSpecials(left + PADDING + COLUMN_WIDTH + COLUMN_GAP, contentTop);
  }

  private drawFigures(x: number, top: number): void {
    this.text(x, top + HEADER_HEIGHT / 2 - 4, 'Комбинации', FONT_HEADER);
    let y = top + HEADER_HEIGHT;
    const levelX = (index: number) => x + FIGURE_COLUMN_WIDTH + LEVEL_COLUMN_WIDTH * (index + 0.5);
    LEVELS.forEach((level, i) => {
      this.text(
        levelX(i),
        y + LEVELS_HEADER_HEIGHT / 2,
        `${level} ур.`,
        FONT_NOTE,
        UI_MUTED_TEXT_COLOR,
      ).setOrigin(0.5);
    });
    y += LEVELS_HEADER_HEIGHT;
    for (const figure of MATCH_FIGURES) {
      this.drawFigureRow(figure, x, y + FIGURE_ROW_HEIGHT / 2, levelX);
      y += FIGURE_ROW_HEIGHT;
    }
    y += NOTES_GAP;
    for (const note of NOTES) {
      this.text(x, y + LEFT_NOTE_ROW_HEIGHT / 2, note, FONT_NOTE, UI_MUTED_TEXT_COLOR);
      y += LEFT_NOTE_ROW_HEIGHT;
    }
  }

  private drawFigureRow(
    figure: MatchFigure,
    x: number,
    y: number,
    levelX: (index: number) => number,
  ): void {
    drawFigure(this.scene, figure.rows, x + FIGURE_COLUMN_WIDTH / 2 - 2, y, FIGURE_CELL);
    LEVELS.forEach((level: CellLevel, i) => {
      const { icons, points } = figureValue(figure, level);
      const first = levelX(i) - ((icons.length - 1) * FIGURE_ICON_STEP) / 2;
      icons.forEach((icon, n) => {
        const iconX = first + n * FIGURE_ICON_STEP;
        drawRuleIcon(this.scene, iconX, y + FIGURE_ICON_Y, icon, FIGURE_ICON_SIZE);
      });
      this.text(
        levelX(i),
        y + FIGURE_POINTS_Y,
        String(points),
        FONT_POINTS,
        UI_MUTED_TEXT_COLOR,
      ).setOrigin(0.5);
    });
  }

  private drawSpecials(x: number, top: number): void {
    this.text(x, top + HEADER_HEIGHT / 2 - 4, 'Спецфишки', FONT_HEADER);
    let y = top + HEADER_HEIGHT;
    this.text(x, y + NOTE_ROW_HEIGHT / 2, ACTIVATION_NOTE, FONT_NOTE, UI_MUTED_TEXT_COLOR);
    y += NOTE_ROW_HEIGHT;
    for (const { type, text } of SPECIALS) {
      this.icon(x + SPECIAL_ICON_SIZE / 2, y + SPECIAL_ROW_HEIGHT / 2, type);
      this.text(x + SPECIAL_ICON_SIZE + 8, y + SPECIAL_ROW_HEIGHT / 2, text, FONT_ROW);
      y += SPECIAL_ROW_HEIGHT;
    }
    this.text(
      x,
      y + HEADER_HEIGHT / 2,
      'Комбо: обмен двух спецфишек',
      FONT_NOTE,
      UI_MUTED_TEXT_COLOR,
    );
    y += HEADER_HEIGHT;
    for (const { pair, text } of COMBOS) {
      const rowY = y + SPECIAL_ROW_HEIGHT / 2;
      this.icon(x + SPECIAL_ICON_SIZE / 2, rowY, pair[0]);
      this.icon(x + SPECIAL_ICON_SIZE / 2 + COMBO_ICON_STEP, rowY, pair[1]);
      this.text(x + SPECIAL_ICON_SIZE + COMBO_ICON_STEP + 8, rowY, text, FONT_ROW);
      y += SPECIAL_ROW_HEIGHT;
    }
  }

  private icon(x: number, y: number, kind: PieceType): void {
    drawRuleIcon(this.scene, x, y, kind, SPECIAL_ICON_SIZE);
  }

  private text(
    x: number,
    y: number,
    content: string,
    fontSize: string,
    color = UI_TEXT_COLOR,
  ): Phaser.GameObjects.Text {
    return this.scene.add
      .text(x, y, content, { fontFamily: 'sans-serif', fontSize, color })
      .setOrigin(0, 0.5);
  }
}
