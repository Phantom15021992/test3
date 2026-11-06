// Боты для оценки сложности уровней (npm run levels и npm run levels:tune).
//
// Новичок ходит случайно — это нижняя граница. Опытный видит, как человек, на один ход вперёд:
// примеряет свой ход целиком, с каскадами, и лучший следующий ход после него. Будущие фишки он
// не подглядывает (примерка идёт на отдельном ГСЧ), а где спрятано золото, не знает, пока лёд
// или сундук его не покажет.

import {
  allPositions,
  cloneBoard,
  getCell,
  isTile,
  posKey,
  setCell,
  type Board,
  type ColorId,
  type Position,
} from '../src/core/board';
import { aimedPiece, isBonusTarget, type AimedBonus } from '../src/core/bonus';
import { iceHits, type Level, type StarTaskKind } from '../src/core/level';
import { LevelSession, type LevelAction } from '../src/core/levelSession';
import { findPossibleMoves } from '../src/core/moves';
import { runMove, type ResolveStep } from '../src/core/resolve';
import { createRng, type Rng } from '../src/core/rng';
import type { PlayerMove } from '../src/core/session';
import { comboNeedsColor, mostFrequentColor } from '../src/core/specials';

export type Bot = 'novice' | 'expert' | 'buyer';

export const BOTS: readonly Bot[] = ['novice', 'expert', 'buyer'];
/** Сколько ходов оценивать за раз: перебор всех на поле 10×10 слишком долгий */
const MAX_CANDIDATES = 40;
/** Сколько клеток примерять для покупной бомбы */
const MAX_AIM_CELLS = 30;
/**
 * Мастерство опытного бота — сколько обменов на поле он замечает за ход (случайных; спецфишки видны
 * всегда). Подобрано по живым игрокам на 1-1 и 1-5 (scripts/calibrateBot.ts).
 * focus — сколько обменов он ещё замечает рядом с отдельными предметами цели (короны, сундуки, уголь,
 * камни): человек смотрит на них нарочно. Лёд лежит по всему полю, на него внимание не делится
 */
export const botSkill = { attention: 2.25, focus: 3, crownRow: 40, temperature: 0 };
/** Сколько клеток цели на поле человек видит все разом: при таком числе и лёд — отдельные предметы */
const FOCUS_TARGETS = 12;
/** На сколько клеток под корону человек смотрит всегда */
const CROWN_LOOK = 3;
/** Сколько лучших ходов примерять вместе со следующим ходом */
const TOP_FIRST = 6;
/** Сколько следующих ходов смотреть после каждого из них */
const MAX_NEXT = 15;
/** Следующий ход ещё не сделан и поле после него угадано лишь отчасти — он весит меньше */
const NEXT_WEIGHT = 0.5;

export interface GameResult {
  won: boolean;
  /** Журнал попытки и итоговые очки: по ним партию можно проиграть заново (core/levelReplay.ts) */
  journal: readonly LevelAction[];
  score: number;
  /** Сколько ходов ушло на цели; при поражении — весь лимит */
  movesUsed: number;
  /** По каждой цели: на каком ходу достигнуто 1, 2, 3… её единиц */
  reached: number[][];
  stars: number;
  movesLeft: number;
  /** Какая доля целей выполнена: показывает, насколько близко было поражение */
  done: number;
  /** После каждого хода: очки и счётчики задач на звёзды — по ним подгоняются условия звёзд */
  track: { score: number[]; level2: number[]; level3: number[]; item: number[] };
  /** Сколько спецфишек куплено */
  bought: number;
  /** Покупки по видам спецфишек */
  boughtBy: Record<string, number>;
}

function candidates(session: LevelSession): PlayerMove[] {
  const { board } = session;
  const color = mostFrequentColor(board) ?? 0;
  const moves: PlayerMove[] = findPossibleMoves(board).map(({ from, to }) =>
    comboNeedsColor(board, from, to)
      ? { type: 'swap', from, to, color }
      : { type: 'swap', from, to },
  );
  for (const at of allPositions(board)) {
    const cell = getCell(board, at);
    if (cell?.kind !== 'piece') continue;
    if (cell.type === 'rocket' || cell.type === 'bomb' || cell.type === 'megaBomb') {
      moves.push({ type: 'fire', at });
    }
    if (cell.type === 'rainbow') moves.push({ type: 'rainbow', at, color });
  }
  return moves;
}

/** Лёд, под которым может быть золото, пока его не ударили: снаружи 2 уровень, внутри неизвестно */
function unrevealedIce(session: LevelSession, pos: Position): boolean {
  const style = session.iceStyle[pos.row]?.[pos.col];
  if (style !== 'plain' && style !== 'gold') return false;
  return (
    (session.ice[pos.row]?.[pos.col] ?? 0) === iceHits(style, session.level.iceCracks === true)
  );
}

