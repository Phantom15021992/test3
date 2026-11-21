import Phaser from 'phaser';
import type { LevelSession } from '../core/levelSession';
import { levelAfter } from '../levels';
import {
  fetchLevelBoard,
  loadCampaignName,
  localBest,
  rememberBest,
  submitLevelBoard,
  type LevelBoardResult,
  type LevelBoardRow,
} from '../storage/levelBoard';
import { DEFAULT_PLAYER_NAME } from '../storage/leaderboard';
import { remoteConfig } from '../storage/remoteLeaderboard';
import { levelTitle, missingGoalsText } from './levelText';
import { createMenuButton, menuButtonLabel } from './menuButton';
import {
  HIGHLIGHT_COLOR,
  UI_MUTED_TEXT_COLOR,
  UI_PANEL_COLOR,
  UI_TEXT_COLOR,
} from '../view/palette';

const PANEL_WIDTH = 640;
const PANEL_HEIGHT = 1180;
const DEPTH = 20;
const STAR_COUNT = 3;
const BUTTON_WIDTH = 500;
const BUTTON_HEIGHT = 96;
const BUTTON_STEP = 112;
/** Таблица лидеров уровня: высота строки и размер шрифта */
const ROW_HEIGHT = 38;
const TABLE_FONT = 24;
/** Сколько строк таблицы уровня показывать */
const BOARD_TOP = 10;
/** Столбцы таблицы — от левого края окна: место, ник, звёзды, ходы, очки */
const COL_RANK = 52;
const COL_NAME = 76;
const COL_STARS = 400;
const COL_MOVES = 490;
const COL_SCORE = 608;

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
const starsText = (stars: number) => '★'.repeat(stars);

export interface LevelResultActions {
  onRetry: () => void;
  onMap: () => void;
}

// Окно конца уровня: победа со звёздами или поражение, таблица лидеров уровня и что делать дальше.
// Победа отправляется в таблицу (supabase/level_board.sql); без связи видно лучший итог этого устройства.
export class LevelResultDialog {
  private left = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  show(session: LevelSession, actions: LevelResultActions): void {
    const { scene } = this;
    const { width, height } = scene.scale;
    const centerX = width / 2;
    const top = (height - PANEL_HEIGHT) / 2;
    this.left = centerX - PANEL_WIDTH / 2;
    const won = session.goalsDone;

    // Затемнение перехватывает нажатия, чтобы поле под окном не реагировало
    scene.add
      .rectangle(0, 0, width, height, 0x000000, 0.75)
      .setOrigin(0, 0)
      .setInteractive()
      .setDepth(DEPTH);
    scene.add
      .graphics()
      .fillStyle(UI_PANEL_COLOR)
      .fillRoundedRect(this.left, top, PANEL_WIDTH, PANEL_HEIGHT, 28)
      .setDepth(DEPTH);

    this.text(centerX, top + 60, won ? 'Уровень пройден!' : 'Ходы закончились', 44, UI_TEXT_COLOR);
    this.text(centerX, top + 112, levelTitle(session.level), 28, UI_MUTED_TEXT_COLOR);
    const stars = Array.from({ length: STAR_COUNT }, (_, i) =>
      i < session.stars ? '★' : '☆',
    ).join(' ');
    this.text(centerX, top + 180, stars, 64, hex(HIGHLIGHT_COLOR));

    let tableTop = top + 250;
    if (won) {
      this.text(
        centerX,
        top + 245,
        `Ходов: ${session.moves}   Очков: ${session.score}`,
        26,
        UI_MUTED_TEXT_COLOR,
      );
      tableTop = top + 300;
    } else {
      const missing = this.text(
        centerX,
        top + 250,
        `Не хватило:\n${missingGoalsText(session)}`,
        24,
        UI_MUTED_TEXT_COLOR,
      ).setAlign('center');
      tableTop = top + 250 + missing.height / 2 + 30;
    }
    this.showBoard(session, won, centerX, tableTop);

    const next = won ? levelAfter(session.level.id) : undefined;
    const buttons: [string, () => void][] = [
      ...(next
        ? ([['Следующий уровень', () => scene.scene.restart({ level: next })]] as [
            string,
            () => void,
          ][])
        : []),
      [won ? 'Ещё раз' : 'Попробовать снова', actions.onRetry],
      ['Карта уровней', actions.onMap],
    ];
    buttons.forEach(([label, onClick], i) => {
      createMenuButton(
        scene,
        centerX,
        top + PANEL_HEIGHT - 70 - (buttons.length - 1 - i) * BUTTON_STEP,
        [menuButtonLabel(scene, label)],
        onClick,
        BUTTON_WIDTH,
        BUTTON_HEIGHT,
      ).setDepth(DEPTH);
    });
  }

