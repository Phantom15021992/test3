import { describe, expect, it } from 'vitest';
import { createGameStats, recordPurchase, recordStep } from '../../src/core/gameStats';
import type { ResolveStep } from '../../src/core/resolve';

const p = (row: number, col: number) => ({ row, col });

describe('статистика партии', () => {
  it('новая партия — всё по нулям', () => {
    expect(createGameStats()).toEqual({
      level2Created: 0,
      level3Created: 0,
      specialsFromMatches: 0,
      specialsActivated: 0,
      bought: { bomb: 0, rocket: 0, manipulator: 0, rainbow: 0 },
      pointsSpent: 0,
    });
  });

  it('считает созданные ячейки 2 и 3 уровня и спецфишки из совпадений', () => {
    const stats = createGameStats();
    const step: ResolveStep = {
      kind: 'transform',
      placements: [
        { pos: p(0, 0), cell: { kind: 'tile', color: 0, level: 2 } },
        { pos: p(0, 1), cell: { kind: 'tile', color: 0, level: 2 } },
        { pos: p(1, 0), cell: { kind: 'tile', color: 1, level: 3 } },
        { pos: p(1, 1), cell: { kind: 'piece', type: 'rocket', direction: 'row' } },
        { pos: p(2, 0), cell: { kind: 'tile', color: 1, level: 1 } },
      ],
    };
    recordStep(stats, step);
    expect(stats.level2Created).toBe(2);
    expect(stats.level3Created).toBe(1);
    expect(stats.specialsFromMatches).toBe(1);
  });

  it('считает сработавшие спецфишки по шагам удаления', () => {
    const stats = createGameStats();
    recordStep(stats, { kind: 'clear', cells: [p(0, 0), p(0, 1)], points: 10, pieces: 1 });
    recordStep(stats, { kind: 'clear', cells: [p(1, 0)], points: 0, pieces: 2 });
    recordStep(stats, { kind: 'swap', a: p(0, 0), b: p(0, 1) });
    expect(stats.specialsActivated).toBe(3);
  });

  it('учитывает покупки и потраченные очки', () => {
    const stats = createGameStats();
    recordPurchase(stats, 'bomb', 150);
    recordPurchase(stats, 'bomb', 150);
    recordPurchase(stats, 'rainbow', 750);
    expect(stats.bought).toEqual({ bomb: 2, rocket: 0, manipulator: 0, rainbow: 1 });
    expect(stats.pointsSpent).toBe(1050);
  });
});
