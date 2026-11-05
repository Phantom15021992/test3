import { describe, expect, it } from 'vitest';
import { isCoal, type Board, type Position } from '../../src/core/board';
import { COAL_SIZE } from '../../src/core/config';
import { applyGravity, refill, settle } from '../../src/core/gravity';
import { boardTemplate, parseLevel, type Level } from '../../src/core/level';
import { LevelSession } from '../../src/core/levelSession';
import { isValidSwap } from '../../src/core/moves';
import { runMove, type ResolveStep } from '../../src/core/resolve';
import { createRng } from '../../src/core/rng';
import { parseBoard } from '../helpers/parseBoard';

const p = (row: number, col: number) => ({ row, col });
const ctx = () => ({ colorCount: 4, rng: createRng(1), campaign: true });

/** Ставит глыбу угля COAL_SIZE×COAL_SIZE левым верхним углом в top, left */
function withCoal(board: Board, top: number, left: number, layers = 9): Board {
  for (let row = top; row < top + COAL_SIZE; row++) {
    for (let col = left; col < left + COAL_SIZE; col++)
      board[row]![col] = { kind: 'coal', top, left, layers };
  }
  return board;
}

const clears = (steps: ResolveStep[]) =>
  steps.filter((step): step is Extract<ResolveStep, { kind: 'clear' }> => step.kind === 'clear');

/** Поле 3×5: уголь в левом верхнем углу, под ним строка, где ход собирает тройку цвета R */
function besideCoal(level: 1 | 2 | 3, layers = 9): Board {
  return withCoal(
    parseBoard(`
      .  .  G1 B1 Y1
      .  .  B1 G1 B1
      R${level} R${level} G1 R${level} B1
    `),
    0,
    0,
    layers,
  );
}

const swapIn = { type: 'swap', from: p(2, 3), to: p(2, 2) } as const;

describe('уголь: удары', () => {
  it('совпадение фишек 1 уровня рядом снимает 1 слой', () => {
    const { steps } = runMove(besideCoal(1), swapIn, ctx());
    expect(clears(steps)[0]?.coal).toEqual([{ top: 0, left: 0, layers: 8 }]);
  });

  it('совпадение ячеек 2 уровня снимает 2 слоя, 3 уровня — 3', () => {
    expect(clears(runMove(besideCoal(2), swapIn, ctx()).steps)[0]?.coal?.[0]?.layers).toBe(7);
    expect(clears(runMove(besideCoal(3), swapIn, ctx()).steps)[0]?.coal?.[0]?.layers).toBe(6);
  });

  it('последний слой снят — глыба исчезает, её клетки заполняются', () => {
    const { steps, board } = runMove(besideCoal(1, 1), swapIn, ctx());
    expect(clears(steps)[0]?.coal).toEqual([{ top: 0, left: 0, layers: 0 }]);
    expect(board.flat().some(isCoal)).toBe(false);
    expect(board.flat().includes(null)).toBe(false);
  });

  it('каждый взрыв, задевший глыбу, снимает один слой: две бомбы по цепочке — два', () => {
    const board = withCoal(
      parseBoard(`
        .  .  G1 B1
        .  .  B1 G1
        R1 *  *  Y1
        G1 B1 Y1 R1
      `),
      0,
      0,
    );
    const { steps } = runMove(board, { type: 'fire', at: p(2, 2) }, ctx());
    expect(clears(steps)[0]?.coal).toEqual([{ top: 0, left: 0, layers: 7 }]);
  });

  it('уголь не меняется обменом и не уничтожается взрывом', () => {
    const board = besideCoal(1);
    expect(isValidSwap(board, p(1, 1), p(2, 1))).toBe(false);
    const { steps } = runMove(
      withCoal(
        parseBoard(`
          .  .  *  B1
          .  .  B1 G1
          R1 G1 B1 Y1
        `),
        0,
        0,
      ),
      { type: 'fire', at: p(0, 2) },
      ctx(),
    );
    expect(clears(steps)[0]?.cells.every(({ col }) => col >= 2)).toBe(true);
  });
});

