import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { LevelMapScene } from './scenes/LevelMapScene';
import { MenuScene } from './scenes/MenuScene';
import { RulesScene } from './scenes/RulesScene';

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
  // DOM-элементы поверх холста — для поля ввода имени в таблице лидеров
  dom: { createContainer: true },
  scene: [BootScene, MenuScene, RulesScene, LevelMapScene, GameScene],
});

// Phaser не всегда замечает изменение размера окна (смена размера окна, поворот телефона)
// и оставляет поле в старом масштабе — пересчитываем сами при любом изменении контейнера.
const container = document.getElementById('app');
if (container) new ResizeObserver(() => game.scale.refresh()).observe(container);
