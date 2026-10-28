import { describe, expect, it } from 'vitest';
import { resolveCascades } from '../../src/core/cascade';
import { findMatches } from '../../src/core/match';
import { createRng } from '../../src/core/rng';
import { parseBoard } from '../helpers/parseBoard';

describe('resolveCascades', () => {
  it('без совпадений ничего не делает', () => {
    const board = parseBoard(`
      R1 G1
      G1 R1
    `);
    expect(resolveCascades(board, 6, createRng(1))).toEqual({ board, steps: [] });
  });

  it('после падения возникает новое совпадение — каскад', () => {
    // Убираем жёлтую строку → красные в первом столбце встают в линию
    const board = parseBoard(`
      R1 G1 B1
      R1 B1 G1
      Y1 Y1 Y1
      R1 G1 B1
    `);
    const { board: result, steps } = resolveCascades(board, 6, createRng(7));

    const clears = steps.filter((s) => s.kind === 'clear');
    expect(clears.length).toBeGreaterThanOrEqual(2);
    expect(clears[0]?.cells).toEqual([
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
    ]);
    expect(clears[1]?.cells).toEqual(
      expect.arrayContaining([
        { row: 1, col: 0 },
        { row: 2, col: 0 },
        { row: 3, col: 0 },
      ]),
    );

    expect(findMatches(result)).toEqual([]);
    expect(result.flat().every((cell) => cell !== null)).toBe(true);
  });

  it('шаги чередуются: clear, затем drop', () => {
    const { steps } = resolveCascades(parseBoard(`R1 R1 R1`), 6, createRng(3));
    steps.forEach((step, i) => expect(step.kind).toBe(i % 2 === 0 ? 'clear' : 'drop'));
  });

  it('одинаковый seed — одинаковый результат', () => {
    const board = parseBoard(`
      R1 G1 B1
      Y1 Y1 Y1
    `);
    expect(resolveCascades(board, 4, createRng(11))).toEqual(
      resolveCascades(board, 4, createRng(11)),
    );
  });
});
