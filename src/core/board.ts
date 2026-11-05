// Модель поля. Координаты: row — сверху вниз, col — слева направо.

/** Индекс цвета в палитре уровня */
export type ColorId = number;

export type CellLevel = 1 | 2 | 3;

/** row — ракета убирает строку, col — столбец */
export type RocketDirection = 'row' | 'col';

export interface Tile {
  kind: 'tile';
  color: ColorId;
  level: CellLevel;
}

/** Спецфишки. У всех нет цвета, в совпадениях они не участвуют */
export type Piece =
  | { kind: 'piece'; type: 'rocket'; direction: RocketDirection }
  | { kind: 'piece'; type: 'bomb' | 'rainbow' | 'manipulator' | 'megaBomb' };

export type PieceType = Piece['type'];

/** Дыра — клетка, которой нет на поле; в неё ничего не падает */
export interface Hole {
  kind: 'hole';
}

/** Камень: падает вниз, сдвинуть его нельзя, разбить — только взрывом */
export interface Stone {
  kind: 'stone';
}

/**
 * Сундук: стоит на месте, фишки пролетают сквозь него. Удар — взрыв или совпадение рядом; каждый
 * снимает одну стадию: звено цепи (links), потом сундук открывается (open), потом исчезает.
 * Сундук с сокровищами (treasure) засчитывается в цель «золото»; что внутри, видно, только когда
 * он открыт
 */
export interface Box {
  kind: 'box';
  links?: number;
  open?: boolean;
  treasure?: boolean;
}

/** Корона: падает и меняется как фишка, в совпадениях не участвует, взрывы её не задевают */
export interface Item {
  kind: 'item';
}

/**
 * Уголь — глыба 2×2. Стоит на месте, фишки сквозь неё не пролетают, а обтекают; бьётся совпадениями
 * рядом и взрывами, пока не кончатся слои. Каждая клетка глыбы хранит её левый верхний угол
 * (по нему глыба узнаётся целиком) и сколько слоёв осталось
 */
export interface Coal {
  kind: 'coal';
  top: number;
  left: number;
  layers: number;
}

/** null — пустая клетка, которую нужно заполнить */
export type Cell = Tile | Piece | Hole | Stone | Box | Item | Coal | null;

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

/** Клетка, которая не двигается и не падает. Сквозь неё фишки пролетают — кроме угля, его обтекают */
export function isFixed(cell: Cell | undefined): boolean {
  return cell?.kind === 'hole' || cell?.kind === 'box' || cell?.kind === 'coal';
}

/** Удар по сундуку: снято звено цепи, сундук открылся или (null) исчез */
export function hitBox(box: Box): Box | null {
  const { links = 0, open = false } = box;
  if (links > 1) return { ...box, links: links - 1 };
  // В цепях сундук всегда закрыт: последнее звено снято — остаётся закрытый сундук
  if (links === 1) return box.treasure ? { kind: 'box', treasure: true } : { kind: 'box' };
  return open ? null : { ...box, open: true };
}

export function isCoal(cell: Cell | undefined): cell is Coal {
  return cell?.kind === 'coal';
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
/** Есть ли на поле спецфишки */
export function hasPieces(board: Board): boolean {
  return board.some((line) => line.some((cell) => isPiece(cell)));
}

export function allPositions(board: Board): Position[] {
  return board.flatMap((line, row) =>
    line.flatMap((cell, col) => (cell?.kind === 'hole' ? [] : [{ row, col }])),
  );
}
