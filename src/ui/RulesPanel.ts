import Phaser from 'phaser';
import type { CellLevel, Piece, PieceType } from '../core/board';
import {
  BOMB_BOMB_SIZE,
  BOMB_SIZE,
  MATCH_REWARDS,
  MEGA_BOMB_BOMB_SIZE,
  MEGA_BOMB_ROCKET_WIDTH,
  MEGA_BOMB_SIZE,
  ROCKET_BOMB_WIDTH,
  type MatchReward,
} from '../core/config';
import { matchPoints } from '../core/resolve';
import {
  TILE_COLORS,
  UI_BUTTON_COLOR,
  UI_MUTED_TEXT_COLOR,
  UI_PANEL_COLOR,
  UI_TEXT_COLOR,
} from '../view/palette';
import { drawPiece } from '../view/pieceArt';
import { drawTileShape } from '../view/tileArt';

const PADDING = 16;
const COLUMN_GAP = 40;
/** Левая колонка уже правой: подписи комбо длиннее строк с объединениями */
const MATCHES_COLUMN_WIDTH = 276;
const HEADER_HEIGHT = 44;
const SPECIAL_ROW_HEIGHT = 46;
const MATCH_ROW_HEIGHT = 50;
const LEVEL_TITLE_HEIGHT = 38;
const NOTE_ROW_HEIGHT = 32;
const TILE_ICON_SIZE = 36;
const PIECE_ICON_RADIUS = 17;
const COMBO_ICON_STEP = 44;
const FONT_HEADER = '28px';
const FONT_ROW = '21px';
const FONT_NOTE = '20px';
/** Жёлтый: на тёмной панели значки читаются лучше, чем синим, первым цветом палитры */
const ICON_COLOR = TILE_COLORS[1]!;

const LEVELS: readonly CellLevel[] = [1, 2, 3];
const SIZES = [3, 4, 5] as const;

const square = (size: number) => `${size}×${size}`;

const SPECIALS: readonly { type: PieceType; text: string }[] = [
  { type: 'rocket', text: 'Ракета: строка или столбец' },
  { type: 'bomb', text: `Бомба: взрыв ${square(BOMB_SIZE)}` },
  { type: 'megaBomb', text: `Мега-бомба: взрыв ${square(MEGA_BOMB_SIZE)}` },
  { type: 'rainbow', text: 'Радуга: все фишки цвета' },
  { type: 'manipulator', text: 'Манипулятор: обмен клеток' },
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

const NOTES = ['Квадрат 2×2 — как 4 фишки', '6 и больше — как 5', 'Ракета — только за линию'];

/** Высота панели: определяется правой, более длинной колонкой */
export const RULES_PANEL_HEIGHT =
  PADDING * 2 + HEADER_HEIGHT * 2 + SPECIAL_ROW_HEIGHT * (SPECIALS.length + COMBOS.length);

/** Подпись очков: группа из 5+ приносит не меньше этого, кроме 2 уровня — там сумма постоянная */
function pointsLabel(level: CellLevel, size: 3 | 4 | 5): string {
  const points = matchPoints(level, size);
  return size === 5 && level !== 2 ? `${points}+` : String(points);
}

/** Значки награды по порядку: фишки или спецфишки, затем ракета за линию */
function rewardIcons(reward: MatchReward): (CellLevel | PieceType)[] {
  const main = reward.kind === 'tiles' ? reward.level : reward.type;
  const icons: (CellLevel | PieceType)[] = Array.from({ length: reward.count }, () => main);
  if (reward.kind === 'tiles' && reward.lineRocket) icons.push('rocket');
  return icons;
}

// Панель экрана правил: слева — что дают объединения, справа — спецфишки и их комбо.
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
    const dividerX = left + PADDING + MATCHES_COLUMN_WIDTH + COLUMN_GAP / 2;
    panel.lineStyle(2, UI_BUTTON_COLOR, 0.6);
    panel.lineBetween(dividerX, top + PADDING, dividerX, top + RULES_PANEL_HEIGHT - PADDING);
    this.drawMatches(left + PADDING, contentTop, MATCHES_COLUMN_WIDTH);
    this.drawSpecials(left + PADDING + MATCHES_COLUMN_WIDTH + COLUMN_GAP, contentTop);
  }

  private drawMatches(x: number, top: number, width: number): void {
    this.text(x, top + HEADER_HEIGHT / 2 - 4, 'Объединения', FONT_HEADER);
    this.text(
      x + width,
      top + HEADER_HEIGHT / 2 - 4,
      'очки',
      FONT_NOTE,
      UI_MUTED_TEXT_COLOR,
    ).setOrigin(1, 0.5);
    let y = top + HEADER_HEIGHT;
    for (const level of LEVELS) {
      this.text(x, y + LEVEL_TITLE_HEIGHT / 2, `${level} уровень`, FONT_NOTE, UI_MUTED_TEXT_COLOR);
      y += LEVEL_TITLE_HEIGHT;
      for (const size of SIZES) {
        this.drawMatchRow(x, y + MATCH_ROW_HEIGHT / 2, width, level, size);
        y += MATCH_ROW_HEIGHT;
      }
    }
    y += 6;
    for (const note of NOTES) {
      this.text(x, y + NOTE_ROW_HEIGHT / 2, note, FONT_NOTE, UI_MUTED_TEXT_COLOR);
      y += NOTE_ROW_HEIGHT;
    }
  }

  private drawMatchRow(
    x: number,
    y: number,
    width: number,
    level: CellLevel,
    size: 3 | 4 | 5,
  ): void {
    this.text(x, y, `${size}${size === 5 ? '+' : ''} ×`, FONT_ROW);
    this.icon(x + 68, y, level);
    this.text(x + 94, y, '→', FONT_ROW, UI_MUTED_TEXT_COLOR);
    rewardIcons(MATCH_REWARDS[level][size]).forEach((icon, i) => {
      this.icon(x + 140 + i * 40, y, icon);
    });
    this.text(x + width, y, pointsLabel(level, size), FONT_ROW).setOrigin(1, 0.5);
  }

  private drawSpecials(x: number, top: number): void {
    this.text(x, top + HEADER_HEIGHT / 2 - 4, 'Спецфишки', FONT_HEADER);
    let y = top + HEADER_HEIGHT;
    for (const { type, text } of SPECIALS) {
      this.icon(x + PIECE_ICON_RADIUS, y + SPECIAL_ROW_HEIGHT / 2, type);
      this.text(x + PIECE_ICON_RADIUS * 2 + 10, y + SPECIAL_ROW_HEIGHT / 2, text, FONT_ROW);
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
      this.icon(x + PIECE_ICON_RADIUS, rowY, pair[0]);
      this.icon(x + PIECE_ICON_RADIUS + COMBO_ICON_STEP, rowY, pair[1]);
      this.text(x + PIECE_ICON_RADIUS * 2 + COMBO_ICON_STEP + 8, rowY, text, FONT_ROW);
      y += SPECIAL_ROW_HEIGHT;
    }
  }

  private icon(x: number, y: number, kind: CellLevel | PieceType): void {
    if (typeof kind === 'number') {
      const g = this.scene.add.graphics({ x, y });
      drawTileShape(g, kind, ICON_COLOR, TILE_ICON_SIZE, 2);
      return;
    }
    // Ракета в правилах стоит вертикально: направление здесь не важно
    const piece = { kind: 'piece', type: kind, direction: 'col' } as Piece;
    drawPiece(this.scene, piece, PIECE_ICON_RADIUS).setPosition(x, y);
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
