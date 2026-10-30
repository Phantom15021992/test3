import Phaser from 'phaser';
import {
  getCell,
  isPiece,
  isTile,
  samePos,
  type Board,
  type Cell,
  type Piece,
  type Position,
} from '../core/board';
import {
  DEMO_BOARD_COLS,
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
import type { Level } from '../core/level';
import { LevelSession } from '../core/levelSession';
import { GameSession, type PlayerMove } from '../core/session';
import { comboNeedsColor, isCombo } from '../core/specials';
import { BonusShop } from '../ui/BonusShop';
import { ChoiceDialog } from '../ui/ChoiceDialog';
import { GameOverDialog } from '../ui/GameOverDialog';
import { LevelResultDialog } from '../ui/LevelResultDialog';
import { sendGameResult } from '../storage/gameResults';
import { saveLevelStars } from '../storage/progress';
import { remoteConfig, type GameTicket } from '../storage/remoteLeaderboard';
import { goalsText, levelMoveLimit } from '../ui/levelText';
import { HIGHLIGHT_COLOR, UI_MUTED_TEXT_COLOR, UI_TEXT_COLOR } from '../view/palette';
import { BoardView } from '../view/BoardView';
import { debugSeed, startGame } from './startGame';

const BOARD_MARGIN = 40;
const LEVEL_GOALS_Y_OFFSET = 130;

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
  /** Уровень; null — свободная игра */
  private level: Level | null = null;
  private goalsText: Phaser.GameObjects.Text | null = null;
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
  init(data: { difficulty?: DifficultyId; ticket?: GameTicket | null; level?: Level }): void {
    this.difficulty = DIFFICULTIES.find((d) => d.id === data.difficulty) ?? DIFFICULTIES[2];
    this.ticket = data.ticket ?? null;
    this.level = data.level ?? null;
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
    const seed = debugSeed() ?? this.ticket?.seed ?? Date.now() >>> 0;
    this.session = this.level
      ? new LevelSession(seed, this.level)
      : new GameSession(seed, this.difficulty.colors);
    if (import.meta.env.DEV) {
      // Доступ к сцене из консоли браузера для ручной проверки
      (window as unknown as { gameScene: GameScene }).gameScene = this;
    }

    // Интерфейс привязан к месту поля 10×10, а поле уровня вписывается в него по центру:
    // так экран не прыгает от уровня к уровню, а меньшие поля получают клетки крупнее
    const boxSize = Math.floor((this.scale.width - BOARD_MARGIN * 2) / DEMO_BOARD_COLS) * 10;
    const boxLeft = (this.scale.width - boxSize) / 2;
    const boxTop = (this.scale.height - boxSize) / 2;
    const boxBottom = boxTop + boxSize;
    const rows = this.session.board.length;
    const cols = this.session.board[0]?.length ?? DEMO_BOARD_COLS;
    const cellSize = Math.floor(boxSize / Math.max(rows, cols, 1));
    const originX = boxLeft + (boxSize - cellSize * cols) / 2;
    const originY = boxTop + (boxSize - cellSize * rows) / 2;
    this.view = new BoardView(this, originX, originY, cellSize);
    this.view.render(this.session.board);
    this.refreshIce();
    this.dialog = new ChoiceDialog(this, boxBottom + 30);

    const centerX = this.scale.width / 2;
    this.add
      .text(centerX, boxTop - 275, this.titleText(), {
        fontFamily: 'sans-serif',
        fontSize: '44px',
        color: UI_TEXT_COLOR,
      })
      .setOrigin(0.5);
    const hudStyle = { fontFamily: 'sans-serif', fontSize: '34px', color: UI_TEXT_COLOR };
    this.scoreText = this.add.text(centerX - 100, boxTop - 205, '', hudStyle).setOrigin(0.5);
    this.movesText = this.add.text(centerX + 115, boxTop - 205, '', hudStyle).setOrigin(0.5);
    this.hintText = this.add
      .text(centerX, boxBottom + 60, this.level?.hint ?? '', {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        color: UI_MUTED_TEXT_COLOR,
        align: 'center',
        wordWrap: { width: boxSize },
      })
      .setOrigin(0.5);
    this.bonusShop = new BonusShop(this, boxLeft, boxLeft + boxSize, boxTop - 115, (type) =>
      this.takeBonus(type),
    );
    this.updateScore();
    this.updateMoves();
    this.goalsText = this.level
      ? this.add
          .text(centerX, boxBottom + LEVEL_GOALS_Y_OFFSET, '', {
            fontFamily: 'sans-serif',
            fontSize: '30px',
            color: `#${HIGHLIGHT_COLOR.toString(16)}`,
            align: 'center',
          })
          .setOrigin(0.5)
      : null;
    this.refreshGoals();
    if (this.level) {
      this.add
        .text(30, boxTop - 275, '← Карта', {
          fontFamily: 'sans-serif',
          fontSize: '30px',
          color: UI_MUTED_TEXT_COLOR,
        })
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (!this.busy) this.scene.start('LevelMap');
        });
    }

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
  }

  private titleText(): string {
    return this.level ? this.level.title : `Три в ряд · ${this.difficulty.name}`;
  }

  private refreshIce(): void {
    if (this.session instanceof LevelSession) this.view.setIce(this.session.ice);
  }

  private refreshGoals(): void {
    if (this.goalsText && this.session instanceof LevelSession) {
      this.goalsText.setText(goalsText(this.session));
    }
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
      if (samePos(mode.at, cell)) {
        // Привычный двойной клик не должен сразу отменять только что включённый выбор
        if (this.isDoubleTap(cell)) return;
        return this.setMode({ type: 'idle' });
      }
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
      if (!isOnField(content)) return;
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
    if (isPiece(content) && content.type === 'rainbow') {
      this.setSelected(null);
      return this.setMode({ type: 'rainbowColor', at: cell });
    }
    // Одиночное нажатие остальные спецфишки только выделяет, чтобы их можно было сдвинуть
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
    if (piece.type === 'manipulator') return this.setMode({ type: 'manipulator', at, first: null });
    void this.play({ type: 'fire', at });
  }

  // ---------- Ходы ----------

  private async trySwap(a: Position, b: Position): Promise<void> {
    const board = this.session.board;
    const cellA = getCell(board, a);
    const cellB = getCell(board, b);
    if (!isOnField(cellA) || !isOnField(cellB)) return;

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
      await (this.session instanceof LevelSession
        ? this.finishLevel(this.session)
        : this.finishGame());
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
          this.refreshIce();
          this.refreshGoals();
          await this.view.clear(step.cells);
          break;
        case 'transform':
          this.refreshGoals();
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

  /** Уровень окончен: цели выполнены или кончились ходы */
  private async finishLevel(session: LevelSession): Promise<void> {
    const { level, stars } = session;
    if (stars > 0) saveLevelStars(level.id, stars);
    new LevelResultDialog(this).show(session, {
      onRetry: () => this.scene.restart({ level }),
      onMap: () => this.scene.start('LevelMap'),
    });
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
    this.movesText.setText(`Ходы: ${levelMoveLimit(this.session, MOVE_LIMIT)}`);
  }

  private updateBonusShop(): void {
    // Покупка — только в спокойном состоянии: не во время хода и не в режиме выбора клеток
    this.bonusShop.update(this.session.score, !this.busy && this.mode.type === 'idle');
  }
}

/** Клетка, с которой можно что-то сделать: дыра и камень в обмене не участвуют */
function isOnField(cell: Cell | undefined): boolean {
  return cell != null && cell.kind !== 'hole' && cell.kind !== 'stone';
}

/** Одиночное нажатие спецфишку только выделяет — подсказываем, что с ней делать */
function pieceHint(piece: Piece): string {
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
