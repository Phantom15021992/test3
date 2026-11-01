import Phaser from 'phaser';
import { CombinationsPanel, COMBINATIONS_PANEL_HEIGHT } from '../ui/CombinationsPanel';
import { createMenuButton, menuButtonLabel } from '../ui/menuButton';
import { UI_TEXT_COLOR } from '../view/palette';

const TITLE_Y = 60;
const PANEL_TOP = 110;
const PANEL_MARGIN = 18;
const PANEL_GAP = 22;
const BACK_BUTTON_HEIGHT = 84;

// Какие фигуры собираются и что дают; открывается кнопкой с экрана правил.
export class CombinationsScene extends Phaser.Scene {
  constructor() {
    super('Combinations');
  }

  create(): void {
    const centerX = this.scale.width / 2;
    this.add
      .text(centerX, TITLE_Y, 'Комбинации', {
        fontFamily: 'sans-serif',
        fontSize: '56px',
        color: UI_TEXT_COLOR,
      })
      .setOrigin(0.5);
    new CombinationsPanel(this, PANEL_MARGIN, PANEL_TOP, this.scale.width - PANEL_MARGIN * 2);
    const backY = PANEL_TOP + COMBINATIONS_PANEL_HEIGHT + PANEL_GAP + BACK_BUTTON_HEIGHT / 2;
    createMenuButton(
      this,
      centerX,
      backY,
      [menuButtonLabel(this, 'Назад')],
      () => this.scene.start('Rules'),
      undefined,
      BACK_BUTTON_HEIGHT,
    );
  }
}
