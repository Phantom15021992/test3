import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';

// Портретная ориентация под телефон; на ПК масштабируется с сохранением пропорций.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#1b1f2e',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 720,
    height: 1280,
  },
  scene: [BootScene, GameScene],
});

// Phaser не всегда замечает изменение размера окна (смена размера окна, поворот телефона)
// и оставляет поле в старом масштабе — пересчитываем сами при любом изменении контейнера.
const container = document.getElementById('app');
if (container) new ResizeObserver(() => game.scale.refresh()).observe(container);
