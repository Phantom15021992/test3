import Phaser from 'phaser';
import type { CellLevel } from '../core/board';
import { UI_MUTED_TEXT_COLOR, UI_PANEL_COLOR, UI_TEXT_COLOR } from '../view/palette';
import { figureValue, MATCH_FIGURES, type MatchFigure } from './matchFigures';
import { drawFigure, drawRuleIcon } from './ruleArt';

const PADDING = 16;
const HEADER_HEIGHT = 60;
const ROW_HEIGHT = 74;
const NOTE_ROW_HEIGHT = 30;
const FIGURE_CELL = 19;
const RULE_ICON_STEP = 40;
const FIGURE_COLUMN_WIDTH = 124;
const TITLE_COLUMN_WIDTH = 122;
const LEVEL_COLUMN_WIDTH = 134;
const ICON_Y = -13;
const POINTS_Y = 21;
const FONT_ROW = '20px';
const FONT_POINTS = '19px';
const FONT_NOTE = '20px';

const LEVELS: readonly CellLevel[] = [1, 2, 3];

const NOTES = [
  'Поворот и отражение фигуры не важны',
  'Другие фигуры из 5 и больше клеток — как линия из 5',
];

export const COMBINATIONS_PANEL_HEIGHT =
  PADDING * 2 +
  HEADER_HEIGHT +
  ROW_HEIGHT * MATCH_FIGURES.length +
  NOTE_ROW_HEIGHT * NOTES.length +
  8;

// Панель экрана «Комбинации»: каждая фигура и что она даёт на каждом уровне ячеек.
export class CombinationsPanel {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly left: number,
    top: number,
    width: number,
  ) {
    const panel = scene.add.graphics();
    panel.fillStyle(UI_PANEL_COLOR);
    panel.fillRoundedRect(left, top, width, COMBINATIONS_PANEL_HEIGHT, 20);

    let y = top + PADDING;
    this.drawHeader(y + HEADER_HEIGHT / 2);
    y += HEADER_HEIGHT;
    for (const figure of MATCH_FIGURES) {
      this.drawRow(figure, y + ROW_HEIGHT / 2);
      y += ROW_HEIGHT;
    }
    y += 8;
    for (const note of NOTES) {
      this.text(left + PADDING, y + NOTE_ROW_HEIGHT / 2, note, FONT_NOTE, UI_MUTED_TEXT_COLOR);
      y += NOTE_ROW_HEIGHT;
    }
  }

  private levelX(index: number): number {
    return (
      this.left +
      PADDING +
      FIGURE_COLUMN_WIDTH +
      TITLE_COLUMN_WIDTH +
      LEVEL_COLUMN_WIDTH * (index + 0.5)
    );
  }

  private drawHeader(y: number): void {
    this.text(this.left + PADDING, y, 'Из клеток уровня:', FONT_NOTE, UI_MUTED_TEXT_COLOR);
    LEVELS.forEach((level, i) => {
      const x = this.levelX(i);
      drawRuleIcon(this.scene, x - 34, y, level);
      this.text(x - 8, y, `${level} ур.`, FONT_ROW);
    });
  }

  private drawRow(figure: MatchFigure, y: number): void {
    drawFigure(
      this.scene,
      figure.rows,
      this.left + PADDING + FIGURE_COLUMN_WIDTH / 2,
      y,
      FIGURE_CELL,
    );
    this.text(
      this.left + PADDING + FIGURE_COLUMN_WIDTH,
      y,
      figure.title,
      FONT_ROW,
    ).setWordWrapWidth(TITLE_COLUMN_WIDTH - 8);
    LEVELS.forEach((level, i) => {
      const { icons, points } = figureValue(figure, level);
      const x = this.levelX(i);
      const first = x - ((icons.length - 1) * RULE_ICON_STEP) / 2;
      icons.forEach((icon, n) => {
        drawRuleIcon(this.scene, first + n * RULE_ICON_STEP, y + ICON_Y, icon);
      });
      this.text(x, y + POINTS_Y, String(points), FONT_POINTS, UI_MUTED_TEXT_COLOR).setOrigin(0.5);
    });
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
