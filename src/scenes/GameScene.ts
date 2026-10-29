import Phaser from 'phaser';
import {
  createEmptyBoard,
  getCell,
  isPiece,
  isTile,
  samePos,
  type Board,
  type Position,
} from '../core/board';
import {
  DEMO_BOARD_COLS,
  DEMO_BOARD_ROWS,
  DEMO_COLOR_COUNT,
  SWIPE_THRESHOLD,
} from '../core/config';
import { generateStartBoard } from '../core/generate';
import { buyBonus, placeBonus, type BonusType } from '../core/bonus';
import { History } from '../core/history';
import { areAdjacent, hasTileMove, isValidSwap, shuffleBoard } from '../core/moves';
import { resolveMove, type ChoiceOption, type Move } from '../core/resolve';
import { createRng, type Rng } from '../core/rng';
import { comboNeedsColor, isCombo } from '../core/specials';
import { ArrowButton } from '../ui/ArrowButton';
import { BonusShop } from '../ui/BonusShop';
import { ChoiceDialog } from '../ui/ChoiceDialog';
import { UI_MUTED_TEXT_COLOR, UI_TEXT_COLOR } from '../view/palette';
import { BoardView } from '../view/BoardView';

const BOARD_MARGIN = 40;

/** Режим ввода: обычный, выбор цвета (радуга / мега-бомба + радуга), выбор клеток манипулятором */
type Mode =
  | { type: 'idle' }
  | { type: 'rainbowColor'; at: Position }
  | { type: 'comboColor'; from: Position; to: Position }
  | { type: 'manipulator'; at: Position; first: Position | null };

/** Снимок партии для шага назад / вперёд */
interface Snapshot {
  board: Board;
  score: number;
  moves: number;
  rngState: number;
}

export class GameScene extends Phaser.Scene {
  private board: Board = [];
  private rng!: Rng;
  private view!: BoardView;
  private dialog!: ChoiceDialog;
  private scoreText!: Phaser.GameObjects.Text;
  private movesText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private score = 0;
  /** Сколько ходов сделано (взятие бонуса и перемешивание не считаются) */
  private moves = 0;
  private bonusShop!: BonusShop;
  private mode: Mode = { type: 'idle' };
  private selected: Position | null = null;
  private pressed: { cell: Position; x: number; y: number } | null = null;
  private busy = false;
  private history!: History<Snapshot>;
  private undoButton!: ArrowButton;
  private redoButton!: ArrowButton;

  constructor() {
    super('Game');
  }

  create(): void {
    // ?seed=123 — одинаковое поле при каждом запуске (удобно для отладки)
    const seedParam = Number(new URLSearchParams(window.location.search).get('seed'));
    this.rng = createRng(
      Number.isFinite(seedParam) && seedParam > 0 ? seedParam : Date.now() >>> 0,
    );
    if (import.meta.env.DEV) {
      // Доступ к сцене из консоли браузера для ручной проверки
      (window as unknown as { gameScene: GameScene }).gameScene = this;
    }
    this.board = generateStartBoard(
      createEmptyBoard(DEMO_BOARD_ROWS, DEMO_BOARD_COLS),
      DEMO_COLOR_COUNT,
      this.rng,
    );

    const cellSize = Math.floor((this.scale.width - BOARD_MARGIN * 2) / DEMO_BOARD_COLS);
    const originX = (this.scale.width - cellSize * DEMO_BOARD_COLS) / 2;
    const originY = (this.scale.height - cellSize * DEMO_BOARD_ROWS) / 2;
    const boardBottom = originY + cellSize * DEMO_BOARD_ROWS;
    this.view = new BoardView(this, originX, originY, cellSize);
    this.view.render(this.board);
    this.dialog = new ChoiceDialog(this, boardBottom + 30);

    const centerX = this.scale.width / 2;
    this.add
      .text(centerX, originY - 275, 'Три в ряд', {
        fontFamily: 'sans-serif',
        fontSize: '44px',
        color: UI_TEXT_COLOR,
      })
      .setOrigin(0.5);
    const hudStyle = { fontFamily: 'sans-serif', fontSize: '34px', color: UI_TEXT_COLOR };
    this.scoreText = this.add.text(centerX - 100, originY - 205, '', hudStyle).setOrigin(0.5);
    this.movesText = this.add.text(centerX + 115, originY - 205, '', hudStyle).setOrigin(0.5);
    this.hintText = this.add
      .text(centerX, boardBottom + 60, '', {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        color: UI_MUTED_TEXT_COLOR,
        align: 'center',
      })
      .setOrigin(0.5);
    const boardRight = originX + cellSize * DEMO_BOARD_COLS;
    this.bonusShop = new BonusShop(this, originX, boardRight, originY - 115, (type) =>
      this.takeBonus(type),
    );
    this.addScore(0);
    this.updateMoves();

    this.undoButton = new ArrowButton(this, originX + 36, originY - 205, 'left', () => this.undo());
    this.redoButton = new ArrowButton(this, boardRight - 36, originY - 205, 'right', () =>
      this.redo(),
    );
    this.history = new History(this.snapshot());
    this.updateHistoryButtons();

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
  }

