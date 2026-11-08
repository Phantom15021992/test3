import Phaser from 'phaser';
import { isCoal, type Board, type Cell, type Position, type Tile } from '../core/board';
import type { CoalHit } from '../core/coal';
import {
  CLEAR_DURATION_MS,
  COAL_MAX_LAYERS,
  COAL_SIZE,
  COMBO_LABEL_DURATION_MS,
  FALL_DURATION_PER_CELL_MS,
  HINT_PULSE_MS,
  MATCH_PULSE_DURATION_MS,
  PLACE_DURATION_MS,
  SHUFFLE_DURATION_MS,
  SWAP_DURATION_MS,
} from '../core/config';
import type { Fall, Spawn } from '../core/gravity';
import type { ChestHit, ComboHit, Placement } from '../core/resolve';
import type { IceStyle } from '../core/level';
import { comboTextureKey } from './comboLabel';
import {
  BLOCKED_ALPHA,
  BLOCKED_COLOR,
  BOARD_CELL_DARK,
  BOARD_CELL_LIGHT,
  HIGHLIGHT_COLOR,
  SELECTION_COLOR,
  TILE_COLORS,
} from './palette';
import { chestParts, iceImage, obstacleImage, setCoalArt } from './obstacleArt';
import { drawPiece } from './pieceArt';
import {
  addCrystal,
  CRYSTAL_CELL,
  CRYSTAL_CELL_ALPHA,
  CRYSTAL_CELL_SHARE,
  CRYSTAL_FIELD_COLOR,
  CRYSTAL_PIECE_SHARE,
} from './crystalArt';
import { drawTileShape } from './tileArt';

/** Поле тестового уровня чуть шире клеток: синий фон выступает каймой, как на образце художника */
const CRYSTAL_FIELD_PAD = 0.12;

type TileSprite = Phaser.GameObjects.Container;

const TILE_OUTLINE_WIDTH = 3;
const COMBO_LABEL_DEPTH = 5;

