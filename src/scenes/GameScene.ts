import Phaser from 'phaser';
import {
  getCell,
  isPiece,
  isTile,
  samePos,
  type Board,
  type Piece,
  type Position,
} from '../core/board';
import {
  DEMO_BOARD_COLS,
  DEMO_BOARD_ROWS,
  DIFFICULTIES,
  DOUBLE_TAP_MS,
  MOVE_LIMIT,
  SWIPE_THRESHOLD,
  type Difficulty,
  type DifficultyId,
} from '../core/config';
import type { BonusType } from '../core/bonus';
import { areAdjacent, isValidSwap } from '../core/moves';
import type { ChoiceOption, ResolveStep } from '../core/resolve';
import { GameSession, type PlayerMove } from '../core/session';
import { comboNeedsColor, isCombo } from '../core/specials';
import { BonusShop } from '../ui/BonusShop';
import { ChoiceDialog } from '../ui/ChoiceDialog';
import { GameOverDialog } from '../ui/GameOverDialog';
import { sendGameResult } from '../storage/gameResults';
import { remoteConfig, type GameTicket } from '../storage/remoteLeaderboard';
import { UI_MUTED_TEXT_COLOR, UI_TEXT_COLOR } from '../view/palette';
import { BoardView } from '../view/BoardView';
import { debugSeed, startGame } from './startGame';

const BOARD_MARGIN = 40;

/** Режим ввода: обычный, выбор цвета (радуга / мега-бомба + радуга), выбор клеток манипулятором */
type Mode =
  | { type: 'idle' }
  | { type: 'rainbowColor'; at: Position }
  | { type: 'comboColor'; from: Position; to: Position }
  | { type: 'manipulator'; at: Position; first: Position | null };

export class GameScene extends Phaser.Scene {
  private session!: GameSession;
  private difficulty!: Difficulty;
  /** Билет сервера на партию; null — без связи, результат останется только на устройстве */
  private ticket: GameTicket | null = null;
  private view!: BoardView;
  private dialog!: ChoiceDialog;
  private scoreText!: Phaser.GameObjects.Text;
  private movesText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  // Для анонимной статистики партии (game_results): длительность считаем от первого хода
  private startedAt = 0;
  private bonusShop!: BonusShop;
  private mode: Mode = { type: 'idle' };
  private selected: Position | null = null;
  private pressed: { cell: Position; x: number; y: number } | null = null;
  private lastTap: { cell: Position; at: number } | null = null;
  private busy = false;

  constructor() {
    super('Game');
  }

  /** Сложность и билет на партию приходят из startGame; при «Играть снова» сложность та же */
  init(data: { difficulty?: DifficultyId; ticket?: GameTicket | null }): void {
    this.difficulty = DIFFICULTIES.find((d) => d.id === data.difficulty) ?? DIFFICULTIES[2];
    this.ticket = data.ticket ?? null;
  }

