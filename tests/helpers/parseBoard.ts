import type { Board, Cell, CellLevel } from '../../src/core/board';

// Буква → индекс цвета.
// Нотация клетки:
//   R1   — цвет + уровень
//   -    — ракета по строке, | — ракета по столбцу, * — бомба
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
  if (token === '-') return { kind: 'piece', type: 'rocket', direction: 'row' };
  if (token === '|') return { kind: 'piece', type: 'rocket', direction: 'col' };
  if (token === '*') return { kind: 'piece', type: 'bomb' };

  const match = /^([A-Z])([123])$/.exec(token);
  const color = COLOR_LETTERS.indexOf(match?.[1] ?? '');
  if (!match || color < 0) throw new Error(`Неизвестная клетка: "${token}"`);
  return { kind: 'tile', color, level: Number(match[2]) as CellLevel };
}
