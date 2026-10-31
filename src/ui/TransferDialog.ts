import Phaser from 'phaser';
import { remoteConfig } from '../storage/remoteLeaderboard';
import {
  loadFromCode,
  loadTransferCode,
  normalizeCode,
  saveToCode,
  TRANSFER_CODE_LENGTH,
} from '../storage/transfer';
import { createMenuButton, menuButtonLabel } from './menuButton';
import { UI_MUTED_TEXT_COLOR, UI_PANEL_COLOR, UI_TEXT_COLOR } from '../view/palette';

const PANEL_WIDTH = 620;
const PANEL_HEIGHT = 800;
const BUTTON_WIDTH = 500;
const BUTTON_HEIGHT = 96;
const DEPTH = 20;
const NO_CONNECTION = 'Нет связи. Попробуйте ещё раз';

// Окно переноса прогресса на другое устройство. Поле кода — настоящий <input>, как поле имени:
// на телефоне так открывается клавиатура, а полученный код можно скопировать.
export class TransferDialog {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private status!: Phaser.GameObjects.Text;
  private input!: HTMLInputElement;
  private busy = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onLoaded: () => void,
  ) {}

  show(): void {
    const { scene } = this;
    const { width, height } = scene.scale;
    const centerX = width / 2;
    const top = (height - PANEL_HEIGHT) / 2;

    // Затемнение перехватывает нажатия, чтобы карта под окном не реагировала
    this.add(
      scene.add.rectangle(0, 0, width, height, 0x000000, 0.75).setOrigin(0, 0).setInteractive(),
    );
    this.add(
      scene.add
        .graphics()
        .fillStyle(UI_PANEL_COLOR)
        .fillRoundedRect(centerX - PANEL_WIDTH / 2, top, PANEL_WIDTH, PANEL_HEIGHT, 28),
    );
    this.text(centerX, top + 65, 'Перенос прогресса', 44, UI_TEXT_COLOR);
    this.text(
      centerX,
      top + 165,
      'Сохраните прогресс и запишите код.\nВведите его на другом устройстве,\nи звёзды этих устройств сложатся.',
      28,
      UI_MUTED_TEXT_COLOR,
    ).setAlign('center');

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.maxLength = TRANSFER_CODE_LENGTH;
    this.input.value = loadTransferCode();
    this.input.placeholder = 'Код';
    this.input.autocapitalize = 'characters';
    Object.assign(this.input.style, {
      width: '460px',
      height: '84px',
      fontSize: '44px',
      letterSpacing: '4px',
      textAlign: 'center',
      borderRadius: '14px',
      border: 'none',
      outline: 'none',
      padding: '0 12px',
      boxSizing: 'border-box',
    });
    this.add(scene.add.dom(centerX, top + 300, this.input));
    this.status = this.text(centerX, top + 385, '', 28, UI_TEXT_COLOR).setAlign('center');

    this.button(centerX, top + 480, 'Сохранить прогресс', () => void this.save());
    this.button(centerX, top + 590, 'Загрузить по коду', () => void this.load());
    this.button(centerX, top + 700, 'Закрыть', () => this.destroy());
  }

  private async save(): Promise<void> {
    await this.request('Сохраняем…', async (config) => {
      const code = await saveToCode(config);
      if (!code) return this.status.setText('Сервер отказал. Попробуйте позже');
      this.input.value = code;
      this.status.setText('Готово! Запишите код');
    });
  }

  private async load(): Promise<void> {
    const code = normalizeCode(this.input.value);
    if (code.length !== TRANSFER_CODE_LENGTH) {
      this.status.setText(`В коде ${TRANSFER_CODE_LENGTH} символов`);
      return;
    }
    await this.request('Загружаем…', async (config) => {
      if (!(await loadFromCode(config, code))) return this.status.setText('Код не найден');
      this.destroy();
      this.onLoaded();
    });
  }

  /** Общая обвязка запроса: не даёт нажать дважды и показывает ошибку связи */
  private async request(
    message: string,
    run: (config: NonNullable<ReturnType<typeof remoteConfig>>) => Promise<unknown>,
  ): Promise<void> {
    const config = remoteConfig();
    if (this.busy) return;
    if (!config) {
      this.status.setText(NO_CONNECTION);
      return;
    }
    this.busy = true;
    this.status.setText(message);
    try {
      await run(config);
    } catch {
      this.status.setText(NO_CONNECTION);
    }
    this.busy = false;
  }

  private button(x: number, y: number, label: string, onClick: () => void): void {
    this.add(
      createMenuButton(
        this.scene,
        x,
        y,
        [menuButtonLabel(this.scene, label)],
        onClick,
        BUTTON_WIDTH,
        BUTTON_HEIGHT,
      ),
    );
  }

  private text(x: number, y: number, content: string, size: number, color: string) {
    return this.add(
      this.scene.add
        .text(x, y, content, { fontFamily: 'sans-serif', fontSize: `${size}px`, color })
        .setOrigin(0.5),
    );
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