  create(): void {
    // При «Играть снова» сцена перезапускается, а поля класса сами не сбрасываются
    this.startedAt = 0;
    this.mode = { type: 'idle' };
    this.selected = null;
    this.pressed = null;
    this.lastTap = null;
    this.busy = false;
    // Seed выдаёт сервер, чтобы партию можно было проверить. ?seed=123 — одинаковое поле при
    // каждом запуске (для отладки; в общую таблицу такая партия не попадает, см. startGame)
    this.session = new GameSession(
      debugSeed() ?? this.ticket?.seed ?? Date.now() >>> 0,
      this.difficulty.colors,
    );
    if (import.meta.env.DEV) {
      // Доступ к сцене из консоли браузера для ручной проверки
      (window as unknown as { gameScene: GameScene }).gameScene = this;
    }

    const cellSize = Math.floor((this.scale.width - BOARD_MARGIN * 2) / DEMO_BOARD_COLS);
    const originX = (this.scale.width - cellSize * DEMO_BOARD_COLS) / 2;
    const originY = (this.scale.height - cellSize * DEMO_BOARD_ROWS) / 2;
    const boardBottom = originY + cellSize * DEMO_BOARD_ROWS;
    this.view = new BoardView(this, originX, originY, cellSize);
    this.view.render(this.session.board);
    this.dialog = new ChoiceDialog(this, boardBottom + 30);

    const centerX = this.scale.width / 2;
    this.add
      .text(centerX, originY - 275, `Три в ряд · ${this.difficulty.name}`, {
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
    this.updateScore();
    this.updateMoves();

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
  }

  /** Только для отладки: подменить поле */
  debugSetBoard(board: Board): void {
    this.session.board = board;
    this.view.render(board);
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
    const board = this.session.board;
    const content = getCell(board, cell);
    const mode = this.mode;

    if (mode.type === 'rainbowColor') {
      if (samePos(mode.at, cell)) return this.setMode({ type: 'idle' });
      // Радугу можно и совместить с соседней спецфишкой
      if (areAdjacent(mode.at, cell) && isCombo(board, mode.at, cell)) {
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
    const doubleTap = this.isDoubleTap(cell);
    if (selected && areAdjacent(selected, cell)) {
      this.setSelected(null);
      return void this.trySwap(selected, cell);
    }
    // Одиночное нажатие спецфишку только выделяет, чтобы её можно было сдвинуть на соседнюю клетку
    if (doubleTap && isPiece(content)) {
      this.setSelected(null);
      return this.activatePiece(cell, content);
    }
    if (selected && samePos(selected, cell)) return this.setSelected(null);
    if (isPiece(content) || isTile(content)) this.setSelected(cell);
  }

  private isDoubleTap(cell: Position): boolean {
    const now = Date.now();
    const last = this.lastTap;
    this.lastTap = { cell, at: now };
    return last !== null && samePos(last.cell, cell) && now - last.at <= DOUBLE_TAP_MS;
  }

  /** Двойной клик: взрывные спецфишки срабатывают на месте, остальным нужен выбор игрока */
  private activatePiece(at: Position, piece: Piece): void {
    if (piece.type === 'rainbow') return this.setMode({ type: 'rainbowColor', at });
    if (piece.type === 'manipulator') return this.setMode({ type: 'manipulator', at, first: null });
    void this.play({ type: 'fire', at });
  }

  // ---------- Ходы ----------

  private async trySwap(a: Position, b: Position): Promise<void> {
    const board = this.session.board;
    const cellA = getCell(board, a);
    const cellB = getCell(board, b);
    if (cellA == null || cellB == null || cellA.kind === 'hole' || cellB.kind === 'hole') return;

    if (!isValidSwap(board, a, b)) {
      // Показываем, что так нельзя: туда и обратно
      this.busy = true;
      await this.view.swap(a, b);
      await this.view.swap(a, b);
      this.busy = false;
      return;
    }
    if (comboNeedsColor(board, a, b)) {
      return this.setMode({ type: 'comboColor', from: a, to: b });
    }
    await this.play({ type: 'swap', from: a, to: b });
  }

  /** Проигрывает ход: логика отдаёт шаги, сцена их анимирует и отвечает на выборы */
  private async play(move: PlayerMove): Promise<void> {
    this.busy = true;
    if (this.session.moves === 0) this.startedAt = Date.now();
    const steps = this.session.play(move);
    this.updateMoves();
    this.updateBonusShop();
    this.setSelected(null);
    await this.animate(steps);
    await this.ensureMoves();
    if (this.session.isOver) {
      await this.finishGame();
      return;
    }
    this.busy = false;
    this.updateBonusShop();
  }

  /** Сцена анимирует шаги партии и отвечает на выборы */
  private async animate(
    steps: Generator<ResolveStep, void, ChoiceOption | undefined>,
  ): Promise<void> {
    let next = steps.next();
    while (!next.done) {
      const step = next.value;
      let answer: ChoiceOption | undefined;
      switch (step.kind) {
        case 'swap':
          await this.view.swap(step.a, step.b);
          break;
        case 'clear':
          this.updateScore();
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
  }

  /**
   * Ходы кончились: все спецфишки срабатывают на месте, пока на поле не останется ни одной
   * (в каскадах могут появиться новые), затем — окно с таблицей лидеров.
   */
  private async finishGame(): Promise<void> {
    const { session } = this;
    this.hintText.setText('Ходы закончились — спецфишки срабатывают!');
    const scoreBeforeFinale = session.score;
    await this.animate(session.finale());
    this.hintText.setText('');
    this.sendResult(session.score - scoreBeforeFinale);
    new GameOverDialog(this).show(
      session.score,
      this.difficulty,
      {
        onRestart: () => void startGame(this, this.difficulty.id),
        onMenu: () => this.scene.start('Menu'),
      },
      this.ticket && { ticketId: this.ticket.id, actions: session.actions },
    );
  }

  /** Анонимная запись доигранной партии для анализа — сразу, ещё до ввода имени */
  private sendResult(finalePoints: number): void {
    const config = remoteConfig();
    if (!config) return;
    const { session } = this;
    void sendGameResult(config, {
      difficulty: this.difficulty.id,
      score: session.score,
      movesMade: session.moves,
      durationSec: Math.round((Date.now() - this.startedAt) / 1000),
      finalePoints,
      shuffles: session.shuffles,
      stats: session.stats,
      device: window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'desktop',
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      version: (import.meta.env.VITE_GAME_VERSION ?? 'dev').slice(0, 7),
    });
  }

  /** Если ходов обычными фишками не осталось — перемешать поле */
  private async ensureMoves(): Promise<void> {
    if (!this.session.shuffleIfStuck()) return;
    this.hintText.setText('Ходов нет — перемешиваем поле');
    await this.view.shuffle(this.session.board);
    this.hintText.setText(hintFor(this.mode));
  }

  // ---------- Бонусы ----------

  /** Покупка спецфишки за очки: встаёт на случайную фишку 1 уровня, хода не тратит */
  private async takeBonus(type: BonusType): Promise<void> {
    if (this.busy || this.mode.type !== 'idle') return;
    const placed = this.session.buy(type);
    if (!placed) return;
    this.busy = true;
    this.updateScore();
    this.setSelected(null);
    this.updateBonusShop();
    await this.view.place([{ pos: placed.pos, cell: placed.piece }]);
    await this.ensureMoves();
    this.busy = false;
    this.updateBonusShop();
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
    const cell = pos && getCell(this.session.board, pos);
    this.hintText.setText(isPiece(cell) ? pieceHint(cell) : hintFor(this.mode));
  }

  private updateScore(): void {
    this.scoreText.setText(`Очки: ${this.session.score}`);
    this.updateBonusShop();
  }

  private updateMoves(): void {
    this.movesText.setText(`Ходы: ${MOVE_LIMIT - this.session.moves}`);
  }

  private updateBonusShop(): void {
    // Покупка — только в спокойном состоянии: не во время хода и не в режиме выбора клеток
    this.bonusShop.update(this.session.score, !this.busy && this.mode.type === 'idle');
  }
}

/** Одиночное нажатие спецфишку только выделяет — подсказываем, что с ней делать */
function pieceHint(piece: Piece): string {
  if (piece.type === 'rainbow') return 'Радуга: двойной клик — выбрать цвет';
  if (piece.type === 'manipulator') return 'Манипулятор: двойной клик — выбрать две клетки';
  return 'Двойной клик — сработает на месте,\nсдвиг — на соседней клетке';
}

function hintFor(mode: Mode): string {
  switch (mode.type) {
    case 'idle':
      return '';
    case 'rainbowColor':
      return 'Радуга: нажмите на фишку нужного цвета\n(нажатие на радугу — отмена)';
    case 'comboColor':
      return 'Мега-бомба + радуга: нажмите на фишку,\nцвет которой станет бомбами';
    case 'manipulator':
      return mode.first
        ? 'Манипулятор: выберите вторую клетку'
        : 'Манипулятор: выберите две клетки для обмена\n(нажатие на него — отмена)';
  }
}
