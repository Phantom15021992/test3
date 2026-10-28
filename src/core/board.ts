// Модель поля. Координаты: row — сверху вниз, col — слева направо.

/** Индекс цвета в палитре уровня */
export type ColorId = number;

export type CellLevel = 1 | 2 | 3;

export interface Tile {
  kind: 'tile';
  color: ColorId;
  level: CellLevel;
}

/** Дыра — клетка, которой нет на поле; в неё ничего не падает */
export interface Hole {
  kind: 'hole';
}

/** null — пустая клетка, которую нужно заполнить */
export type Cell = Tile | Hole | null;

export type Board = Cell[][];

export interface Position {
  row: number;
  col: number;
}

export function getCell(board: Board, pos: Position): Cell | undefined {
  return board[pos.row]?.[pos.col];
}

export function isTile(cell: Cell | undefined): cell is Tile {
  return cell != null && cell.kind === 'tile';
}

/** Совпадают ли фишки: одинаковый цвет и одинаковый уровень */
export function sameKind(a: Cell | undefined, b: Cell | undefined): boolean {
  return isTile(a) && isTile(b) && a.color === b.color && a.level === b.level;
}

export function createEmptyBoard(rows: number, cols: number): Board {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, (): Cell => null));
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell === null ? null : { ...cell })));
}