  /** Только для отладки: подменить поле */
  debugSetBoard(board: Board): void {
    this.board = board;
    this.view.render(board);
    this.history.push(this.snapshot());
    this.updateHistoryButtons();
  }

  // ---------- Шаг назад / вперёд ----------

  private snapshot(): Snapshot {
    return {
      board: this.board,
      score: this.score,
      moves: this.moves,
      rngState: this.rng.getState(),
    };
  }

  private undo(): void {
    if (this.busy) return;
    const state = this.history.undo();
    if (state) this.restore(state);
  }

  private redo(): void {
    if (this.busy) return;
    const state = this.history.redo();
    if (state) this.restore(state);
  }

  private restore(state: Snapshot): void {
    this.board = state.board;
    // ГСЧ тоже откатывается: повтор того же хода даст тот же результат
    this.rng = createRng(state.rngState);
    this.score = state.score;
    this.moves = state.moves;
    this.updateMoves();
    this.addScore(0);
    this.setSelected(null);
    this.setMode({ type: 'idle' });
    this.view.render(this.board);
    this.updateHistoryButtons();
  }

  private updateHistoryButtons(): void {
    this.undoButton.setEnabled(!this.busy && this.history.canUndo);
    this.redoButton.setEnabled(!this.busy && this.history.canRedo);
    this.updateBonusShop();
  }

