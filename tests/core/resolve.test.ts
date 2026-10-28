import { describe, expect, it } from 'vitest';
import type { Position } from '../../src/core/board';
import { findMatches } from '../../src/core/match';
import { runMove, type ResolveStep } from '../../src/core/resolve';
import { createRng } from '../../src/core/rng';
import { parseBoard } from '../helpers/parseBoard';

const ctx = () => ({ colorCount: 6, rng: createRng(1) });
const p = (row: number, col: number): Position => ({ row, col });

const stepsOf = <K extends ResolveStep['kind']>(steps: ResolveStep[], kind: K) =>
  steps.filter((s): s is Extract<ResolveStep, { kind: K }> => s.kind === kind);

const sortCells = (cells: Position[]) => [...cells].sort((a, b) => a.row - b.row || a.col - b.col);

function expectSettled(board: ReturnType<typeof runMove>['board']) {
  expect(findMatches(board)).toEqual([]);
  expect(board.flat().includes(null)).toBe(false);
}

describe('resolveMove: совпадения 1 уровня', () => {
  it('3 в ряд — просто очки', () => {
    const board = parseBoard(`
      R1 G1 R1 R1
      G1 B1 Y1 P1
    `);
    const result = runMove(board, { type: 'swap', from: p(0, 0), to: p(0, 1) }, ctx());
    const [clear] = stepsOf(result.steps, 'clear');
    expect(sortCells(clear!.cells)).toEqual([p(0, 1), p(0, 2), p(0, 3)]);
    expect(clear!.points).toBe(30);
    expect(stepsOf(result.steps, 'choice')).toEqual([]);
    expectSettled(result.board);
  });

  it('4 в ряд — ракета вдоль линии на месте сдвинутой фишки', () => {
    const board = parseBoard(`
      R1 G1 R1 R1 R1
      B1 Y1 P1 O1 B1
    `);
    const result = runMove(board, { type: 'swap', from: p(0, 0), to: p(0, 1) }, ctx());
    const [transform] = stepsOf(result.steps, 'transform');
    expect(transform!.placements).toEqual([
      {
        pos: p(0, 1),
        cell: { kind: 'piece', type: 'rocket', direction: 'row' },
      },
    ]);
    expect(stepsOf(result.steps, 'clear')[0]!.points).toBe(40);
  });

  it('квадрат 2×2 — манипулятор', () => {
    const board = parseBoard(`
      R1 G1 R1
      R1 R1 B1
    `);
    const result = runMove(board, { type: 'swap', from: p(0, 2), to: p(0, 1) }, ctx());
    expect(stepsOf(result.steps, 'transform')[0]!.placements).toEqual([
      { pos: p(0, 1), cell: { kind: 'piece', type: 'manipulator' } },
    ]);
  });

  const lBoard = () =>
    parseBoard(`
      R1 G1 B1
      R1 B1 G1
      G1 R1 R1
      R1 Y1 P1
    `);
  const lMove = { type: 'swap', from: p(3, 0), to: p(2, 0) } as const;

  it('L/T — выбор: бомба', () => {
    const result = runMove(lBoard(), lMove, ctx(), ['bomb']);
    const [choice] = stepsOf(result.steps, 'choice');
    expect(choice!.options).toEqual(['bomb', 'merge']);
    expect(stepsOf(result.steps, 'clear')[0]!.points).toBe(50);
    expect(stepsOf(result.steps, 'transform')[0]!.placements).toEqual([
      { pos: p(2, 0), cell: { kind: 'piece', type: 'bomb' } },
    ]);
  });

  it('L/T — выбор: 2 ячейки 2 уровня без очков', () => {
    const result = runMove(lBoard(), lMove, ctx(), ['merge']);
    expect(stepsOf(result.steps, 'clear')[0]!.points).toBe(0);
    expect(stepsOf(result.steps, 'transform')[0]!.placements).toEqual([
      { pos: p(2, 0), cell: { kind: 'tile', color: 0, level: 2 } },
      { pos: p(2, 1), cell: { kind: 'tile', color: 0, level: 2 } },
    ]);
  });

  const line5 = () =>
    parseBoard(`
      R1 R1 G1 R1 R1
      B1 Y1 R1 P1 O1
    `);
  const line5Move = { type: 'swap', from: p(1, 2), to: p(0, 2) } as const;

  it('5 в ряд — выбор: радуга', () => {
    const result = runMove(line5(), line5Move, ctx(), ['rainbow']);
    expect(stepsOf(result.steps, 'choice')[0]!.options).toEqual(['rainbow', 'merge']);
    expect(stepsOf(result.steps, 'transform')[0]!.placements).toEqual([
      { pos: p(0, 2), cell: { kind: 'piece', type: 'rainbow' } },
    ]);
  });

  it('5 в ряд — выбор: 2 ячейки 2 уровня', () => {
    const result = runMove(line5(), line5Move, ctx(), ['merge']);
    expect(stepsOf(result.steps, 'transform')[0]!.placements.map((pl) => pl.pos)).toEqual([
      p(0, 2),
      p(0, 3),
    ]);
  });
});

