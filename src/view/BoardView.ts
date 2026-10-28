import Phaser from 'phaser';
import type { Board, Position, Tile } from '../core/board';
import { MATCH_PULSE_DURATION_MS, SWAP_DURATION_MS } from '../core/config';
import {
  BOARD_CELL_DARK,
  BOARD_CELL_LIGHT,
  LEVEL2_MARKER_COLOR,
  LEVEL3_MARKER_COLOR,
  SELECTION_COLOR,
  TILE_COLORS,
} from './palette';

type TileSprite = Phaser.GameObjects.Container;

// Отображение поля. Состояние игры здесь не хранится — только спрайты, повторяющие поле из core.
export class BoardView {
  private readonly background: Phaser.GameObjects.Graphics;
  private readonly selection: Phaser.GameObjects.Graphics;
  private sprites: (TileSprite | null)[][] = [];
  private rows = 0;
  private cols = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly originX: number,
    private readonly originY: number,
    readonly cellSize: number,
  ) {
    this.background = scene.add.graphics();
    this.selection = scene.add.graphics().setDepth(1);
  }

  render(board: Board): void {
    this.sprites.flat().forEach((sprite) => sprite?.destroy());
    this.rows = board.length;
    this.cols = board[0]?.length ?? 0;

    this.background.clear();
    this.sprites = board.map((row, r) =>
      row.map((cell, c) => {
        if (cell?.kind === 'hole') return null;
        const x = this.originX + c * this.cellSize;
        const y = this.originY + r * this.cellSize;
        this.background.fillStyle((r + c) % 2 === 0 ? BOARD_CELL_DARK : BOARD_CELL_LIGHT);
        this.background.fillRect(x, y, this.cellSize, this.cellSize);
        return cell ? this.createTile(cell, { row: r, col: c }) : null;
      }),
    );
  }

  cellAt(x: number, y: number): Position | null {
    const col = Math.floor((x - this.originX) / this.cellSize);
    const row = Math.floor((y - this.originY) / this.cellSize);
    if (row < 0 || col < 0 || row >= this.rows || col >= this.cols) return null;
    return { row, col };
  }

  select(pos: Position | null): void {
    this.selection.clear();
    if (!pos) return;
    const { x, y } = this.centerOf(pos);
    this.selection.lineStyle(4, SELECTION_COLOR, 0.9);
    this.selection.strokeRoundedRect(
      x - this.cellSize / 2 + 3,
      y - this.cellSize / 2 + 3,
      this.cellSize - 6,
      this.cellSize - 6,
      10,
    );
  }

  /** Меняет спрайты местами с анимацией */
  async swap(a: Position, b: Position): Promise<void> {
    const spriteA = this.spriteAt(a);
    const spriteB = this.spriteAt(b);
    await Promise.all([this.moveTo(spriteA, b), this.moveTo(spriteB, a)]);
    this.sprites[a.row]![a.col] = spriteB;
    this.sprites[b.row]![b.col] = spriteA;
  }

  /** Подсвечивает клетки совпадения пульсацией */
  async pulse(cells: Position[]): Promise<void> {
    const targets = cells.map((pos) => this.spriteAt(pos)).filter((s) => s !== null);
    if (targets.length === 0) return;
    await new Promise<void>((resolve) =>
      this.scene.tweens.add({
        targets,
        scale: 1.2,
        duration: MATCH_PULSE_DURATION_MS,
        yoyo: true,
        onComplete: () => resolve(),
      }),
    );
  }

  private createTile(tile: Tile, pos: Position): TileSprite {
    const { x, y } = this.centerOf(pos);
    const radius = this.cellSize * 0.38;
    const color = TILE_COLORS[tile.color] ?? 0xffffff;

    const body = this.scene.add.graphics();
    body.fillStyle(color);
    body.fillCircle(0, 0, radius);
    // Блик сверху, чтобы фишка выглядела объёмной
    body.fillStyle(0xffffff, 0.25);
    body.fillCircle(-radius * 0.3, -radius * 0.35, radius * 0.35);

    if (tile.level >= 2) {
      body.lineStyle(4, LEVEL2_MARKER_COLOR);
      body.strokeCircle(0, 0, radius - 2);
    }
    if (tile.level === 3) {
      body.lineStyle(3, LEVEL3_MARKER_COLOR);
      body.strokeCircle(0, 0, radius * 0.6);
    }

    return this.scene.add.container(x, y, [body]);
  }

  private spriteAt(pos: Position): TileSprite | null {
    return this.sprites[pos.row]?.[pos.col] ?? null;
  }

  private centerOf(pos: Position): { x: number; y: number } {
    return {
      x: this.originX + (pos.col + 0.5) * this.cellSize,
      y: this.originY + (pos.row + 0.5) * this.cellSize,
    };
  }

  private moveTo(sprite: TileSprite | null, pos: Position): Promise<void> {
    if (!sprite) return Promise.resolve();
    const { x, y } = this.centerOf(pos);
    return new Promise((resolve) =>
      this.scene.tweens.add({
        targets: sprite,
        x,
        y,
        duration: SWAP_DURATION_MS,
        ease: 'Quad.easeInOut',
        onComplete: () => resolve(),
      }),
    );
  }
}
