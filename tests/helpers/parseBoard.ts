import type { Board, Cell, CellLevel } from '../../src/core/board';

// Буква → индекс цвета.
// Нотация клетки:
//   R1   — цвет + уровень
//   R1-  — ракета по строке, R1| — ракета по столбцу, R1* — бомба
//   @    — радуга, M — манипулятор, X — мега-бомба
//   .    — пусто, # — дыра
const COLOR_LETTERS = 'RGBYPO';

export function parseBoard(text: string): Board {
  return text
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(parseCell));
}

function parseCell(token: string): Cell {
  if (token === '.') return null;
  if (token === '#') return { kind: 'hole' };
  if (token === '@') return { kind: 'piece', type: 'rainbow' };
  if (token === 'M') return { kind: 'piece', type: 'manipulator' };
  if (token === 'X') return { kind: 'piece', type: 'megaBomb' };

  const match = /^([A-Z])([123])([-|*]?)$/.exec(token);
  const color = COLOR_LETTERS.indexOf(match?.[1] ?? '');
  if (!match || color < 0) throw new Error(`Неизвестная клетка: "${token}"`);

  const cell: Cell = { kind: 'tile', color, level: Number(match[2]) as CellLevel };
  if (match[3] === '-') cell.special = { type: 'rocket', direction: 'row' };
  if (match[3] === '|') cell.special = { type: 'rocket', direction: 'col' };
  if (match[3] === '*') cell.special = { type: 'bomb' };
  return cell;
}
