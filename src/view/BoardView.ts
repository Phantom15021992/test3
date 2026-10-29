import Phaser from 'phaser';
import type { Board, Cell, Position, Tile } from '../core/board';
import {
  CLEAR_DURATION_MS,
  FALL_DURATION_PER_CELL_MS,
  MATCH_PULSE_DURATION_MS,
  PLACE_DURATION_MS,
  SHUFFLE_DURATION_MS,
  SWAP_DURATION_MS,
} from '../core/config';
import type { Fall, Spawn } from '../core/gravity';
import type { Placement } from '../core/resolve';
import {
  BOARD_CELL_DARK,
  BOARD_CELL_LIGHT,
  HIGHLIGHT_COLOR,
  SELECTION_COLOR,
  TILE_COLORS,
} from './palette';
import { drawPiece } from './pieceArt';

type TileSprite = Phaser.GameObjects.Container;

const TILE_OUTLINE_WIDTH = 3;
const TILE_OUTLINE_ALPHA = 0.35;

/**
 * Вершины правильного многоугольника или звезды вокруг (0, 0), первая вершина — вверху.
 * Для звезды inner < outer: вершины чередуются между внешним и внутренним радиусом.
 * offsetY сдвигает фигуру вниз, чтобы треугольник выглядел отцентрованным в клетке.
 */
function regularPolygon(
  corners: number,
  outer: number,
  inner: number,
  offsetY: number,
): Phaser.Math.Vector2[] {
  const isStar = inner < outer;
  const count = isStar ? corners * 2 : corners;
  return Array.from({ length: count }, (_, i) => {
    const radius = isStar && i % 2 === 1 ? inner : outer;
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / count;
    return new Phaser.Math.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius + offsetY);
  });
}

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

  /** Перемешивание: все фишки сжимаются и появляются уже на новых местах */
  async shuffle(board: Board): Promise<void> {
    const old = this.sprites.flat().filter((s) => s !== null);
    if (old.length > 0) {
      await this.tween({
        targets: old,
        scale: 0,
        duration: SHUFFLE_DURATION_MS,
        ease: 'Back.easeIn',
      });
    }
    this.render(board);
    const fresh = this.sprites.flat().filter((s) => s !== null);
    fresh.forEach((s) => s.setScale(0));
    if (fresh.length > 0) {
      await this.tween({
        targets: fresh,
        scale: 1,
        duration: SHUFFLE_DURATION_MS,
        ease: 'Back.easeOut',
      });
    }
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
    let children: Phaser.GameObjects.GameObject[];
    if (cell.kind === 'tile') {
      const body = this.scene.add.graphics();
      children = [body, ...this.drawTile(body, cell)];
    } else {
      children = [drawPiece(this.scene, cell, this.cellSize * 0.4)];
    }
    return this.scene.add.container(x, y, children).setMask(this.mask);
  }

  /** Возвращает картинку фишки, если она есть; иначе рисует кружок в g */
  private drawTile(g: Phaser.GameObjects.Graphics, tile: Tile): Phaser.GameObjects.GameObject[] {
    // Уровень виден по форме: 1 — круг, 2 — треугольник, 3 — пятиконечная звезда
    const color = TILE_COLORS[tile.color] ?? 0xffffff;
    g.fillStyle(color);
    g.lineStyle(TILE_OUTLINE_WIDTH, 0xffffff, TILE_OUTLINE_ALPHA);

    if (tile.level === 1) {
      const radius = this.cellSize * 0.38;
      g.fillCircle(0, 0, radius);
      g.strokeCircle(0, 0, radius);
      // Блик сверху, чтобы фишка выглядела объёмной
      g.fillStyle(0xffffff, 0.25);
      g.fillCircle(-radius * 0.3, -radius * 0.35, radius * 0.35);
      return [];
    }

    const points =
      tile.level === 2
        ? regularPolygon(3, this.cellSize * 0.47, this.cellSize * 0.47, this.cellSize * 0.08)
        : regularPolygon(5, this.cellSize * 0.46, this.cellSize * 0.2, this.cellSize * 0.03);
    g.fillPoints(points, true);
    g.strokePoints(points, true);
    // Блик у верхней вершины
    g.fillStyle(0xffffff, 0.3);
    g.fillCircle(0, -this.cellSize * (tile.level === 2 ? 0.14 : 0.2), this.cellSize * 0.06);
    return [];
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
