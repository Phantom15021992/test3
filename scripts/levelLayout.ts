// Размер целей уровня для подгонки сложности: цели растут или уменьшаются, а препятствия на поле
// добавляются или убираются так, чтобы их было ровно столько, сколько требует цель.
//
// Новые препятствия ставятся по правилам кампании: лёд — только в толстых местах поля, сундуки в цепях —
// не ближе 3 клеток друг от друга и по одному в строке, сундуки — не на дне столбца, если там нужна корона.
// Ставим снизу вверх, парами зеркальных клеток, чтобы поле осталось симметричным.

import { COAL_MAX_LAYERS } from '../src/core/config';
import type { Goal } from '../src/core/level';
import { createRng } from '../src/core/rng';

/**
 * Цвета задания на 5, 9 и 10 местах этажа — одни на весь этаж (по просьбе владельца): один цвет или два, не три.
 * Зависят только от номера этажа, поэтому генератор и правка уже готовых уровней дают одно и то же
 */
export function floorColors(floor: number): number[] {
  const rng = createRng(floor * 7919 + 13);
  const count = 1 + rng.int(2);
  const palette = [0, 1, 2];
  for (let i = palette.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [palette[i], palette[j]] = [palette[j]!, palette[i]!];
  }
  return palette.slice(0, count);
}

type Grid = string[][];

interface Cell {
  row: number;
  col: number;
}

/** Весь лёд поля: тонкий и крепкий */
const ICE = 'iJ';
/** Золото на виду: сундуки с сокровищами (уголь с золотом считается глыбами — goldCoal) */
const GOLD = 'tuvw';
/** Все сундуки поля: простые, с сокровищами, в цепях */
const CHESTS = 'bt123uvw';
/** Где прячется спрятанное золото: сундуки без сокровищ */
const HIDEOUTS = 'b123';
/** Сколько звеньев бывает на одной цепи */
const MAX_LINKS = 3;

export interface SizedLevel {
  layout: string[];
  goals: Goal[];
  /** Слои угля — рычаг сложности уровней с углём */
  coalLayers?: number;
  /** Сколько золота спрятано в случайных льдинах и сундуках */
  hiddenGold?: number;
}

/** Что ещё нужно знать, чтобы поменять размер целей */
export interface ResizeOptions {
  coalLayers?: number;
  hiddenGold?: number;
  /** Цели, которые не меняются: например, лёд 30–40 на первом этаже — там рычаг остальные цели */
  fixed?: readonly Goal['kind'][];
}

/** Цели в scale раз больше (меньше 1 — меньше); препятствий на поле — ровно по цели */
export function resizeLevel(
  layout: readonly string[],
  goals: readonly Goal[],
  scale: number,
  { coalLayers, hiddenGold, fixed = [] }: ResizeOptions = {},
): SizedLevel {
  const grid = layout.map((line) => [...line]);
  const has = (kind: Goal['kind']) =>
    goals.some((goal) => goal.kind === kind) && !fixed.includes(kind);
  // Сначала меняется поле, потом считаются цели: лёд и сундуки со слитками входят в две цели сразу
  if (has('gold')) resizeGold(grid, scale, hiddenGold !== undefined);
  if (has('ice')) resizeIce(grid, scale);
  if (has('box')) resizeChests(grid, scale);
  // Спрятанное золото — в той же доле, но не больше, чем есть льдин 2 уровня и сундуков без сокровищ
  const hidden =
    hiddenGold === undefined
      ? undefined
      : Math.min(
          cellsOf(grid, HIDEOUTS).length,
          has('gold') ? Math.max(1, Math.round(hiddenGold * scale)) : hiddenGold,
        );
  const sized = goals.map((goal): Goal => {
    if (goal.kind === 'ice') return { kind: 'ice', count: cellsOf(grid, ICE).length };
    if (goal.kind === 'box') return { kind: 'box', count: cellsOf(grid, CHESTS).length };
    if (goal.kind === 'gold') {
      return { kind: 'gold', count: cellsOf(grid, GOLD).length + (hidden ?? 0) + goldCoal(grid) };
    }
    // Камни — помеха, короны и уголь меняются не числом: у короны — высота, у угля — слои
    if (['item', 'stone', 'coal'].includes(goal.kind) || fixed.includes(goal.kind)) return goal;
    return { ...goal, count: Math.max(1, Math.round(goal.count * scale)) };
  });
  const result: SizedLevel = { layout: grid.map((line) => line.join('')), goals: sized };
  if (hidden !== undefined) result.hiddenGold = hidden;
  // Слои угля — рычаг и цели «уголь», и цели «золото», когда золото в угле
  const coalGoal = has('coal') || (has('gold') && goldCoal(grid) > 0);
  if (coalLayers !== undefined && coalGoal) {
    result.coalLayers = Math.min(COAL_MAX_LAYERS, Math.max(1, Math.round(coalLayers * scale)));
  }
  return result;
}

