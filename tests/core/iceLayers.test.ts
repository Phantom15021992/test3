import { describe, expect, it } from 'vitest';
import { iceStyles, iceTemplate, parseLevel, type Level } from '../../src/core/level';
import { LevelSession } from '../../src/core/levelSession';
import { parseBoard } from '../helpers/parseBoard';

const p = (row: number, col: number) => ({ row, col });

function level(overrides: Partial<Level> = {}): Level {
  return {
    id: 1,
    title: 'Лёд',
    hint: '',
    layout: ['J.g', '...', '...'],
    colors: 4,
    moves: 10,
    goals: [{ kind: 'ice', count: 1 }],
    stars: [
      { kind: 'score', count: 30 },
      { kind: 'level2', count: 1 },
    ],
    ...overrides,
  };
}

/** Ход собирает верхнюю строку R1 R1 R1: удар по льду в клетках (0,0), (0,1), (0,2) */
function strike(session: LevelSession): void {
  session.board = parseBoard(`
    R1 R1 G1
    B1 Y1 R1
    Y1 B1 G1
  `);
  for (const step of session.play({ type: 'swap', from: p(1, 2), to: p(0, 2) })) void step;
}

describe('лёд со слоями', () => {
  it('символы поля: i — 1 удар, j — 2, J — 3, g — 2 и золото', () => {
    const layout = ['ijJg', '....'];
    expect(iceTemplate(level({ layout }))[0]).toEqual([1, 2, 3, 2]);
    expect(iceStyles(level({ layout }))[0]).toEqual(['classic', 'thin', 'thick', 'gold']);
    expect(iceTemplate(level({ layout }))[1]).toEqual([0, 0, 0, 0]);
  });

  it('лёд 2 уровня: удар снимает слой, в цель идёт только целиком сломанный', () => {
    const session = new LevelSession(1, parseLevel(level()));
    strike(session);
    expect(session.ice[0]?.[0]).toBe(2);
    expect(session.progress.ice).toBe(0);
  });

  it('последний удар ломает льдину, она засчитывается в цель', () => {
    const session = new LevelSession(1, parseLevel(level()));
    session.ice = [
      [1, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    strike(session);
    expect(session.ice[0]?.[0]).toBe(0);
    expect(session.progress.ice).toBe(1);
  });

  it('лёд со слитками золота: сломан — засчитывается и в золото, и в лёд', () => {
    const session = new LevelSession(1, parseLevel(level({ goals: [{ kind: 'gold', count: 1 }] })));
    strike(session);
    expect(session.ice[0]?.[2]).toBe(1);
    expect(session.progress.gold).toBe(0);
    strike(session);
    expect(session.progress.gold).toBe(1);
    expect(session.progress.ice).toBe(1);
  });

  it('цель на лёд считает все виды льда, цель на золото — только лёд со слитками', () => {
    expect(() => parseLevel(level({ goals: [{ kind: 'ice', count: 2 }] }))).not.toThrow();
    expect(() => parseLevel(level({ goals: [{ kind: 'ice', count: 3 }] }))).toThrow('больше');
    expect(() => parseLevel(level({ goals: [{ kind: 'gold', count: 2 }] }))).toThrow('больше');
  });
});
