import Phaser from 'phaser';
import { PIECE_IMAGE_FILES } from '../view/pieceArt';

// Загрузка картинок, затем — меню
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    for (const { key, path } of PIECE_IMAGE_FILES) this.load.image(key, path);
  }

  create(): void {
    this.scene.start('Menu');
  }
}
