import { describe, expect, it } from 'vitest';
import { applyGravity, itemsOnBottom, refill } from '../../src/core/gravity';
import { parseLevel, type Level } from '../../src/core/level';
import { LevelSession } from '../../src/core/levelSession';
import { isValidSwap, shuffleBoard } from '../../src/core/moves';
import { runMove, type ResolveStep } from '../../src/core/resolve';
import { createRng } from '../../src/core/rng';
import { expandChain, isCombo } from '../../src/core/specials';
import { parseBoard } from '../helpers/parseBoard';

const p = (row: number, col: number) => ({ row, col });
const ctx = () => ({ colorCount: 4, rng: createRng(1) });
const STONE = { kind: 'stone' } as const;
const ITEM = { kind: 'item' } as const;

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
    stars: [{ kind: 'movesLeft', count: 3 }, { kind: 'noBuy' }],
    ...overrides,
  };
}

describe('камни', () => {
  // Камень в клетке (1,2); совпадение R1 в верхней строке — рядом с ним
  const board = () => {
    const b = parseBoard(`
      R1 R1 G1 B1
      G1 B1 R1 Y1
      B1 Y1 G1 R1
    `);
    b[1]![1] = STONE;
    return b;
  };

  it('фишки пролетают сквозь камень', () => {
    const b = parseBoard(`
      R1
      G1
      .
    `);
    b[1]![0] = STONE;
    const { board: fallen, falls } = applyGravity(b);
    expect(fallen[1]?.[0]).toEqual(STONE);
    expect(fallen[2]?.[0]).toEqual({ kind: 'tile', color: expect.any(Number), level: 1 });
    expect(fallen[0]?.[0]).toBeNull();
    expect(falls).toEqual([{ from: p(0, 0), to: p(2, 0) }]);
  });

  it('камень нельзя двигать обменом, и спецфишка с ним не меняется', () => {
    const b = board();
    expect(isValidSwap(b, p(1, 0), p(1, 1))).toBe(false);
    b[1]![0] = { kind: 'piece', type: 'bomb' };
    expect(isValidSwap(b, p(1, 0), p(1, 1))).toBe(false);
  });

  it('совпадение рядом ломает камень, сам камень очков не даёт', () => {
    const b = parseBoard(`
      R1 G1 R1 B1
      G1 R1 Y1 Y1
      B1 Y1 G1 R1
    `);
    b[1]![2] = STONE;
    const { steps } = runMove(b, { type: 'swap', from: p(0, 1), to: p(1, 1) }, ctx());
    const [first] = clears(steps);
    expect(first?.stones).toBe(1);
    expect(first?.points).toBe(30);
  });

  it('взрыв ломает камень', () => {
    const b = parseBoard(`
      * G1
      B1 Y1
    `);
    b[0]![1] = STONE;
    const cells = expandChain(b, [p(0, 0)]);
    expect(cells).toContainEqual(p(0, 1));
  });

  it('перемешивание оставляет камни и предметы на месте', () => {
    const b = parseBoard(`
      R1 G1 B1 Y1
      G1 B1 Y1 R1
      B1 Y1 R1 G1
      Y1 R1 G1 B1
    `);
    b[1]![1] = STONE;
    b[2]![2] = ITEM;
    const shuffled = shuffleBoard(b, 4, createRng(3));
    expect(shuffled[1]?.[1]).toEqual(STONE);
    expect(shuffled[2]?.[2]).toEqual(ITEM);
  });
});

describe('предметы', () => {
  it('взрывы предмет не задевают', () => {
    const b = parseBoard(`
      * G1
      B1 Y1
    `);
    b[0]![1] = ITEM;
    expect(expandChain(b, [p(0, 0)])).not.toContainEqual(p(0, 1));
  });

  it('предмет в совпадениях не участвует и разрывает линию', () => {
    const b = parseBoard(`
      R1 G1 R1 B1
      Y1 B1 G1 Y1
    `);
    b[0]![1] = ITEM;
    expect(isValidSwap(b, p(0, 0), p(1, 0))).toBe(false);
  });

  it('предмет можно сдвинуть, если обмен даёт совпадение', () => {
    const b = parseBoard(`
      R1 R1 G1
      B1 Y1 R1
    `);
    b[0]![2] = ITEM;
    expect(isValidSwap(b, p(0, 2), p(1, 2))).toBe(true);
  });

  it('дном считается нижняя клетка столбца без дыр и камней', () => {
    const b = parseBoard(`
      R1 R1 .
      R1 R1 .
    `);
    b[1]![0] = ITEM;
    b[0]![1] = ITEM;
    b[1]![1] = STONE;
    b[0]![2] = ITEM;
    b[1]![2] = { kind: 'hole' };
    expect(itemsOnBottom(b)).toEqual([p(1, 0), p(0, 1), p(0, 2)]);
  });

  it('дошедший до дна предмет убирается, считается, а место заполняется', () => {
    // Совпадение в нижней строке опускает предмет на дно
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

  it('заполнение не трогает камни и предметы', () => {
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

  it('спецфишка с предметом не срабатывает и не считается комбо', () => {
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
        layout: ['#s..', '.o..', 'i...', '....'],
        goals: [{ kind: 'ice', count: 1 }],
      }),
    );
    expect(session.board[0]?.[0]).toEqual({ kind: 'hole' });
    expect(session.board[0]?.[1]).toEqual(STONE);
    expect(session.board[1]?.[1]).toEqual(ITEM);
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

  it('цели считаются, уровень кончается сразу, звёзды — за запас ходов и без покупок', () => {
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

  it('покупка лишает звезды за игру без покупок', () => {
    const session = new LevelSession(5, level());
    session.score = 1000;
    expect(session.buy('bomb')).not.toBeNull();
    session.progress.level2 = 1;
    expect(session.stars).toBe(2);
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
    ['не две задачи', { stars: [{ kind: 'noBuy' }] }],
  ])('отклоняет: %s', (_, overrides) => {
    expect(() => parseLevel(level(overrides as Partial<Level>))).toThrow();
  });
});
