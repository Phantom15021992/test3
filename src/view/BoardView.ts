import Phaser from 'phaser';
import type { Board, Cell, Piece, Position, Tile } from '../core/board';
import {
  CLEAR_DURATION_MS,
  FALL_DURATION_PER_CELL_MS,
  MATCH_PULSE_DURATION_MS,
  PLACE_DURATION_MS,
  SWAP_DURATION_MS,
} from '../core/config';
import type { Fall, Spawn } from '../core/gravity';
import type { Placement } from '../core/resolve';
import {
  BOARD_CELL_DARK,
  BOARD_CELL_LIGHT,
  BOMB_CORE_COLOR,
  HIGHLIGHT_COLOR,
  LEVEL2_MARKER_COLOR,
  LEVEL3_MARKER_COLOR,
  MANIPULATOR_COLOR,
  MANIPULATOR_MARK_COLOR,
  MEGA_BOMB_COLOR,
  MEGA_BOMB_RING_COLOR,
  SELECTION_COLOR,
  SPECIAL_MARK_COLOR,
  TILE_COLORS,
} from './palette';

type TileSprite = Phaser.GameObjects.Container;

// Отображение поля. Состояние игры здесь не хранится — только спрайты, повторяющие поле из core.
export class BoardView {
  private readonly background: Phaser.GameObjects.Graphics;
  private readonly selection: Phaser.GameObjects.Graphics;
  private readonly highlight: Phaser.GameObjects.Graphics;
  // Новые фишки появляются над полем — маска скрывает их, пока не долетят до поля
  private readonly maskShape: Phaser.GameObjects.Graphics;
  private readonly mask: Phaser.Display.Masks.GeometryMask;
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
    this.highlight = scene.add.graphics().setDepth(1);
    this.maskShape = scene.make.graphics({}, false);
    this.mask = this.maskShape.createGeometryMask();
  }

  render(board: Board): void {
    this.sprites.flat().forEach((sprite) => sprite?.destroy());
    this.rows = board.length;
    this.cols = board[0]?.length ?? 0;

    this.maskShape.clear();
    this.maskShape.fillStyle(0xffffff);
    this.maskShape.fillRect(
      this.originX,
      this.originY,
      this.cols * this.cellSize,
      this.rows * this.cellSize,
    );

    this.background.clear();
    this.sprites = board.map((row, r) =>
      row.map((cell, c) => {
        if (cell?.kind === 'hole') return null;
        const x = this.originX + c * this.cellSize;
        const y = this.originY + r * this.cellSize;
        this.background.fillStyle((r + c) % 2 === 0 ? BOARD_CELL_DARK : BOARD_CELL_LIGHT);
        this.background.fillRect(x, y, this.cellSize, this.cellSize);
        return cell ? this.createSprite(cell, { row: r, col: c }) : null;
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
    if (pos) this.outline(this.selection, pos, SELECTION_COLOR);
  }

  /** Подсветка группы, по которой игрок делает выбор */
  setHighlight(cells: Position[]): void {
    this.highlight.clear();
    for (const pos of cells) this.outline(this.highlight, pos, HIGHLIGHT_COLOR);
  }

  /** Замена клеток: созданные спецфишки и объединённые ячейки «выпрыгивают» на месте */
  async place(placements: Placement[]): Promise<void> {
    const created = placements.map(({ pos, cell }) => {
      this.spriteAt(pos)?.destroy();
      const sprite = cell && cell.kind !== 'hole' ? this.createSprite(cell, pos) : null;
      this.sprites[pos.row]![pos.col] = sprite;
      return sprite?.setScale(0);
    });
    const targets = created.filter((s) => s !== undefined);
    if (targets.length > 0) {
      await this.tween({ targets, scale: 1, duration: PLACE_DURATION_MS, ease: 'Back.easeOut' });
    }
  }

  /** Меняет спрайты местами с анимацией */
  async swap(a: Position, b: Position): Promise<void> {
    const spriteA = this.spriteAt(a);
    const spriteB = this.spriteAt(b);
    await Promise.all([this.moveTo(spriteA, b), this.moveTo(spriteB, a)]);
    this.sprites[a.row]![a.col] = spriteB;
    this.sprites[b.row]![b.col] = spriteA;
  }

  /** Совпавшие фишки пульсируют и исчезают */
  async clear(cells: Position[]): Promise<void> {
    const targets = cells.map((pos) => this.spriteAt(pos)).filter((s) => s !== null);
    if (targets.length === 0) return;
    await this.tween({ targets, scale: 1.2, duration: MATCH_PULSE_DURATION_MS });
    await this.tween({ targets, scale: 0, alpha: 0, duration: CLEAR_DURATION_MS });
    targets.forEach((sprite) => sprite.destroy());
    for (const { row, col } of cells) this.sprites[row]![col] = null;
  }

  /** Падение оставшихся фишек и появление новых сверху — одновременно */
  async drop(falls: Fall[], spawns: Spawn[]): Promise<void> {
    const moving = falls.map((fall) => ({ sprite: this.spriteAt(fall.from), fall }));
    for (const { fall } of moving) this.sprites[fall.from.row]![fall.from.col] = null;
    for (const { sprite, fall } of moving) this.sprites[fall.to.row]![fall.to.col] = sprite;

    // Новые фишки столбца выстраиваются стопкой над полем и падают вместе
    const spawnsPerColumn = new Map<number, number>();
    for (const { to } of spawns)
      spawnsPerColumn.set(to.col, (spawnsPerColumn.get(to.col) ?? 0) + 1);
    const created = spawns.map(({ to, tile }) => {
      const start = { row: to.row - (spawnsPerColumn.get(to.col) ?? 0), col: to.col };
      const sprite = this.createSprite(tile, start);
      this.sprites[to.row]![to.col] = sprite;
      return { sprite, from: start, to };
    });

    await Promise.all([
      ...moving.map(({ sprite, fall }) => this.fallTo(sprite, fall.from, fall.to)),
      ...created.map(({ sprite, from, to }) => this.fallTo(sprite, from, to)),
    ]);
  }

  private createSprite(cell: Exclude<Cell, null | { kind: 'hole' }>, pos: Position): TileSprite {
    const { x, y } = this.centerOf(pos);
    const body = this.scene.add.graphics();
    const children: Phaser.GameObjects.GameObject[] = [body];
    if (cell.kind === 'tile') this.drawTile(body, cell);
    else children.push(...this.drawPiece(body, cell));
    return this.scene.add.container(x, y, children).setMask(this.mask);
  }

  private drawTile(g: Phaser.GameObjects.Graphics, tile: Tile): void {
    const radius = this.cellSize * 0.38;
    g.fillStyle(TILE_COLORS[tile.color] ?? 0xffffff);
    g.fillCircle(0, 0, radius);
    // Блик сверху, чтобы фишка выглядела объёмной
    g.fillStyle(0xffffff, 0.25);
    g.fillCircle(-radius * 0.3, -radius * 0.35, radius * 0.35);

    if (tile.level >= 2) {
      g.lineStyle(4, LEVEL2_MARKER_COLOR);
      g.strokeCircle(0, 0, radius - 2);
    }
    if (tile.level === 3) {
      g.lineStyle(3, LEVEL3_MARKER_COLOR);
      g.strokeCircle(0, 0, radius * 0.6);
    }

    if (tile.special?.type === 'rocket') {
      // Полоса с наконечниками вдоль направления удара
      const len = radius * 0.8;
      const head = radius * 0.3;
      const horizontal = tile.special.direction === 'row';
      g.fillStyle(SPECIAL_MARK_COLOR);
      if (horizontal) {
        g.fillRect(-len, -3, len * 2, 6);
        g.fillTriangle(len + head, 0, len, -head, len, head);
        g.fillTriangle(-len - head, 0, -len, -head, -len, head);
      } else {
        g.fillRect(-3, -len, 6, len * 2);
        g.fillTriangle(0, len + head, -head, len, head, len);
        g.fillTriangle(0, -len - head, -head, -len, head, -len);
      }
    }
    if (tile.special?.type === 'bomb') {
      g.fillStyle(BOMB_CORE_COLOR);
      g.fillCircle(0, 0, radius * 0.5);
      g.fillStyle(SPECIAL_MARK_COLOR);
      g.fillCircle(radius * 0.18, -radius * 0.18, radius * 0.12);
    }
  }

  /** Возвращает дополнительные объекты (подписи), которые нужно положить в контейнер */
  private drawPiece(g: Phaser.GameObjects.Graphics, piece: Piece): Phaser.GameObjects.GameObject[] {
    const radius = this.cellSize * 0.4;
    switch (piece.type) {
      case 'rainbow': {
        const step = (Math.PI * 2) / TILE_COLORS.length;
        TILE_COLORS.forEach((color, i) => {
          g.fillStyle(color);
          g.slice(0, 0, radius, i * step, (i + 1) * step);
          g.fillPath();
        });
        g.fillStyle(0xffffff);
        g.fillCircle(0, 0, radius * 0.3);
        return [];
      }
      case 'megaBomb': {
        g.fillStyle(MEGA_BOMB_COLOR);
        g.fillCircle(0, 0, radius);
        g.lineStyle(4, MEGA_BOMB_RING_COLOR);
        g.strokeCircle(0, 0, radius - 3);
        g.strokeCircle(0, 0, radius * 0.55);
        g.fillStyle(MEGA_BOMB_RING_COLOR);
        g.fillCircle(0, 0, radius * 0.2);
        return [];
      }
      case 'manipulator': {
        g.fillStyle(MANIPULATOR_COLOR);
        g.fillRoundedRect(-radius, -radius, radius * 2, radius * 2, radius * 0.4);
        const label = this.scene.add
          .text(0, 0, '⇄', {
            fontFamily: 'sans-serif',
            fontSize: `${Math.round(radius * 1.3)}px`,
            color: `#${MANIPULATOR_MARK_COLOR.toString(16).padStart(6, '0')}`,
          })
          .setOrigin(0.5);
        return [label];
      }
    }
  }

  private outline(g: Phaser.GameObjects.Graphics, pos: Position, color: number): void {
    const { x, y } = this.centerOf(pos);
    g.lineStyle(4, color, 0.9);
    g.strokeRoundedRect(
      x - this.cellSize / 2 + 3,
      y - this.cellSize / 2 + 3,
      this.cellSize - 6,
      this.cellSize - 6,
      10,
    );
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
    return this.tween({
      targets: sprite,
      x,
      y,
      duration: SWAP_DURATION_MS,
      ease: 'Quad.easeInOut',
    });
  }

  private fallTo(sprite: TileSprite | null, from: Position, to: Position): Promise<void> {
    if (!sprite) return Promise.resolve();
    return this.tween({
      targets: sprite,
      y: this.centerOf(to).y,
      duration: FALL_DURATION_PER_CELL_MS * Math.max(1, to.row - from.row),
      ease: 'Quad.easeIn',
    });
  }

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) =>
      this.scene.tweens.add({ ...config, onComplete: () => resolve() }),
    );
  }
}
