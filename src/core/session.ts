import {
  allPositions,
  createEmptyBoard,
  getCell,
  hasPieces,
  isPiece,
  isTile,
  samePos,
  type Board,
  type ColorId,
  type Piece,
  type Position,
} from './board';
import { buyBonus, placeBonus, type BonusType } from './bonus';
import {
  BONUS_TIERS,
  DEMO_BOARD_COLS,
  DEMO_BOARD_ROWS,
  FINALE_MAX_ROUNDS,
  MOVE_LIMIT,
} from './config';
import { createGameStats, recordPurchase, recordStep, type GameStats } from './gameStats';
import { generateStartBoard } from './generate';
import { hasTileMove, isValidSwap, shuffleBoard } from './moves';
import { resolveMove, type ChoiceOption, type Move, type ResolveStep } from './resolve';
import { createRng, type Rng } from './rng';
import { comboNeedsColor } from './specials';

// Партия целиком: поле, счёт, ходы и журнал действий игрока.
// Этим же кодом партию проигрывает сервер (см. replayGame): вся случайность идёт от одного seed,
// поэтому по seed и журналу действий получается ровно тот же счёт, что и у игрока.

export type PlayerMove = Exclude<Move, { type: 'finale' }>;

/** Всё, что меняет партию и должно попасть в журнал: ходы и покупки */
export type GameAction = PlayerMove | { type: 'buy'; bonus: BonusType };

type Steps = Generator<ResolveStep, void, ChoiceOption | undefined>;

export class GameSession {
  board: Board;
  score = 0;
  /** Сколько ходов сделано (покупка спецфишки и перемешивание не считаются) */
  moves = 0;
  shuffles = 0;
  readonly stats: GameStats = createGameStats();
  readonly actions: GameAction[] = [];
  private readonly rng: Rng;

  constructor(
    seed: number,
    private readonly colorCount: number,
    template: Board = createEmptyBoard(DEMO_BOARD_ROWS, DEMO_BOARD_COLS),
    private readonly moveLimit: number = MOVE_LIMIT,
  ) {
    this.rng = createRng(seed);
    this.board = generateStartBoard(template, colorCount, this.rng);
  }

  get isOver(): boolean {
    return this.moves >= this.moveLimit;
  }

  /** Ход игрока; шаги отдаются для анимации */
  play(move: PlayerMove): Steps {
    this.moves++;
    this.actions.push(move);
    return this.run(move);
  }

  private *run(move: Move): Steps {
    const steps = resolveMove(this.board, move, { colorCount: this.colorCount, rng: this.rng });
    let next = steps.next();
    while (!next.done) {
      const step = next.value;
      recordStep(this.stats, step);
      if (step.kind === 'clear') this.score += step.points;
      this.onStep?.(step);
      next = steps.next(yield step);
    }
    this.board = next.value.board;
  }

  /** Для партии на уровне: цели считаются по шагам разбора хода */
  protected onStep?(step: ResolveStep): void;

  /** Покупка спецфишки; null — если не хватает очков или некуда поставить */
  buy(type: BonusType): { pos: Position; piece: Piece } | null {
    const scoreAfter = buyBonus(this.score, type);
    if (scoreAfter === null) return null;
    const placed = placeBonus(this.board, type, this.rng);
    if (!placed) return null;
    recordPurchase(this.stats, type, this.score - scoreAfter);
    this.score = scoreAfter;
    this.board = placed.board;
    this.actions.push({ type: 'buy', bonus: type });
    return { pos: placed.pos, piece: placed.piece };
  }

  /** Если ходов обычными фишками не осталось — перемешивает поле. true — перемешали */
  shuffleIfStuck(): boolean {
    if (hasTileMove(this.board)) return false;
    this.shuffles++;
    this.board = shuffleBoard(this.board, this.colorCount, this.rng);
    return true;
  }

  /** Финал: спецфишки срабатывают, пока на поле не останется ни одной (в каскадах бывают новые) */
  *finale(): Steps {
    for (let round = 0; round < FINALE_MAX_ROUNDS && hasPieces(this.board); round++) {
      yield* this.run({ type: 'finale' });
    }
  }

