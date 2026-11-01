import { describe, expect, it } from 'vitest';
import { setCell, type Board, type CellLevel } from '../../src/core/board';
import { findMatches } from '../../src/core/match';
import { runMove, type ResolveStep } from '../../src/core/resolve';
import { createRng } from '../../src/core/rng';
import {
  figureCells,
  figureValue,
  MATCH_FIGURES,
  type RewardIcon,
} from '../../src/ui/matchFigures';
import { parseBoard } from '../helpers/parseBoard';

const SIDE = 8;
const OFFSET = 1;

/** Шахматное поле без совпадений, на нём фигура красными ячейками уровня level */
function boardWith(rows: readonly string[], level: CellLevel): Board {
  const lines = Array.from({ length: SIDE }, (_, row) =>
    Array.from({ length: SIDE }, (_, col) => ((row + col) % 2 === 0 ? 'G1' : 'B1')).join(' '),
  );
  const board = parseBoard(lines.join('\n'));
  for (const { row, col } of figureCells(rows)) {
    setCell(board, { row: row + OFFSET, col: col + OFFSET }, parseBoard(`R${level}`)[0]![0]!);
  }
  return board;
}

const sorted = (icons: RewardIcon[]) => icons.map(String).sort();

function actualIcons(steps: ResolveStep[]): RewardIcon[] {
  const place = steps.find((step) => step.kind === 'transform');
  if (place?.kind !== 'transform') return [];
  return place.placements.flatMap(({ cell }): RewardIcon[] => {
    if (cell?.kind === 'tile') return [cell.level];
    return cell?.kind === 'piece' ? [cell.type] : [];
  });
}

describe('колонка «Комбинации» в правилах', () => {
  const cases = MATCH_FIGURES.flatMap((figure) =>
    ([1, 2, 3] as const).map((level) => [figure.title, level, figure] as const),
  );

  it.each(cases)('%s, %i уровень: собирается одной группой', (_, level, figure) => {
    const groups = findMatches(boardWith(figure.rows, level));
    expect(groups).toHaveLength(1);
    expect(groups[0]!.cells).toHaveLength(figureCells(figure.rows).length);
  });

  it.each(cases)('%s, %i уровень: награда и очки как в игре', (_, level, figure) => {
    const ctx = { colorCount: 6, rng: createRng(1) };
    const { steps } = runMove(boardWith(figure.rows, level), { type: 'finale' }, ctx);
    const clear = steps.find((step) => step.kind === 'clear');
    const value = figureValue(figure, level);
    expect(clear?.kind === 'clear' && clear.points).toBe(value.points);
    expect(sorted(actualIcons(steps))).toEqual(sorted(value.icons));
  });
});