/** Лёд: меняется лёд того вида, что уже на поле (2 уровня или обычный) */
function resizeIce(grid: Grid, scale: number): void {
  const symbol = cellsOf(grid, 'J').length > 0 ? 'J' : 'i';
  const count = cellsOf(grid, symbol).length;
  if (count > 0) resizeLayer(grid, symbol, count, scale);
}

/** Глыбы угля с золотом: клеток k вчетверо больше, чем глыб */
const goldCoal = (grid: Grid) => cellsOf(grid, 'k').length / 4;

/**
 * Золото: сундуки с сокровищами (без цепей) меняются в своей доле, со спрятанным золотом — и простые
 * сундуки, где оно прячется. Уголь с золотом числом не меняется — у него, как у всего угля, меняются слои
 */
function resizeGold(grid: Grid, scale: number, hidden: boolean): void {
  for (const symbol of hidden ? ['t', 'b'] : ['t']) {
    const count = cellsOf(grid, symbol).length;
    if (count > 0) resizeLayer(grid, symbol, count, scale);
  }
}

const cellsOf = (grid: Grid, symbols: string): Cell[] =>
  grid.flatMap((line, row) =>
    line.flatMap((symbol, col) => (symbols.includes(symbol) ? [{ row, col }] : [])),
  );

/**
 * Симметричная клетка (по просьбе владельца уровни — симметричные): зеркально слева направо, если так
 * стоят дыры поля; у букв S и Z — поворот на 180°, у E и C — отражение сверху вниз; у прочих — всё равно зеркало
 */
export function symmetryOf(grid: readonly (readonly string[] | string)[]): (cell: Cell) => Cell {
  const rows = grid.length;
  const cols = grid[0]!.length;
  const hole = (r: number, c: number) => grid[r]![c] === '#';
  const every = (image: (cell: Cell) => Cell) =>
    grid.every((_, r) =>
      Array.from({ length: cols }, (_, c) => c).every((c) => {
        const { row, col } = image({ row: r, col: c });
        return hole(r, c) === hole(row, col);
      }),
    );
  const lr = ({ row, col }: Cell): Cell => ({ row, col: cols - 1 - col });
  const rot = ({ row, col }: Cell): Cell => ({ row: rows - 1 - row, col: cols - 1 - col });
  if (every(lr)) return lr;
  if (every(rot)) return rot;
  // У букв E и C ось — горизонтальная: отражение сверху вниз
  const tb = ({ row, col }: Cell): Cell => ({ row: rows - 1 - row, col });
  return every(tb) ? tb : lr;
}

const same = (a: Cell, b: Cell) => a.row === b.row && a.col === b.col;

/** Клетки, куда падает корона: самая нижняя клетка каждого столбца, если на поле есть короны */
function crownFloor(grid: Grid): Set<string> {
  const floor = new Set<string>();
  if (cellsOf(grid, 'o').length === 0) return floor;
  for (let col = 0; col < grid[0]!.length; col++) {
    for (let row = grid.length - 1; row >= 0; row--) {
      if (grid[row]![col] === '#') continue;
      floor.add(`${row},${col}`);
      break;
    }
  }
  return floor;
}

/** Клетка входит в квадрат 3×3 без дыр: лёд в тонких просветах не кладётся */
function thick(grid: Grid, { row, col }: Cell): boolean {
  const offsets = [0, 1, 2];
  const solid = (top: number, left: number) =>
    offsets.every((i) => offsets.every((j) => (grid[top + i]?.[left + j] ?? '#') !== '#'));
  return offsets.some((i) => offsets.some((j) => solid(row - i, col - j)));
}

/**
 * Клетка не на краю поля: со всех четырёх сторон клетки. В углу и у края совпадений мало: лёд и сундук
 * там почти не добить
 */