  /** Может ли игрок сделать это в текущем состоянии — журнал приходит от клиента, ему не верим */
  canApply(action: GameAction): boolean {
    const { board } = this;
    const piece = (pos: Position, type: Piece['type']) => {
      const cell = getCell(board, pos);
      return isPiece(cell) && cell.type === type;
    };
    switch (action.type) {
      case 'buy':
        return true; // проверяет сама покупка
      case 'swap':
        return (
          isFilled(board, action.from) &&
          isFilled(board, action.to) &&
          isValidSwap(board, action.from, action.to) &&
          (comboNeedsColor(board, action.from, action.to)
            ? hasColor(board, action.color)
            : action.color === undefined)
        );
      case 'rainbow':
        return piece(action.at, 'rainbow') && hasColor(board, action.color);
      case 'fire':
        return (
          piece(action.at, 'rocket') || piece(action.at, 'bomb') || piece(action.at, 'megaBomb')
        );
      case 'manipulator':
        return (
          piece(action.at, 'manipulator') &&
          isFilled(board, action.a) &&
          isFilled(board, action.b) &&
          !samePos(action.a, action.b) &&
          !samePos(action.a, action.at) &&
          !samePos(action.b, action.at)
        );
    }
  }
}

function isFilled(board: Board, pos: Position): boolean {
  const cell = getCell(board, pos);
  return cell != null && cell.kind !== 'hole' && cell.kind !== 'stone';
}

function hasColor(board: Board, color: ColorId | undefined): boolean {
  return allPositions(board).some((pos) => {
    const cell = getCell(board, pos);
    return isTile(cell) && cell.color === color;
  });
}

function finish(steps: Steps): void {
  let next = steps.next();
  while (!next.done) next = steps.next();
}

/**
 * Проигрывает партию по seed и журналу. null — журнал невозможен: недопустимое действие
 * или партия не доиграна до конца. Порядок вызовов — как в GameScene.
 */
export function replayGame(
  seed: number,
  colorCount: number,
  actions: readonly GameAction[],
): number | null {
  const session = new GameSession(seed, colorCount);
  for (const action of actions) {
    if (session.isOver || !session.canApply(action)) return null;
    if (action.type === 'buy') {
      if (!session.buy(action.bonus)) return null;
    } else {
      finish(session.play(action));
    }
    session.shuffleIfStuck();
  }
  if (!session.isOver) return null;
  finish(session.finale());
  return session.score;
}

// ---------- Разбор журнала из запроса ----------

/** Покупок не бывает много: каждая требует очков. Защита от огромного запроса */
const MAX_ACTIONS = 1000;

const isInt = (value: unknown): value is number => Number.isInteger(value);

function parsePosition(value: unknown): Position | null {
  if (typeof value !== 'object' || value === null) return null;
  const { row, col } = value as Record<string, unknown>;
  return isInt(row) && isInt(col) ? { row, col } : null;
}

function parseAction(value: unknown): GameAction | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  switch (v.type) {
    case 'buy': {
      const tier = BONUS_TIERS.find((t) => t.type === v.bonus);
      return tier ? { type: 'buy', bonus: tier.type } : null;
    }
    case 'swap': {
      const from = parsePosition(v.from);
      const to = parsePosition(v.to);
      if (!from || !to) return null;
      if (v.color === undefined) return { type: 'swap', from, to };
      return isInt(v.color) ? { type: 'swap', from, to, color: v.color } : null;
    }
    case 'rainbow': {
      const at = parsePosition(v.at);
      return at && isInt(v.color) ? { type: 'rainbow', at, color: v.color } : null;
    }
    // megaBomb — прежнее имя этого хода: журнал могла прислать вкладка со старой версией игры
    case 'fire':
    case 'megaBomb': {
      const at = parsePosition(v.at);
      return at ? { type: 'fire', at } : null;
    }
    case 'manipulator': {
      const at = parsePosition(v.at);
      const a = parsePosition(v.a);
      const b = parsePosition(v.b);
      return at && a && b ? { type: 'manipulator', at, a, b } : null;
    }
    default:
      return null;
  }
}

/** Журнал действий из непроверенного JSON; null — если он неправильного вида */
export function parseActions(value: unknown): GameAction[] | null {
  if (!Array.isArray(value) || value.length > MAX_ACTIONS) return null;
  const actions = value.map(parseAction);
  return actions.every((action) => action !== null) ? (actions as GameAction[]) : null;
}
