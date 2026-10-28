import Phaser from 'phaser';
import { createEmptyBoard } from '../core/board';

// Заглушка игровой сцены: рисует пустую сетку, чтобы проверить, что сборка и рендер работают.
export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create(): void {
    const board = createEmptyBoard(8, 8);
    const cellSize = 64;
    const rows = board.length;
    const cols = board[0]?.length ?? 0;
    const originX = (this.scale.width - cols * cellSize) / 2;
    const originY = (this.scale.height - rows * cellSize) / 2;

    const grid = this.add.graphics();
    grid.lineStyle(2, 0x3a4160);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        grid.fillStyle((row + col) % 2 === 0 ? 0x262b40 : 0x2c3249);
        grid.fillRect(originX + col * cellSize, originY + row * cellSize, cellSize, cellSize);
        grid.strokeRect(originX + col * cellSize, originY + row * cellSize, cellSize, cellSize);
      }
    }

    this.add
      .text(this.scale.width / 2, originY - 40, 'Три в ряд', {
        fontFamily: 'sans-serif',
        fontSize: '36px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }
}
