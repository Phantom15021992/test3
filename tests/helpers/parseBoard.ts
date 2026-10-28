import type { Board, Cell, CellLevel } from '../../src/core/board';

// Буква → индекс цвета. Нотация клетки: R1 (цвет + уровень), . (пусто), # (дыра).
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

  const color = COLOR_LETTERS.indexOf(token[0] ?? '');
  const level = Number(token.slice(1));
  if (color < 0 || ![1, 2, 3].includes(level)) {
    throw new Error(`Неизвестная клетка: "${token}"`);
  }
  return { kind: 'tile', color, level: level as CellLevel };
}
