import Phaser from 'phaser';
import { createMenuButton, menuButtonLabel } from './menuButton';
import { HIGHLIGHT_COLOR, UI_MUTED_TEXT_COLOR, UI_PANEL_COLOR } from '../view/palette';

const PANEL_WIDTH = 620;
const PANEL_HEIGHT = 560;
const DEPTH = 20;
const BUTTON_WIDTH = 500;
const BUTTON_HEIGHT = 96;
const BUTTON_STEP = 112;

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

// Окно конца обучения: что игрок узнал и куда дальше — без звёзд, у обучения их нет.
export function showTutorialDone(
  scene: Phaser.Scene,
  text: string,
  buttons: readonly (readonly [string, () => void])[],
): void {
  const { width, height } = scene.scale;
  const centerX = width / 2;
  const top = (height - PANEL_HEIGHT) / 2;
  // Затемнение перехватывает нажатия, чтобы поле под окном не реагировало
  scene.add
    .rectangle(0, 0, width, height, 0x000000, 0.75)
    .setOrigin(0, 0)
    .setInteractive()
    .setDepth(DEPTH);
  scene.add
    .graphics()
    .fillStyle(UI_PANEL_COLOR)
    .fillRoundedRect(centerX - PANEL_WIDTH / 2, top, PANEL_WIDTH, PANEL_HEIGHT, 28)
    .setDepth(DEPTH);
  scene.add
    .text(centerX, top + 70, 'Отлично!', {
      fontFamily: 'sans-serif',
      fontSize: '48px',
      color: hex(HIGHLIGHT_COLOR),
    })
    .setOrigin(0.5)
    .setDepth(DEPTH);
  scene.add
    .text(centerX, top + 120, text, {
      fontFamily: 'sans-serif',
      fontSize: '28px',
      color: UI_MUTED_TEXT_COLOR,
      align: 'center',
      lineSpacing: 6,
      wordWrap: { width: PANEL_WIDTH - 80 },
    })
    .setOrigin(0.5, 0)
    .setDepth(DEPTH);
  buttons.forEach(([label, onClick], i) => {
    createMenuButton(
      scene,
      centerX,
      top + PANEL_HEIGHT - 80 - (buttons.length - 1 - i) * BUTTON_STEP,
      [menuButtonLabel(scene, label)],
      onClick,
      BUTTON_WIDTH,
      BUTTON_HEIGHT,
    ).setDepth(DEPTH);
  });
}
