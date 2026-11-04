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
      { kind: 'score', count: 30 },
      { kind: 'level2', count: 1 },
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

  it('перемешивание оставляет камни и короны на месте', () => {
    const b = parseBoard(`
      R1 G1 B1 Y1
      G1 B1 Y1 R1
      B1 Y1 R1 G1
      Y1 R1 G1 B1
    `);
    b[1]![1] = STONE;
    b[2]![2] = ITEM;
    for (let seed = 1; seed <= 20; seed++) {
      const shuffled = shuffleBoard(b, 4, createRng(seed));
      expect(shuffled[1]?.[1]).toEqual(STONE);
      expect(shuffled[2]?.[2]).toEqual(ITEM);
    }
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

  it('корона над дыркой посреди столбца не засчитывается: пролетает её и доходит до дна', () => {
    const b = parseBoard(`
      R1
      .
      .
    `);
    b[0]![0] = ITEM;
    b[1]![0] = { kind: 'hole' };
    expect(itemsOnBottom(b)).toEqual([]);
    const fallen = applyGravity(b).board;
    expect(fallen[2]?.[0]).toEqual(ITEM);
    expect(itemsOnBottom(fallen)).toEqual([p(2, 0)]);
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
    expect(session.ice[2]?.[0]).toBe(1);
    expect(session.ice[1]?.[0]).toBe(0);
  });

  it('лёд ломается, когда на клетке исчезает фишка, и остаётся на месте при падении', () => {
    const session = new LevelSession(
      5,
      level({ layout: ['....', 'i...', '.i..', '....'], goals: [{ kind: 'ice', count: 2 }] }),
    );
    session.ice = [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
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
    expect(session.ice[0]?.[0]).toBe(0);
    expect(session.ice[2]?.[1]).toBe(1);
  });

  it('цели и задачи на звёзды выполнены одним ходом — уровень кончается, три звезды', () => {
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

  it('цели выполнены, а задачи на звёзды нет — уровень идёт до конца ходов', () => {
    const session = new LevelSession(
      5,
      level({
        stars: [
          { kind: 'score', count: 100000 },
          { kind: 'level3', count: 50 },
        ],
      }),
    );
    swap(
      session,
      `
      R1 R1 G1
      B1 Y1 R1
    `,
    );
    expect(session.goalsDone).toBe(true);
    expect(session.stars).toBe(1);
    expect(session.isOver).toBe(false);
    session.moves = 10;
    expect(session.isOver).toBe(true);
    expect(session.stars).toBe(1);
  });

  it('после целей уровень кончается, как только выполнены все задачи на звёзды', () => {
    const session = new LevelSession(
      5,
      level({
        stars: [
          { kind: 'score', count: 1000 },
          { kind: 'level3', count: 2 },
        ],
      }),
    );
    swap(
      session,
      `
      R1 R1 G1
      B1 Y1 R1
    `,
    );
    expect(session.isOver).toBe(false);
    session.score = 1000;
    expect(session.isOver).toBe(false);
    session.progress.level3 = 2;
    expect(session.isOver).toBe(true);
    expect(session.stars).toBe(3);
  });

  it('ячейка 3 уровня сразу из фишек идёт в цель на ячейки 2 уровня за две', () => {
    const session = new LevelSession(5, level({ goals: [{ kind: 'level2', count: 50 }] }));
    session.board = parseBoard(`
      R1 R1 G1 R1 R1
      B1 Y1 R1 Y1 B1
    `);
    const steps = session.play({ type: 'swap', from: p(0, 2), to: p(1, 2) });
    let next = steps.next();
    while (next.value?.kind !== 'transform') next = steps.next();
    expect(next.value).toMatchObject({ kind: 'transform', direct3: 1 });
    expect(session.progress.level2).toBe(2);
    expect(session.progress.level3).toBe(1);
  });

  it('с коронами уровень идёт до второй короны и очков: за них — звёзды', () => {
    const session = new LevelSession(
      5,
      level({
        layout: ['o...', '....', '....', '...o'],
        goals: [{ kind: 'item', count: 1 }],
        stars: [
          { kind: 'score', count: 1 },
          { kind: 'item', count: 2 },
        ],
      }),
    );
    session.progress.item = 1;
    expect(session.goalsDone).toBe(true);
    expect(session.isOver).toBe(false);
    expect(session.stars).toBe(1);
    session.progress.item = 2;
    expect(session.isOver).toBe(false);
    session.score = 10;
    expect(session.isOver).toBe(true);
    expect(session.stars).toBe(3);
  });

  it('с коронами ходы кончились после первой короны — победа', () => {
    const session = new LevelSession(
      5,
      level({ layout: ['o...', '....', '....', '...o'], goals: [{ kind: 'item', count: 1 }] }),
    );
    session.progress.item = 1;
    session.moves = 10;
    expect(session.isOver).toBe(true);
    expect(session.stars).toBeGreaterThan(0);
  });

  it('финал: ходы кончились — бомба доламывает лёд, и итог уже победа', () => {
    const session = new LevelSession(5, level({ moves: 1, goals: [{ kind: 'ice', count: 2 }] }));
    session.board = parseBoard(`
      R1 G1 B1 Y1
      G1 *  Y1 R1
      B1 Y1 R1 G1
      Y1 R1 G1 B1
    `);
    session.ice = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
    ];
    session.progress.ice = 0;
    session.moves = 1;
    expect(session.isOver).toBe(true);
    expect(session.goalsDone).toBe(false);
    drain(session.campaignFinale());
    expect(session.progress.ice).toBe(2);
    expect(session.goalsDone).toBe(true);
    expect(session.stars).toBeGreaterThan(0);
    expect(session.board.flat().some((cell) => cell?.kind === 'piece')).toBe(false);
  });

  it('финал: радуга выбирает цвет, который даёт задание, а не самый частый', () => {
    const session = new LevelSession(5, level({ moves: 1, goals: [{ kind: 'ice', count: 1 }] }));
    session.board = parseBoard(`
      R1 R1 G1 R1
      @  B1 R1 G1
      R1 G1 R1 B1
    `);
    session.ice = [
      [0, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 0, 0],
    ];
    session.moves = 1;
    drain(session.campaignFinale());
    expect(session.goalsDone).toBe(true);
  });

  it('финал: три звезды взяты досрочно — оставшаяся бомба всё равно срабатывает на очки', () => {
    const session = new LevelSession(5, level({ moves: 10 }));
    session.board = parseBoard(`
      R1 G1 B1 Y1
      G1 *  Y1 R1
      B1 Y1 R1 G1
      Y1 R1 G1 B1
    `);
    session.progress.level2 = 1;
    session.score = 30;
    expect(session.stars).toBe(3);
    expect(session.isOver).toBe(true);
    expect(session.movesLeft).toBe(10);
    drain(session.campaignFinale());
    expect(session.score).toBeGreaterThan(30);
    expect(session.stars).toBe(3);
    expect(session.board.flat().some((cell) => cell?.kind === 'piece')).toBe(false);
  });

  it('финал: спецфишек нет — поле и итог не меняются', () => {
    const session = new LevelSession(5, level({ moves: 1 }));
    session.moves = 1;
    const before = JSON.stringify(session.board);
    drain(session.campaignFinale());
    expect(JSON.stringify(session.board)).toBe(before);
    expect(session.score).toBe(0);
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
    ['не две задачи', { stars: [{ kind: 'score', count: 1 }] }],
    [
      'запас ходов больше не задача',
      {
        stars: [
          { kind: 'movesLeft', count: 1 },
          { kind: 'score', count: 1 },
        ],
      },
    ],
  ])('отклоняет: %s', (_, overrides) => {
    expect(() => parseLevel(level(overrides as Partial<Level>))).toThrow();
  });
});
