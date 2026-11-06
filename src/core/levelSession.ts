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
import { CAMPAIGN_BONUS_LIMITS, FINALE_MAX_ROUNDS, HIDDEN_GOLD_SALT } from './config';
import { recordPurchase } from './gameStats';
import {
  FLOOR_SIZE,
  boardTemplate,
  hideGold,
  iceStyles,
  iceTemplate,
  type IceStyle,
  type Goal,
  type GoalKind,
  type Level,
  type StarTask,
} from './level';
import { findPossibleMoves } from './moves';
import type { Move, ResolveStep } from './resolve';
import { createRng, type Rng } from './rng';
import { GameSession, type PlayerMove, type Steps } from './session';

/**
 * Действие в журнале попытки уровня: ход или покупка за звёзды. Покупная бомба или ракета
 * ставится в клетку (aim) и срабатывает следующим ходом 'fire'; радуга и манипулятор оплачиваются
 * (pay) и применяются своим ходом. По seed, звёздам на начало и журналу попытку можно проиграть
 * заново (core/levelReplay.ts) — так ходы живых игроков сравниваются с ходами бота.
 */
export type LevelAction =
  PlayerMove | { type: 'aim'; bonus: AimedBonus; at: Position } | { type: 'pay'; bonus: BonusType };

// Партия на уровне: те же ходы, что и в свободной игре, плюс лёд, цели и звёзды.
// Спецфишки покупаются за звёзды этажа и применяются сразу: копить их нельзя. Списание сохраняет
// сцена только при победе: на проигранном уровне потраченное возвращается. Когда уровень кончился,
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
    item: 0,
    coal: 0,
    gold: 0,
    level3color: 0,
  };
  /** Ячейки 3 уровня по цветам — для цели level3color */
  readonly level3ByColor: number[] = [];
  /** Сколько ударов ещё выдержит лёд в клетке (0 — льда нет) */
  ice: number[][];
  /** Вид льда по клеткам — не меняется за уровень: по нему рисуется картинка и считается золото */
  readonly iceStyle: readonly (readonly (IceStyle | null)[])[];
  /** Сколько звёзд этажа потрачено в этой попытке */
  starsSpent = 0;
  /**
   * Слои глыб угля (ключ — левый верхний угол) — по шагам хода: поле партии обновляется
   * только в конце хода, а прогресс виден сразу
   */
  coal = new Map<string, number>();
  /** Журнал попытки: ходы и покупки по порядку */
  readonly journal: LevelAction[] = [];

  constructor(
    seed: number,
    readonly level: Level,
    /** Звёзды этажа, доступные к началу попытки */
    private readonly wallet = 0,
    /** Лимиты покупок; другие — только для замеров бота (например, сколько бомб нужно на уровень) */
    private readonly limits: Partial<Record<BonusType, number>> = CAMPAIGN_BONUS_LIMITS,
    /** Магазин открыт на любом уровне — только для замеров бота (бомба на 5-м и 9-м месте) */
    private readonly anyShop = false,
  ) {
    super(seed, level.colors, boardTemplate(level), level.moves);
    this.ice = iceTemplate(level);
    const styles = iceStyles(level);
    // Своё зерно: золото прячется, не трогая ГСЧ партии, — поле попытки остаётся тем же
    if (level.hiddenGold) hideGold(level, this.board, styles, createRng(seed ^ HIDDEN_GOLD_SALT));
    this.iceStyle = styles;
    this.board.forEach((line, row) =>
      line.forEach((cell, col) => {
        if (cell?.kind === 'coal' && cell.top === row && cell.left === col) {
          this.coal.set(`${row},${col}`, cell.layers);
        }
      }),
    );
  }

  /** Сколько слоёв угля осталось на поле */
  get coalLeft(): number {
    let sum = 0;
    for (const layers of this.coal.values()) sum += layers;
    return sum;
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
   * Финал кампании: уровень кончился (ходами или досрочно на трёх звёздах), и все спецфишки на поле
   * срабатывают по одной. Каждый раз — та,
   * что сильнее всего улучшит итог: сначала задание (доломать лёд, сундуки, собрать нужные ячейки…),
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

  /** Копия партии, на которой ход примерен своим ГСЧ (финал и боты): сама партия не меняется */
  trial(move: Move, rng: Rng = createRng(FINALE_PREVIEW_SEED)): LevelSession {
    const copy = Object.assign(Object.create(LevelSession.prototype) as LevelSession, this, {
      progress: { ...this.progress },
      level3ByColor: [...this.level3ByColor],
      ice: this.ice.map((line) => [...line]),
      coal: new Map(this.coal),
      stats: structuredClone(this.stats),
      actions: [],
      journal: [],
    });
    const steps = copy.run(move, rng);
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
    return Math.min(this.goalCount(goal), goal.count);
  }

  /** Сколько единиц цели набрано, без ограничения сверху */
  goalCount(goal: Goal): number {
    if (goal.kind === 'level3color') return this.level3ByColor[goal.color ?? 0] ?? 0;
    return this.progress[goal.kind];
  }

  get starsLeft(): number {
    return this.wallet - this.starsSpent;
  }

  /** Покупка на случайную клетку — только для свободной игры */
  override buy(): null {
    return null;
  }

  /** Магазин спецфишек открыт только на последнем, 10-м уровне этажа */
  get shopOpen(): boolean {
    return this.anyShop || this.level.id % FLOOR_SIZE === 0;
  }

  /** Открыт ли магазин, хватает ли звёзд и не исчерпан ли лимит покупок этой спецфишки на уровне */
  canBuy(type: BonusType): boolean {
    if (!this.shopOpen) return false;
    const limit = this.limits[type];
    return (
      this.starsLeft >= bonusStars(type) && (limit === undefined || this.stats.bought[type] < limit)
    );
  }

  override play(move: PlayerMove): Steps {
    this.journal.push(move);
    return super.play(move);
  }

  /** Платит за радугу или манипулятор (их ход идёт следом); false — звёзд не хватает или лимит исчерпан */
  payBonus(type: BonusType): boolean {
    if (!this.charge(type)) return false;
    this.journal.push({ type: 'pay', bonus: type });
    return true;
  }

  private charge(type: BonusType): boolean {
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
    if (!isBonusTarget(this.board, at) || !this.charge(type)) return null;
    this.journal.push({ type: 'aim', bonus: type, at });
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
      // Удар по льду — каждая очищенная клетка, одна клетка — раз за шаг
      const hit = new Set<string>();
      for (const { row, col } of step.cells) {
        const line = this.ice[row];
        const key = `${row},${col}`;
        if (!line?.[col] || hit.has(key)) continue;
        hit.add(key);
        line[col] = line[col]! - 1;
        if (line[col]! > 0) continue;
        this.progress.ice++;
        if (this.iceStyle[row]?.[col] === 'gold') this.progress.gold++;
      }
      this.progress.stone += step.stones ?? 0;
      this.progress.box += step.boxes ?? 0;
      this.progress.gold += step.treasures ?? 0;
      this.progress.item += step.items ?? 0;
      for (const { top, left, layers } of step.coal ?? []) {
        this.coal.set(`${top},${left}`, layers);
        if (layers === 0) this.progress.coal++;
      }
    }
    if (step.kind === 'transform') {
      // Ячейка 3 уровня сразу из фишек 1 уровня (в обход 2 уровня) идёт в ячейки 2 уровня за две
      this.progress.level2 += (step.direct3 ?? 0) * 2;
      for (const { cell } of step.placements) {
        if (cell?.kind === 'tile' && cell.level === 2) this.progress.level2++;
        if (cell?.kind === 'tile' && cell.level === 3) {
          this.progress.level3++;
          this.level3ByColor[cell.color] = (this.level3ByColor[cell.color] ?? 0) + 1;
        }
        if (cell?.kind === 'piece' && cell.type === 'megaBomb') this.progress.megaBomb++;
        if (cell?.kind === 'piece' && cell.type === 'rainbow') this.progress.rainbow++;
      }
    }
  }
}
