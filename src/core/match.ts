import {
  getCell,
  isTile,
  sameKind,
  type Board,
  type CellLevel,
  type ColorId,
  type Position,
} from './board';

// Поиск совпадений и определение их формы.
//
// Совпадение строится из «единиц»: линий 3+ по горизонтали/вертикали и (только для 1 уровня)
// квадратов 2×2. Единицы с общими клетками сливаются в одну группу.

/** Форма группы из фишек 1 уровня — определяет, что она даёт */
export type Level1Shape = 'line3' | 'line4' | 'line5' | 'lt' | 'square';

/** Размер группы ячеек 2–3 уровня; группы из 6+ считаются как 5 */
export type MergedGroupSize = 3 | 4 | 5;

export type MatchGroup =
  | { level: 1; color: ColorId; cells: Position[]; shape: Level1Shape }
  | { level: 2 | 3; color: ColorId; cells: Position[]; size: MergedGroupSize };

interface Unit {
  cells: Position[];
  kind: 'run' | 'square';
}

export function findMatches(board: Board): MatchGroup[] {
  const units = [...findRuns(board), ...findSquares(board)];
  return groupUnits(units).map((group) => classify(board, group));
}

function findRuns(board: Board): Unit[] {
  const runs: Unit[] = [];
  const rows = board.length;
  const cols = board[0]?.length ?? 0;

  const scan = (
    lineCount: number,
    lineLength: number,
    at: (line: number, i: number) => Position,
  ) => {
    for (let line = 0; line < lineCount; line++) {
      let start = 0;
      for (let i = 1; i <= lineLength; i++) {
        const continues =
          i < lineLength && sameKind(getCell(board, at(line, start)), getCell(board, at(line, i)));
        if (continues) continue;
        if (i - start >= 3) {
          const cells: Position[] = [];
          for (let k = start; k < i; k++) cells.push(at(line, k));
          runs.push({ cells, kind: 'run' });
        }
        start = i;
      }
    }
  };

  scan(rows, cols, (row, col) => ({ row, col }));
  scan(cols, rows, (col, row) => ({ row, col }));
  return runs;
}

function findSquares(board: Board): Unit[] {
  const squares: Unit[] = [];
  for (let row = 0; row + 1 < board.length; row++) {
    const cols = board[row]?.length ?? 0;
    for (let col = 0; col + 1 < cols; col++) {
      const cells = [
        { row, col },
        { row, col: col + 1 },
        { row: row + 1, col },
        { row: row + 1, col: col + 1 },
      ];
      const first = getCell(board, cells[0]!);
      // Квадрат даёт манипулятор, а спецфишки создаются только из 1 уровня
      if (!isTile(first) || first.level !== 1) continue;
      if (cells.every((pos) => sameKind(first, getCell(board, pos)))) {
        squares.push({ cells, kind: 'square' });
      }
    }
  }
  return squares;
}

/** Сливает единицы с общими клетками (union-find) */
function groupUnits(units: Unit[]): Unit[][] {
  const parent = units.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };

  const ownerByCell = new Map<string, number>();
  units.forEach((unit, i) => {
    for (const pos of unit.cells) {
      const key = `${pos.row},${pos.col}`;
      const owner = ownerByCell.get(key);
      if (owner === undefined) ownerByCell.set(key, i);
      else parent[find(i)] = find(owner);
    }
  });

  const groups = new Map<number, Unit[]>();
  units.forEach((unit, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), unit]);
  });
  return [...groups.values()];
}

function classify(board: Board, units: Unit[]): MatchGroup {
  const cells = uniqueCells(units.flatMap((unit) => unit.cells));
  const tile = getCell(board, cells[0]!);
  if (!isTile(tile)) throw new Error('Группа совпадения без фишки');

  if (tile.level !== 1) {
    const size = Math.min(cells.length, 5) as MergedGroupSize;
    return { level: tile.level as Exclude<CellLevel, 1>, color: tile.color, cells, size };
  }

  return { level: 1, color: tile.color, cells, shape: level1Shape(units, cells.length) };
}

function level1Shape(units: Unit[], cellCount: number): Level1Shape {
  // Квадрат важнее любой другой фигуры
  if (units.some((unit) => unit.kind === 'square')) return 'square';

  if (units.length === 1) {
    const length = units[0]!.cells.length;
    if (length === 3) return 'line3';
    if (length === 4) return 'line4';
    return 'line5';
  }

  // Пересекающиеся линии: обычная L/T из 5 фишек — бомба, с длинным лучом — как 5 в ряд
  return cellCount === 5 ? 'lt' : 'line5';
}

function uniqueCells(cells: Position[]): Position[] {
  const seen = new Set<string>();
  return cells.filter((pos) => {
    const key = `${pos.row},${pos.col}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
