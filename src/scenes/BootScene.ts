import Phaser from 'phaser';

// Загрузка ассетов. Пока ассетов нет — сразу переходим к игре.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.scene.start('Game');
  }
}
