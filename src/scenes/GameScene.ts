import Phaser from 'phaser';
import {
  getCell,
  isChained,
  isFixed,
  isPiece,
  isTile,
  samePos,
  type Board,
  type Cell,
  type Position,
} from '../core/board';
import {
  DEMO_BOARD_COLS,
  DIFFICULTIES,
  DOUBLE_TAP_MS,
  HINT_DELAY_MS,
  MOVE_LIMIT,
  SWIPE_THRESHOLD,
  type Difficulty,
  type DifficultyId,
} from '../core/config';
import type { BonusType } from '../core/bonus';
import { strongestMove, type HintKind } from '../core/hint';
import { areAdjacent, isValidSwap } from '../core/moves';
import type { ChoiceOption, ResolveStep } from '../core/resolve';
import { floorOf, type Level } from '../core/level';
import { LevelSession } from '../core/levelSession';
import { GameSession, type PlayerMove } from '../core/session';
import { comboNeedsColor, isCombo } from '../core/specials';
import { BonusShop } from '../ui/BonusShop';
import { ChoiceDialog } from '../ui/ChoiceDialog';
import { GameOverDialog } from '../ui/GameOverDialog';
import { LevelResultDialog } from '../ui/LevelResultDialog';
import { sendGameResult } from '../storage/gameResults';
import { sendLevelResult, type LevelOutcome } from '../storage/levelResults';
import { floorWallet, saveLevelSpending, saveLevelStars } from '../storage/progress';
import { remoteConfig, type GameTicket } from '../storage/remoteLeaderboard';
import { goalsText, levelBriefing, levelMoveLimit, levelTitle } from '../ui/levelText';
import { HIGHLIGHT_COLOR, UI_MUTED_TEXT_COLOR, UI_TEXT_COLOR } from '../view/palette';
import { BoardView } from '../view/BoardView';
import { debugSeed, startGame } from './startGame';

