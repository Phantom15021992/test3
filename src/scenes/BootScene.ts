import Phaser from 'phaser';
import { TILE_ICONS } from '../view/assets';

// Загрузка ассетов, затем переход к игре
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    for (const { key, path } of TILE_ICONS) this.load.image(key, path);
  }

  create(): void {
    this.scene.start('Game');
  }
}
