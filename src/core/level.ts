import { UNCOLORED, createEmptyBoard, type Board } from './board';
import { COAL_MAX_LAYERS, COAL_SIZE } from './config';

// Описание уровня и его проверка: уровни лежат в JSON, поэтому при загрузке им нельзя верить на слово.
//
// Поле уровня — строки из символов:
//   .  обычная клетка (заполнится случайной фишкой)
//   #  дыра: клетки нет, фишки пролетают сквозь неё
//   i  клетка со льдом
//   s  камень: падает, сдвинуть нельзя, разбить можно только взрывом
//   b  коробка: стоит на месте, ломается взрывом и совпадением рядом
//   o  корона: её нужно опустить на дно
//   1, 2, 3  фишка под цепью из стольких звеньев
//   c  уголь: глыба 4×4 из этих символов; слоёв у глыб уровня — coalLayers (по умолчанию 9)

export type GoalKind =
  | 'level2'
  | 'level3'
  | 'megaBomb'
  | 'rainbow'
  | 'ice'
  | 'stone'
  | 'box'
  | 'chain'
  | 'item'
  | 'coal';

export interface Goal {
  kind: GoalKind;
  count: number;
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
}

const GOAL_KINDS: readonly GoalKind[] = [
  'level2',
  'level3',
  'megaBomb',
  'rainbow',
  'ice',
  'stone',
  'box',
  'chain',
  'item',
  'coal',
];
const STAR_TASKS = 2;
/** Уровней на этаже: номер уровня складывается из этажа и места на нём */
export const FLOOR_SIZE = 10;

/** Этаж уровня, с единицы */
export function floorOf(levelId: number): number {
  return Math.ceil(levelId / FLOOR_SIZE);
}

export function boardTemplate(level: Level): Board {
  const board = createEmptyBoard(level.layout.length, level.layout[0]?.length ?? 0);
  level.layout.forEach((line, row) =>
    [...line].forEach((symbol, col) => {
      if (symbol === '#') board[row]![col] = { kind: 'hole' };
      if (symbol === 's') board[row]![col] = { kind: 'stone' };
      if (symbol === 'b') board[row]![col] = { kind: 'box' };
      if (/[123]/.test(symbol)) {
        board[row]![col] = { kind: 'tile', color: UNCOLORED, level: 1, chain: Number(symbol) };
      }
      if (symbol === 'o') board[row]![col] = { kind: 'item' };
    }),
  );
  const layers = level.coalLayers ?? COAL_MAX_LAYERS;
  for (const block of coalBlocks(level.layout)) {
    for (let row = block.row; row < block.row + COAL_SIZE; row++) {
      for (let col = block.col; col < block.col + COAL_SIZE; col++) {
        board[row]![col] = { kind: 'coal', top: block.row, left: block.col, layers };
      }
    }
  }
  return board;
}

/**
 * Глыбы угля в поле (левые верхние углы); если символы угля не складываются
 * в отдельные квадраты 4×4 — исключение
 */
export function coalBlocks(layout: readonly string[]): { row: number; col: number }[] {
  const taken = layout.map((line) => [...line].map(() => false));
  const blocks: { row: number; col: number }[] = [];
  layout.forEach((line, row) =>
    [...line].forEach((symbol, col) => {
      if (symbol !== 'c' || taken[row]![col]) return;
      for (let r = row; r < row + COAL_SIZE; r++) {
        for (let c = col; c < col + COAL_SIZE; c++) {
          if (layout[r]?.[c] !== 'c' || taken[r]![c])
            throw new Error('уголь — только квадраты 4×4');
          taken[r]![c] = true;
        }
      }
      blocks.push({ row, col });
    }),
  );
  return blocks;
}

/** Лёд — отдельный слой под фишками: он остаётся на месте, когда фишки падают и меняются */
export function iceTemplate(level: Level): boolean[][] {
  return level.layout.map((line) => [...line].map((symbol) => symbol === 'i'));
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
  if (level.layout.join('').replace(/[.#isob123c]/g, '') !== '') fail('неизвестный символ в поле');
  let coal = 0;
  try {
    coal = coalBlocks(level.layout).length;
  } catch {
    fail('уголь — только квадраты 4×4');
  }
  if (
    level.coalLayers !== undefined &&
    (!Number.isInteger(level.coalLayers) ||
      level.coalLayers < 1 ||
      level.coalLayers > COAL_MAX_LAYERS)
  ) {
    fail(`слоёв угля 1–${COAL_MAX_LAYERS}`);
  }

  if (!Array.isArray(level.goals) || level.goals.length === 0) fail('нет целей');
  for (const goal of level.goals) {
    if (!GOAL_KINDS.includes(goal.kind)) fail(`неизвестная цель ${goal.kind}`);
    if (!Number.isInteger(goal.count) || goal.count < 1) fail(`нет числа у цели ${goal.kind}`);
    const symbols = { ice: 'i', stone: 's', box: 'b', chain: '123', item: 'o' }[
      goal.kind as string
    ];
    const available =
      goal.kind === 'coal'
        ? coal
        : [...(symbols ?? '')].reduce((sum, s) => sum + countSymbol(level, s), 0);
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
