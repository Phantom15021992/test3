import { describe, expect, it } from 'vitest';
import type { Board } from '../../src/core/board';
import { applyGravity, itemsOnBottom, refill } from '../../src/core/gravity';
import { parseLevel, type Level } from '../../src/core/level';
import { LevelSession } from '../../src/core/levelSession';
import { isValidSwap, shuffleBoard } from '../../src/core/moves';
import { runMove, type ResolveStep } from '../../src/core/resolve';
import { createRng } from '../../src/core/rng';
import { GameSession } from '../../src/core/session';
import { expandChain, isCombo } from '../../src/core/specials';
import { parseBoard } from '../helpers/parseBoard';

const p = (row: number, col: number) => ({ row, col });
const ctx = () => ({ colorCount: 4, rng: createRng(1) });
const STONE = { kind: 'stone' } as const;
const BOX = { kind: 'box' } as const;
const ITEM = { kind: 'item' } as const;

function drain(steps: Generator<unknown, void, undefined>): void {
  let next = steps.next();
  while (!next.done) next = steps.next();
}

const clears = (steps: ResolveStep[]) =>
  steps.filter((step): step is Extract<ResolveStep, { kind: 'clear' }> => step.kind === 'clear');

function level(overrides: Partial<Level> = {}): Level {
  return {
    id: 1,
    title: 'Проба',
    hint: '',
    layout: ['....', '....', '....', '....'],
    colors: 4,
    moves: 10,
    goals: [{ kind: 'level2', count: 1 }],
    stars: [
      { kind: 'movesLeft', count: 3 },
      { kind: 'movesLeft', count: 5 },
    ],
    ...overrides,
  };
}

describe('камни', () => {
  it('камень падает вниз вместе с фишками и закрывает собой нижнюю клетку', () => {
    const b = parseBoard(`
      R1
      .
      .
    `);
    b[0]![0] = STONE;
    const { board: fallen } = applyGravity(b);
    expect(fallen[2]?.[0]).toEqual(STONE);
  });

  it('камень встаёт на камень, а фишки — на них', () => {
    const b = parseBoard(`
      R1
      .
      G1
      .
    `);
    b[1]![0] = STONE;
    b[2]![0] = STONE;
    const { board: fallen } = applyGravity(b);
    expect(fallen[3]?.[0]).toEqual(STONE);
    expect(fallen[2]?.[0]).toEqual(STONE);
    expect(fallen[1]?.[0]?.kind).toBe('tile');
  });

  it('камень пролетает сквозь дыру', () => {
    const b = parseBoard(`
      R1
      #
      .
    `);
    b[0]![0] = STONE;
    expect(applyGravity(b).board[2]?.[0]).toEqual(STONE);
  });

  it('камень нельзя двигать обменом, и спецфишка с ним не меняется', () => {
    const b = parseBoard(`
      R1 G1
      B1 Y1
    `);
    b[0]![1] = STONE;
    expect(isValidSwap(b, p(0, 0), p(0, 1))).toBe(false);
    b[0]![0] = { kind: 'piece', type: 'bomb' };
    expect(isValidSwap(b, p(0, 0), p(0, 1))).toBe(false);
  });

  it('совпадение рядом камень не ломает', () => {
    const b = parseBoard(`
      R1 G1 R1 B1
      G1 R1 Y1 Y1
      B1 Y1 G1 R1
    `);
    b[1]![2] = STONE;
    const { steps, board: after } = runMove(b, { type: 'swap', from: p(0, 1), to: p(1, 1) }, ctx());
    expect(clears(steps).some((step) => step.stones)).toBe(false);
    expect(after.flat().filter((cell) => cell?.kind === 'stone')).toHaveLength(1);
  });

  it('взрыв разбивает камень', () => {
    const b = parseBoard(`
      * G1
      B1 Y1
    `);
    b[0]![1] = STONE;
    const { steps } = runMove(b, { type: 'fire', at: p(0, 0) }, ctx());
    expect(clears(steps)[0]?.stones).toBe(1);
  });

  it('перемешивание переставляет камни и короны наравне с фишками', () => {
    const b = parseBoard(`
      R1 G1 B1 Y1
      G1 B1 Y1 R1
      B1 Y1 R1 G1
      Y1 R1 G1 B1
    `);
    b[1]![1] = STONE;
    b[2]![2] = ITEM;
    const shuffled = shuffleBoard(b, 4, createRng(3));
    expect(shuffled[1]?.[1]).not.toEqual(STONE);
    expect(shuffled.flat().filter((cell) => cell?.kind === 'stone')).toHaveLength(1);
    expect(shuffled.flat().filter((cell) => cell?.kind === 'item')).toHaveLength(1);
  });
});

