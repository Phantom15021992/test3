import { cloneBoard, setCell, type Piece, type Position } from './board';
import { aimedPiece, bonusStars, isBonusTarget, type AimedBonus, type BonusType } from './bonus';
import { CAMPAIGN_BONUS_LIMITS } from './config';
import { recordPurchase } from './gameStats';
import {
  boardTemplate,
  iceTemplate,
  type Goal,
  type GoalKind,
  type Level,
  type StarTask,
} from './level';
import type { ResolveStep } from './resolve';
import { GameSession } from './session';

// Партия на уровне: те же ходы, что и в свободной игре, плюс лёд, цели и звёзды.
// Спецфишки покупаются за звёзды этажа и применяются сразу: копить их нельзя. Списание сохраняет
// сцена только при победе: на проигранном уровне потраченное возвращается. Уровень заканчивается сразу, как выполнены цели;
// финала со спецфишками здесь нет.

export type GoalProgress = Record<GoalKind, number>;

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