function inner(grid: Grid, { row, col }: Cell): boolean {
  const sides = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const;
  return sides.every(([dr, dc]) => (grid[row + dr]?.[col + dc] ?? '#') !== '#');
}

/** Свободные клетки снизу вверх, в строке — от середины к краям */
function freeCells(grid: Grid, allowed: (cell: Cell) => boolean): Cell[] {
  const width = grid[0]!.length;
  return cellsOf(grid, '.')
    .filter(allowed)
    .sort(
      (a, b) =>
        b.row - a.row ||
        Math.abs(2 * a.col - width + 1) - Math.abs(2 * b.col - width + 1) ||
        a.col - b.col,
    );
}

function resizeLayer(grid: Grid, symbol: string, count: number, scale: number): number {
  const target = Math.max(1, Math.round(count * scale));
  const floor = crownFloor(grid);
  const allowed = (cell: Cell) =>
    inner(grid, cell) &&
    ('iJg'.includes(symbol) ? thick(grid, cell) : !floor.has(`${cell.row},${cell.col}`));
  // Поле держится симметричным: препятствие ставится и убирается вместе со своим отражением. Число может
  // разойтись с целью на одно — цель потом считается по полю
  const image = symmetryOf(grid);
  const at = (cell: Cell) => grid[cell.row]![cell.col];
  const set = (cell: Cell, value: string) => (grid[cell.row]![cell.col] = value);
  let placed = cellsOf(grid, symbol).length;
  while (placed > target) {
    // Убираем сверху: снизу препятствия мешают сильнее, а ставим мы их тоже снизу. Сначала — без пары
    const list = cellsOf(grid, symbol);
    const lonely = list.find((cell) => at(image(cell)) !== symbol || same(image(cell), cell));
    const extra = placed - target;
    if (lonely) {
      set(lonely, '.');
      placed -= 1;
    } else if (extra >= 2) {
      set(image(list[0]!), '.');
      set(list[0]!, '.');
      placed -= 2;
    } else break;
  }
  while (placed < target) {
    const free = freeCells(grid, allowed);
    if (free.length === 0) break;
    const freeAt = (cell: Cell) => free.some((c) => same(c, cell));
    // Сначала — отражение уже стоящего, потом пара свободных клеток, потом клетка на оси
    const missing = free.find((cell) => at(image(cell)) === symbol && !same(image(cell), cell));
    const pair = free.find((cell) => !same(image(cell), cell) && freeAt(image(cell)));
    const axis = free.find((cell) => same(image(cell), cell));
    const left = target - placed;
    if (missing) {
      set(missing, symbol);
      placed += 1;
    } else if (left === 1 && axis) {
      set(axis, symbol);
      placed += 1;
    } else if (pair) {
      set(pair, symbol);
      set(image(pair), symbol);
      placed += 2;
    } else {
      set(free[0]!, symbol);
      placed += 1;
    }
  }
  return placed;
}

/** Сундуки: простые и в цепях меняются каждые в своей доле */
function resizeChests(grid: Grid, scale: number): void {
  const plain = cellsOf(grid, 'b').length;
  if (plain > 0) resizeLayer(grid, 'b', plain, scale);
  if (cellsOf(grid, '123').length > 0) resizeChains(grid, scale);
}

/**
 * Цепи растут по звеньям: сначала новые цепи по одному звену, пока есть место, потом звенья на
 * уже стоящих (до трёх). Возвращается число сундуков в цепях.
 */
function resizeChains(grid: Grid, scale: number): number {
  const links = () => cellsOf(grid, '123').reduce((sum, c) => sum + Number(grid[c.row]![c.col]), 0);
  const target = Math.max(1, Math.round(links() * scale));
  const floor = crownFloor(grid);
  while (links() > target) {
    const strongest = cellsOf(grid, '123').sort(
      (a, b) => Number(grid[b.row]![b.col]) - Number(grid[a.row]![a.col]) || a.row - b.row,
    )[0]!;
    const left = Number(grid[strongest.row]![strongest.col]) - 1;
    grid[strongest.row]![strongest.col] = left > 0 ? String(left) : '.';
  }
  while (links() < target) {
    const chains = cellsOf(grid, '123');
    const [free] = freeCells(
      grid,
      (cell) =>
        !floor.has(`${cell.row},${cell.col}`) &&
        inner(grid, cell) &&
        chains.every(
          (c) =>
            c.row !== cell.row &&
            Math.max(Math.abs(c.row - cell.row), Math.abs(c.col - cell.col)) >= 3,
        ),
    );
    if (free) {
      grid[free.row]![free.col] = '1';
      continue;
    }
    const weakest = chains
      .filter((c) => Number(grid[c.row]![c.col]) < MAX_LINKS)
      .sort(
        (a, b) => Number(grid[a.row]![a.col]) - Number(grid[b.row]![b.col]) || b.row - a.row,
      )[0];
    if (!weakest) break;
    grid[weakest.row]![weakest.col] = String(Number(grid[weakest.row]![weakest.col]) + 1);
  }
  return cellsOf(grid, '123').length;
}

