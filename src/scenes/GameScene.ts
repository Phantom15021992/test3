import Phaser from 'phaser';
import {
  allPositions,
  getCell,
  hasPieces,
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
import { isBonusTarget, type AimedBonus, type BonusType } from '../core/bonus';
import { strongestMove, type HintKind } from '../core/hint';
import { areAdjacent, isValidSwap } from '../core/moves';
import type { ChoiceOption, Move, ResolveStep } from '../core/resolve';
import { floorOf, type Level } from '../core/level';
import { LevelSession } from '../core/levelSession';
import {
  locate,
  manipulatorPick,
  rainbowPick,
  swapFigure,
  TUTORIALS,
  tutorialLevel,
  tutorialSession,
  type Tutorial,
  type TutorialStep,
} from '../core/tutorial';
import { GameSession, type PlayerMove } from '../core/session';
import { comboNeedsColor, isCombo } from '../core/specials';
import { BonusShop } from '../ui/BonusShop';
import { ChoiceDialog } from '../ui/ChoiceDialog';
import { GameOverDialog } from '../ui/GameOverDialog';
import { LevelResultDialog } from '../ui/LevelResultDialog';
import { sendGameResult } from '../storage/gameResults';
import { sendLevelMoves } from '../storage/levelMoves';
import { sendLevelResult, type LevelOutcome } from '../storage/levelResults';
import {
  attemptWallet,
  markTutorialDone,
  saveLevelSpending,
  saveLevelStars,
} from '../storage/progress';
import { LEVELS } from '../levels';
import { showTutorialDone } from '../ui/TutorialDoneDialog';
import { remoteConfig, type GameTicket } from '../storage/remoteLeaderboard';
import {
  GOALS_SEPARATOR,
  goalItems,
  briefingLines,
  levelMoveLimit,
  levelTitle,
} from '../ui/levelText';
import { HIGHLIGHT_COLOR, UI_MUTED_TEXT_COLOR, UI_TEXT_COLOR } from '../view/palette';
import { BoardView } from '../view/BoardView';
import { CRYSTAL_FILES, createCrystalTextures } from '../view/crystalArt';
import { debugSeed, startGame } from './startGame';
import { playCues, playSound, playStars } from '../audio/gameSounds';
import { StepSoundTracker, type ProgressView } from '../audio/stepSounds';
import { addSoundToggle } from '../ui/soundToggle';

const BOARD_MARGIN = 40;
/** Верх строки целей под полем и зазор до описания звёзд под ней */
const LEVEL_GOALS_Y_OFFSET = 94;
const LEVEL_BRIEFING_GAP = 12;
/** Шрифт строки целей и самый мелкий, до которого он уменьшается, если цели не помещаются в ширину */
const GOALS_FONT_SIZE = 30;
const GOALS_MIN_FONT_SIZE = 18;

/** Промежуток между колонкой звёзд и надписями условий */
const BRIEFING_COLUMN_GAP = 10;

/** Обучение: пауза после последнего хода, чтобы игрок успел разглядеть собранную фишку до окна итога */
const TUTORIAL_RESULT_DELAY_MS = 2000;

/** Сколько ходов должно остаться, чтобы прозвучало предупреждение о последних ходах */
const LAST_MOVES_WARNING = 5;

/** Режим ввода: обычный, выбор цвета (радуга / мега-бомба + радуга), выбор клеток манипулятором */
type Mode =
  | { type: 'idle' }
  | { type: 'rainbowColor'; at: Position }
  | { type: 'comboColor'; from: Position; to: Position }
  | { type: 'manipulator'; at: Position; first: Position | null }
  // Покупки кампании: звёзды списываются, только когда игрок выбрал цель
  | { type: 'aim'; bonus: AimedBonus }
  | { type: 'boughtRainbow' }
  | { type: 'boughtManipulator'; first: Position | null };

export class GameScene extends Phaser.Scene {
  private session!: GameSession;
  private difficulty!: Difficulty;
  /** Билет сервера на партию; null — без связи, результат останется только на устройстве */
  private ticket: GameTicket | null = null;
  /** Уровень; null — свободная игра */
  private level: Level | null = null;
  /** Seed и звёзды на начало попытки: с журналом они проигрывают попытку заново (level_moves) */
  private seed = 0;
  private wallet = 0;
  /** Тестовый уровень с экрана правил: правила Лёгкого, фишки — кристаллы */
  private gems = false;
  /** Обучающий уровень: поле подготовлено, подсказка видна сразу, сделать можно только её ход */
  private tutorial: Tutorial | null = null;
  /** Номер шага обучения: рассказ без хода тоже шаг, поэтому не равен числу ходов */
  private stepIndex = 0;
  /** Клетки, которые подсказка даёт поменять манипулятором (выбраны в начале его шага) */
  private manipulatorCells: { a: Position; b: Position } | null = null;
  private goalsText: Phaser.GameObjects.Text | null = null;
  /** Ширина, в которую должна поместиться строка целей */
  private goalsWidth = 0;
  private briefingText: Phaser.GameObjects.Text | null = null;
  /** Звёзды условий — отдельной колонкой по правому краю, чтобы надписи после них начинались с одной линии */
  private briefingStars: Phaser.GameObjects.Text | null = null;
  private briefingCenterX = 0;
  private briefingWidth = 0;
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
  init(data: {
    difficulty?: DifficultyId;
    ticket?: GameTicket | null;
    level?: Level;
    gems?: boolean;
    tutorial?: Tutorial;
  }): void {
    this.gems = data.gems ?? false;
    this.tutorial = data.tutorial ?? null;
    // Тестовый уровень — по правилам Лёгкого (4 цвета: синий, жёлтый, красный, зелёный), без билета: в общую таблицу и статистику не идёт
    this.difficulty = this.gems
      ? DIFFICULTIES[1]!
      : (DIFFICULTIES.find((d) => d.id === data.difficulty) ?? DIFFICULTIES[2]);
    this.ticket = this.gems ? null : (data.ticket ?? null);
    this.level = this.gems
      ? null
      : this.tutorial
        ? tutorialLevel(this.tutorial)
        : (data.level ?? null);
  }

  /** Фишки-кристаллы — в кампании и на тестовом уровне; свободная игра по-прежнему с кружками */
  private get crystals(): boolean {
    return this.gems || this.level !== null;
  }

  /** Лист кристаллов грузится только там, где они нужны */
  preload(): void {
    if (!this.crystals) return;
    for (const { key, path } of CRYSTAL_FILES) {
      if (!this.textures.exists(key)) this.load.image(key, path);
    }
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
    this.stepIndex = 0;
    this.manipulatorCells = null;
    // Seed выдаёт сервер, чтобы партию можно было проверить. ?seed=123 — одинаковое поле при
    // каждом запуске (для отладки; в общую таблицу такая партия не попадает, см. startGame)
    const seed = debugSeed() ?? this.ticket?.seed ?? Date.now() >>> 0;
    this.seed = seed;
    this.wallet = this.level && !this.tutorial ? attemptWallet(this.level.id) : 0;
    this.session = this.tutorial
      ? tutorialSession(this.tutorial)
      : this.level
        ? new LevelSession(seed, this.level, this.wallet)
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
    this.view.gems = this.crystals;
    // Лист кристаллов режется на фишки до первой отрисовки поля
    if (this.crystals) createCrystalTextures(this);
    if (this.level?.coalLayers) this.view.coalLayers = this.level.coalLayers;
    this.view.render(this.session.board);
    this.refreshIce();
    this.dialog = new ChoiceDialog(this, boxBottom + 30);

    const centerX = this.scale.width / 2;
    this.add
      .text(centerX, boxTop - 275, this.titleText(), {
        fontFamily: 'sans-serif',
        // У уровня заголовок длиннее, а слева от него ещё кнопка карты (у тестового — правил)
        fontSize: this.level || this.gems ? '36px' : '44px',
        color: UI_TEXT_COLOR,
      })
      .setOrigin(0.5);
    // Справа от заголовка — выключатель звука
    addSoundToggle(this, this.scale.width - 30, boxTop - 275);
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
    if (this.session instanceof LevelSession && !this.session.shopOpen) this.bonusShop.hide();
    this.walletText =
      this.level && !this.tutorial
        ? this.add
            .text(this.scale.width - 30, boxTop - 205, '', {
              ...hudStyle,
              color: `#${HIGHLIGHT_COLOR.toString(16)}`,
            })
            .setOrigin(1, 0.5)
        : null;
    this.updateScore();
    this.updateMoves();
    this.goalsText =
      this.level && !this.tutorial
        ? this.add
            .text(centerX, boxBottom + LEVEL_GOALS_Y_OFFSET, '', {
              fontFamily: 'sans-serif',
              fontSize: `${GOALS_FONT_SIZE}px`,
              color: `#${HIGHLIGHT_COLOR.toString(16)}`,
              align: 'center',
            })
            .setOrigin(0.5, 0)
        : null;
    this.goalsWidth = Math.min(boxSize, this.scale.width - 2 * BOARD_MARGIN);
    if (this.level) {
      const style = {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: UI_MUTED_TEXT_COLOR,
        lineSpacing: 5,
      };
      const y = boxBottom + LEVEL_GOALS_Y_OFFSET;
      this.briefingCenterX = centerX;
      this.briefingWidth = boxSize;
      if (!this.tutorial) {
        this.briefingStars = this.add.text(0, y, '', { ...style, align: 'right' });
        this.briefingText = this.add.text(0, y, '', style);
        this.setBriefing(this.level);
        this.refreshGoals();
      }
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
          const { session } = this;
          // Цели выполнены — победа уже засчитана, даже если игрок не стал добирать звёзды
          if (session instanceof LevelSession && session.goalsDone) this.saveLevelResult(session);
          else if (session.moves > 0) this.sendLevelAttempt('left');
          this.scene.start('LevelMap', this.mapData());
        });
    }
    if (this.gems) {
      // Тестовый уровень открыт с экрана правил — туда и возвращает
      this.add
        .text(30, boxTop - 275, '← Правила', {
          fontFamily: 'sans-serif',
          fontSize: '30px',
          color: UI_MUTED_TEXT_COLOR,
        })
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (!this.busy) this.scene.start('Rules');
        });
    }

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.showTutorialStep();
  }

  // ---------- Обучение ----------

  /** Шаг обучения, который ждёт игрока; null — шаги кончились (игрок продолжает сам) или это не обучение */
  private get tutorialStep(): TutorialStep | null {
    return this.tutorial?.steps[this.stepIndex] ?? null;
  }

  /**
   * Что сейчас подсказывает шаг: какие клетки можно нажать, какие подсветить и что написать. У радуги
   * и манипулятора по нескольку нажатий: сначала сама спецфишка, потом фишки, которые она возьмёт
   */
  private tutorialFocus(): { allowed: Position[]; shown: Position[]; text: string } | null {
    const step = this.tutorialStep;
    if (!step || step.kind === 'info') return null;
    const { board } = this.session;
    const mode = this.mode;
    switch (step.kind) {
      case 'swap': {
        const from = locate(board, step.from);
        const to = locate(board, step.to);
        if (!from || !to) return null;
        return { allowed: [from, to], shown: swapFigure(board, from, to), text: step.text };
      }
      case 'fire': {
        const at = locate(board, step.at);
        return at ? { allowed: [at], shown: [at], text: step.text } : null;
      }
      case 'rainbow': {
        const at = locate(board, step.at);
        const pick = rainbowPick(board);
        if (!at || !pick) return null;
        return mode.type === 'rainbowColor'
          ? { allowed: [pick.at], shown: [at, pick.at], text: step.pickText }
          : { allowed: [at], shown: [at], text: step.text };
      }
      case 'manipulator': {
        const at = locate(board, step.at);
        const pick = this.manipulatorCells;
        if (!at || !pick) return null;
        if (mode.type !== 'manipulator') return { allowed: [at], shown: [at], text: step.text };
        return mode.first
          ? { allowed: [pick.b], shown: [pick.a, pick.b], text: step.secondText }
          : { allowed: [pick.a], shown: [pick.a], text: step.firstText };
      }
    }
  }

  /** Подсвечивает клетки шага и затемняет остальное поле, внизу — что сделать */
  private showTutorialStep(): void {
    const { tutorial } = this;
    if (!tutorial) return;
    const step = this.tutorialStep;
    if (step?.kind === 'info') return this.showTutorialInfo(step.title, step.text);
    if (!step) {
      // Подсказки кончились: игрок играет сам, обычная подсказка — по паузе
      this.view.setBlocked([]);
      this.hintText.setText(this.tutorialFreeText());
      return;
    }
    // Клетки манипулятора выбираются один раз на шаг: перебор пар не быстрый, а поле до хода не меняется
    if (step.kind === 'manipulator' && this.mode.type !== 'manipulator') {
      this.manipulatorCells = manipulatorPick(this.session.board);
    }
    const focus = this.tutorialFocus();
    if (!focus) return;
    this.view.showHint(focus.shown);
    this.view.setBlocked(this.tutorialBlocked());
    this.hintText.setText(focus.text);
  }

  private tutorialFreeText(): string {
    const { tutorial, session } = this;
    if (!tutorial?.goal || !(session instanceof LevelSession)) return tutorial?.freeText ?? '';
    const { goal } = tutorial;
    return `${tutorial.freeText ?? ''}: ${session.goalValue(goal)}/${goal.count}`;
  }

  /** Рассказ без хода: окно с кнопкой «Дальше»; поле в это время не нажимается */
  private showTutorialInfo(title: string, text: string): void {
    this.busy = true;
    this.view.setBlocked(this.tutorialBlocked());
    this.hintText.setText('');
    const objects = showTutorialDone(
      this,
      text,
      [
        [
          'Дальше',
          () => {
            objects.forEach((object) => object.destroy());
            this.busy = false;
            this.stepIndex++;
            this.showTutorialStep();
          },
        ],
      ],
      title,
    );
  }

  /** Затемнено всё, кроме подсвеченного; пока идёт рассказ — всё поле */
  private tutorialBlocked(): Position[] {
    if (!this.tutorial || !this.tutorialStep) return [];
    const shown = this.tutorialFocus()?.shown ?? [];
    const { board } = this.session;
    return allPositions(board).filter(
      (pos) => getCell(board, pos)?.kind !== 'hole' && !shown.some((cell) => samePos(cell, pos)),
    );
  }

  /** В обучении нажимать можно только подсказанные клетки; когда подсказки кончились — любые */
  private tutorialAllows(cell: Position): boolean {
    if (!this.tutorial || !this.tutorialStep) return true;
    return this.tutorialFocus()?.allowed.some((pos) => samePos(pos, cell)) ?? false;
  }

  /** Обучение пройдено: окно с итогом, дальше — следующее обучение или первый уровень */
  private finishTutorial(tutorial: Tutorial): void {
    const won = !(this.session instanceof LevelSession) || this.session.goalsDone;
    if (won) markTutorialDone(tutorial.index);
    this.view.hideHint();
    this.view.setBlocked([]);
    this.hintText.setText('');
    const next = TUTORIALS.find((t) => t.index === tutorial.index + 1);
    const first = LEVELS[0];
    // Окно — не сразу: собранная фишка должна успеть попасться на глаза (поле пока не нажимается)
    this.time.delayedCall(TUTORIAL_RESULT_DELAY_MS, () => {
      if (!won) {
        playSound('lose');
        showTutorialDone(
          this,
          'Ходы закончились. Попробуй ещё раз — подсказки покажут фигуры снова',
          [
            ['Ещё раз', () => this.scene.restart({ tutorial })],
            ['Карта уровней', () => this.scene.start('LevelMap', { floor: 1 })],
          ],
          'Почти получилось',
        );
        return;
      }
      playStars(1, (delay, fn) => this.time.delayedCall(delay, fn));
      showTutorialDone(this, tutorial.done, [
        next
          ? ['Дальше', () => this.scene.restart({ tutorial: next })]
          : ['Играть 1-1', () => this.scene.restart(first ? { level: first } : {})],
        ['Карта уровней', () => this.scene.start('LevelMap', { floor: 1 })],
      ]);
    });
  }

  update(time: number): void {
    // Пока идёт ход, пауза не считается: думать игрок начинает, когда поле успокоилось
    if (this.busy) this.lastActionAt = time;
    // В обучении своя подсказка видна всё время; обычная — только когда игрок продолжает сам
    if (this.tutorialStep || this.busy || this.hintShown || this.mode.type !== 'idle') return;
    if (time - this.lastActionAt < HINT_DELAY_MS) return;
    this.hintShown = true;
    const hint = strongestMove(this.session);
    if (!hint) return;
    this.view.showHint(hint.cells);
    playSound('hint');
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
    if (this.gems) return 'Тестовый уровень';
    if (this.tutorial) return this.tutorial.title;
    return this.level ? levelTitle(this.level) : `Три в ряд · ${this.difficulty.name}`;
  }

  private refreshIce(): void {
    if (this.session instanceof LevelSession) {
      const { ice, iceStyle, level } = this.session;
      this.view.setIce(ice, iceStyle, level.iceCracks === true);
    }
  }

  private refreshGoals(): void {
    if (!(this.session instanceof LevelSession)) return;
    this.layoutGoals(goalItems(this.session));
    this.setBriefing(this.session.level, this.session);
  }

  /**
   * Условия звёзд — две колонки: звёзды слева, надписи справа с одной линии. Перенесённое условие
   * занимает несколько строк, поэтому в колонку звёзд под ним встают пустые строки; блок — по центру
   */
  private setBriefing(level: Level, session?: LevelSession): void {
    const stars = this.briefingStars;
    const text = this.briefingText;
    if (!stars || !text) return;
    const lines = briefingLines(level, session);
    stars.setText(lines.map((line) => line.stars).join('\n'));
    text.setWordWrapWidth(this.briefingWidth - stars.width - BRIEFING_COLUMN_GAP);
    const starRows: string[] = [];
    const textRows: string[] = [];
    for (const line of lines) {
      const wrapped = text.getWrappedText(line.text);
      textRows.push(...wrapped);
      starRows.push(line.stars, ...wrapped.slice(1).map(() => ''));
    }
    stars.setText(starRows.join('\n'));
    text.setWordWrapWidth(null).setText(textRows.join('\n'));
    const left = this.briefingCenterX - (stars.width + BRIEFING_COLUMN_GAP + text.width) / 2;
    stars.setX(left);
    text.setX(left + stars.width + BRIEFING_COLUMN_GAP);
  }

  /**
   * Строка целей: в одну строку, если помещается в ширину поля, иначе цели делятся на две строки;
   * если и так широко — шрифт уменьшается. Описание звёзд встаёт сразу под ней
   */
  private layoutGoals(items: string[]): void {
    const text = this.goalsText;
    if (!text) return;
    const half = Math.ceil(items.length / 2);
    const twoLines = [items.slice(0, half), items.slice(half)]
      .map((line) => line.join(GOALS_SEPARATOR))
      .join('\n');
    text.setFontSize(GOALS_FONT_SIZE).setText(items.join(GOALS_SEPARATOR));
    if (text.width > this.goalsWidth && items.length > 1) text.setText(twoLines);
    for (let size = GOALS_FONT_SIZE; text.width > this.goalsWidth && size > GOALS_MIN_FONT_SIZE;) {
      size -= 2;
      text.setFontSize(size);
    }
    this.briefingText?.setY(text.y + text.height + LEVEL_BRIEFING_GAP);
    this.briefingStars?.setY(text.y + text.height + LEVEL_BRIEFING_GAP);
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
    if (!this.pressed || this.busy || isBuying(this.mode)) return;
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
    if (!this.tutorialAllows(cell)) return;
    const board = this.session.board;
    const content = getCell(board, cell);
    const mode = this.mode;

    if (mode.type === 'aim') {
      if (isBonusTarget(board, cell)) void this.fireAimed(mode.bonus, cell);
      return;
    }

    if (mode.type === 'boughtRainbow') {
      if (isTile(content)) {
        void this.playBought('rainbow', { type: 'boughtRainbow', color: content.color });
      }
      return;
    }

    if (mode.type === 'boughtManipulator') {
      if (!isOnField(content)) return;
      if (!mode.first) return this.setMode({ ...mode, first: cell });
      if (samePos(mode.first, cell)) return this.setMode({ ...mode, first: null });
      return void this.playBought('manipulator', {
        type: 'boughtManipulator',
        a: mode.first,
        b: cell,
      });
    }

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
    const step = this.tutorialStep;
    if (step) {
      if (step.kind !== 'swap') return;
      const from = locate(this.session.board, step.from);
      const to = locate(this.session.board, step.to);
      const same =
        from &&
        to &&
        ((samePos(a, from) && samePos(b, to)) || (samePos(a, to) && samePos(b, from)));
      if (!same) return;
      // Ход всегда «от from к to»: награда встаёт туда, куда сдвинута фишка, — как задумано на поле
      a = from;
      b = to;
    }
    const board = this.session.board;
    const cellA = getCell(board, a);
    const cellB = getCell(board, b);
    if (!isOnField(cellA) || !isOnField(cellB)) return;

    if (!isValidSwap(board, a, b)) {
      // Показываем, что так нельзя: туда и обратно
      this.busy = true;
      playSound('invalid');
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
    // Ход по подсказке обучения закрывает её шаг; пока он идёт, поле не затемнено
    const guided = this.tutorialStep !== null;
    if (guided) {
      this.view.hideHint();
      this.view.setBlocked([]);
    }
    const steps = this.session.play(move);
    this.updateMoves();
    this.updateBonusShop();
    this.setSelected(null);
    await this.animate(steps, move);
    if (guided) this.stepIndex++;
    await this.ensureMoves();
    if (this.session.isOver) {
      if (this.tutorial) return this.finishTutorial(this.tutorial);
      await (this.session instanceof LevelSession
        ? this.finishLevel(this.session)
        : this.finishGame());
      return;
    }
    this.busy = false;
    this.updateBonusShop();
    this.showTutorialStep();
  }

  /** Сцена анимирует шаги партии и отвечает на выборы */
  private async animate(
    steps: Generator<ResolveStep, void, ChoiceOption | undefined>,
    move: Move | null = null,
  ): Promise<void> {
    // Поле партии меняется только в конце хода, поэтому здесь оно ещё прежнее — по нему и слушаем
    const sounds = new StepSoundTracker(this.session.board, this.progressView());
    playCues(sounds.begin(move));
    let next = steps.next();
    while (!next.done) {
      const step = next.value;
      playCues(sounds.step(step, this.progressView()));
      let answer: ChoiceOption | undefined;
      switch (step.kind) {
        case 'swap':
          await this.view.swap(step.a, step.b);
          break;
        case 'clear':
          this.updateScore();
          this.refreshIce();
          this.refreshGoals();
          this.view.hitChests(step.chests ?? []);
          this.view.hitCoal(step.coal ?? []);
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
    this.hintText.setText('Ходы закончились — бустеры срабатывают!');
    const scoreBeforeFinale = session.score;
    await this.animate(session.finale());
    this.hintText.setText('');
    if (!this.gems) this.sendResult(session.score - scoreBeforeFinale);
    playSound('gameOver');
    new GameOverDialog(this).show(
      session.score,
      this.difficulty,
      {
        onRestart: () =>
          this.gems ? this.scene.restart({ gems: true }) : void startGame(this, this.difficulty.id),
        onMenu: () => this.scene.start(this.gems ? 'Rules' : 'Menu'),
      },
      this.ticket && { ticketId: this.ticket.id, actions: session.actions },
    );
  }

  /** Уровень окончен: цели выполнены или кончились ходы */
  private async finishLevel(session: LevelSession): Promise<void> {
    const { level } = session;
    // Уровень кончился — ходами или досрочно на трёх звёздах, — а на поле остались спецфишки: они
    // срабатывают на лучший итог (при трёх звёздах — на очки), и итог подводится после
    if (hasPieces(session.board)) {
      this.hintText.setText(
        session.movesLeft === 0
          ? 'Ходы закончились — бустеры срабатывают!'
          : 'Три звезды! Оставшиеся бустеры срабатывают',
      );
      await this.animate(session.campaignFinale());
      this.hintText.setText('');
    }
    this.saveLevelResult(session);
    if (session.stars > 0)
      playStars(session.stars, (delay, fn) => this.time.delayedCall(delay, fn));
    else playSound('lose');
    new LevelResultDialog(this).show(session, {
      onRetry: () => this.scene.restart({ level }),
      onMap: () => this.scene.start('LevelMap', this.mapData()),
    });
  }

  /** Попытка уходит в статистику, а победа — в прогресс: звёзды и траты */
  private saveLevelResult(session: LevelSession): void {
    if (this.tutorial) return;
    const { level, stars } = session;
    this.sendLevelAttempt(stars > 0 ? 'won' : 'lost');
    if (stars > 0) {
      saveLevelStars(level.id, stars);
      saveLevelSpending(level.id, session.starsSpent);
    }
  }

  private mapData(): { floor?: number } {
    if (this.tutorial) return { floor: 1 };
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
    if (this.tutorial) return;
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
    // Ходы — отдельной строкой: по ним бот калибруется под живых игроков (scripts/humanMoves.ts)
    void sendLevelMoves(config, {
      levelId: session.level.id,
      version: clientInfo().version,
      seed: this.seed,
      wallet: this.wallet,
      outcome,
      movesMade: session.moves,
      actions: session.journal,
    });
  }

  private playedSeconds(): number {
    return this.startedAt === 0 ? 0 : Math.round((Date.now() - this.startedAt) / 1000);
  }

  /** Если ходов обычными фишками не осталось — перемешать поле */
  private async ensureMoves(): Promise<void> {
    if (!this.session.shuffleIfStuck()) return;
    this.hintText.setText('Ходов нет — перемешиваем поле');
    playSound('shuffle');
    await this.view.shuffle(this.session.board);
    this.hintText.setText(hintFor(this.mode));
  }

  // ---------- Бонусы ----------

  /** Кнопка покупки: в кампании включает выбор цели, повторное нажатие его отменяет */
  private chooseBonus(session: LevelSession, type: BonusType): void {
    if (!session.canBuy(type)) return;
    const next = buyingMode(type);
    const same = this.mode.type === next.type && (next.type !== 'aim' || sameAim(this.mode, next));
    this.setSelected(null);
    this.setMode(same ? { type: 'idle' } : next);
  }

  /** Покупная бомба или ракета появляется в выбранной клетке и сразу срабатывает */
  private async fireAimed(bonus: AimedBonus, at: Position): Promise<void> {
    if (!(this.session instanceof LevelSession)) return;
    const piece = this.session.aimBonus(bonus, at);
    if (!piece) return;
    playSound('buy');
    this.setMode({ type: 'idle' });
    this.busy = true;
    this.updateBonusShop();
    await this.view.place([{ pos: at, cell: piece }]);
    await this.play({ type: 'fire', at });
  }

  private async playBought(bonus: BonusType, move: PlayerMove): Promise<void> {
    if (!(this.session instanceof LevelSession) || !this.session.payBonus(bonus)) return;
    playSound('buy');
    this.setMode({ type: 'idle' });
    await this.play(move);
  }

  /** Покупка спецфишки в свободной игре: встаёт на случайную фишку 1 уровня, хода не тратит */
  private async takeBonus(type: BonusType): Promise<void> {
    if (this.busy) return;
    if (this.session instanceof LevelSession) return this.chooseBonus(this.session, type);
    if (this.mode.type !== 'idle') return;
    const placed = this.session.buy(type);
    if (!placed) return;
    playSound('buy');
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
        : mode.type === 'boughtManipulator'
          ? mode.first
          : null;
    this.view.select(marked);
    const { board } = this.session;
    this.view.setBlocked(
      this.tutorialStep
        ? this.tutorialBlocked()
        : mode.type === 'aim'
          ? allPositions(board).filter((pos) => {
              const cell = getCell(board, pos);
              return cell?.kind !== 'hole' && !isBonusTarget(board, pos);
            })
          : [],
    );
    this.hintText.setText(this.tutorialFocus()?.text ?? hintFor(mode));
    this.updateBonusShop();
    // У радуги и манипулятора следующее нажатие — уже по другим клеткам
    if (this.tutorialStep) this.showTutorialStep();
  }

  private setSelected(pos: Position | null): void {
    if (pos && (!this.selected || !samePos(pos, this.selected))) playSound('select');
    this.selected = pos;
    this.view.select(pos);
    const cell = pos && getCell(this.session.board, pos);
    this.hintText.setText(
      this.tutorialFocus()?.text ?? (isPiece(cell) ? PIECE_HINT : hintFor(this.mode)),
    );
  }

  private updateScore(): void {
    this.scoreText.setText(`Очки: ${this.session.score}`);
    this.updateBonusShop();
  }

  private updateMoves(): void {
    const left = levelMoveLimit(this.session, MOVE_LIMIT);
    this.movesText.setText(`Ходы: ${left}`);
    if (left === LAST_MOVES_WARNING && this.session.moves > 0) playSound('lastMoves');
  }

  /** Прогресс уровня для звуков: по разнице между шагами слышно лёд, золото и выполненные цели */
  private progressView(): ProgressView | null {
    const { session } = this;
    if (!(session instanceof LevelSession)) return null;
    const { level } = session;
    const done =
      level.goals.filter((goal) => session.goalValue(goal) >= goal.count).length +
      level.stars.filter((task) => session.starTaskValue(task) >= task.count).length;
    return {
      iceLeft: session.ice.flat().reduce((sum, hits) => sum + hits, 0),
      iceBroken: session.progress.ice,
      gold: session.progress.gold,
      done,
    };
  }

  private updateBonusShop(): void {
    // Покупка — только в спокойном состоянии: не во время хода и не в режиме выбора клеток.
    // Пока выбирается цель покупки, кнопки работают: ими её можно отменить или заменить
    const { session } = this;
    const budget = session instanceof LevelSession ? session.starsLeft : session.score;
    const allowed =
      session instanceof LevelSession ? (type: BonusType) => session.canBuy(type) : undefined;
    this.bonusShop.update(
      budget,
      !this.busy && (this.mode.type === 'idle' || isBuying(this.mode)),
      allowed,
    );
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
  return cell != null && cell.kind !== 'stone' && !isFixed(cell);
}

const HINT_TEXTS: Readonly<Record<HintKind, string>> = {
  swap: 'Подсказка: поменяйте отмеченные клетки',
  fire: 'Подсказка: двойной клик по бустеру',
  rainbow: 'Подсказка: нажмите на радугу, затем на отмеченную фишку',
};

/** Одиночное нажатие взрывную спецфишку только выделяет — подсказываем, что с ней делать */
const PIECE_HINT = 'Двойной клик — сработает на месте,\nсдвиг — на соседней клетке';

function isBuying(mode: Mode): boolean {
  return mode.type === 'aim' || mode.type === 'boughtRainbow' || mode.type === 'boughtManipulator';
}

function sameAim(a: Mode, b: Mode): boolean {
  return a.type === 'aim' && b.type === 'aim' && a.bonus === b.bonus;
}

function buyingMode(type: BonusType): Mode {
  if (type === 'rainbow') return { type: 'boughtRainbow' };
  if (type === 'manipulator') return { type: 'boughtManipulator', first: null };
  return { type: 'aim', bonus: type };
}

function hintFor(mode: Mode): string {
  switch (mode.type) {
    case 'idle':
    case 'aim':
      return '';
    case 'boughtRainbow':
      return 'Радуга: нажмите на фишку нужного цвета\n(нажатие на кнопку — отмена)';
    case 'boughtManipulator':
      return mode.first
        ? 'Манипулятор: выберите вторую клетку'
        : 'Манипулятор: выберите две клетки для обмена\n(нажатие на кнопку — отмена)';
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
