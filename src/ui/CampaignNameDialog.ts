import Phaser from 'phaser';
import { PLAYER_NAME_MAX_LENGTH } from '../core/config';
import { loadCampaignName, normalizeCampaignName, saveCampaignName } from '../storage/levelBoard';
import { createMenuButton, menuButtonLabel } from './menuButton';
import { UI_MUTED_TEXT_COLOR, UI_PANEL_COLOR, UI_TEXT_COLOR } from '../view/palette';

const PANEL_WIDTH = 620;
const PANEL_HEIGHT = 520;
const BUTTON_HEIGHT = 96;
const DEPTH = 30;

// Ввод ника кампании: при первом нажатии «Кампания» и по кнопке на карте. Ник виден в таблицах лидеров
// уровней. Поле — настоящий <input>, как поле имени свободной игры: на телефоне открывается клавиатура.
export class CampaignNameDialog {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    /** Ник сохранён */
    private readonly onDone: (name: string) => void,
    /** Окно можно закрыть без ввода — когда ник уже есть */
    private readonly onCancel?: () => void,
  ) {}

  show(): void {
    const { scene } = this;
    const { width, height } = scene.scale;
    const centerX = width / 2;
    const top = (height - PANEL_HEIGHT) / 2;

    // Затемнение перехватывает нажатия, чтобы экран под окном не реагировал
    this.add(
      scene.add.rectangle(0, 0, width, height, 0x000000, 0.75).setOrigin(0, 0).setInteractive(),
    );
    this.add(
      scene.add
        .graphics()
        .fillStyle(UI_PANEL_COLOR)
        .fillRoundedRect(centerX - PANEL_WIDTH / 2, top, PANEL_WIDTH, PANEL_HEIGHT, 28),
    );
    this.text(centerX, top + 65, 'Твой никнейм', 44, UI_TEXT_COLOR);
    this.text(
      centerX,
      top + 135,
      'Он будет виден в таблицах лидеров уровней',
      26,
      UI_MUTED_TEXT_COLOR,
    );

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = PLAYER_NAME_MAX_LENGTH;
    input.value = loadCampaignName();
    input.placeholder = 'Никнейм';
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
    this.add(scene.add.dom(centerX, top + 230, input));
    // Поле сразу активно, прошлый ник выделен — его можно просто напечатать поверх
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
    const hint = this.text(centerX, top + 300, '', 24, UI_MUTED_TEXT_COLOR);

    const submit = () => {
      const name = normalizeCampaignName(input.value);
      if (!name) {
        hint.setText('Введи хотя бы один символ');
        return;
      }
      saveCampaignName(name);
      this.close();
      this.onDone(name);
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    });

    const buttonY = top + PANEL_HEIGHT - 50 - BUTTON_HEIGHT / 2;
    if (this.onCancel) {
      const half = 240;
      this.button(centerX - half / 2 - 10, buttonY, half, 'Готово', submit);
      this.button(centerX + half / 2 + 10, buttonY, half, 'Отмена', () => {
        this.close();
        this.onCancel?.();
      });
    } else {
      this.button(centerX, buttonY, 400, 'Готово', submit);
    }
  }

  private close(): void {
    this.objects.forEach((obj) => obj.destroy());
    this.objects.length = 0;
  }

  private add<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    (obj as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(DEPTH);
    this.objects.push(obj);
    return obj;
  }

  private text(x: number, y: number, content: string, size: number, color: string) {
    return this.add(
      this.scene.add
        .text(x, y, content, { fontFamily: 'sans-serif', fontSize: `${size}px`, color })
        .setOrigin(0.5),
    );
  }

  private button(x: number, y: number, width: number, label: string, onClick: () => void) {
    this.add(
      createMenuButton(
        this.scene,
        x,
        y,
        [menuButtonLabel(this.scene, label)],
        onClick,
        width,
        BUTTON_HEIGHT,
      ),
    );
  }
}
