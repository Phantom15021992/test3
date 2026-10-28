// Модель поля. Координаты: row — сверху вниз, col — слева направо.

/** Индекс цвета в палитре уровня */
export type ColorId = number;

export type CellLevel = 1 | 2 | 3;

/** row — ракета убирает строку, col — столбец */
export type RocketDirection = 'row' | 'col';

/** Спецфишки, у которых есть цвет: участвуют в обычных совпадениях этого цвета */
export type TileSpecial = { type: 'rocket'; direction: RocketDirection } | { type: 'bomb' };

export interface Tile {
  kind: 'tile';
  color: ColorId;
  level: CellLevel;
  special?: TileSpecial;
}

/** Спецфишки без цвета: не участвуют в совпадениях, активируются тапом */
export type PieceType = 'rainbow' | 'manipulator' | 'megaBomb';

export interface Piece {
  kind: 'piece';
  type: PieceType;
}

/** Дыра — клетка, которой нет на поле; в неё ничего не падает */
export interface Hole {
  kind: 'hole';
}

/** null — пустая клетка, которую нужно заполнить */
export type Cell = Tile | Piece | Hole | null;

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

export function isPiece(cell: Cell | undefined): cell is Piece {
  return cell != null && cell.kind === 'piece';
}

/** Ракета, бомба, радуга, манипулятор или мега-бомба */
export function isSpecial(cell: Cell | undefined): boolean {
  return isPiece(cell) || (isTile(cell) && cell.special !== undefined);
}

/** Совпадают ли фишки: одинаковый цвет и одинаковый уровень */
export function sameKind(a: Cell | undefined, b: Cell | undefined): boolean {
  return isTile(a) && isTile(b) && a.color === b.color && a.level === b.level;
}

export function samePos(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

export function posKey({ row, col }: Position): string {
  return `${row},${col}`;
}

export function createEmptyBoard(rows: number, cols: number): Board {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, (): Cell => null));
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell === null ? null : { ...cell })));
}

export function setCell(board: Board, { row, col }: Position, cell: Cell): void {
  const line = board[row];
  if (!line || col < 0 || col >= line.length) throw new Error('Клетка за пределами поля');
  line[col] = cell;
}

/** Все клетки поля, кроме дыр */
export function allPositions(board: Board): Position[] {
  return board.flatMap((line, row) =>
    line.flatMap((cell, col) => (cell?.kind === 'hole' ? [] : [{ row, col }])),
  );
}
