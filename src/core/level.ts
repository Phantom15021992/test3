import { createEmptyBoard, type Board } from './board';
import type { Rng } from './rng';
import { COAL_MAX_LAYERS, COAL_SIZE, ICE_HITS } from './config';

// Описание уровня и его проверка: уровни лежат в JSON, поэтому при загрузке им нельзя верить на слово.
//
// Поле уровня — строки из символов:
//   .  обычная клетка (заполнится случайной фишкой)
//   #  дыра: клетки нет, фишки пролетают сквозь неё
//   i  тонкий лёд: ломается с одного удара
//   J  крепкий лёд: целый → треснувший → нет (2 удара)
//   s  камень: падает, сдвинуть нельзя, разбить можно только взрывом
//   b  сундук: стоит на месте, бьётся взрывом и совпадением рядом: закрытый → открытый → нет
//   t  сундук с сокровищами: так же, сломанный засчитывается в цель gold
//   1, 2, 3  сундук в цепи из стольких звеньев (каждый удар снимает звено, потом — как b)
//   u, v, w  сундук с сокровищами в цепи из 1, 2, 3 звеньев
//   o  корона: её нужно опустить на дно
//   c  уголь: глыба 2×2 из этих символов; слоёв у глыб уровня — coalLayers (по умолчанию 9)
//   k  уголь с золотом: такая же глыба 2×2, последний слой — самородок; разбитая засчитывается и в цель gold

export type GoalKind =
  | 'level2'
  | 'level3'
  | 'megaBomb'
  | 'rainbow'
  | 'ice'
  | 'stone'
  | 'box'
  | 'item'
  | 'coal'
  | 'gold'
  | 'level3color';

export interface Goal {
  kind: GoalKind;
  count: number;
  /** Для level3color — какого цвета ячейки 3 уровня нужны (индекс в палитре уровня) */
  color?: number;
}

/** Дополнительные задачи: каждая выполненная даёт ещё одну звезду. score — очки за уровень;
 *  level2, level3 и item — считаются как одноимённые цели */
export type StarTaskKind = 'score' | 'level2' | 'level3' | 'item';

export interface StarTask {
  kind: StarTaskKind;
  count: number;
}

const STAR_TASK_KINDS: readonly StarTaskKind[] = ['score', 'level2', 'level3', 'item'];

export interface Level {
  id: number;
  title: string;
  /** Подсказка на старте: чему учит уровень */
  hint: string;
  layout: readonly string[];
  colors: number;
  moves: number;
  goals: readonly Goal[];
  stars: readonly StarTask[];
  /** Сколько слоёв у каждой глыбы угля: подбирается под сложность уровня */
  coalLayers?: number;
  /**
   * Сколько золота спрятать в случайные сундуки без сокровищ (b, 1–3): какие из них с золотом, решает seed
   * попытки, остальные — пустышки
   */
  hiddenGold?: number;
}

const GOAL_KINDS: readonly GoalKind[] = [
  'level2',
  'level3',
  'megaBomb',
  'rainbow',
  'ice',
  'stone',
  'box',
  'item',
  'coal',
  'gold',
  'level3color',
];
const STAR_TASKS = 2;
/** Уровней на этаже: номер уровня складывается из этажа и места на нём */
export const FLOOR_SIZE = 10;

/** Этаж уровня, с единицы */
export function floorOf(levelId: number): number {
  return Math.ceil(levelId / FLOOR_SIZE);
}

/** Сундуки в поле: символ → звенья цепи и сокровища */
const CHEST_SYMBOLS: Readonly<Record<string, { links?: number; treasure?: boolean }>> = {
  b: {},
  t: { treasure: true },
  1: { links: 1 },
  2: { links: 2 },
  3: { links: 3 },
  u: { links: 1, treasure: true },
  v: { links: 2, treasure: true },
  w: { links: 3, treasure: true },
};

