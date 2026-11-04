import {
  allPositions,
  cloneBoard,
  getCell,
  hasPieces,
  isPiece,
  isTile,
  setCell,
  type Piece,
  type Position,
} from './board';
import { aimedPiece, bonusStars, isBonusTarget, type AimedBonus, type BonusType } from './bonus';
import { CAMPAIGN_BONUS_LIMITS, FINALE_MAX_ROUNDS } from './config';
import { recordPurchase } from './gameStats';
import {
  boardTemplate,
  iceTemplate,
  type Goal,
  type GoalKind,
  type Level,
  type StarTask,
} from './level';
import { findPossibleMoves } from './moves';
import type { Move, ResolveStep } from './resolve';
import { createRng } from './rng';
import { GameSession, type Steps } from './session';

// Партия на уровне: те же ходы, что и в свободной игре, плюс лёд, цели и звёзды.
// Спецфишки покупаются за звёзды этажа и применяются сразу: копить их нельзя. Списание сохраняет
// сцена только при победе: на проигранном уровне потраченное возвращается. Когда кончились ходы,
// спецфишки на поле срабатывают в финале (campaignFinale), и итог подводится уже после него.

export type GoalProgress = Record<GoalKind, number>;

/** Свой seed для примерки ходов финала: ГСЧ партии при примерке не трогается */
const FINALE_PREVIEW_SEED = 20261104;

/** Сравнение итогов по старшинству: больше — лучше */
function compareRanks(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}

export class LevelSession extends GameSession {
  readonly progress: GoalProgress = {
    level2: 0,
    level3: 0,
    megaBomb: 0,
    rainbow: 0,
    ice: 0,
    stone: 0,
    box: 0,
    chain: 0,
    item: 0,
  };
  /** Клетки, на которых ещё лежит лёд */
  ice: boolean[][];
  /** Сколько звёзд этажа потрачено в этой попытке */
  starsSpent = 0;

  constructor(
    seed: number,
    readonly level: Level,
    /** Звёзды этажа, доступные к началу попытки */
    private readonly wallet = 0,
    /** Лимиты покупок; другие — только для замеров бота (например, сколько бомб нужно на уровень) */
    private readonly limits: Partial<Record<BonusType, number>> = CAMPAIGN_BONUS_LIMITS,
  ) {
    super(seed, level.colors, boardTemplate(level), level.moves);
    this.ice = iceTemplate(level);
  }

  get goalsDone(): boolean {
    return this.level.goals.every((goal) => this.goalValue(goal) >= goal.count);
  }

  /**
   * Выполнены цели — победа уже засчитана, но уровень идёт дальше, пока не выполнены все задачи
   * на звёзды (очки, ячейки, вторая корона) или не кончились ходы: иначе досрочный конец отнимал бы
   * у игрока шанс на три звезды
   */
  get isOver(): boolean {
    if (super.isOver) return true;
    return this.goalsDone && this.stars === 1 + this.level.stars.length;
  }

  /**
   * Финал кампании: ходы кончились, и все спецфишки на поле срабатывают по одной. Каждый раз — та,
   * что сильнее всего улучшит итог: сначала задание (доломать лёд, коробки, собрать нужные ячейки…),
   * потом звёзды, потом очки. Радуга выбирает лучший цвет, манипулятор — лучший обмен. Спецфишки
   * из каскадов финала тоже идут в дело. Победа и звёзды считаются после финала
   */
  *campaignFinale(): Steps {
    for (let round = 0; round < FINALE_MAX_ROUNDS && hasPieces(this.board); round++) {
      let best: Move | null = null;
      let bestRank: number[] = [];
      for (const move of this.finaleOptions()) {
        const rank = this.trial(move).finaleRank();
        if (!best || compareRanks(rank, bestRank) > 0) {
          best = move;
          bestRank = rank;
        }
      }
      if (!best) return;
      yield* this.run(best);
    }
  }

  /** Чем может сработать каждая спецфишка на поле */
  private finaleOptions(): Move[] {
    const { board } = this;
    const colors = [
      ...new Set(
        allPositions(board).flatMap((pos) => {
          const cell = getCell(board, pos);
          return isTile(cell) ? [cell.color] : [];
        }),
      ),
    ];
    const swaps = findPossibleMoves(board).filter(
      ({ from, to }) => isTile(getCell(board, from)) && isTile(getCell(board, to)),
    );
    return allPositions(board).flatMap((at): Move[] => {
      const cell = getCell(board, at);
      if (!isPiece(cell)) return [];
      if (cell.type === 'rainbow') return colors.map((color) => ({ type: 'rainbow', at, color }));
      if (cell.type === 'manipulator') {
        // Без полезного обмена манипулятор просто уходит с поля
        return swaps.length > 0
          ? swaps.map(({ from, to }) => ({ type: 'manipulator', at, a: from, b: to }))
          : [{ type: 'manipulator', at, a: at, b: at }];
      }
      return [{ type: 'fire', at }];
    });
  }