/** Закрытый сундук: есть ли в нём сокровища, не видно */
function closedChest(board: Board, pos: Position): boolean {
  const cell = getCell(board, pos);
  return cell?.kind === 'box' && cell.open !== true;
}

/**
 * Какова надежда найти золото в нераскрытом месте: сколько его ещё спрятано на сколько мест.
 * Человек видит число на цели и поле, но не знает, где именно слитки
 */
function goldOdds(session: LevelSession): number {
  let spots = 0;
  let gold = 0;
  for (const pos of allPositions(session.board)) {
    const cell = getCell(session.board, pos);
    if (unrevealedIce(session, pos)) {
      spots++;
      if (session.iceStyle[pos.row]?.[pos.col] === 'gold') gold++;
    } else if (closedChest(session.board, pos)) {
      spots++;
      if (cell?.kind === 'box' && cell.treasure) gold++;
    }
  }
  return spots > 0 ? gold / spots : 0;
}

/**
 * Сколько клеток коронам осталось до дна своих столбцов. Доставленная корона уходит с поля —
 * ей остаётся 0, а не «минус все её ряды», как было бы при счёте по строкам корон
 */
function crownDistance(board: Board): number {
  return allPositions(board)
    .filter((pos) => getCell(board, pos)?.kind === 'item')
    .reduce((sum: number, pos: Position) => {
      let bottom = pos.row;
      for (let row = pos.row + 1; row < board.length; row++) {
        if (getCell(board, { row, col: pos.col })?.kind !== 'hole') bottom = row;
      }
      return sum + bottom - pos.row;
    }, 0);
}

/** Насколько ход приближает к целям; очки — лишь слабая подсказка при равенстве */
function moveValue(
  session: LevelSession,
  move: PlayerMove,
  rng: Rng,
  start: Board = session.board,
): number {
  const { board, steps } = runMove(start, move, {
    colorCount: session.level.colors,
    rng,
    campaign: true,
  });
  const need = (kind: string) =>
    session.level.goals.some((goal) => goal.kind === kind && session.goalValue(goal) < goal.count);
  // Цели выполнены — уровень идёт до конца ходов, и бот добирает задачи на звёзды
  const star = (kind: StarTaskKind) =>
    session.goalsDone &&
    session.level.stars.some(
      (task) => task.kind === kind && session.starTaskValue(task) < task.count,
    );
  // Камни бьются только взрывом, а взрывы дают объединения высоких уровней
  const wantsHighLevels =
    need('level3') ||
    need('level3color') ||
    need('megaBomb') ||
    need('rainbow') ||
    need('stone') ||
    star('level3');
  // Нужный цвет звёзд: ячейки 3 уровня этого цвета — цель
  const colors = session.level.goals.flatMap((goal) =>
    goal.kind === 'level3color' && session.goalValue(goal) < goal.count ? [goal.color] : [],
  );
  const iced = new Set<string>();
  const odds = need('gold') ? goldOdds(session) : 0;
  let value = (crownDistance(session.board) - crownDistance(board)) * botSkill.crownRow;

  const scoreStep = (step: ResolveStep) => {
    if (step.kind === 'clear') {
      value += step.points * (star('score') ? 0.5 : 0.05) + (step.items ?? 0) * 800;
      value += (step.stones ?? 0) * (need('stone') ? 120 : 15);
      // Сундук: сломанный — цель, снятое звено или открытый — шаг к ней
      value += (step.boxes ?? 0) * (need('box') ? 90 : 5);
      value += (step.chests?.length ?? 0) * (need('box') ? 50 : 3 + 60 * odds);
      value += (step.treasures ?? 0) * (need('gold') ? 120 : 0);
      // Удар по углю: слой снят; разбитая глыба — цель
      for (const hit of step.coal ?? []) value += need('coal') ? (hit.layers === 0 ? 400 : 70) : 5;
      for (const pos of step.cells) {
        const hits = session.ice[pos.row]?.[pos.col] ?? 0;
        if (hits > 0 && !iced.has(posKey(pos))) {
          iced.add(posKey(pos));
          // Последний удар ломает льдину — он ценнее, чем снятый слой
          // Золото видно после первого удара; до него — только надежда, что оно здесь
          const gold = unrevealedIce(session, pos)
            ? odds
            : session.iceStyle[pos.row]?.[pos.col] === 'gold'
              ? 1
              : 0;
          const worth = (need('ice') ? 60 : 0) + (need('gold') ? 80 * gold : 0);
          value += hits === 1 ? worth : worth / 2;
        }
      }
    }
    if (step.kind !== 'transform') return;
    for (const { cell } of step.placements) {
      if (cell?.kind === 'tile' && cell.level === 2) {
        value += need('level2') || star('level2') ? 70 : wantsHighLevels ? 20 : 2;
      }
      if (cell?.kind === 'tile' && cell.level === 3) {
        value += colors.includes(cell.color) ? 160 : wantsHighLevels ? 90 : 4;
      }
      if (cell?.kind === 'piece' && cell.type === 'megaBomb') value += need('megaBomb') ? 400 : 50;
      if (cell?.kind === 'piece' && cell.type === 'rainbow') value += need('rainbow') ? 400 : 50;
    }
  };
  steps.forEach(scoreStep);
  return value;
}