export function boardTemplate(level: Level): Board {
  const board = createEmptyBoard(level.layout.length, level.layout[0]?.length ?? 0);
  level.layout.forEach((line, row) =>
    [...line].forEach((symbol, col) => {
      if (symbol === '#') board[row]![col] = { kind: 'hole' };
      if (symbol === 's') board[row]![col] = { kind: 'stone' };
      const chest = CHEST_SYMBOLS[symbol];
      if (chest) board[row]![col] = { kind: 'box', ...chest };
      if (symbol === 'o') board[row]![col] = { kind: 'item' };
    }),
  );
  const layers = level.coalLayers ?? COAL_MAX_LAYERS;
  for (const block of coalBlocks(level.layout)) {
    for (let row = block.row; row < block.row + COAL_SIZE; row++) {
      for (let col = block.col; col < block.col + COAL_SIZE; col++) {
        board[row]![col] = {
          kind: 'coal',
          top: block.row,
          left: block.col,
          layers,
          ...(block.gold && { gold: true }),
        };
      }
    }
  }
  return board;
}

/**
 * Глыбы угля в поле (левые верхние углы; gold — уголь с золотом, символ k); если символы угля не складываются
 * в отдельные квадраты 2×2 одного вида — исключение
 */
export function coalBlocks(
  layout: readonly string[],
): { row: number; col: number; gold?: boolean }[] {
  const taken = layout.map((line) => [...line].map(() => false));
  const blocks: { row: number; col: number; gold?: boolean }[] = [];
  layout.forEach((line, row) =>
    [...line].forEach((symbol, col) => {
      if ((symbol !== 'c' && symbol !== 'k') || taken[row]![col]) return;
      for (let r = row; r < row + COAL_SIZE; r++) {
        for (let c = col; c < col + COAL_SIZE; c++) {
          if (layout[r]?.[c] !== symbol || taken[r]![c])
            throw new Error('уголь — только квадраты 2×2');
          taken[r]![c] = true;
        }
      }
      blocks.push(symbol === 'k' ? { row, col, gold: true } : { row, col });
    }),
  );
  return blocks;
}

/** Клетки, где может спрятаться золото: сундуки без сокровищ */
function goldHideouts(level: Level): { row: number; col: number }[] {
  const spots: { row: number; col: number }[] = [];
  level.layout.forEach((line, row) =>
    [...line].forEach((symbol, col) => {
      if ('b123'.includes(symbol)) spots.push({ row, col });
    }),
  );
  return spots;
}

/**
 * Прячет hiddenGold уровня в случайные сундуки: сундук становится сундуком с сокровищами (снаружи такой же).
 * ГСЧ — свой, чтобы не менять поле попытки
 */
export function hideGold(level: Level, board: Board, rng: Rng): void {
  const spots = goldHideouts(level);
  for (let left = level.hiddenGold ?? 0; left > 0 && spots.length > 0; left--) {
    const [{ row, col }] = spots.splice(rng.int(spots.length), 1) as [{ row: number; col: number }];
    const cell = board[row]![col];
    if (cell?.kind === 'box') board[row]![col] = { ...cell, treasure: true };
  }
}

/** Вид льда: от него зависят картинка и сколько ударов он держит */
export type IceStyle = keyof typeof ICE_HITS;

const ICE_SYMBOLS: Readonly<Record<string, IceStyle>> = {
  i: 'classic',
  J: 'plain',
};

/** Сколько ударов держит лёд этого вида */
export function iceHits(style: IceStyle): number {
  return ICE_HITS[style];
}

/** Вид льда по клеткам; null — льда нет */
export function iceStyles(level: Level): (IceStyle | null)[][] {
  return level.layout.map((line) => [...line].map((symbol) => ICE_SYMBOLS[symbol] ?? null));
}

/**
 * Лёд — отдельный слой под фишками: он остаётся на месте, когда фишки падают и меняются.
 * Число в клетке — сколько ударов лёд ещё выдержит (0 — льда нет)
 */
export function iceTemplate(level: Level): number[][] {
  return iceStyles(level).map((line) => line.map((style) => (style ? iceHits(style) : 0)));
}

