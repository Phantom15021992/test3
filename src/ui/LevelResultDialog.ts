import Phaser from 'phaser';
import type { LevelSession } from '../core/levelSession';
import { levelAfter } from '../levels';
import { levelTitle, missingGoalsText, starTaskText } from './levelText';
import { createMenuButton, menuButtonLabel } from './menuButton';
import {
  HIGHLIGHT_COLOR,
  UI_MUTED_TEXT_COLOR,
  UI_PANEL_COLOR,
  UI_TEXT_COLOR,
} from '../view/palette';

const PANEL_WIDTH = 620;
const PANEL_HEIGHT = 760;
const DEPTH = 20;
const STAR_COUNT = 3;
const BUTTON_WIDTH = 500;
const BUTTON_HEIGHT = 96;
const BUTTON_STEP = 112;

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

export interface LevelResultActions {
  onRetry: () => void;
  onMap: () => void;
}

// Окно конца уровня: победа со звёздами или поражение, и что делать дальше.
export class LevelResultDialog {
  constructor(private readonly scene: Phaser.Scene) {}

  show(session: LevelSession, actions: LevelResultActions): void {
    const { scene } = this;
    const { width, height } = scene.scale;
    const centerX = width / 2;
    const top = (height - PANEL_HEIGHT) / 2;
    const won = session.goalsDone;

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

    this.text(centerX, top + 70, won ? 'Уровень пройден!' : 'Ходы закончились', 44, UI_TEXT_COLOR);
    this.text(centerX, top + 130, levelTitle(session.level), 28, UI_MUTED_TEXT_COLOR);
    const stars = Array.from({ length: STAR_COUNT }, (_, i) =>
      i < session.stars ? '★' : '☆',
    ).join(' ');
    this.text(centerX, top + 210, stars, 72, hex(HIGHLIGHT_COLOR));

    const details = won
      ? session.level.stars.map(starTaskText).join('\n')
      : `Не хватило:\n${missingGoalsText(session)}`;
    this.text(centerX, top + 320, details, 26, UI_MUTED_TEXT_COLOR).setAlign('center');

    const next = won ? levelAfter(session.level.id) : undefined;
    const buttons: [string, () => void][] = [
      ...(next
        ? ([['Следующий уровень', () => scene.scene.restart({ level: next })]] as [
            string,
            () => void,
          ][])
        : []),
      [won ? 'Ещё раз' : 'Попробовать снова', actions.onRetry],
      ['Карта уровней', actions.onMap],
    ];
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

  private text(x: number, y: number, content: string, size: number, color: string) {
    return this.scene.add
      .text(x, y, content, { fontFamily: 'sans-serif', fontSize: `${size}px`, color })
      .setOrigin(0.5)
      .setDepth(DEPTH);
  }
}