/** Клетки препятствий, которые ещё нужны целям уровня */
function goalTargets(session: LevelSession): Position[] {
  const need = (kind: string) =>
    session.level.goals.some((goal) => goal.kind === kind && session.goalValue(goal) < goal.count);
  return allPositions(session.board).filter((pos) => {
    const cell = getCell(session.board, pos);
    return (
      (need('ice') && (session.ice[pos.row]?.[pos.col] ?? 0) > 0) ||
      (need('gold') &&
        (session.ice[pos.row]?.[pos.col] ?? 0) > 0 &&
        (session.iceStyle[pos.row]?.[pos.col] === 'gold' || unrevealedIce(session, pos))) ||
      ((need('box') ||
        (need('gold') &&
          (closedChest(session.board, pos) || (cell?.kind === 'box' && cell.treasure === true)))) &&
        cell?.kind === 'box') ||
      (need('stone') && cell?.kind === 'stone') ||
      (need('coal') && cell?.kind === 'coal')
    );
  });
}

function shuffled<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

interface Pick {
  move: PlayerMove;
  value: number;
}

/** Ходы по порядку перебора: сначала рядом с коронами и оставшимися препятствиями цели */
function ordered(session: LevelSession, rng: Rng): PlayerMove[] {
  // Перемешиваем, чтобы отбор не предпочитал верх поля
  const all = shuffled(candidates(session), rng);
  // Человек замечает не все обмены на поле, а случайные несколько; спецфишки видны всегда
  // Дробное внимание: целая часть — всегда, дробная — с такой вероятностью ещё один обмен
  const whole = Math.floor(botSkill.attention);
  const limit = whole + (rng.int(1000) < (botSkill.attention - whole) * 1000 ? 1 : 0);
  const crowns = allPositions(session.board).filter(
    (pos) => getCell(session.board, pos)?.kind === 'item',
  );
  const targets = goalTargets(session);
  const distance = (move: PlayerMove) => {
    if (move.type !== 'swap') return Infinity;
    const { from, to } = move;
    if (crowns.some((pos) => Math.abs(pos.col - from.col) + Math.abs(pos.col - to.col) <= 2)) {
      return 0;
    }
    return Math.min(
      ...targets.map((pos) =>
        Math.min(
          Math.abs(pos.row - from.row) + Math.abs(pos.col - from.col),
          Math.abs(pos.row - to.row) + Math.abs(pos.col - to.col),
        ),
      ),
    );
  };
  // Отдельные предметы цели человек видит и ищет ходы рядом с ними. Лёд — тоже, когда его немного:
  // по всему полю льдины не высмотреть, а несколько штук (или последние) видны сразу
  const items =
    targets.length <= FOCUS_TARGETS
      ? targets
      : targets.filter((pos) => {
          const kind = getCell(session.board, pos)?.kind;
          return kind === 'box' || kind === 'coal' || kind === 'stone';
        });
  const nearItem = (move: PlayerMove) =>
    move.type === 'swap' &&
    (crowns.some(
      (pos) => Math.abs(pos.col - move.from.col) + Math.abs(pos.col - move.to.col) <= 2,
    ) ||
      items.some(
        (pos) =>
          Math.min(
            Math.abs(pos.row - move.from.row) + Math.abs(pos.col - move.from.col),
            Math.abs(pos.row - move.to.row) + Math.abs(pos.col - move.to.col),
          ) <= 1,
      ));
  // Под корону человек смотрит всегда: обмены в 1–3 клетках под ней (в её столбце или рядом)
  const rightUnder = (pos: Position) =>
    crowns.some(
      (crown) =>
        Math.abs(pos.col - crown.col) <= 1 &&
        pos.row > crown.row &&
        pos.row <= crown.row + CROWN_LOOK,
    );
  const seenUnderCrown = (move: PlayerMove) =>
    move.type === 'swap' &&
    rightUnder(move.from) &&
    rightUnder(move.to) &&
    (move.from.col === crowns.find((c) => Math.abs(c.col - move.from.col) <= 1)?.col ||
      move.to.col === crowns.find((c) => Math.abs(c.col - move.to.col) <= 1)?.col);
  let noticed = 0;
  let focused = 0;
  const moves = all.filter(
    (move) =>
      move.type !== 'swap' ||
      seenUnderCrown(move) ||
      noticed++ < limit ||
      (nearItem(move) && focused++ < botSkill.focus),
  );
  // Иначе отбор мог выбросить как раз их, и последняя цепь в углу ждала бы десятки ходов,
  // а человек бьёт в неё сразу
  const order = new Map(moves.map((move) => [move, distance(move)]));
  return moves.sort((x, y) => order.get(x)! - order.get(y)!);
}