describe('уголь: падение', () => {
  /** Поле 6×6: две глыбы рядом сверху — стена в 4 клетки, под ней пустые строки */
  function hollow(): Board {
    const board = parseBoard(`
      R1 .  .  .  .  G1
      G1 .  .  .  .  B1
      B1 .  .  .  .  R1
      Y1 .  .  .  .  G1
      R1 .  .  .  .  B1
      G1 .  .  .  .  Y1
    `);
    return withCoal(withCoal(board, 0, 1), 0, 1 + COAL_SIZE);
  }

  it('фишки не пролетают сквозь уголь: над ним ложатся на него', () => {
    const board = withCoal(
      parseBoard(`
        R1 .
        .  .
        .  .
        .  .
      `).map((line) => [...line, null]),
      1,
      0,
    );
    board[0]![0] = { kind: 'tile', color: 0, level: 1 };
    const { board: after } = applyGravity(board);
    expect(after[0]![0]).toEqual({ kind: 'tile', color: 0, level: 1 });
  });

  it('под углём фишки скатываются наискосок, а куда нечему — появляются на месте', () => {
    const { board, drops } = settle(hollow(), 4, createRng(3));
    expect(board.flat().includes(null)).toBe(false);
    const falls = drops.flatMap((drop) => drop.falls);
    expect(falls.some(({ from, to }) => from.col !== to.col)).toBe(true);
    const inPlace = drops.flatMap((drop) => drop.spawns.filter((spawn) => spawn.inPlace));
    // Наискосок не достать только до двух средних клеток строки сразу под стеной
    const unreachable = (pos: Position) =>
      pos.row === COAL_SIZE && (pos.col === 2 || pos.col === 3);
    expect(inPlace.length).toBeGreaterThan(0);
    expect(inPlace.every(({ to }) => unreachable(to))).toBe(true);
  });

  it('без угля падение то же, что и раньше: одно, с тем же ГСЧ', () => {
    const board = parseBoard(`
      R1 .  G1
      .  B1 .
      Y1 .  R1
    `);
    const fallen = applyGravity(board);
    const expected = refill(fallen.board, 4, createRng(5));
    const { board: after, drops } = settle(board, 4, createRng(5));
    expect(after).toEqual(expected.board);
    expect(drops).toEqual([{ falls: fallen.falls, spawns: expected.spawns }]);
  });
});

describe('уголь: уровень', () => {
  function level(overrides: Partial<Level> = {}): Level {
    return {
      id: 1,
      title: 'Уголь',
      hint: '',
      layout: ['cc....', 'cc....', '......', '......', '......', '......'],
      colors: 4,
      moves: 10,
      goals: [{ kind: 'coal', count: 1 }],
      stars: [
        { kind: 'score', count: 30 },
        { kind: 'level2', count: 1 },
      ],
      ...overrides,
    };
  }

  it('глыба 2×2 из символов c, слоёв — coalLayers (по умолчанию 9)', () => {
    expect(new LevelSession(1, parseLevel(level())).coalLeft).toBe(9);
    expect(new LevelSession(1, parseLevel(level({ coalLayers: 4 }))).coalLeft).toBe(4);
    expect(boardTemplate(level())[1]![1]).toEqual({ kind: 'coal', top: 0, left: 0, layers: 9 });
  });

  it('уголь — только квадраты 2×2, слоёв 1–9, цель не больше глыб на поле', () => {
    const bad = ['ccc...', 'ccc...', 'ccc...', '......', '......', '......'];
    expect(() => parseLevel(level({ layout: bad }))).toThrow('2×2');
    expect(() => parseLevel(level({ coalLayers: 10 }))).toThrow('слоёв');
    expect(() => parseLevel(level({ goals: [{ kind: 'coal', count: 2 }] }))).toThrow('больше');
  });

  it('разбитая глыба засчитывается в цель', () => {
    const session = new LevelSession(1, parseLevel(level({ coalLayers: 1 })));
    session.board = besideCoal(1, 1).map((line) => [...line]);
    for (const step of session.play(swapIn)) void step;
    expect(session.progress.coal).toBe(1);
    expect(session.coalLeft).toBe(0);
  });
});