const BOARD_MARGIN = 40;
const LEVEL_GOALS_Y_OFFSET = 112;
const LEVEL_BRIEFING_Y_OFFSET = 142;

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
  private walletText: Phaser.GameObjects.Text | null = null;
  private hintText!: Phaser.GameObjects.Text;
  // Для анонимной статистики партии (game_results): длительность считаем от первого хода
  private startedAt = 0;
  private bonusShop!: BonusShop;
  private mode: Mode = { type: 'idle' };
  private selected: Position | null = null;
  private pressed: { cell: Position; x: number; y: number } | null = null;
  private lastTap: { cell: Position; at: number } | null = null;
  private busy = false;
  /** Когда игрок действовал в последний раз: от этого момента считается пауза до подсказки */
  private lastActionAt = 0;
  private hintShown = false;

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
    this.lastActionAt = this.game.loop.time;
    this.hintShown = false;
    // Seed выдаёт сервер, чтобы партию можно было проверить. ?seed=123 — одинаковое поле при
    // каждом запуске (для отладки; в общую таблицу такая партия не попадает, см. startGame)
    const seed = debugSeed() ?? this.ticket?.seed ?? Date.now() >>> 0;
    this.session = this.level
      ? new LevelSession(seed, this.level, floorWallet(floorOf(this.level.id)))
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
        // У уровня заголовок длиннее, а слева от него ещё кнопка карты
        fontSize: this.level ? '36px' : '44px',
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
    this.bonusShop = new BonusShop(
      this,
      boxLeft,
      boxLeft + boxSize,
      boxTop - 115,
      (type) => this.takeBonus(type),
      this.level !== null,
    );
    this.walletText = this.level
      ? this.add
          .text(this.scale.width - 30, boxTop - 205, '', {
            ...hudStyle,
            color: `#${HIGHLIGHT_COLOR.toString(16)}`,
          })
          .setOrigin(1, 0.5)
      : null;
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
        .text(centerX, boxBottom + LEVEL_BRIEFING_Y_OFFSET, levelBriefing(this.level), {
          fontFamily: 'sans-serif',
          fontSize: '24px',
          color: UI_MUTED_TEXT_COLOR,
          lineSpacing: 5,
          wordWrap: { width: boxSize },
        })
        .setOrigin(0.5, 0);
      this.add
        .text(30, boxTop - 275, '← Карта', {
          fontFamily: 'sans-serif',
          fontSize: '30px',
          color: UI_MUTED_TEXT_COLOR,
        })
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (this.busy) return;
          if (this.session.moves > 0) this.sendLevelAttempt('left');
          this.scene.start('LevelMap', this.mapData());
        });
    }

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
  }

  update(time: number): void {
    // Пока идёт ход, пауза не считается: думать игрок начинает, когда поле успокоилось
    if (this.busy) this.lastActionAt = time;
    if (this.busy || this.hintShown || this.mode.type !== 'idle') return;
    if (time - this.lastActionAt < HINT_DELAY_MS) return;
    this.hintShown = true;
    const hint = strongestMove(this.session);
    if (!hint) return;
    this.view.showHint(hint.cells);
    this.hintText.setText(HINT_TEXTS[hint.kind]);
  }

  /** Любое действие игрока убирает подсказку и начинает отсчёт заново */
  private resetHint(): void {
    this.lastActionAt = this.game.loop.time;
    if (!this.hintShown) return;
    this.hintShown = false;
    this.view.hideHint();
    this.hintText.setText(hintFor(this.mode));
  }

  private titleText(): string {
    return this.level ? levelTitle(this.level) : `Три в ряд · ${this.difficulty.name}`;
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
    this.resetHint();
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
      if (samePos(mode.at, cell)) {
        // Привычный двойной клик не должен сразу отменять только что включённый выбор
        if (this.isDoubleTap(cell)) return;
        return this.setMode({ type: 'idle' });
      }
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
    if (isPiece(content) && content.type === 'manipulator') {
      this.setSelected(null);
      return this.setMode({ type: 'manipulator', at: cell, first: null });
    }
    // Одиночное нажатие взрывные спецфишки только выделяет, чтобы их можно было сдвинуть
    if (doubleTap && isPiece(content)) {
      this.setSelected(null);
      return void this.play({ type: 'fire', at: cell });
    }
    if (selected && samePos(selected, cell)) return this.setSelected(null);
    if (isOnField(content)) this.setSelected(cell);
  }

  private isDoubleTap(cell: Position): boolean {
    const now = Date.now();
    const last = this.lastTap;
    this.lastTap = { cell, at: now };
    return last !== null && samePos(last.cell, cell) && now - last.at <= DOUBLE_TAP_MS;
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
          this.view.loosen(step.links ?? []);
          this.view.showCombos(step.combos ?? []);
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
    this.sendLevelAttempt(stars > 0 ? 'won' : 'lost');
    if (stars > 0) {
      saveLevelStars(level.id, stars);
      saveLevelSpending(level.id, session.starsSpent);
    }
    new LevelResultDialog(this).show(session, {
      onRetry: () => this.scene.restart({ level }),
      onMap: () => this.scene.start('LevelMap', this.mapData()),
    });
  }

  private mapData(): { floor?: number } {
    return this.level ? { floor: floorOf(this.level.id) } : {};
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
      durationSec: this.playedSeconds(),
      finalePoints,
      shuffles: session.shuffles,
      stats: session.stats,
      ...clientInfo(),
    });
  }

  /** Анонимная запись попытки уровня: настоящая сложность видна только по живым игрокам */
  private sendLevelAttempt(outcome: LevelOutcome): void {
    const config = remoteConfig();
    const { session } = this;
    if (!config || !(session instanceof LevelSession)) return;
    void sendLevelResult(config, {
      levelId: session.level.id,
      outcome,
      stars: session.stars,
      movesMade: session.moves,
      movesLeft: Math.max(0, session.movesLeft),
      goalsPercent: session.goalsPercent,
      shuffles: session.shuffles,
      durationSec: this.playedSeconds(),
      starsSpent: session.starsSpent,
      stats: session.stats,
      ...clientInfo(),
    });
  }

  private playedSeconds(): number {
    return this.startedAt === 0 ? 0 : Math.round((Date.now() - this.startedAt) / 1000);
  }

  /** Если ходов обычными фишками не осталось — перемешать поле */
  private async ensureMoves(): Promise<void> {
    if (!this.session.shuffleIfStuck()) return;
    this.hintText.setText('Ходов нет — перемешиваем поле');
    await this.view.shuffle(this.session.board);
    this.hintText.setText(hintFor(this.mode));
  }

  // ---------- Бонусы ----------

  /** Покупка спецфишки: встаёт на случайную фишку 1 уровня, хода не тратит */
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
    this.hintText.setText(isPiece(cell) ? PIECE_HINT : hintFor(this.mode));
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
    const { session } = this;
    const budget = session instanceof LevelSession ? session.starsLeft : session.score;
    this.bonusShop.update(budget, !this.busy && this.mode.type === 'idle');
    this.walletText?.setText(`★ ${budget}`);
  }
}

function clientInfo() {
  return {
    device: window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'desktop',
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    version: (import.meta.env.VITE_GAME_VERSION ?? 'dev').slice(0, 7),
  } as const;
}

/** Клетка, которую можно сдвинуть: остальные в обмене не участвуют */
function isOnField(cell: Cell | undefined): boolean {
  return cell != null && cell.kind !== 'stone' && !isFixed(cell) && !isChained(cell);
}

const HINT_TEXTS: Readonly<Record<HintKind, string>> = {
  swap: 'Подсказка: поменяйте отмеченные клетки',
  fire: 'Подсказка: двойной клик по спецфишке',
  rainbow: 'Подсказка: нажмите на радугу, затем на отмеченную фишку',
};

/** Одиночное нажатие взрывную спецфишку только выделяет — подсказываем, что с ней делать */
const PIECE_HINT = 'Двойной клик — сработает на месте,\nсдвиг — на соседней клетке';

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