describe('коробки', () => {
  it('фишки пролетают сквозь коробку, сама она стоит', () => {
    const b = parseBoard(`
      R1
      G1
      .
    `);
    b[1]![0] = BOX;
    const { board: fallen, falls } = applyGravity(b);
    expect(fallen[1]?.[0]).toEqual(BOX);
    expect(fallen[0]?.[0]).toBeNull();
    expect(falls).toEqual([{ from: p(0, 0), to: p(2, 0) }]);
  });

  it('коробку нельзя двигать обменом', () => {
    const b = parseBoard(`
      R1 G1
    `);
    b[0]![1] = BOX;
    expect(isValidSwap(b, p(0, 0), p(0, 1))).toBe(false);
  });

  it('совпадение рядом ломает коробку, сама она очков не даёт', () => {
    const b = parseBoard(`
      R1 G1 R1 B1
      G1 R1 Y1 Y1
      B1 Y1 G1 R1
    `);
    b[1]![2] = BOX;
    const { steps } = runMove(b, { type: 'swap', from: p(0, 1), to: p(1, 1) }, ctx());
    const [first] = clears(steps);
    expect(first?.boxes).toBe(1);
    expect(first?.points).toBe(30);
  });

  it('взрыв ломает коробку', () => {
    const b = parseBoard(`
      * G1
      B1 Y1
    `);
    b[0]![1] = BOX;
    expect(expandChain(b, [p(0, 0)])).toContainEqual(p(0, 1));
  });

  it('перемешивание оставляет коробку на месте', () => {
    const b = parseBoard(`
      R1 G1 B1 Y1
      G1 B1 Y1 R1
      B1 Y1 R1 G1
      Y1 R1 G1 B1
    `);
    b[1]![1] = BOX;
    expect(shuffleBoard(b, 4, createRng(3))[1]?.[1]).toEqual(BOX);
  });
});

describe('цепи', () => {
  const chain = (b: Board, row: number, col: number, links: number) => {
    const cell = b[row]?.[col];
    if (cell?.kind === 'tile') cell.chain = links;
  };
  // Совпадение R1: левая фишка верхней строки под цепью
  const matchBoard = (links: number) => {
    const b = parseBoard(`
      R1 R1 G1
      B1 Y1 R1
      Y1 B1 G1
    `);
    chain(b, 0, 0, links);
    return b;
  };
  const move = { type: 'swap', from: p(0, 2), to: p(1, 2) } as const;

  it('фишку под цепью нельзя сдвинуть даже в совпадение, и спецфишка с ней не меняется', () => {
    const b = parseBoard(`
      R1 G1 R1 R1
      B1 Y1 B1 Y1
    `);
    chain(b, 0, 1, 1);
    expect(isValidSwap(b, p(0, 0), p(0, 1))).toBe(false);
    b[1]![1] = { kind: 'piece', type: 'bomb' };
    expect(isValidSwap(b, p(1, 1), p(0, 1))).toBe(false);
  });

  it('фишка под цепью не падает, остальные пролетают сквозь неё', () => {
    const b = parseBoard(`
      R1
      G1
      .
    `);
    chain(b, 1, 0, 1);
    const { board: fallen } = applyGravity(b);
    expect(fallen[1]?.[0]).toMatchObject({ kind: 'tile', chain: 1 });
    expect(fallen[2]?.[0]).toMatchObject({ kind: 'tile' });
    expect(fallen[0]?.[0]).toBeNull();
  });

  it('совпадение снимает звено: фишка остаётся, свободные объединяются как обычно', () => {
    const { steps, board: after } = runMove(matchBoard(2), move, ctx());
    const [first] = clears(steps);
    expect(first?.links).toEqual([{ pos: p(0, 0), left: 1 }]);
    expect(first?.cells).not.toContainEqual(p(0, 0));
    expect(after[0]?.[0]).toMatchObject({ kind: 'tile', level: 1, chain: 1 });
    const placed = steps.find((step) => step.kind === 'transform');
    expect(placed).toMatchObject({
      placements: [{ pos: p(0, 2), cell: { kind: 'tile', level: 2 } }],
    });
  });

  it('последнее звено освобождает фишку: она снова обычная', () => {
    const { board: after, steps } = runMove(matchBoard(1), move, ctx());
    expect(clears(steps)[0]?.links).toEqual([{ pos: p(0, 0), left: 0 }]);
    expect(after[0]?.[0]).not.toHaveProperty('chain');
  });

  it('награда не встаёт в клетку под цепью', () => {
    const b = parseBoard(`
      R1 R1 G1
      B1 Y1 R1
      Y1 B1 G1
    `);
    chain(b, 0, 1, 1);
    const { steps } = runMove(b, move, ctx());
    const placed = steps.find((step) => step.kind === 'transform');
    expect(placed).toMatchObject({ placements: [{ pos: p(0, 2) }] });
  });

  it('взрыв снимает звено, но фишку не уничтожает', () => {
    const b = parseBoard(`
      * G1
      B1 Y1
    `);
    chain(b, 0, 1, 2);
    const { steps, board: after } = runMove(b, { type: 'fire', at: p(0, 0) }, ctx());
    expect(clears(steps)[0]?.links).toEqual([{ pos: p(0, 1), left: 1 }]);
    expect(after[0]?.[1]).toMatchObject({ chain: 1 });
  });

  it('перемешивание фишку под цепью не трогает', () => {
    const b = parseBoard(`
      R1 G1 B1 Y1
      G1 B1 Y1 R1
      B1 Y1 R1 G1
      Y1 R1 G1 B1
    `);
    chain(b, 1, 1, 3);
    expect(shuffleBoard(b, 4, createRng(3))[1]?.[1]).toEqual(b[1]?.[1]);
  });

  it('цель считает освобождённые фишки, а не снятые звенья', () => {
    const session = new LevelSession(
      5,
      level({ layout: ['2...', '....', '....', '....'], goals: [{ kind: 'chain', count: 1 }] }),
    );
    expect(session.board[0]?.[0]).toMatchObject({ kind: 'tile', chain: 2 });
    session.board = matchBoard(2);
    drain(session.play(move));
    expect(session.progress.chain).toBe(0);
    const again = matchBoard(1);
    session.board = again;
    drain(session.play(move));
    expect(session.progress.chain).toBe(1);
  });
});

