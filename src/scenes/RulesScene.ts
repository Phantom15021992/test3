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
const TEST_FONT_SIZE = 26;

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
    // «Назад», сброс прогресса кампании и тестовый уровень — в один ряд: под панелью правил
    // места на два ряда нет
    const third = (MENU_BUTTON_WIDTH - MENU_BUTTON_GAP * 2) / 3;
    const step = third + MENU_BUTTON_GAP;
    createMenuButton(
      this,
      centerX - step,
      backY,
      [menuButtonLabel(this, 'Назад')],
      () => this.scene.start('Menu'),
      third,
    );
    addResetProgressButton(this, centerX, backY, third, MENU_BUTTON_HEIGHT);
    // Тестовый уровень: правила Детского, фишки — картинки самоцветов
    const test = menuButtonLabel(this, 'Тестовый\nуровень', TEST_FONT_SIZE).setAlign('center');
    createMenuButton(
      this,
      centerX + step,
      backY,
      [test],
      () => this.scene.start('Game', { gems: true }),
      third,
    );
  }
}
