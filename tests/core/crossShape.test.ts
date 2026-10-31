import { describe, expect, it } from 'vitest';
import type { Position } from '../../src/core/board';
import { isSevenCross } from '../../src/core/match';
import { runMove, type ResolveStep } from '../../src/core/resolve';
import { createRng } from '../../src/core/rng';
import { parseBoard } from '../helpers/parseBoard';

const p = (row: number, col: number) => ({ row, col });
const ctx = () => ({ colorCount: 4, rng: createRng(1) });

const firstClear = (steps: ResolveStep[]) =>
  steps.find((step): step is Extract<ResolveStep, { kind: 'clear' }> => step.kind === 'clear');
const firstPlaced = (steps: ResolveStep[]) =>
  steps.find((step): step is Extract<ResolveStep, { kind: 'transform' }> => {
    return step.kind === 'transform';
  })?.placements;

/** Линия из 5 по столбцу 1 и отросток вправо из середины; сама середина появляется при обмене */
const tee = (t: string) =>
  parseBoard(`
    G1 ${t} B1 Y1
    B1 ${t} Y1 G1
    ${t} G1 ${t} ${t}
    Y1 ${t} B1 G1
    B1 ${t} Y1 B1
  `);
const teeMove = { type: 'swap', from: p(2, 0), to: p(2, 1) } as const;

describe('фигура из 7 клеток: распознавание', () => {
  const line = [p(0, 2), p(1, 2), p(2, 2), p(3, 2), p(4, 2)];
  const sideways = (cells: Position[]) => cells.map(({ row, col }) => p(col, row));

  it.each([
    ['отросток вправо', [p(2, 3), p(2, 4)]],
    ['отросток влево', [p(2, 1), p(2, 0)]],
    ['крест', [p(2, 1), p(2, 3)]],
  ])('считает: %s, по вертикали и по горизонтали', (_, branch) => {
    expect(isSevenCross([...line, ...branch])).toBe(true);
    expect(isSevenCross(sideways([...line, ...branch]))).toBe(true);
  });

  it.each([
    ['отросток не из середины', [p(1, 3), p(1, 4)]],
    ['отросток с конца', [p(0, 3), p(0, 4)]],
    ['две клетки в разных строках', [p(1, 3), p(3, 3)]],
  ])('не считает: %s', (_, branch) => {
    expect(isSevenCross([...line, ...branch])).toBe(false);
  });

  it('не считает другое число клеток', () => {
    expect(isSevenCross(line)).toBe(false);
    expect(isSevenCross([...line, p(2, 3), p(2, 4), p(2, 5)])).toBe(false);
  });
});

describe('фигура из 7 клеток: награда', () => {
  it('из фишек 1 уровня — 2 ячейки 3 уровня и обычные очки', () => {
    const { steps } = runMove(tee('R1'), teeMove, ctx());
    expect(firstClear(steps)?.points).toBe(70);
    expect(firstPlaced(steps)).toEqual([
      { pos: p(2, 1), cell: { kind: 'tile', color: expect.any(Number), level: 3 } },
      { pos: p(2, 2), cell: { kind: 'tile', color: expect.any(Number), level: 3 } },
    ]);
  });

  it('из ячеек 2 уровня — 2 радуги рядом и очки как за 5 ячеек 3 уровня', () => {
    const { steps } = runMove(tee('R2'), teeMove, ctx());
    expect(firstClear(steps)?.points).toBe(1250);
    expect(firstPlaced(steps)).toEqual([
      { pos: p(2, 1), cell: { kind: 'piece', type: 'rainbow' } },
      { pos: p(2, 2), cell: { kind: 'piece', type: 'rainbow' } },
    ]);
  });

  it('из ячеек 3 уровня всё как раньше', () => {
    const { steps } = runMove(tee('R3'), teeMove, ctx());
    expect(firstClear(steps)?.points).toBe(1750);
    expect(firstPlaced(steps)).toHaveLength(2);
  });

  it('крест даёт ту же награду', () => {
    const board = parseBoard(`
      G1 R2 B1 Y1
      B1 R2 Y1 B1
      R2 R2 G1 R2
      Y1 R2 B1 G1
      B1 R2 Y1 B1
    `);
    const { steps } = runMove(board, { type: 'swap', from: p(2, 3), to: p(2, 2) }, ctx());
    expect(firstClear(steps)?.points).toBe(1250);
    expect(firstPlaced(steps)?.map((placed) => placed.cell)).toEqual([
      { kind: 'piece', type: 'rainbow' },
      { kind: 'piece', type: 'rainbow' },
    ]);
  });

  it('7 клеток другой формы считаются как обычно: 5+', () => {
    const board = parseBoard(`
      R1 R1 R1 Y1
      R1 G1 B1 G1
      R1 B1 Y1 B1
      R1 Y1 B1 G1
      R1 B1 Y1 B1
    `);
    const { steps } = runMove(board, { type: 'swap', from: p(4, 2), to: p(4, 3) }, ctx());
    expect(firstPlaced(steps)).toEqual([
      { pos: expect.anything(), cell: { kind: 'tile', color: expect.any(Number), level: 3 } },
    ]);
  });
});