describe('resolveMove: ячейки 2–3 уровня', () => {
  const level2 = () =>
    parseBoard(`
      B2 B2 G1 Y1
      R1 P1 B2 O1
    `);
  const move = { type: 'swap', from: p(1, 2), to: p(0, 2) } as const;

  it('2 уровень — выбор: очки ×5', () => {
    const result = runMove(level2(), move, ctx(), ['score']);
    expect(stepsOf(result.steps, 'choice')[0]!.options).toEqual(['score', 'merge']);
    expect(stepsOf(result.steps, 'clear')[0]!.points).toBe(150);
    expect(stepsOf(result.steps, 'transform')).toEqual([]);
  });

  it('2 уровень — выбор: объединение в 3 уровень', () => {
    const result = runMove(level2(), move, ctx(), ['merge']);
    expect(stepsOf(result.steps, 'clear')[0]!.points).toBe(0);
    expect(stepsOf(result.steps, 'transform')[0]!.placements).toEqual([
      { pos: p(0, 2), cell: { kind: 'tile', color: 2, level: 3 } },
    ]);
  });

  it('3 уровень, 4 ячейки — ×20 и мега-бомба', () => {
    const board = parseBoard(`
      R3 R3 G1 R3
      B1 Y1 R3 P1
    `);
    const result = runMove(board, move, ctx());
    expect(stepsOf(result.steps, 'clear')[0]!.points).toBe(800);
    expect(stepsOf(result.steps, 'transform')[0]!.placements).toEqual([
      { pos: p(0, 2), cell: { kind: 'piece', type: 'megaBomb' } },
    ]);
  });
});

describe('resolveMove: срабатывание спецфишек', () => {
  it('ракета, сдвинутая на обычную фишку, срабатывает на новом месте', () => {
    const board = parseBoard(`
      G1 B1 Y1
      -  R1 P1
      O1 Y1 B1
    `);
    const result = runMove(board, { type: 'swap', from: p(1, 0), to: p(1, 1) }, ctx());
    expect(result.steps[0]).toEqual({ kind: 'swap', a: p(1, 0), b: p(1, 1) });
    const [clear] = stepsOf(result.steps, 'clear');
    expect(sortCells(clear!.cells)).toEqual([p(1, 0), p(1, 1), p(1, 2)]);
    // Сама ракета очков не даёт
    expect(clear!.points).toBe(20);
  });

  it('если двигали обычную фишку на бомбу — бомба срабатывает там, куда переехала', () => {
    const board = parseBoard(`
      G1 B1 Y1 O1
      R1 *  P1 G1
      O1 Y1 B1 R1
    `);
    const result = runMove(board, { type: 'swap', from: p(1, 0), to: p(1, 1) }, ctx());
    // Бомба переехала в (1, 0): взрыв 3×3 вокруг неё
    expect(sortCells(stepsOf(result.steps, 'clear')[0]!.cells)).toEqual([
      p(0, 0),
      p(0, 1),
      p(1, 0),
      p(1, 1),
      p(2, 0),
      p(2, 1),
    ]);
  });

  it('цепная реакция: ракета задевает бомбу', () => {
    const board = parseBoard(`
      G1 B1 Y1
      -  R1 *
      O1 Y1 B1
    `);
    const result = runMove(board, { type: 'swap', from: p(1, 0), to: p(1, 1) }, ctx());
    expect(stepsOf(result.steps, 'clear')[0]!.cells).toHaveLength(7);
  });
});

