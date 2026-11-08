import Phaser from 'phaser';
import { isSoundOn, playSound, setSoundOn } from '../audio/gameSounds';
import { UI_MUTED_TEXT_COLOR } from '../view/palette';

// Выключатель звука: значок динамика в углу экрана, настройка сохраняется между запусками
const ON = '🔊';
const OFF = '🔇';

export function addSoundToggle(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Text {
  const label = scene.add
    .text(x, y, isSoundOn() ? ON : OFF, {
      fontFamily: 'sans-serif',
      fontSize: '44px',
      color: UI_MUTED_TEXT_COLOR,
    })
    .setOrigin(1, 0.5)
    .setInteractive({ useHandCursor: true });
  label.on('pointerup', () => {
    setSoundOn(!isSoundOn());
    label.setText(isSoundOn() ? ON : OFF);
    // Включили — сразу слышно, что звук есть
    playSound('button');
  });
  return label;
}
