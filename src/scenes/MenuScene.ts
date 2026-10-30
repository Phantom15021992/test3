import Phaser from 'phaser';
import { DIFFICULTIES, type Difficulty } from '../core/config';
import { loadLeaderboard, type LeaderboardEntry } from '../storage/leaderboard';
import { fetchTop, remoteConfig } from '../storage/remoteLeaderboard';
import { RULES_PANEL_HEIGHT, RulesPanel } from '../ui/RulesPanel';
import { startGame } from './startGame';
import {
  HIGHLIGHT_COLOR,
  TILE_COLORS,
  UI_BUTTON_COLOR,
  UI_MUTED_TEXT_COLOR,
  UI_PANEL_COLOR,
  UI_TEXT_COLOR,
} from '../view/palette';

const BUTTON_WIDTH = 560;
const BUTTON_HEIGHT = 84;
const BUTTON_GAP = 20;
const TITLE_Y = 46;
const RULES_MARGIN = 18;
const RULES_TOP = 90;
/** Правила отделены от выбора сложности полуторным отступом между кнопками */
const RULES_GAP = BUTTON_GAP * 1.5;
const SUBTITLE_HEIGHT = 34;
const DOT_RADIUS = 8;

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

// Стартовое меню: правила и выбор сложности.
// На кнопке — сколько цветов (кружками) и рекорд этой сложности.
export class MenuScene extends Phaser.Scene {
  private subtitle!: Phaser.GameObjects.Text;
  private starting = false;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.starting = false;
    const centerX = this.scale.width / 2;
    new RulesPanel(this, RULES_MARGIN, RULES_TOP, this.scale.width - RULES_MARGIN * 2);
    const subtitleTop = RULES_TOP + RULES_PANEL_HEIGHT + RULES_GAP;
    const subtitleY = subtitleTop + SUBTITLE_HEIGHT / 2;
    const buttonsTop = subtitleTop + SUBTITLE_HEIGHT + BUTTON_GAP / 2;
    this.add
      .text(centerX, TITLE_Y, 'Три в ряд', {
        fontFamily: 'sans-serif',
        fontSize: '56px',
        color: UI_TEXT_COLOR,
      })
      .setOrigin(0.5);
    this.subtitle = this.add
      .text(centerX, subtitleY, 'Выберите сложность', {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        color: UI_MUTED_TEXT_COLOR,
      })
      .setOrigin(0.5);

    DIFFICULTIES.forEach((difficulty, i) => {
      const y = buttonsTop + BUTTON_HEIGHT / 2 + i * (BUTTON_HEIGHT + BUTTON_GAP);
      this.addButton(centerX, y, difficulty);
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
      .text(left, -14, difficulty.name, {
        fontFamily: 'sans-serif',
        fontSize: '32px',
        color: UI_TEXT_COLOR,
      })
      .setOrigin(0, 0.5);

    // Цвета этой сложности — сразу видно, сколько их будет на поле
    const dots = this.add.graphics();
    TILE_COLORS.slice(0, difficulty.colors).forEach((color, i) => {
      dots.fillStyle(color);
      dots.fillCircle(left + DOT_RADIUS + i * (DOT_RADIUS * 2 + 8), 22, DOT_RADIUS);
    });

    // Рекорд: очки и чей он
    const recordText = (entry: LeaderboardEntry | undefined) =>
      entry ? `Рекорд ${entry.score}\n${entry.name}` : '';
    const record = this.add
      .text(BUTTON_WIDTH / 2 - 36, 0, recordText(loadLeaderboard(difficulty.id)[0]), {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: hex(HIGHLIGHT_COLOR),
        align: 'right',
      })
      .setOrigin(1, 0.5);

    // Общий рекорд всех игроков приходит с сервера позже и заменяет локальный — даже если
    // общая таблица пуста: иначе на разных устройствах были бы видны разные «рекорды»
    const config = remoteConfig();
    if (config) {
      fetchTop(config, difficulty.id, 1)
        .then(([top]) => {
          if (record.active) record.setText(recordText(top));
        })
        .catch(() => {
          // Нет связи — остаётся рекорд этого устройства
        });
    }

    const hit = this.add
      .zone(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        // Пока сервер выдаёт билет на партию, повторные нажатия не должны запускать вторую
        if (this.starting) return;
        this.starting = true;
        this.subtitle.setText('Готовим поле…');
        void startGame(this, difficulty.id);
      });

    this.add.container(x, y, [bg, name, dots, record, hit]);
  }
}