/** Лучший ход на поле партии (уже после примеренного хода) — без следующего за ним */
function bestNext(session: LevelSession, rng: Rng): number {
  if (session.isOver) return 0;
  let best = 0;
  for (const move of ordered(session, rng).slice(0, MAX_NEXT)) {
    best = Math.max(best, moveValue(session, move, createRng(rng.int(2 ** 31))));
  }
  return best;
}

export function pickMove(session: LevelSession, bot: Bot, rng: Rng): Pick | null {
  if (bot === 'novice') {
    const moves = candidates(session);
    return moves.length > 0 ? { move: moves[rng.int(moves.length)]!, value: 0 } : null;
  }
  const weighed = weighMoves(session, rng);
  if (weighed.length === 0) return null;
  const chosen =
    botSkill.temperature > 0
      ? weighed[sampleIndex(choiceOdds(weighed, botSkill.temperature), rng)]!
      : weighed.reduce((best, pick) => (pick.total > best.total ? pick : best));
  // Ценность — самого хода: с ней сравнивается покупка, а она тоже примеряется без следующего
  return { move: chosen.move, value: chosen.value };
}

export interface WeighedMove extends Pick {
  /** Ценность хода вместе с лучшим следующим (вполовину веса) — по ней бот выбирает */
  total: number;
}

/**
 * Ходы, между которыми бот выбирает: из замеченных обменов лучшие TOP_FIRST, примеренные целиком,
 * с каскадами, и к каждому — лучший следующий ход. Дальше бот не смотрит, как и человек
 */
export function weighMoves(session: LevelSession, rng: Rng): WeighedMove[] {
  const moves = ordered(session, rng);
  if (moves.length === 0) return [];
  const first = moves
    .slice(0, MAX_CANDIDATES)
    .map((move) => ({ move, value: moveValue(session, move, createRng(rng.int(2 ** 31))) }))
    .sort((a, b) => b.value - a.value);
  return first.slice(0, TOP_FIRST).map((pick) => {
    const after = session.trial(pick.move, createRng(rng.int(2 ** 31)));
    return {
      ...pick,
      total: pick.value + NEXT_WEIGHT * bestNext(after, createRng(rng.int(2 ** 31))),
    };
  });
}

/**
 * Вероятности выбора (softmax с температурой): человек берёт не всегда лучший ход, а тем чаще,
 * чем он ценнее. Температура 0 — всегда лучший. Подбирается по ходам живых игроков (scripts/humanMoves.ts)
 */
export function choiceOdds(weighed: readonly WeighedMove[], temperature: number): number[] {
  const top = Math.max(...weighed.map((pick) => pick.total));
  if (temperature <= 0) {
    const best = weighed.findIndex((pick) => pick.total === top);
    return weighed.map((_, i) => (i === best ? 1 : 0));
  }
  const weights = weighed.map((pick) => Math.exp((pick.total - top) / temperature));
  const sum = weights.reduce((a, w) => a + w, 0);
  return weights.map((w) => w / sum);
}

function sampleIndex(odds: readonly number[], rng: Rng): number {
  let left = rng.int(1_000_000) / 1_000_000;
  for (let i = 0; i < odds.length; i++) {
    left -= odds[i]!;
    if (left < 0) return i;
  }
  return odds.length - 1;
}

type Purchase =
  | { kind: 'aim'; bonus: AimedBonus; at: Position; value: number }
  | { kind: 'rainbow'; color: ColorId; value: number };

/** Ценность бомбы или ракеты в клетке: примеряется на копии поля */
function aimValue(session: LevelSession, bonus: AimedBonus, at: Position, rng: Rng): number {
  const board = cloneBoard(session.board);
  setCell(board, at, aimedPiece(bonus));
  return moveValue(session, { type: 'fire', at }, createRng(rng.int(2 ** 31)), board);
}

