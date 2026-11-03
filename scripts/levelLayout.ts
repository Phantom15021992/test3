// Размер целей уровня для подгонки сложности: цели растут или уменьшаются, а препятствия на поле
// добавляются или убираются так, чтобы их было ровно столько, сколько требует цель.
//
// Новые препятствия ставятся по правилам кампании: лёд — только в толстых местах поля, цепи — не ближе
// 3 клеток друг от друга и по одной в строке, коробки и цепи — не на дне столбца, если там нужна корона.
// Ставим снизу вверх, парами зеркальных клеток, чтобы поле осталось симметричным.

import type { Goal } from '../src/core/level';

type Grid = string[][];

interface Cell {
  row: number;
  col: number;
}

const LAYERS: Partial<Record<Goal['kind'], string>> = { ice: 'i', box: 'b' };
/** Сколько звеньев бывает на одной цепи */
const MAX_LINKS = 3;

export interface SizedLevel {
  layout: string[];
  goals: Goal[];
}

/** Цели в scale раз больше (меньше 1 — меньше); препятствий на поле — ровно по цели */
export function resizeLevel(
  layout: readonly string[],
  goals: readonly Goal[],
  scale: number,
): SizedLevel {
  const grid = layout.map((line) => [...line]);
  const sized = goals.map((goal): Goal => {
    const layer = LAYERS[goal.kind];
    if (layer) return { kind: goal.kind, count: resizeLayer(grid, layer, goal.count, scale) };
    if (goal.kind === 'chain') return { kind: 'chain', count: resizeChains(grid, scale) };
    if (goal.kind === 'item' || goal.kind === 'stone') return goal;
    return { kind: goal.kind, count: Math.max(1, Math.round(goal.count * scale)) };
  });
  return { layout: grid.map((line) => line.join('')), goals: sized };
}

const cellsOf = (grid: Grid, symbols: string): Cell[] =>
  grid.flatMap((line, row) =>
    line.flatMap((symbol, col) => (symbols.includes(symbol) ? [{ row, col }] : [])),
  );

const mirror = (grid: Grid, col: number) => grid[0]!.length - 1 - col;

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
    symbol === 'i' ? thick(grid, cell) : !floor.has(`${cell.row},${cell.col}`);
  let placed = cellsOf(grid, symbol).length;
  while (placed > target) {
    // Убираем сверху: снизу препятствия мешают сильнее, а ставим мы их тоже снизу
    const extra = placed - target;
    const list = cellsOf(grid, symbol);
    const pair = list.find(
      ({ row, col }) => col !== mirror(grid, col) && grid[row]![mirror(grid, col)] === symbol,
    );
    if (extra >= 2 && pair) {
      grid[pair.row]![pair.col] = '.';
      grid[pair.row]![mirror(grid, pair.col)] = '.';
      placed -= 2;
    } else {
      const { row, col } = list[0]!;
      grid[row]![col] = '.';
      placed -= 1;
    }
  }
  while (placed < target) {
    const free = freeCells(grid, allowed);
    if (free.length === 0) break;
    const pair = free.find(
      ({ row, col }) =>
        col !== mirror(grid, col) && free.some((c) => c.row === row && c.col === mirror(grid, col)),
    );
    if (target - placed >= 2 && pair) {
      grid[pair.row]![pair.col] = symbol;
      grid[pair.row]![mirror(grid, pair.col)] = symbol;
      placed += 2;
    } else {
      const { row, col } = free[0]!;
      grid[row]![col] = symbol;
      placed += 1;
    }
  }
  return placed;
}

/**
 * Цепи растут по звеньям: сначала новые цепи по одному звену, пока есть место, потом звенья на
 * уже стоящих (до трёх). Цель считает фишки под цепями, поэтому возвращается число цепей.
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
 * становится легче, а цели не меняются. На дно столбца корону не ставим — она засчиталась бы сразу,
 * и встаёт она только на свободную клетку: если та занята, корона остаётся выше.
 */
export function lowerCrowns(layout: readonly string[], rows: number): string[] {
  const grid = layout.map((line) => [...line]);
  for (const crown of cellsOf(grid, 'o')) {
    const below = grid
      .map((line, row) => ({ row, symbol: line[crown.col]! }))
      .filter(({ row, symbol }) => row > crown.row && symbol !== '#')
      .slice(0, -1);
    let target = Math.min(rows, below.length) - 1;
    while (target >= 0 && below[target]!.symbol !== '.') target--;
    if (target < 0) continue;
    grid[crown.row]![crown.col] = '.';
    grid[below[target]!.row]![crown.col] = 'o';
  }
  return grid.map((line) => line.join(''));
}
