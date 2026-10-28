import Phaser from 'phaser';
import { BASE_POINTS_PER_TILE, LEVEL2_SCORE_MULTIPLIER } from '../core/config';
import type { MatchGroup } from '../core/match';
import type { ChoiceOption } from '../core/resolve';
import {
  UI_BUTTON_ALT_COLOR,
  UI_BUTTON_COLOR,
  UI_MUTED_TEXT_COLOR,
  UI_PANEL_COLOR,
  UI_TEXT_COLOR,
} from '../view/palette';

const PANEL_HEIGHT = 230;
const BUTTON_HEIGHT = 96;

// Панель под полем: «что сделать с совпадением?» и две кнопки.
export class ChoiceDialog {
  private container: Phaser.GameObjects.Container | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly top: number,
  ) {}

  ask(group: MatchGroup, options: readonly [ChoiceOption, ChoiceOption]): Promise<ChoiceOption> {
    this.close();
    const width = this.scene.scale.width - 40;
    const left = 20;

    const panel = this.scene.add.graphics();
    panel.fillStyle(UI_PANEL_COLOR, 0.97);
    panel.fillRoundedRect(left, this.top, width, PANEL_HEIGHT, 24);

    const title = this.scene.add
      .text(this.scene.scale.width / 2, this.top + 38, 'Что сделать с совпадением?', {
        fontFamily: 'sans-serif',
        fontSize: '32px',
        color: UI_TEXT_COLOR,
      })
      .setOrigin(0.5);

    const container = this.scene.add.container(0, 0, [panel, title]).setDepth(10);
    this.container = container;

    return new Promise((resolve) => {
      const buttonWidth = (width - 60) / 2;
      options.forEach((option, i) => {
        const x = left + 20 + i * (buttonWidth + 20);
        const y = this.top + 90;
        const button = this.scene.add
          .rectangle(
            x,
            y,
            buttonWidth,
            BUTTON_HEIGHT,
            i === 0 ? UI_BUTTON_COLOR : UI_BUTTON_ALT_COLOR,
          )
          .setOrigin(0, 0)
          .setInteractive({ useHandCursor: true });
        const [label, hint] = describe(option, group);
        const text = this.scene.add
          .text(x + buttonWidth / 2, y + 34, label, {
            fontFamily: 'sans-serif',
            fontSize: '30px',
            color: UI_TEXT_COLOR,
          })
          .setOrigin(0.5);
        const sub = this.scene.add
          .text(x + buttonWidth / 2, y + 70, hint, {
            fontFamily: 'sans-serif',
            fontSize: '22px',
            color: UI_MUTED_TEXT_COLOR,
          })
          .setOrigin(0.5);
        button.on('pointerup', () => {
          this.close();
          resolve(option);
        });
        container.add([button, text, sub]);
      });
    });
  }

  close(): void {
    this.container?.destroy();
    this.container = null;
  }
}

function describe(option: ChoiceOption, group: MatchGroup): [string, string] {
  switch (option) {
    case 'bomb':
      return ['Бомба', 'взрыв 3×3'];
    case 'rainbow':
      return ['Радуга', 'убирает один цвет'];
    case 'score':
      return ['Очки', `+${group.cells.length * BASE_POINTS_PER_TILE * LEVEL2_SCORE_MULTIPLIER}`];
    case 'merge':
      if (group.level === 1) return ['Объединить', '2 ячейки 2 уровня'];
      return ['Объединить', group.size === 5 ? '2 ячейки 3 уровня' : '1 ячейка 3 уровня'];
  }
}