describe('resolveMove: комбо', () => {
  it('ракета + ракета — крест', () => {
    const board = parseBoard(`
      G1 B1 Y1
      -  |  P1
      O1 Y1 B1
    `);
    const result = runMove(board, { type: 'swap', from: p(1, 0), to: p(1, 1) }, ctx());
    expect(sortCells(stepsOf(result.steps, 'clear')[0]!.cells)).toEqual([
      p(0, 1),
      p(1, 0),
      p(1, 1),
      p(1, 2),
      p(2, 1),
    ]);
  });

  it('бомба + бомба — взрыв 5×5 вокруг клетки, куда передвинули', () => {
    const board = parseBoard(`
      R1 G1 B1  Y1  P1
      G1 B1 Y1  P1  O1
      B1 Y1 *  *  R1
      Y1 P1 O1  R1  G1
      P1 O1 R1  G1  B1
    `);
    const result = runMove(board, { type: 'swap', from: p(2, 2), to: p(2, 3) }, ctx());
    expect(stepsOf(result.steps, 'clear')[0]!.cells).toHaveLength(20);
  });

  it('радуга + радуга — очистка поля', () => {
    const board = parseBoard(`
      @  @
      R1 G1
    `);
    const result = runMove(board, { type: 'swap', from: p(0, 0), to: p(0, 1) }, ctx());
    expect(stepsOf(result.steps, 'clear')[0]!.cells).toHaveLength(4);
  });

  it('радуга + ракета — фишки 1 уровня самого частого цвета становятся ракетами', () => {
    const board = parseBoard(`
      @  -  G1
      R1 G1 R1
      B1 R1 R2
    `);
    const result = runMove(board, { type: 'swap', from: p(0, 0), to: p(0, 1) }, ctx());
    const [transform] = stepsOf(result.steps, 'transform');
    // Красных больше всего (с учётом R2), но превращаются только фишки 1 уровня
    expect(transform!.placements.map((pl) => pl.pos)).toEqual([p(1, 0), p(1, 2), p(2, 1)]);
    for (const { cell } of transform!.placements) {
      expect(cell).toMatchObject({ kind: 'piece', type: 'rocket' });
    }
  });

  it('мега-бомба + радуга — выбранный цвет становится бомбами', () => {
    const board = parseBoard(`
      X  @  G1
      R1 G1 B1
      B1 R1 G1
    `);
    const result = runMove(board, { type: 'swap', from: p(0, 0), to: p(0, 1), color: 1 }, ctx());
    const [transform] = stepsOf(result.steps, 'transform');
    expect(transform!.placements.map((pl) => pl.pos)).toEqual([p(0, 2), p(1, 1), p(2, 2)]);
    for (const { cell } of transform!.placements) {
      expect(cell).toEqual({ kind: 'piece', type: 'bomb' });
    }
  });
});

describe('resolveMove: активация тапом', () => {
  it('радуга убирает все фишки выбранного цвета', () => {
    const board = parseBoard(`
      @  G1 B1
      G2 B1 G1
      B1 G1 Y1
    `);
    const result = runMove(board, { type: 'rainbow', at: p(0, 0), color: 1 }, ctx());
    expect(sortCells(stepsOf(result.steps, 'clear')[0]!.cells)).toEqual([
      p(0, 0),
      p(0, 1),
      p(1, 0),
      p(1, 2),
      p(2, 1),
    ]);
  });

  it('мега-бомба — взрыв 5×5', () => {
    const board = parseBoard(`
      R1 G1 B1 Y1 P1
      G1 B1 Y1 P1 O1
      B1 Y1 X  G1 R1
      Y1 P1 O1 R1 G1
      P1 O1 R1 G1 B1
    `);
    const result = runMove(board, { type: 'megaBomb', at: p(2, 2) }, ctx());
    const [clear] = stepsOf(result.steps, 'clear');
    expect(clear!.cells).toHaveLength(25);
    expect(clear!.points).toBe(240);
  });

  it('манипулятор исчезает и меняет две любые клетки', () => {
    const board = parseBoard(`
      M  G1 B1
      R1 B1 R1
      Y1 R1 P1
    `);
    const result = runMove(
      board,
      { type: 'manipulator', at: p(0, 0), a: p(1, 1), b: p(2, 1) },
      ctx(),
    );
    expect(result.steps[0]).toEqual({ kind: 'clear', cells: [p(0, 0)], points: 0 });
    expect(result.steps[1]).toEqual({ kind: 'swap', a: p(1, 1), b: p(2, 1) });
    expect(sortCells(stepsOf(result.steps, 'clear')[1]!.cells)).toEqual([
      p(1, 0),
      p(1, 1),
      p(1, 2),
    ]);
    expectSettled(result.board);
  });
});

describe('resolveMove: каскады', () => {
  it('после падения возникает новое совпадение', () => {
    const board = parseBoard(`
      R1 G1 @
      R1 B1 G1
      Y1 P1 Y1
      R1 G1 B1
    `);
    const result = runMove(board, { type: 'rainbow', at: p(0, 2), color: 3 }, ctx());
    const clears = stepsOf(result.steps, 'clear');
    expect(clears.length).toBeGreaterThanOrEqual(2);
    expect(clears[1]!.cells).toEqual(expect.arrayContaining([p(1, 0), p(2, 0), p(3, 0)]));
    expectSettled(result.board);
  });

  it('одинаковый seed — одинаковый результат', () => {
    const board = parseBoard(`
      R1 G1 R1 R1
      G1 B1 Y1 P1
    `);
    const move = { type: 'swap', from: p(0, 0), to: p(0, 1) } as const;
    expect(runMove(board, move, ctx())).toEqual(runMove(board, move, ctx()));
  });
});
