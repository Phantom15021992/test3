import Phaser from 'phaser';
import {
  createMenuButton,
  MENU_BUTTON_GAP,
  MENU_BUTTON_HEIGHT,
  MENU_BUTTON_WIDTH,
  menuButtonLabel,
} from '../ui/menuButton';
import { RULES_PANEL_HEIGHT, RulesPanel } from '../ui/RulesPanel';
import { addResetProgressButton } from '../ui/resetProgressButton';
import { UI_TEXT_COLOR } from '../view/palette';

const TITLE_Y = 110;
const PANEL_TOP = 170;
const PANEL_MARGIN = 18;

// Отдельный экран с правилами игры; открывается кнопкой из главного меню. Внизу — сброс прогресса кампании.
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
    // «Назад» и сброс прогресса кампании — в один ряд: под панелью правил места на два ряда нет
    const half = (MENU_BUTTON_WIDTH - MENU_BUTTON_GAP) / 2;
    const offset = (half + MENU_BUTTON_GAP) / 2;
    createMenuButton(
      this,
      centerX - offset,
      backY,
      [menuButtonLabel(this, 'Назад')],
      () => this.scene.start('Menu'),
      half,
    );
    addResetProgressButton(this, centerX + offset, backY, half, MENU_BUTTON_HEIGHT);
  }
}