/**
 * Короны опускаются на rows клеток своего столбца (дыры не клетки): так уровень с коронами
 * становится легче, а цели не меняются. Ниже середины поля корону не ставим: снизу её доводят
 * за пару ходов. Встаёт она только на свободную клетку: если та занята, корона остаётся выше.
 */
/** Самая низкая строка, где может стоять корона: середина поля */
export function middleRow(grid: readonly (readonly string[] | string)[]): number {
  return Math.floor((grid.length - 1) / 2);
}

/**
 * Короны — на самый верх своего столбца (до ближайшей дыры сверху, на свободную клетку): с этой высоты
 * подгонщик опускает их, пока уровень не уложится в задуманные ходы. Иначе прошлая подгонка, опустившая
 * корону, не дала бы сделать уровень труднее
 */
export function raiseCrowns(layout: readonly string[]): string[] {
  const grid = layout.map((line) => [...line]);
  for (let row = 0; row < grid.length; row++) {
    grid[row]!.forEach((symbol, col) => {
      if (symbol !== 'o') return;
      let top = row;
      // Над дырой или углём корона застряла бы: выше них не поднимаем
      for (let r = row - 1; r >= 0 && !['#', 'c', 'k'].includes(grid[r]![col]!); r--) {
        if (grid[r]![col] === '.') top = r;
      }
      if (top === row) return;
      grid[row]![col] = '.';
      grid[top]![col] = 'o';
    });
  }
  return grid.map((line) => line.join(''));
}

/** Сколько клеток поля минимум под короной в её столбце: корона стоит на 4-й строке от дна или выше */
export const CROWN_MIN_BELOW = 3;

export function lowerCrowns(layout: readonly string[], rows: number): string[] {
  const grid = layout.map((line) => [...line]);
  for (const crown of cellsOf(grid, 'o')) {
    const below = grid
      .map((line, row) => ({ row, symbol: line[crown.col]! }))
      .filter(({ row, symbol }) => row > crown.row && row <= middleRow(grid) && symbol !== '#');
    // Ниже 4-й клетки от дна корону не ставим: у дна её доводят за ход-два, а на дне она засчиталась бы сразу
    const cellsBelow = (row: number) =>
      grid.filter((line, r) => r > row && line[crown.col] !== '#').length;
    let target = Math.min(rows, below.length) - 1;
    while (
      target >= 0 &&
      (below[target]!.symbol !== '.' || cellsBelow(below[target]!.row) < CROWN_MIN_BELOW)
    )
      target--;
    if (target < 0) continue;
    grid[crown.row]![crown.col] = '.';
    grid[below[target]!.row]![crown.col] = 'o';
  }
  return grid.map((line) => line.join(''));
}

/**
 * Генератор новых этажей (scripts/generateFloors.ts): поставить на поле count препятствий symbol по тем же
 * правилам, что и подгонка (лёд — только в толстых местах, сундуки — не на дне под коронами, не на краю)
 */
export function placeLayer(layout: readonly string[], symbol: string, count: number): string[] {
  const grid = layout.map((line) => [...line]);
  resizeLayer(grid, symbol, 1, count);
  return grid.map((line) => line.join(''));
}

/** Сундуки в цепях: первый ставится на свободную внутреннюю клетку, остальные — по правилам цепей */
export function placeChains(layout: readonly string[], links: number): string[] {
  const grid = layout.map((line) => [...line]);
  const floor = crownFloor(grid);
  const [first] = freeCells(
    grid,
    (cell) => inner(grid, cell) && !floor.has(`${cell.row},${cell.col}`),
  );
  if (!first) return [...layout];
  grid[first.row]![first.col] = '1';
  resizeChains(grid, links);
  return grid.map((line) => line.join(''));
}
