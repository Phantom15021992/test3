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
const SUBHEADER_HEIGHT = 32;
/** Обе колонки стоят на одной сетке: строки идут вровень, значки и подписи одного размера */
const ROW_HEIGHT = 52;
const ICON_SIZE = 24;
const FIGURE_COLUMN_WIDTH = 68;
const FIGURE_CELL = 11;
const FIGURE_ICON_STEP = 26;
const LEVEL_COLUMN_WIDTH = 81;
/** Значок и подпись уровня в заголовке, от середины колонки */
const LEVEL_ICON_X = -24;
const LEVEL_TEXT_X = -8;
const FIGURE_ICON_Y = -13;
const FIGURE_POINTS_Y = 13;
const COMBO_ICON_STEP = 28;
const TEXT_GAP = 8;
const FONT_HEADER = '28px';
const FONT_ROW = '19px';
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
  HEADER_HEIGHT +
  SUBHEADER_HEIGHT +
  ROW_HEIGHT * (SPECIALS.length + 1 + COMBOS.length);

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
      const rowY = y + SUBHEADER_HEIGHT / 2;
      drawRuleIcon(this.scene, levelX(i) + LEVEL_ICON_X, rowY, level, ICON_SIZE);
      this.text(levelX(i) + LEVEL_TEXT_X, rowY, `${level} ур.`, FONT_ROW, UI_MUTED_TEXT_COLOR);
    });
    y += SUBHEADER_HEIGHT;
    for (const figure of MATCH_FIGURES) {
      this.drawFigureRow(figure, x, y + ROW_HEIGHT / 2, levelX);
      y += ROW_HEIGHT;
    }
    for (const note of NOTES) {
      this.text(x, y + ROW_HEIGHT / 2, note, FONT_ROW, UI_MUTED_TEXT_COLOR);
      y += ROW_HEIGHT;
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
        drawRuleIcon(this.scene, iconX, y + FIGURE_ICON_Y, icon, ICON_SIZE);
      });
      this.text(levelX(i), y + FIGURE_POINTS_Y, String(points), FONT_ROW).setOrigin(0.5);
    });
  }

  private drawSpecials(x: number, top: number): void {
    this.text(x, top + HEADER_HEIGHT / 2 - 4, 'Спецфишки', FONT_HEADER);
    let y = top + HEADER_HEIGHT;
    this.text(x, y + SUBHEADER_HEIGHT / 2, ACTIVATION_NOTE, FONT_ROW, UI_MUTED_TEXT_COLOR);
    y += SUBHEADER_HEIGHT;
    for (const { type, text } of SPECIALS) {
      this.icon(x + ICON_SIZE / 2, y + ROW_HEIGHT / 2, type);
      this.text(x + ICON_SIZE + TEXT_GAP, y + ROW_HEIGHT / 2, text, FONT_ROW);
      y += ROW_HEIGHT;
    }
    this.text(x, y + ROW_HEIGHT / 2, 'Комбо: обмен двух спецфишек', FONT_ROW, UI_MUTED_TEXT_COLOR);
    y += ROW_HEIGHT;
    for (const { pair, text } of COMBOS) {
      const rowY = y + ROW_HEIGHT / 2;
      this.icon(x + ICON_SIZE / 2, rowY, pair[0]);
      this.icon(x + ICON_SIZE / 2 + COMBO_ICON_STEP, rowY, pair[1]);
      this.text(x + ICON_SIZE + COMBO_ICON_STEP + TEXT_GAP, rowY, text, FONT_ROW);
      y += ROW_HEIGHT;
    }
  }

  private icon(x: number, y: number, kind: PieceType): void {
    drawRuleIcon(this.scene, x, y, kind, ICON_SIZE);
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