/** Самая полезная покупка, которая по карману; манипулятор бот не применяет */
function bestPurchase(session: LevelSession, rng: Rng, onlyBombs = false): Purchase | null {
  const { board } = session;
  const cells = shuffled(
    allPositions(board).filter((pos) => isBonusTarget(board, pos)),
    rng,
  );
  const options: Purchase[] = [];
  const aim = (bonus: AimedBonus, at: Position) => {
    options.push({ kind: 'aim', bonus, at, value: aimValue(session, bonus, at, rng) });
  };
  if (session.canBuy('bomb')) {
    cells.slice(0, MAX_AIM_CELLS).forEach((at) => aim('bomb', at));
  }
  if (!onlyBombs && session.canBuy('rocket')) {
    // Ракета бьёт по всей строке: достаточно одной клетки в каждой
    const rows = new Set(cells.map((pos) => pos.row));
    rows.forEach((row) =>
      aim(
        'rocket',
        cells.find((pos) => pos.row === row)!,
      ),
    );
  }
  if (!onlyBombs && session.canBuy('rainbow')) {
    const colors = new Set(
      allPositions(board).flatMap((pos) => {
        const cell = getCell(board, pos);
        return isTile(cell) ? [cell.color] : [];
      }),
    );
    colors.forEach((color) => {
      const move: PlayerMove = { type: 'boughtRainbow', color };
      const value = moveValue(session, move, createRng(rng.int(2 ** 31)));
      options.push({ kind: 'rainbow', color, value });
    });
  }
  return options.reduce<Purchase | null>(
    (best, option) => (!best || option.value > best.value ? option : best),
    null,
  );
}

function applyPurchase(session: LevelSession, purchase: Purchase): PlayerMove | null {
  if (purchase.kind === 'rainbow') {
    return session.payBonus('rainbow') ? { type: 'boughtRainbow', color: purchase.color } : null;
  }
  return session.aimBonus(purchase.bonus, purchase.at) ? { type: 'fire', at: purchase.at } : null;
}

function finish(steps: Generator<ResolveStep, void, undefined>): void {
  let next = steps.next();
  while (!next.done) next = steps.next();
}

/**
 * bombs — замер «сколько бомб нужно»: опытный бот покупает только бомбы, не больше стольких
 * (лимит правил снят), звёзд без ограничения
 */
export function play(level: Level, seed: number, bot: Bot, wallet = 0, bombs?: number): GameResult {
  const session =
    bombs === undefined
      ? new LevelSession(seed, level, wallet)
      : new LevelSession(
          seed,
          level,
          1000,
          { bomb: bombs, rocket: 0, manipulator: 0, rainbow: 0 },
          true,
        );
  const rng = createRng(seed ^ 0x5bd1e995);
  const reached = level.goals.map((): number[] => []);
  const track: GameResult['track'] = { score: [], level2: [], level3: [], item: [] };
  let bought = 0;
  while (!session.isOver) {
    const pick = pickMove(session, bot, rng);
    // Покупка и есть ход, поэтому бот берёт её, когда она полезнее лучшего обычного хода
    const purchase =
      bot === 'buyer' || bombs !== undefined
        ? bestPurchase(session, rng, bombs !== undefined)
        : null;
    const purchased =
      purchase && purchase.value > (pick?.value ?? -Infinity)
        ? applyPurchase(session, purchase)
        : null;
    if (purchased) bought++;
    const move = purchased ?? pick?.move;
    if (!move) break;
    finish(session.play(move));
    session.shuffleIfStuck();
    track.score.push(session.score);
    track.level2.push(session.progress.level2);
    track.level3.push(session.progress.level3);
    track.item.push(session.progress.item);
    level.goals.forEach((goal, i) => {
      const line = reached[i]!;
      while (line.length < Math.min(session.goalCount(goal), goal.count)) {
        line.push(session.moves);
      }
    });
  }
  // Уровень кончился — спецфишки на поле срабатывают в финале, итог считается после него, как в игре
  finish(session.campaignFinale());
  const shares = level.goals.map((goal) => session.goalValue(goal) / goal.count);
  return {
    journal: session.journal,
    score: session.score,
    won: session.goalsDone,
    movesUsed: session.moves,
    reached,
    stars: session.stars,
    movesLeft: session.goalsDone ? session.movesLeft : 0,
    done: shares.reduce((sum, share) => sum + share, 0) / shares.length,
    track,
    bought,
    boughtBy: { ...session.stats.bought },
  };
}
