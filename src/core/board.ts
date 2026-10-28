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

export function createEmptyBoard(rows: number, cols: number): Board {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, (): Cell => null));
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell === null ? null : { ...cell })));
}
