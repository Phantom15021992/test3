import Phaser from 'phaser';
import {
  createMenuButton,
  MENU_BUTTON_GAP,
  MENU_BUTTON_HEIGHT,
  menuButtonLabel,
} from '../ui/menuButton';
import { RULES_PANEL_HEIGHT, RulesPanel } from '../ui/RulesPanel';
import { addResetProgressButton } from '../ui/resetProgressButton';
import { addUpdateGameButton } from '../ui/updateGameButton';
import { UI_TEXT_COLOR } from '../view/palette';

const TITLE_Y = 110;
const PANEL_TOP = 170;
const PANEL_MARGIN = 18;
const TEST_FONT_SIZE = 24;
const BACK_FONT_SIZE = 34;
/** Ряд кнопок под правилами — почти во всю ширину экрана: в нём четыре кнопки */
const ROW_WIDTH = 680;

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
    // «Назад», сброс прогресса кампании, тестовый уровень и обновление игры — в один ряд: под панелью
    // правил места на два ряда нет, поэтому ряд шире обычной кнопки меню
    const quarter = (ROW_WIDTH - MENU_BUTTON_GAP * 3) / 4;
    const step = quarter + MENU_BUTTON_GAP;
    const xAt = (i: number) => centerX + (i - 1.5) * step;
    createMenuButton(
      this,
      xAt(0),
      backY,
      [menuButtonLabel(this, 'Назад', BACK_FONT_SIZE)],
      () => this.scene.start('Menu'),
      quarter,
    );
    addResetProgressButton(this, xAt(1), backY, quarter, MENU_BUTTON_HEIGHT);
    // Тестовый уровень: правила Лёгкого, фишки — камни с листа владельца
    const test = menuButtonLabel(this, 'Тестовый\nуровень', TEST_FONT_SIZE).setAlign('center');
    createMenuButton(
      this,
      xAt(2),
      backY,
      [test],
      () => this.scene.start('Game', { gems: true }),
      quarter,
    );
    addUpdateGameButton(this, xAt(3), backY, quarter, MENU_BUTTON_HEIGHT);
  }
}