  /** Победа уходит в таблицу уровня, поражение только читает её; пока сервер думает — «Загружаем…» */
  private showBoard(session: LevelSession, won: boolean, centerX: number, top: number): void {
    const levelId = session.level.id;
    const mine: LevelBoardResult | null = won
      ? rememberBest(levelId, { stars: session.stars, moves: session.moves, score: session.score })
      : localBest(levelId);
    const heading = this.text(centerX, top, 'Таблица лидеров уровня', 30, UI_TEXT_COLOR);
    const status = this.text(centerX, top + 60, 'Загружаем таблицу…', 24, UI_MUTED_TEXT_COLOR);
    const offline = (note: string) => {
      status.setText(note);
      if (mine) this.rows(top + 50, [{ rank: 0, name: this.name(), ...mine, me: true }], top + 110);
    };
    const config = remoteConfig();
    if (!config) {
      offline('Нет связи — твой лучший итог:');
      return;
    }
    const request = won
      ? submitLevelBoard(config, levelId, this.name(), {
          stars: session.stars,
          moves: session.moves,
          score: session.score,
        })
      : fetchLevelBoard(config, levelId);
    request
      .then((rows) => {
        // Игрок мог уже уйти с экрана
        if (!heading.active) return;
        if (!rows) {
          offline('Таблица не загрузилась — твой лучший итог:');
          return;
        }
        status.destroy();
        if (rows.length === 0) {
          this.text(centerX, top + 60, 'Пока здесь никого нет', 24, UI_MUTED_TEXT_COLOR);
          return;
        }
        // Только десятка (по просьбе владельца): игрок ниже неё в таблице не показывается
        this.rows(
          top + 50,
          rows.filter((row) => row.rank <= BOARD_TOP),
        );
      })
      .catch(() => {
        if (heading.active) offline('Нет связи — твой лучший итог:');
      });
  }

  private name(): string {
    return loadCampaignName() || DEFAULT_PLAYER_NAME;
  }

  /** Заголовок столбцов и строки; строка игрока подсвечена, если он ниже десятки — отделена отступом */
  private rows(y: number, rows: readonly LevelBoardRow[], firstRowY = y + ROW_HEIGHT): void {
    const header = { rank: '#', name: 'Никнейм', stars: '★', moves: 'Ходы', score: 'Очки' };
    if (firstRowY === y + ROW_HEIGHT) this.row(y, header, UI_MUTED_TEXT_COLOR);
    let rowY = firstRowY;
    rows.forEach((row, i) => {
      // Строка игрока ниже десятки: между ней и десяткой — пропуск
      if (i > 0 && row.rank > rows[i - 1]!.rank + 1) rowY += ROW_HEIGHT / 2;
      this.row(
        rowY,
        {
          rank: row.rank > 0 ? String(row.rank) : '',
          name: row.name,
          stars: starsText(row.stars),
          moves: String(row.moves),
          score: String(row.score),
        },
        row.me ? hex(HIGHLIGHT_COLOR) : UI_TEXT_COLOR,
      );
      rowY += ROW_HEIGHT;
    });
  }

  private row(
    y: number,
    cells: { rank: string; name: string; stars: string; moves: string; score: string },
    color: string,
  ): void {
    const at = (x: number, text: string, originX: number) =>
      this.scene.add
        .text(this.left + x, y, text, {
          fontFamily: 'sans-serif',
          fontSize: `${TABLE_FONT}px`,
          color,
        })
        .setOrigin(originX, 0.5)
        .setDepth(DEPTH);
    at(COL_RANK, cells.rank, 1);
    at(COL_NAME, cells.name, 0);
    at(COL_STARS, cells.stars, 0.5);
    at(COL_MOVES, cells.moves, 0.5);
    at(COL_SCORE, cells.score, 1);
  }

  private text(x: number, y: number, content: string, size: number, color: string) {
    return this.scene.add
      .text(x, y, content, { fontFamily: 'sans-serif', fontSize: `${size}px`, color })
      .setOrigin(0.5)
      .setDepth(DEPTH);
  }
}
