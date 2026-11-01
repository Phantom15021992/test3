import Phaser from 'phaser';
import {
  createMenuButton,
  MENU_BUTTON_GAP,
  MENU_BUTTON_HEIGHT,
  menuButtonLabel,
} from '../ui/menuButton';
import { RULES_PANEL_HEIGHT, RulesPanel } from '../ui/RulesPanel';
import { UI_TEXT_COLOR } from '../view/palette';

const TITLE_Y = 110;
const PANEL_TOP = 170;
const PANEL_MARGIN = 18;
/** Две кнопки в ряд: под панелью нет места на вторую строку */
const BUTTON_WIDTH = 270;
const BUTTON_OFFSET = 145;

// Отдельный экран с правилами игры; открывается кнопкой из главного меню.
export class RulesScene extends Phaser.Scene {
  constructor() {
    super('Rules');
  }

  create(): void {
    const centerX = this.scale.width / 2;
    this.add
      .text(centerX, TITLE_Y, 'Правила игры', {
        fontFamily: 'sans-serif',
        fontSize: '56px',
        color: UI_TEXT_COLOR,
      })
      .setOrigin(0.5);
    new RulesPanel(this, PANEL_MARGIN, PANEL_TOP, this.scale.width - PANEL_MARGIN * 2);
    const backY = PANEL_TOP + RULES_PANEL_HEIGHT + MENU_BUTTON_GAP * 1.5 + MENU_BUTTON_HEIGHT / 2;
    createMenuButton(
      this,
      centerX - BUTTON_OFFSET,
      backY,
      [menuButtonLabel(this, 'Назад')],
      () => this.scene.start('Menu'),
      BUTTON_WIDTH,
    );
    createMenuButton(
      this,
      centerX + BUTTON_OFFSET,
      backY,
      [menuButtonLabel(this, 'Комбинации')],
      () => this.scene.start('Combinations'),
      BUTTON_WIDTH,
    );
  }
}