describe('короны', () => {
  it('взрывы корону не задевают', () => {
    const b = parseBoard(`
      * G1
      B1 Y1
    `);
    b[0]![1] = ITEM;
    expect(expandChain(b, [p(0, 0)])).not.toContainEqual(p(0, 1));
  });

  it('корона в совпадениях не участвует и разрывает линию', () => {
    const b = parseBoard(`
      R1 G1 R1 B1
      Y1 B1 G1 Y1
    `);
    b[0]![1] = ITEM;
    expect(isValidSwap(b, p(0, 0), p(1, 0))).toBe(false);
  });

  it('корону можно сдвинуть, если обмен даёт совпадение', () => {
    const b = parseBoard(`
      R1 R1 G1
      B1 Y1 R1
    `);
    b[0]![2] = ITEM;
    expect(isValidSwap(b, p(0, 2), p(1, 2))).toBe(true);
  });

  it('дно — только нижняя клетка столбца: дыры не клетки, а камень надо разбить', () => {
    const b = parseBoard(`
      R1 R1 .
      R1 R1 .
    `);
    b[1]![0] = ITEM;
    b[0]![1] = ITEM;
    b[1]![1] = STONE;
    b[0]![2] = ITEM;
    b[1]![2] = { kind: 'hole' };
    expect(itemsOnBottom(b)).toEqual([p(1, 0), p(0, 2)]);
  });

  it('манипулятор двигает корону', () => {
    const game = new GameSession(1, 4);
    game.board = parseBoard(`
      M R1
      G1 B1
    `);
    game.board[0]![1] = ITEM;
    expect(game.canApply({ type: 'manipulator', at: p(0, 0), a: p(0, 1), b: p(1, 1) })).toBe(true);
  });

  it('дошедшая до дна корона убирается, считается, а место заполняется', () => {
    const b = parseBoard(`
      R1 G1 G1
      B1 R1 R1
    `);
    b[0]![1] = ITEM;
    const { steps, board: after } = runMove(b, { type: 'swap', from: p(0, 0), to: p(1, 0) }, ctx());
    const collected = clears(steps).find((step) => step.items);
    expect(collected?.items).toBe(1);
    expect(collected?.points).toBe(0);
    expect(after.flat().some((cell) => cell?.kind === 'item')).toBe(false);
    expect(after.flat().includes(null)).toBe(false);
  });

  it('заполнение не трогает камни и короны', () => {
    const b = parseBoard(`
      . R1
      . R1
    `);
    b[1]![0] = ITEM;
    b[1]![1] = STONE;
    const { board: filled } = refill(b, 3, createRng(1));
    expect(filled[1]?.[0]).toEqual(ITEM);
    expect(filled[1]?.[1]).toEqual(STONE);
  });

  it('спецфишка с короной не срабатывает и не считается комбо', () => {
    const b = parseBoard(`
      * R1
    `);
    b[0]![1] = ITEM;
    expect(isCombo(b, p(0, 0), p(0, 1))).toBe(false);
    expect(isValidSwap(b, p(0, 0), p(0, 1))).toBe(false);
  });
});

