import { describe, expect, it } from 'vitest';
import type { Position } from '../../src/core/board';
import { comboMultiplier, runMove, type ResolveStep } from '../../src/core/resolve';
import { createRng } from '../../src/core/rng';
import { parseBoard } from '../helpers/parseBoard';

const ctx = () => ({ colorCount: 6, rng: createRng(1) });
const p = (row: number, col: number): Position => ({ row, col });

const clears = (steps: ResolveStep[]) =>
  steps.filter((s): s is Extract<ResolveStep, { kind: 'clear' }> => s.kind === 'clear');

describe('комбо', () => {
  it('множитель растёт на 0,1 и останавливается на x2', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(1)).toBe(1.1);
    expect(comboMultiplier(5)).toBe(1.5);
    expect(comboMultiplier(10)).toBe(2);
    expect(comboMultiplier(15)).toBe(2);
  });

  it('совпадение от хода идёт без множителя, собравшееся само — x1.1', () => {
    const board = parseBoard(`
      R1 G1 G1 Y1
      B1 R1 R1 G1
      Y1 B1 Y1 B1
    `);
    const { steps } = runMove(board, { type: 'swap', from: p(0, 0), to: p(1, 0) }, ctx());
    const [first, second] = clears(steps);
    expect(first!.points).toBe(30);
    expect(first!.combos).toBeUndefined();
    expect(second!.points).toBe(33);
    expect(second!.combos).toEqual([{ at: p(1, 2), step: 1 }]);
  });

  it('две линии в одном падении считаются по очереди: x1.1 и x1.2', () => {
    const board = parseBoard(`
      Y1 P1 P1 Y1
      R1 G1 G1 P1
      B1 R1 R1 G1
      Y1 B1 Y1 B1
    `);
    const { steps } = runMove(board, { type: 'swap', from: p(1, 0), to: p(2, 0) }, ctx());
    const [, second] = clears(steps);
    expect(second!.combos?.map((combo) => combo.step)).toEqual([1, 2]);
    expect(second!.points).toBe(33 + 36);
  });

  const blast = `
    G1 G1 Y1
    Y1 B1 Y1
    B1 B1 G1
    *  Y1 B1
  `;

  it('после взрыва спецфишки считается, а клетки под взрывом — нет', () => {
    const { steps } = runMove(parseBoard(blast), { type: 'fire', at: p(3, 0) }, ctx());
    const [explosion, match] = clears(steps);
    expect(explosion!.combos).toBeUndefined();
    expect(match!.combos?.[0]?.step).toBe(1);
    expect(match!.points).toBe(33);
  });

  it('работает и в финале', () => {
    const { steps } = runMove(parseBoard(blast), { type: 'finale' }, ctx());
    expect(clears(steps)[1]!.points).toBe(33);
  });
});
