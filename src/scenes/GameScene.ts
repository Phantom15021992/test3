import Phaser from 'phaser';
import { createEmptyBoard, getCell, isTile, type Board, type Position } from '../core/board';
import {
  DEMO_BOARD_COLS,
  DEMO_BOARD_ROWS,
  DEMO_COLOR_COUNT,
  SWIPE_THRESHOLD,
} from '../core/config';
import { resolveCascades } from '../core/cascade';
import { generateStartBoard } from '../core/generate';
import { areAdjacent, isValidSwap, swapCells } from '../core/moves';
import { createRng, type Rng } from '../core/rng';
import { BoardView } from '../view/BoardView';

const BOARD_MARGIN = 40;

// Игровая сцена. Пока без спецфишек, объединения и очков: совпадения просто удаляются,
// фишки падают, сверху появляются новые, каскады разбираются до конца.
export class GameScene extends Phaser.Scene {
  private board: Board = [];
  private rng!: Rng;
  private view!: BoardView;
  private selected: Position | null = null;
  private pressed: { cell: Position; x: number; y: number } | null = null;
  private busy = false;

  constructor() {
    super('Game');
  }

  create(): void {
    this.rng = createRng(Date.now() >>> 0);
    this.board = generateStartBoard(
      createEmptyBoard(DEMO_BOARD_ROWS, DEMO_BOARD_COLS),
      DEMO_COLOR_COUNT,
      this.rng,
    );

    const cellSize = Math.floor((this.scale.width - BOARD_MARGIN * 2) / DEMO_BOARD_COLS);
    const originX = (this.scale.width - cellSize * DEMO_BOARD_COLS) / 2;
    const originY = (this.scale.height - cellSize * DEMO_BOARD_ROWS) / 2;
    this.view = new BoardView(this, originX, originY, cellSize);
    this.view.render(this.board);

    this.add
      .text(this.scale.width / 2, originY - 60, 'Три в ряд', {
        fontFamily: 'sans-serif',
        fontSize: '44px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.busy) return;
    const cell = this.view.cellAt(pointer.x, pointer.y);
    this.pressed = cell ? { cell, x: pointer.x, y: pointer.y } : null;
  }

  /** Свайп: как только палец ушёл достаточно далеко, меняем с соседом в этом направлении */
  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.pressed || this.busy) return;
    const dx = pointer.x - this.pressed.x;
    const dy = pointer.y - this.pressed.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < this.view.cellSize * SWIPE_THRESHOLD) return;

    const from = this.pressed.cell;
    const to =
      Math.abs(dx) > Math.abs(dy)
        ? { row: from.row, col: from.col + Math.sign(dx) }
        : { row: from.row + Math.sign(dy), col: from.col };
    this.pressed = null;
    void this.trySwap(from, to);
  }

  /** Тап: первый выбирает фишку, второй по соседней — меняет */
  private onPointerUp(): void {
    if (!this.pressed || this.busy) return;
    const cell = this.pressed.cell;
    this.pressed = null;
    if (!isTile(getCell(this.board, cell))) return;

    const selected = this.selected;
    if (selected && areAdjacent(selected, cell)) {
      void this.trySwap(selected, cell);
    } else if (selected && selected.row === cell.row && selected.col === cell.col) {
      this.setSelected(null);
    } else {
      this.setSelected(cell);
    }
  }

  private async trySwap(a: Position, b: Position): Promise<void> {
    if (!isTile(getCell(this.board, a)) || !isTile(getCell(this.board, b))) return;
    this.busy = true;
    this.setSelected(null);

    await this.view.swap(a, b);
    if (isValidSwap(this.board, a, b)) {
      // Логика считается сразу целиком, вид лишь проигрывает шаги
      const result = resolveCascades(swapCells(this.board, a, b), DEMO_COLOR_COUNT, this.rng);
      this.board = result.board;
      for (const step of result.steps) {
        if (step.kind === 'clear') await this.view.clear(step.cells);
        else await this.view.drop(step.falls, step.spawns);
      }
    } else {
      await this.view.swap(a, b);
    }

    this.busy = false;
  }

  private setSelected(pos: Position | null): void {
    this.selected = pos;
    this.view.select(pos);
  }
}
