import { createEmptyBoard, type Board } from './board';

// Описание уровня и его проверка: уровни лежат в JSON, поэтому при загрузке им нельзя верить на слово.
//
// Поле уровня — строки из символов:
//   .  обычная клетка (заполнится случайной фишкой)
//   #  дыра: клетки нет, фишки пролетают сквозь неё
//   i  клетка со льдом
//   s  камень: не двигается, фишки пролетают сквозь него
//   o  предмет: его нужно опустить на дно

export type GoalKind = 'level2' | 'level3' | 'megaBomb' | 'rainbow' | 'ice' | 'stone' | 'item';

export interface Goal {
  kind: GoalKind;
  count: number;
}

/** Дополнительные задачи: каждая выполненная даёт ещё одну звезду */
export type StarTask =
  { kind: 'movesLeft'; count: number } | { kind: 'noBuy' } | { kind: 'level3'; count: number };

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
}

const GOAL_KINDS: readonly GoalKind[] = [
  'level2',
  'level3',
  'megaBomb',
  'rainbow',
  'ice',
  'stone',
  'item',
];
const STAR_TASKS = 2;

export function boardTemplate(level: Level): Board {
  const board = createEmptyBoard(level.layout.length, level.layout[0]?.length ?? 0);
  level.layout.forEach((line, row) =>
    [...line].forEach((symbol, col) => {
      if (symbol === '#') board[row]![col] = { kind: 'hole' };
      if (symbol === 's') board[row]![col] = { kind: 'stone' };
      if (symbol === 'o') board[row]![col] = { kind: 'item' };
    }),
  );
  return board;
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
  if (level.layout.join('').replace(/[.#iso]/g, '') !== '') fail('неизвестный символ в поле');

  if (!Array.isArray(level.goals) || level.goals.length === 0) fail('нет целей');
  for (const goal of level.goals) {
    if (!GOAL_KINDS.includes(goal.kind)) fail(`неизвестная цель ${goal.kind}`);
    if (!Number.isInteger(goal.count) || goal.count < 1) fail(`нет числа у цели ${goal.kind}`);
    const available = { ice: 'i', stone: 's', item: 'o' }[goal.kind as string];
    if (available && countSymbol(level, available) < goal.count) {
      fail(`цель ${goal.kind} больше, чем есть на поле`);
    }
  }
  if (!Array.isArray(level.stars) || level.stars.length !== STAR_TASKS) {
    fail(`нужно ${STAR_TASKS} дополнительные задачи`);
  }
  return level;
}
