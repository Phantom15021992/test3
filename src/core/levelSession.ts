import { cloneBoard, setCell, type Piece, type Position } from './board';
import { aimedPiece, bonusStars, isBonusTarget, type AimedBonus, type BonusType } from './bonus';
import { recordPurchase } from './gameStats';
import { boardTemplate, iceTemplate, type Goal, type GoalKind, type Level } from './level';
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
  ) {
    super(seed, level.colors, boardTemplate(level), level.moves);
    this.ice = iceTemplate(level);
  }

  get goalsDone(): boolean {
    return this.level.goals.every((goal) => this.goalValue(goal) >= goal.count);
  }

  get isOver(): boolean {
    return this.goalsDone || super.isOver;
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

  /** Платит за покупку; false — звёзд не хватает */
  payBonus(type: BonusType): boolean {
    const cost = bonusStars(type);
    if (this.starsLeft < cost) return false;
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
    const done = this.level.stars.filter((task) => {
      if (task.kind === 'movesLeft') return this.movesLeft >= task.count;
      return this.progress.level3 >= task.count;
    });
    return 1 + done.length;
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
      for (const { cell } of step.placements) {
        if (cell?.kind === 'tile' && cell.level === 2) this.progress.level2++;
        if (cell?.kind === 'tile' && cell.level === 3) this.progress.level3++;
        if (cell?.kind === 'piece' && cell.type === 'megaBomb') this.progress.megaBomb++;
        if (cell?.kind === 'piece' && cell.type === 'rainbow') this.progress.rainbow++;
      }
    }
  }
}