function countSymbol(level: Level, symbol: string): number {
  return level.layout.join('').split(symbol).length - 1;
}

/** Проверка уровня; при ошибке — исключение с понятным текстом: уровень нельзя выпускать */
export function parseLevel(value: unknown): Level {
  const level = value as Level;
  const fail = (text: string): never => {
    throw new Error(`Уровень ${level?.id}: ${text}`);
  };
  if (typeof level !== 'object' || level === null) fail('не объект');
  if (!Number.isInteger(level.id) || level.id < 1) fail('неверный номер');
  if (typeof level.title !== 'string' || typeof level.hint !== 'string') fail('нет подписей');
  if (!Number.isInteger(level.colors) || level.colors < 3 || level.colors > 7) fail('цвета 3–7');
  if (!Number.isInteger(level.moves) || level.moves < 1) fail('нет лимита ходов');

  if (!Array.isArray(level.layout) || level.layout.length === 0) fail('нет поля');
  const width = level.layout[0]?.length;
  if (level.layout.some((line) => line.length !== width)) fail('строки поля разной длины');
  // Этапа трещин и льда со слитками больше нет: лёд — тонкий (i) или крепкий (J)
  if ('iceCracks' in level) fail('iceCracks больше нет: у льда две прочности, i и J');
  if (level.layout.join('').replace(/[.#iJsobt123uvwck]/g, '') !== '')
    fail('неизвестный символ в поле');
  let coal = 0;
  let goldCoal = 0;
  try {
    const blocks = coalBlocks(level.layout);
    coal = blocks.length;
    goldCoal = blocks.filter((block) => block.gold).length;
  } catch {
    fail('уголь — только квадраты 2×2');
  }
  if (
    level.coalLayers !== undefined &&
    (!Number.isInteger(level.coalLayers) ||
      level.coalLayers < 1 ||
      level.coalLayers > COAL_MAX_LAYERS)
  ) {
    fail(`слоёв угля 1–${COAL_MAX_LAYERS}`);
  }

  const hidden = level.hiddenGold;
  if (
    hidden !== undefined &&
    (!Number.isInteger(hidden) || hidden < 1 || hidden > goldHideouts(level).length)
  ) {
    fail('hiddenGold — от 1 до числа сундуков без сокровищ');
  }

  if (!Array.isArray(level.goals) || level.goals.length === 0) fail('нет целей');
  for (const goal of level.goals) {
    if (!GOAL_KINDS.includes(goal.kind)) fail(`неизвестная цель ${goal.kind}`);
    if (!Number.isInteger(goal.count) || goal.count < 1) fail(`нет числа у цели ${goal.kind}`);
    const colored = goal.kind === 'level3color';
    if (colored !== (goal.color !== undefined)) fail(`цвет — только у цели level3color`);
    if (
      colored &&
      (!Number.isInteger(goal.color) || goal.color! < 0 || goal.color! >= level.colors)
    ) {
      fail(`цвет цели вне палитры уровня`);
    }
    const symbols = { ice: 'iJ', gold: 'tuvw', stone: 's', box: 'bt123uvw', item: 'o' }[
      goal.kind as string
    ];
    const available =
      goal.kind === 'coal'
        ? coal
        : [...(symbols ?? '')].reduce((sum, s) => sum + countSymbol(level, s), 0) +
          (goal.kind === 'gold' ? (hidden ?? 0) + goldCoal : 0);
    if ((symbols || goal.kind === 'coal') && available < goal.count) {
      fail(`цель ${goal.kind} больше, чем есть на поле`);
    }
  }
  if (!Array.isArray(level.stars) || level.stars.length !== STAR_TASKS) {
    fail(`нужно ${STAR_TASKS} дополнительные задачи`);
  }
  for (const task of level.stars) {
    if (!STAR_TASK_KINDS.includes(task.kind)) fail(`неизвестная задача ${task.kind}`);
    if (!Number.isInteger(task.count) || task.count < 1) fail(`нет числа у задачи ${task.kind}`);
  }
  return level;
}