describe('партия на уровне', () => {
  const swap = (session: LevelSession, board: string, from = p(0, 2), to = p(1, 2)) => {
    session.board = parseBoard(board);
    const steps = session.play({ type: 'swap', from, to });
    let next = steps.next();
    while (!next.done) next = steps.next();
  };

  it('поле собирается по описанию: дыры, камни, предметы, лёд', () => {
    const session = new LevelSession(
      5,
      level({
        layout: ['#s..', '.o.b', 'i...', '...3'],
        goals: [{ kind: 'ice', count: 1 }],
      }),
    );
    expect(session.board[0]?.[0]).toEqual({ kind: 'hole' });
    expect(session.board[0]?.[1]).toEqual(STONE);
    expect(session.board[1]?.[1]).toEqual(ITEM);
    expect(session.board[1]?.[3]).toEqual(BOX);
    expect(session.board[3]?.[3]).toMatchObject({ kind: 'tile', level: 1, chain: 3 });
    expect((session.board[3]?.[3] as { color: number }).color).toBeGreaterThanOrEqual(0);
    expect(session.board[2]?.[0]?.kind).toBe('tile');
    expect(session.ice[2]?.[0]).toBe(true);
    expect(session.ice[1]?.[0]).toBe(false);
  });

  it('лёд ломается, когда на клетке исчезает фишка, и остаётся на месте при падении', () => {
    const session = new LevelSession(
      5,
      level({ layout: ['....', 'i...', '.i..', '....'], goals: [{ kind: 'ice', count: 2 }] }),
    );
    session.ice = [
      [true, false, false],
      [false, false, false],
      [false, true, false],
    ];
    swap(
      session,
      `
      R1 R1 G1
      B1 Y1 R1
      Y1 B1 G1
    `,
    );
    expect(session.progress.ice).toBe(1);
    expect(session.ice[0]?.[0]).toBe(false);
    expect(session.ice[2]?.[1]).toBe(true);
  });

  it('цели считаются, уровень кончается сразу, звёзды — за запас ходов', () => {
    const session = new LevelSession(5, level());
    expect(session.isOver).toBe(false);
    swap(
      session,
      `
      R1 R1 G1
      B1 Y1 R1
    `,
    );
    expect(session.progress.level2).toBeGreaterThan(0);
    expect(session.goalsDone).toBe(true);
    expect(session.isOver).toBe(true);
    expect(session.movesLeft).toBe(9);
    expect(session.stars).toBe(3);
  });

  it('ходы кончились, цели не выполнены — ноль звёзд', () => {
    const session = new LevelSession(5, level({ moves: 1 }));
    session.moves = 1;
    expect(session.isOver).toBe(true);
    expect(session.stars).toBe(0);
  });
});

describe('проверка описания уровня', () => {
  it('принимает правильный уровень', () => {
    expect(parseLevel(level()).id).toBe(1);
  });

  it.each([
    ['строки разной длины', { layout: ['...', '..'] }],
    ['неизвестный символ', { layout: ['.?.'] }],
    ['мало цветов', { colors: 2 }],
    ['нет целей', { goals: [] }],
    ['неизвестная цель', { goals: [{ kind: 'score', count: 1 }] }],
    ['льда меньше цели', { goals: [{ kind: 'ice', count: 5 }] }],
    ['не две задачи', { stars: [{ kind: 'movesLeft', count: 1 }] }],
  ])('отклоняет: %s', (_, overrides) => {
    expect(() => parseLevel(level(overrides as Partial<Level>))).toThrow();
  });
});
