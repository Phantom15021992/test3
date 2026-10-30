import Phaser from 'phaser';
import { UI_BUTTON_COLOR, UI_PANEL_COLOR, UI_TEXT_COLOR } from '../view/palette';

export const MENU_BUTTON_WIDTH = 560;
export const MENU_BUTTON_HEIGHT = 120;
/** Интервал между кнопками меню */
export const MENU_BUTTON_GAP = 30;

/** Кнопка меню; content — что на ней нарисовано, координаты от её центра */
export function createMenuButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: Phaser.GameObjects.GameObject[],
  onClick: () => void,
  width = MENU_BUTTON_WIDTH,
  height = MENU_BUTTON_HEIGHT,
): Phaser.GameObjects.Container {
  const bg = scene.add.graphics();
  // Тёмная кнопка с цветной обводкой — чтобы кружки цветов (в том числе синий) были видны
  bg.fillStyle(UI_PANEL_COLOR);
  bg.fillRoundedRect(-width / 2, -height / 2, width, height, 24);
  bg.lineStyle(3, UI_BUTTON_COLOR);
  bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 24);
  const hit = scene.add
    .zone(0, 0, width, height)
    .setInteractive({ useHandCursor: true })
    .on('pointerup', onClick);
  return scene.add.container(x, y, [bg, ...content, hit]);
}

/** Подпись по центру кнопки меню */
export function menuButtonLabel(scene: Phaser.Scene, label: string): Phaser.GameObjects.Text {
  return scene.add
    .text(0, 0, label, { fontFamily: 'sans-serif', fontSize: '40px', color: UI_TEXT_COLOR })
    .setOrigin(0.5);
}