  /** Копия партии, на которой ход финала примерен своим ГСЧ */
  private trial(move: Move): LevelSession {
    const copy = Object.assign(Object.create(LevelSession.prototype) as LevelSession, this, {
      progress: { ...this.progress },
      ice: this.ice.map((line) => [...line]),
      stats: structuredClone(this.stats),
      actions: [],
    });
    const steps = copy.run(move, createRng(FINALE_PREVIEW_SEED));
    for (let next = steps.next(); !next.done; next = steps.next());
    return copy;
  }

  /** Насколько хорош итог, по старшинству: задание выполнено, его доля, звёзды, доля задач, очки */
  private finaleRank(): number[] {
    const share = (value: number, count: number) => Math.min(value / count, 1);
    const goals = this.level.goals.reduce(
      (sum, goal) => sum + share(this.goalValue(goal), goal.count),
      0,
    );
    const tasks = this.level.stars.reduce(
      (sum, task) => sum + share(this.starTaskValue(task), task.count),
      0,
    );
    return [Number(this.goalsDone), goals, this.stars, tasks, this.score];
  }

  /** Сколько корон на поле в начале уровня */
  get crowns(): number {
    return this.level.layout.join('').split('o').length - 1;
  }

  override get campaign(): boolean {
    return true;
  }

  get movesLeft(): number {
    return this.level.moves - this.moves;
  }

  /** Сколько цели уже выполнено; больше нужного не показываем */
  goalValue(goal: Goal): number {
    return Math.min(this.progress[goal.kind], goal.count);
  }

  get starsLeft(): number {
    return this.wallet - this.starsSpent;
  }

  /** Покупка на случайную клетку — только для свободной игры */
  override buy(): null {
    return null;
  }

  /** Хватает ли звёзд и не исчерпан ли лимит покупок этой спецфишки на уровне */
  canBuy(type: BonusType): boolean {
    const limit = this.limits[type];
    return (
      this.starsLeft >= bonusStars(type) && (limit === undefined || this.stats.bought[type] < limit)
    );
  }

  /** Платит за покупку; false — звёзд не хватает или лимит исчерпан */
  payBonus(type: BonusType): boolean {
    if (!this.canBuy(type)) return false;
    const cost = bonusStars(type);
    this.starsSpent += cost;
    recordPurchase(this.stats, type, 0);
    return true;
  }

  /**
   * Покупная бомба или ракета встаёт в выбранную клетку: фишка исчезает без очков, а срабатывает
   * спецфишка следующим ходом 'fire'. null — клетка не подходит или не хватает звёзд.
   */
  aimBonus(type: AimedBonus, at: Position): Piece | null {
    if (!isBonusTarget(this.board, at) || !this.payBonus(type)) return null;
    const piece = aimedPiece(type);
    const next = cloneBoard(this.board);
    setCell(next, at, piece);
    this.board = next;
    return piece;
  }

  /** Насколько выполнены цели, в процентах: показывает, близко ли было поражение */
  get goalsPercent(): number {
    const { goals } = this.level;
    const share = goals.reduce((sum, goal) => sum + this.goalValue(goal) / goal.count, 0);
    return Math.round((share / goals.length) * 100);
  }

  /** Звёзды: 0 — цели не выполнены, иначе 1 и по одной за каждую дополнительную задачу */
  get stars(): number {
    if (!this.goalsDone) return 0;
    return 1 + this.level.stars.filter((task) => this.starTaskValue(task) >= task.count).length;
  }

  /** Насколько выполнена задача на звезду */
  starTaskValue(task: StarTask): number {
    return task.kind === 'score' ? this.score : this.progress[task.kind];
  }

  protected override onStep(step: ResolveStep): void {
    if (step.kind === 'clear') {
      const links = step.links ?? [];
      for (const { row, col } of [...step.cells, ...links.map((link) => link.pos)]) {
        const line = this.ice[row];
        if (line?.[col]) {
          line[col] = false;
          this.progress.ice++;
        }
      }
      this.progress.chain += links.filter((link) => link.left === 0).length;
      this.progress.stone += step.stones ?? 0;
      this.progress.box += step.boxes ?? 0;
      this.progress.item += step.items ?? 0;
    }
    if (step.kind === 'transform') {
      // Ячейка 3 уровня сразу из фишек 1 уровня (в обход 2 уровня) идёт в ячейки 2 уровня за две
      this.progress.level2 += (step.direct3 ?? 0) * 2;
      for (const { cell } of step.placements) {
        if (cell?.kind === 'tile' && cell.level === 2) this.progress.level2++;
        if (cell?.kind === 'tile' && cell.level === 3) this.progress.level3++;
        if (cell?.kind === 'piece' && cell.type === 'megaBomb') this.progress.megaBomb++;
        if (cell?.kind === 'piece' && cell.type === 'rainbow') this.progress.rainbow++;
      }
    }
  }
}
