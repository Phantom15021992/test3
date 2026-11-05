import Phaser from 'phaser';
import { DIFFICULTIES, type Difficulty } from '../core/config';
import { loadLeaderboard, type LeaderboardEntry } from '../storage/leaderboard';
import { resetCampaignProgress } from '../storage/progress';
import { fetchRecords, remoteConfig, wakeGameServer } from '../storage/remoteLeaderboard';
import { forgetTransferCode } from '../storage/transfer';
import { createMenuButton, MENU_BUTTON_WIDTH, menuButtonLabel } from '../ui/menuButton';
import { startGame } from './startGame';
import {
  HIGHLIGHT_COLOR,
  TILE_COLORS,
  UI_MUTED_TEXT_COLOR,
  UI_TEXT_COLOR,
  UI_WARNING_TEXT_COLOR,
} from '../view/palette';

// Кнопки стартового меню ниже, чем в остальных окнах: внизу нужно место для сброса прогресса
const BUTTON_HEIGHT = 92;
const BUTTON_GAP = 22;
const LABEL_FONT_SIZE = 34;
const TITLE_Y = 60;
const LEVELS_BUTTON_Y = 150;
const RULES_BUTTON_Y = LEVELS_BUTTON_Y + BUTTON_HEIGHT + BUTTON_GAP;
/** Кнопка правил отделена от выбора сложности полуторным интервалом между кнопками */
const RULES_GAP = BUTTON_GAP * 1.5;
const SUBTITLE_HEIGHT = 40;
const DOT_RADIUS = 8;
/** Кнопка сброса прогресса — у самого низа экрана, меньше остальных */
const RESET_BUTTON_HEIGHT = 72;
const RESET_BOTTOM_MARGIN = 40;
const RESET_FONT_SIZE = 28;
/** Сколько ждать второго нажатия: сброс необратим, одно случайное касание его не запускает */
const RESET_CONFIRM_MS = 3000;
const RESET_LABEL = 'Сброс прогресса кампании';

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

// Стартовое меню: уровни, правила и свободная игра с выбором сложности.
// На кнопке сложности — сколько цветов (кружками) и её рекорд. Внизу — сброс прогресса кампании.
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

    const label = (text: string) => [menuButtonLabel(this, text, LABEL_FONT_SIZE)];
    createMenuButton(
      this,
      centerX,
      LEVELS_BUTTON_Y,
      label('Кампания'),
      () => {
        if (!this.starting) this.scene.start('LevelMap');
      },
      MENU_BUTTON_WIDTH,
      BUTTON_HEIGHT,
    );
    createMenuButton(
      this,
      centerX,
      RULES_BUTTON_Y,
      label('Правила игры'),
      () => {
        if (!this.starting) this.scene.start('Rules');
      },
      MENU_BUTTON_WIDTH,
      BUTTON_HEIGHT,
    );

    const subtitleTop = RULES_BUTTON_Y + BUTTON_HEIGHT / 2 + RULES_GAP;
    this.subtitle = this.add
      .text(centerX, subtitleTop + SUBTITLE_HEIGHT / 2, 'Выберите сложность', {
        fontFamily: 'sans-serif',
        fontSize: '30px',
        color: UI_MUTED_TEXT_COLOR,
      })
      .setOrigin(0.5);

    const firstY = subtitleTop + SUBTITLE_HEIGHT + BUTTON_GAP / 2 + BUTTON_HEIGHT / 2;
    const records = DIFFICULTIES.map((difficulty, i) => ({
      difficulty,
      text: this.addButton(centerX, firstY + i * (BUTTON_HEIGHT + BUTTON_GAP), difficulty),
    }));

    this.addResetButton(centerX);

    const config = remoteConfig();
    if (!config) return;
    wakeGameServer(config);
    // Общий рекорд всех игроков приходит с сервера позже и заменяет локальный — даже если
    // общая таблица пуста: иначе на разных устройствах были бы видны разные «рекорды»
    fetchRecords(config)
      .then((top) => {
        for (const { difficulty, text } of records) {
          if (text.active) text.setText(recordText(top[difficulty.id]));
        }
      })
      .catch(() => {
        // Нет связи — остаётся рекорд этого устройства
      });
  }

  /**
   * Сброс прогресса кампании: первое нажатие просит подтвердить, второе в течение RESET_CONFIRM_MS
   * стирает звёзды и траты всех уровней (открыт останется только 1-1) и забывает код переноса
   */
  private addResetButton(x: number): void {
    const y = this.scale.height - RESET_BOTTOM_MARGIN - RESET_BUTTON_HEIGHT / 2;
    const text = menuButtonLabel(this, RESET_LABEL, RESET_FONT_SIZE, UI_WARNING_TEXT_COLOR);
    let armed: Phaser.Time.TimerEvent | null = null;
    createMenuButton(
      this,
      x,
      y,
      [text],
      () => {
        if (this.starting) return;
        if (!armed) {
          text.setText('Нажмите ещё раз — прогресс сотрётся');
          armed = this.time.delayedCall(RESET_CONFIRM_MS, () => {
            armed = null;
            text.setText(RESET_LABEL);
          });
          return;
        }
        armed.remove();
        armed = null;
        resetCampaignProgress();
        forgetTransferCode();
        text.setText('Прогресс кампании сброшен');
        this.time.delayedCall(RESET_CONFIRM_MS, () => {
          if (text.active) text.setText(RESET_LABEL);
        });
      },
      MENU_BUTTON_WIDTH,
      RESET_BUTTON_HEIGHT,
    );
  }

  /** Возвращает подпись рекорда: её обновит ответ сервера */
  private addButton(x: number, y: number, difficulty: Difficulty): Phaser.GameObjects.Text {
    const left = -MENU_BUTTON_WIDTH / 2 + 36;

    const name = this.add
      .text(left, -14, difficulty.name, {
        fontFamily: 'sans-serif',
        fontSize: `${LABEL_FONT_SIZE}px`,
        color: UI_TEXT_COLOR,
      })
      .setOrigin(0, 0.5);

    // Цвета этой сложности — сразу видно, сколько их будет на поле
    const dots = this.add.graphics();
    TILE_COLORS.slice(0, difficulty.colors).forEach((color, i) => {
      dots.fillStyle(color);
      dots.fillCircle(left + DOT_RADIUS + i * (DOT_RADIUS * 2 + 7), 22, DOT_RADIUS);
    });

    const record = this.add
      .text(MENU_BUTTON_WIDTH / 2 - 36, 0, recordText(loadLeaderboard(difficulty.id)[0]), {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: hex(HIGHLIGHT_COLOR),
        align: 'right',
      })
      .setOrigin(1, 0.5);

    createMenuButton(
      this,
      x,
      y,
      [name, dots, record],
      () => {
        // Пока сервер выдаёт билет на партию, повторные нажатия не должны запускать вторую
        if (this.starting) return;
        this.starting = true;
        this.subtitle.setText('Готовим поле…');
        void startGame(this, difficulty.id);
      },
      MENU_BUTTON_WIDTH,
      BUTTON_HEIGHT,
    );
    return record;
  }
}

/** Подпись рекорда: очки и чей он */
function recordText(entry: LeaderboardEntry | undefined): string {
  return entry ? `Рекорд ${entry.score}\n${entry.name}` : '';
}