  // ---------- Ввод ----------

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
    this.setMode({ type: 'idle' });
    void this.trySwap(from, to);
  }

  private onPointerUp(): void {
    if (!this.pressed || this.busy) return;
    const cell = this.pressed.cell;
    this.pressed = null;
    this.onTap(cell);
  }

  private onTap(cell: Position): void {
    const content = getCell(this.board, cell);
    const mode = this.mode;

    if (mode.type === 'rainbowColor') {
      if (samePos(mode.at, cell)) return this.setMode({ type: 'idle' });
      // Радугу можно и совместить с соседней спецфишкой
      if (areAdjacent(mode.at, cell) && isCombo(this.board, mode.at, cell)) {
        this.setMode({ type: 'idle' });
        return void this.trySwap(mode.at, cell);
      }
      if (isTile(content)) {
        this.setMode({ type: 'idle' });
        return void this.play({ type: 'rainbow', at: mode.at, color: content.color });
      }
      return;
    }

    if (mode.type === 'comboColor') {
      if (isTile(content)) {
        this.setMode({ type: 'idle' });
        return void this.play({ type: 'swap', from: mode.from, to: mode.to, color: content.color });
      }
      return;
    }

    if (mode.type === 'manipulator') {
      if (samePos(mode.at, cell)) return this.setMode({ type: 'idle' });
      if (content == null || content.kind === 'hole') return;
      if (!mode.first) return this.setMode({ ...mode, first: cell });
      if (samePos(mode.first, cell)) return this.setMode({ ...mode, first: null });
      this.setMode({ type: 'idle' });
      return void this.play({ type: 'manipulator', at: mode.at, a: mode.first, b: cell });
    }

    // Обычный режим
    const selected = this.selected;
    if (selected && areAdjacent(selected, cell)) {
      this.setSelected(null);
      return void this.trySwap(selected, cell);
    }
    if (selected && samePos(selected, cell)) return this.setSelected(null);

    if (isPiece(content)) {
      // Ракету и бомбу выбирают как обычную фишку — срабатывают при обмене с соседней клеткой
      if (content.type === 'rocket' || content.type === 'bomb') return this.setSelected(cell);
      this.setSelected(null);
      if (content.type === 'megaBomb') return void this.play({ type: 'megaBomb', at: cell });
      if (content.type === 'rainbow') return this.setMode({ type: 'rainbowColor', at: cell });
      return this.setMode({ type: 'manipulator', at: cell, first: null });
    }
    if (isTile(content)) this.setSelected(cell);
  }

  // ---------- Ходы ----------

  private async trySwap(a: Position, b: Position): Promise<void> {
    const cellA = getCell(this.board, a);
    const cellB = getCell(this.board, b);
    if (cellA == null || cellB == null || cellA.kind === 'hole' || cellB.kind === 'hole') return;

    if (!isValidSwap(this.board, a, b)) {
      // Показываем, что так нельзя: туда и обратно
      this.busy = true;
      await this.view.swap(a, b);
      await this.view.swap(a, b);
      this.busy = false;
      return;
    }
    if (comboNeedsColor(this.board, a, b)) {
      return this.setMode({ type: 'comboColor', from: a, to: b });
    }
    await this.play({ type: 'swap', from: a, to: b });
  }

  /** Проигрывает ход: логика отдаёт шаги, сцена их анимирует и отвечает на выборы */
  private async play(move: Move): Promise<void> {
    this.busy = true;
    this.moves++;
    this.updateMoves();
    this.updateHistoryButtons();
    this.setSelected(null);
    const steps = resolveMove(this.board, move, { colorCount: DEMO_COLOR_COUNT, rng: this.rng });

    let next = steps.next();
    while (!next.done) {
      const step = next.value;
      let answer: ChoiceOption | undefined;
      switch (step.kind) {
        case 'swap':
          await this.view.swap(step.a, step.b);
          break;
        case 'clear':
          this.addScore(step.points);
          await this.view.clear(step.cells);
          break;
        case 'transform':
          await this.view.place(step.placements);
          break;
        case 'drop':
          await this.view.drop(step.falls, step.spawns);
          break;
        case 'choice':
          this.view.setHighlight(step.group.cells);
          answer = await this.dialog.ask(step.group, step.options);
          this.view.setHighlight([]);
          break;
      }
      next = steps.next(answer);
    }

    this.board = next.value.board;
    await this.ensureMoves();
    this.busy = false;
    this.history.push(this.snapshot());
    this.updateHistoryButtons();
  }

  /** Если ходов обычными фишками не осталось — перемешать поле */
  private async ensureMoves(): Promise<void> {
    if (hasTileMove(this.board)) return;
    this.hintText.setText('Ходов нет — перемешиваем поле');
    this.board = shuffleBoard(this.board, DEMO_COLOR_COUNT, this.rng);
    await this.view.shuffle(this.board);
    this.hintText.setText(hintFor(this.mode));
  }

  // ---------- Бонусы ----------

  /** Покупка спецфишки за очки: встаёт на случайную фишку 1 уровня, хода не тратит */
  private async takeBonus(type: BonusType): Promise<void> {
    if (this.busy || this.mode.type !== 'idle') return;
    const scoreAfter = buyBonus(this.score, type);
    if (scoreAfter === null) return;
    const result = placeBonus(this.board, type, this.rng);
    if (!result) return;
    this.busy = true;
    this.score = scoreAfter;
    this.addScore(0);
    this.setSelected(null);
    this.updateHistoryButtons();
    await this.view.place([{ pos: result.pos, cell: result.piece }]);
    this.board = result.board;
    await this.ensureMoves();
    this.busy = false;
    // В игре отменить покупку нельзя, поэтому и тестовая история «назад» до него не идёт
    this.history.reset(this.snapshot());
    this.updateHistoryButtons();
  }

  // ---------- Состояние интерфейса ----------

  private setMode(mode: Mode): void {
    this.mode = mode;
    const marked: Position | null =
      mode.type === 'rainbowColor' || mode.type === 'manipulator'
        ? (mode.type === 'manipulator' && mode.first) || mode.at
        : null;
    this.view.select(marked);
    this.hintText.setText(hintFor(mode));
    this.updateBonusShop();
  }

  private setSelected(pos: Position | null): void {
    this.selected = pos;
    this.view.select(pos);
  }

  private addScore(points: number): void {
    this.score += points;
    this.scoreText.setText(`Очки: ${this.score}`);
    this.updateBonusShop();
  }

  private updateMoves(): void {
    this.movesText.setText(`Ходы: ${this.moves}`);
  }

  private updateBonusShop(): void {
    // Покупка — только в спокойном состоянии: не во время хода и не в режиме выбора клеток
    this.bonusShop.update(this.score, !this.busy && this.mode.type === 'idle');
  }
}

function hintFor(mode: Mode): string {
  switch (mode.type) {
    case 'idle':
      return '';
    case 'rainbowColor':
      return 'Радуга: нажмите на фишку нужного цвета\n(повторный тап по радуге — отмена)';
    case 'comboColor':
      return 'Мега-бомба + радуга: нажмите на фишку,\nцвет которой станет бомбами';
    case 'manipulator':
      return mode.first
        ? 'Манипулятор: выберите вторую клетку'
        : 'Манипулятор: выберите две клетки для обмена\n(повторный тап по нему — отмена)';
  }
}