// Отображение поля. Состояние игры здесь не хранится — только спрайты, повторяющие поле из core.
export class BoardView {
  private readonly background: Phaser.GameObjects.Graphics;
  private readonly iceLayer: Phaser.GameObjects.Container;
  private readonly selection: Phaser.GameObjects.Graphics;
  private readonly highlight: Phaser.GameObjects.Graphics;
  private readonly hintLayer: Phaser.GameObjects.Graphics;
  private readonly blocked: Phaser.GameObjects.Graphics;
  private hintPulse: Phaser.Tweens.Tween | null = null;
  // Новые фишки появляются над полем — маска скрывает их, пока не долетят до поля
  private readonly maskShape: Phaser.GameObjects.Graphics;
  private readonly mask: Phaser.Display.Masks.GeometryMask;
  private sprites: (TileSprite | null)[][] = [];
  /** Глыбы угля — по картинке на глыбу 4×4, ключ — её левый верхний угол */
  private coal = new Map<string, Phaser.GameObjects.Image>();
  private rows = 0;
  private cols = 0;
  /** Сколько слоёв у целой глыбы на этом уровне: от него считается стадия картинки */
  coalLayers: number = COAL_MAX_LAYERS;
  /** Тестовый уровень с экрана правил: фишки — анимированные камень, ромб и кристалл (лист грузит GameScene) */
  gems = false;
  private readonly plateLayer: Phaser.GameObjects.Container;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly originX: number,
    private readonly originY: number,
    readonly cellSize: number,
  ) {
    this.background = scene.add.graphics();
    // Плитки клеток тестового уровня — свой слой сразу над фоном: под фишками и их ореолами
    this.plateLayer = scene.add.container(0, 0);
    this.iceLayer = scene.add.container(0, 0);
    this.selection = scene.add.graphics().setDepth(1);
    this.highlight = scene.add.graphics().setDepth(1);
    this.hintLayer = scene.add.graphics().setDepth(1);
    this.blocked = scene.add.graphics().setDepth(1);
    this.maskShape = scene.make.graphics({}, false);
    this.mask = this.maskShape.createGeometryMask();
  }

  render(board: Board): void {
    this.sprites.flat().forEach((sprite) => sprite?.destroy());
    this.coal.forEach((image) => image.destroy());
    this.coal.clear();
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
    this.plateLayer.removeAll(true);
    this.sprites = board.map((row, r) =>
      row.map((cell, c) => {
        if (cell?.kind === 'hole') return null;
        const x = this.originX + c * this.cellSize;
        const y = this.originY + r * this.cellSize;
        if (this.gems) this.drawCrystalCell(x, y);
        else {
          this.background.fillStyle((r + c) % 2 === 0 ? BOARD_CELL_DARK : BOARD_CELL_LIGHT);
          this.background.fillRect(x, y, this.cellSize, this.cellSize);
        }
        if (isCoal(cell)) {
          if (cell.top === r && cell.left === c) this.addCoal(cell.top, cell.left, cell.layers);
          return null;
        }
        return cell ? this.createSprite(cell, { row: r, col: c }) : null;
      }),
    );
  }

  /** Клетка тестового уровня: синий фон с каймой и полупрозрачная плитка, как на образце художника */
  private drawCrystalCell(x: number, y: number): void {
    const pad = this.cellSize * CRYSTAL_FIELD_PAD;
    this.background.fillStyle(CRYSTAL_FIELD_COLOR);
    this.background.fillRect(x - pad, y - pad, this.cellSize + pad * 2, this.cellSize + pad * 2);
    const size = this.cellSize * CRYSTAL_CELL_SHARE;
    this.plateLayer.add(
      this.scene.add
        .image(x + this.cellSize / 2, y + this.cellSize / 2, CRYSTAL_CELL)
        .setDisplaySize(size, size)
        .setAlpha(CRYSTAL_CELL_ALPHA),
    );
  }

  /** Лёд рисуется под фишками: он лежит на клетке и не падает вместе с ними */
  setIce(
    ice: readonly (readonly number[])[],
    styles: readonly (readonly (IceStyle | null)[])[],
    cracks: boolean,
  ): void {
    this.iceLayer.removeAll(true);
    ice.forEach((line, row) =>
      line.forEach((hits, col) => {
        const style = styles[row]?.[col];
        if (hits <= 0 || !style) return;
        const { x, y } = this.centerOf({ row, col });
        this.iceLayer.add(
          obstacleImage(this.scene, iceImage(style, hits, cracks), this.cellSize, x, y),
        );
      }),
    );
  }

  /** Сундук получил удар, но остался: снято звено или он открылся — картинка меняется, вздрагивает */
  hitChests(chests: readonly ChestHit[]): void {
    for (const { pos, cell } of chests) {
      const sprite = this.spriteAt(pos);
      if (!sprite) continue;
      sprite.removeAll(true);
      sprite.add(chestParts(this.scene, cell, this.cellSize));
      this.scene.tweens.add({
        targets: sprite,
        scale: 1.12,
        duration: MATCH_PULSE_DURATION_MS,
        yoyo: true,
      });
    }
  }

  /** Удары по углю: глыба вздрагивает и уменьшается, разбитая — исчезает */
  hitCoal(hits: readonly CoalHit[]): void {
    for (const { top, left, layers } of hits) {
      const key = `${top},${left}`;
      const image = this.coal.get(key);
      if (!image) continue;
      if (layers === 0) {
        this.coal.delete(key);
        this.scene.tweens.add({
          targets: image,
          scale: 0,
          alpha: 0,
          duration: CLEAR_DURATION_MS * 2,
          onComplete: () => image.destroy(),
        });
        continue;
      }
      setCoalArt(image, layers, this.cellSize, this.coalLayers);
      const scale = image.scaleX;
      this.scene.tweens.add({
        targets: image,
        scale: scale * 1.08,
        duration: MATCH_PULSE_DURATION_MS,
        yoyo: true,
      });
    }
  }

  private addCoal(top: number, left: number, layers: number): void {
    const half = (COAL_SIZE * this.cellSize) / 2;
    const image = this.scene.add
      .image(
        this.originX + left * this.cellSize + half,
        this.originY + top * this.cellSize + half,
        '',
      )
      .setMask(this.mask);
    setCoalArt(image, layers, this.cellSize, this.coalLayers);
    this.coal.set(`${top},${left}`, image);
  }

  /** Надписи комбо всплывают над совпадениями и не задерживают ход */
  showCombos(combos: ComboHit[]): void {
    const { width } = this.scene.scale;
    for (const { at, step } of combos) {
      const { x, y } = this.centerOf(at);
      const label = this.scene.add.image(x, y, comboTextureKey(step));
      label.setDepth(COMBO_LABEL_DEPTH);
      const half = label.width / 2;
      label.x = Phaser.Math.Clamp(x, half, width - half);
      this.scene.tweens.add({
        targets: label,
        y: y - this.cellSize,
        alpha: { from: 1, to: 0, ease: 'Quad.easeIn' },
        duration: COMBO_LABEL_DURATION_MS,
        onComplete: () => label.destroy(),
      });
    }
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

  /** Затемняет клетки, куда нельзя направить покупку */
  setBlocked(cells: Position[]): void {
    this.blocked.clear();
    this.blocked.fillStyle(BLOCKED_COLOR, BLOCKED_ALPHA);
    for (const { row, col } of cells) {
      const x = this.originX + col * this.cellSize;
      const y = this.originY + row * this.cellSize;
      this.blocked.fillRect(x, y, this.cellSize, this.cellSize);
    }
  }

  /** Подсказка хода: клетки пульсируют, пока игрок не начнёт действовать */
  showHint(cells: Position[]): void {
    this.hideHint();
    for (const pos of cells) this.outline(this.hintLayer, pos, HIGHLIGHT_COLOR);
    this.hintPulse = this.scene.tweens.add({
      targets: this.hintLayer,
      alpha: 0.15,
      duration: HINT_PULSE_MS,
      yoyo: true,
      repeat: -1,
    });
  }

  hideHint(): void {
    this.hintPulse?.remove();
    this.hintPulse = null;
    this.hintLayer.clear();
    this.hintLayer.setAlpha(1);
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
      const sprite =
        cell && cell.kind !== 'hole' && cell.kind !== 'coal' ? this.createSprite(cell, pos) : null;
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
    // Под углём, куда скатиться нечему, новые фишки «выпрыгивают» на месте
    const spawnsPerColumn = new Map<number, number>();
    for (const { to, inPlace } of spawns) {
      if (!inPlace) spawnsPerColumn.set(to.col, (spawnsPerColumn.get(to.col) ?? 0) + 1);
    }
    const created = spawns.map(({ to, tile, inPlace }) => {
      const start = inPlace
        ? to
        : { row: to.row - (spawnsPerColumn.get(to.col) ?? 0), col: to.col };
      const sprite = this.createSprite(tile, start);
      this.sprites[to.row]![to.col] = sprite;
      return { sprite, from: start, to, inPlace };
    });
    const popped = created.filter((c) => c.inPlace).map((c) => c.sprite.setScale(0));

    await Promise.all([
      ...moving.map(({ sprite, fall }) => this.fallTo(sprite, fall.from, fall.to)),
      ...created
        .filter((c) => !c.inPlace)
        .map(({ sprite, from, to }) => this.fallTo(sprite, from, to)),
      popped.length > 0
        ? this.tween({
            targets: popped,
            scale: 1,
            duration: PLACE_DURATION_MS,
            ease: 'Back.easeOut',
          })
        : Promise.resolve(),
    ]);
  }

  private createSprite(
    cell: Exclude<Cell, null | { kind: 'hole' } | { kind: 'coal' }>,
    pos: Position,
  ): TileSprite {
    const { x, y } = this.centerOf(pos);
    let children: Phaser.GameObjects.GameObject[];
    if (cell.kind === 'box') {
      children = chestParts(this.scene, cell, this.cellSize);
    } else if (cell.kind === 'stone' || cell.kind === 'item') {
      const name = cell.kind === 'item' ? 'crown' : cell.kind;
      children = [obstacleImage(this.scene, name, this.cellSize)];
    } else if (cell.kind === 'tile' && this.gems) {
      children = [
        addCrystal(this.scene, cell.level, cell.color, 0, 0, this.cellSize * CRYSTAL_PIECE_SHARE),
      ];
    } else if (cell.kind === 'tile') {
      const body = this.scene.add.graphics();
      this.drawTile(body, cell);
      children = [body];
    } else {
      children = [drawPiece(this.scene, cell, this.cellSize * 0.4)];
    }
    return this.scene.add.container(x, y, children).setMask(this.mask);
  }

  private drawTile(g: Phaser.GameObjects.Graphics, tile: Tile): void {
    drawTileShape(
      g,
      tile.level,
      TILE_COLORS[tile.color] ?? 0xffffff,
      this.cellSize,
      TILE_OUTLINE_WIDTH,
    );
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
      // Под углём фишки скатываются наискосок — тогда меняется и x
      ...this.centerOf(to),
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
