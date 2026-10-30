import Phaser from 'phaser';
import { DIFFICULTIES, type Difficulty } from '../core/config';
import { loadLeaderboard, type LeaderboardEntry } from '../storage/leaderboard';
import { fetchTop, remoteConfig } from '../storage/remoteLeaderboard';
import {
  createMenuButton,
  MENU_BUTTON_GAP,
  MENU_BUTTON_HEIGHT,
  MENU_BUTTON_WIDTH,
  menuButtonLabel,
} from '../ui/menuButton';
import { startGame } from './startGame';
import { HIGHLIGHT_COLOR, TILE_COLORS, UI_MUTED_TEXT_COLOR, UI_TEXT_COLOR } from '../view/palette';

const TITLE_Y = 120;
const RULES_BUTTON_Y = 250;
/** Кнопка правил отделена от выбора сложности полуторным интервалом между кнопками */
const RULES_GAP = MENU_BUTTON_GAP * 1.5;
const SUBTITLE_HEIGHT = 40;
const DOT_RADIUS = 9;

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

// Стартовое меню: кнопка правил и выбор сложности.
// На кнопке сложности — сколько цветов (кружками) и её рекорд.
export class MenuScene extends Phaser.Scene {
  private subtitle!: Phaser.GameObjects.Text;
  private starting = false;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.starting = false;
    const centerX = this.scale.width / 2;
    this.add
      .text(centerX, TITLE_Y, 'Три в ряд', {
        fontFamily: 'sans-serif',
        fontSize: '64px',
        color: UI_TEXT_COLOR,
      })
      .setOrigin(0.5);

    createMenuButton(this, centerX, RULES_BUTTON_Y, [menuButtonLabel(this, 'Правила игры')], () => {
      if (!this.starting) this.scene.start('Rules');
    });

    const subtitleTop = RULES_BUTTON_Y + MENU_BUTTON_HEIGHT / 2 + RULES_GAP;
    this.subtitle = this.add
      .text(centerX, subtitleTop + SUBTITLE_HEIGHT / 2, 'Выберите сложность', {
        fontFamily: 'sans-serif',
        fontSize: '34px',
        color: UI_MUTED_TEXT_COLOR,
      })
      .setOrigin(0.5);

    const firstY = subtitleTop + SUBTITLE_HEIGHT + MENU_BUTTON_GAP / 2 + MENU_BUTTON_HEIGHT / 2;
    DIFFICULTIES.forEach((difficulty, i) => {
      this.addButton(centerX, firstY + i * (MENU_BUTTON_HEIGHT + MENU_BUTTON_GAP), difficulty);
    });
  }

  private addButton(x: number, y: number, difficulty: Difficulty): void {
    const left = -MENU_BUTTON_WIDTH / 2 + 36;

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

    // Рекорд: очки и чей он
    const recordText = (entry: LeaderboardEntry | undefined) =>
      entry ? `Рекорд ${entry.score}\n${entry.name}` : '';
    const record = this.add
      .text(MENU_BUTTON_WIDTH / 2 - 36, 0, recordText(loadLeaderboard(difficulty.id)[0]), {
        fontFamily: 'sans-serif',
        fontSize: '26px',
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

    createMenuButton(this, x, y, [name, dots, record], () => {
      // Пока сервер выдаёт билет на партию, повторные нажатия не должны запускать вторую
      if (this.starting) return;
      this.starting = true;
      this.subtitle.setText('Готовим поле…');
      void startGame(this, difficulty.id);
    });
  }
}
