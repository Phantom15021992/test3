import Phaser from 'phaser';
import { PLAYER_NAME_MAX_LENGTH, type Difficulty } from '../core/config';
import {
  insertEntry,
  loadLastName,
  loadLeaderboard,
  normalizeName,
  saveLastName,
  saveLeaderboard,
  type LeaderboardEntry,
} from '../storage/leaderboard';
import { remoteConfig, submitAndFetch } from '../storage/remoteLeaderboard';
import {
  HIGHLIGHT_COLOR,
  UI_BUTTON_COLOR,
  UI_MUTED_TEXT_COLOR,
  UI_PANEL_COLOR,
  UI_TEXT_COLOR,
} from '../view/palette';

const PANEL_WIDTH = 620;
const PANEL_HEIGHT = 960;
const ROW_HEIGHT = 46;
const OVERLAY_ALPHA = 0.75;
const DEPTH = 20;

const textStyle = (
  size: number,
  color = UI_TEXT_COLOR,
): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: 'sans-serif',
  fontSize: `${size}px`,
  color,
});

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

export interface GameOverActions {
  /** Новая партия на той же сложности */
  onRestart: () => void;
  /** Вернуться в меню выбора сложности */
  onMenu: () => void;
}

// Окно конца партии: сначала ввод имени, затем таблица лидеров этой сложности
// и кнопки «Играть снова» / «Меню».
// Поле имени — настоящий <input> (DOM-элемент Phaser), чтобы на телефоне открывалась клавиатура.
export class GameOverDialog {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly centerX: number;
  private readonly top: number;

  constructor(private readonly scene: Phaser.Scene) {
    this.centerX = scene.scale.width / 2;
    this.top = (scene.scale.height - PANEL_HEIGHT) / 2;
  }

  show(score: number, difficulty: Difficulty, actions: GameOverActions): void {
    const { width, height } = this.scene.scale;
    // Затемнение перехватывает нажатия, чтобы поле под окном не реагировало
    this.add(
      this.scene.add
        .rectangle(0, 0, width, height, 0x000000, OVERLAY_ALPHA)
        .setOrigin(0, 0)
        .setInteractive(),
    );
    const panel = this.scene.add.graphics();
    panel.fillStyle(UI_PANEL_COLOR);
    panel.fillRoundedRect(this.centerX - PANEL_WIDTH / 2, this.top, PANEL_WIDTH, PANEL_HEIGHT, 28);
    this.add(panel);

    this.add(this.text(this.top + 70, 'Игра окончена', 48));
    this.add(this.text(this.top + 125, difficulty.name, 28, UI_MUTED_TEXT_COLOR));
    this.add(this.text(this.top + 180, `Очки: ${score}`, 40, hex(HIGHLIGHT_COLOR)));
    this.askName(score, difficulty, actions);
  }

  private askName(score: number, difficulty: Difficulty, actions: GameOverActions): void {
    const label = this.add(this.text(this.top + 250, 'Ваше имя:', 30, UI_MUTED_TEXT_COLOR));

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = PLAYER_NAME_MAX_LENGTH;
    input.value = loadLastName();
    input.placeholder = 'Игрок';
    Object.assign(input.style, {
      width: '460px',
      height: '72px',
      fontSize: '34px',
      textAlign: 'center',
      borderRadius: '14px',
      border: 'none',
      outline: 'none',
      padding: '0 12px',
      boxSizing: 'border-box',
    });
    const field = this.add(this.scene.add.dom(this.centerX, this.top + 330, input));
    // Поле сразу активно: на компьютере иначе набранное имя никуда не попадало, пока по полю
    // не щёлкнуть, и результат сохранялся как «Игрок». Прошлое имя выделено — его можно
    // просто напечатать поверх.
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);

    let sent = false;
    const submit = async () => {
      if (sent) return;
      sent = true;
      const name = normalizeName(input.value);
      saveLastName(name);
      // Результат всегда сохраняется и на этом устройстве — на случай, если сервер недоступен
      const entry: LeaderboardEntry = { name, score, playedAt: Date.now() };
      const local = insertEntry(loadLeaderboard(difficulty.id), entry);
      saveLeaderboard(difficulty.id, local.entries);
      [label, field, button].forEach((obj) => obj.destroy());

      const config = remoteConfig();
      if (!config) {
        this.showTable(local.entries, local.rank, score, actions, 'Таблица лидеров');
        return;
      }
      const loading = this.add(this.text(this.top + 400, 'Сохраняем результат…', 30));
      try {
        const remote = await submitAndFetch(config, difficulty.id, name, score);
        loading.destroy();
        this.showTable(remote.entries, remote.rank, score, actions, 'Таблица лидеров');
      } catch {
        loading.destroy();
        this.showTable(
          local.entries,
          local.rank,
          score,
          actions,
          'Нет связи — результаты этого устройства',
        );
      }
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void submit();
    });
    const button = this.button(this.centerX, this.top + 450, 360, 'Сохранить', () => void submit());
  }

  private showTable(
    entries: LeaderboardEntry[],
    rank: number | null,
    score: number,
    actions: GameOverActions,
    title: string,
  ): void {
    // Длинная подпись («нет связи…») мельче, чтобы влезла в окно
    this.add(this.text(this.top + 260, title, title.length > 20 ? 26 : 34, UI_MUTED_TEXT_COLOR));
    const left = this.centerX - PANEL_WIDTH / 2 + 50;
    const right = this.centerX + PANEL_WIDTH / 2 - 50;
    entries.forEach((entry, i) => {
      const y = this.top + 310 + i * ROW_HEIGHT;
      const color = i === rank ? hex(HIGHLIGHT_COLOR) : UI_TEXT_COLOR;
      this.add(this.scene.add.text(left, y, `${i + 1}. ${entry.name}`, textStyle(30, color)));
      this.add(
        this.scene.add.text(right, y, String(entry.score), textStyle(30, color)).setOrigin(1, 0),
      );
    });
    if (rank === null) {
      const y = this.top + 310 + entries.length * ROW_HEIGHT + 10;
      this.add(this.text(y + 15, `Ваш результат ${score} — не в десятке лучших`, 26));
    }
    const y = this.top + PANEL_HEIGHT - 70;
    const close = (action: () => void) => () => {
      this.destroy();
      action();
    };
    this.button(this.centerX - 140, y, 260, 'Играть снова', close(actions.onRestart));
    this.button(this.centerX + 140, y, 260, 'Меню', close(actions.onMenu));
  }

  private button(
    x: number,
    y: number,
    width: number,
    label: string,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const height = 84;
    const bg = this.scene.add.graphics();
    bg.fillStyle(UI_BUTTON_COLOR);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 20);
    const text = this.scene.add.text(0, 0, label, textStyle(34)).setOrigin(0.5);
    const hit = this.scene.add
      .zone(0, 0, width, height)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', onClick);
    return this.add(this.scene.add.container(x, y, [bg, text, hit]));
  }

  private text(y: number, content: string, size: number, color?: string): Phaser.GameObjects.Text {
    return this.scene.add.text(this.centerX, y, content, textStyle(size, color)).setOrigin(0.5);
  }

  private add<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    (obj as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(DEPTH);
    this.objects.push(obj);
    return obj;
  }

  private destroy(): void {
    this.objects.forEach((obj) => obj.destroy());
    this.objects.length = 0;
  }
}
