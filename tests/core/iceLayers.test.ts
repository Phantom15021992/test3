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

describe('лёд 2 уровня', () => {
  it('символы поля: i — обычный лёд на 1 удар, J и g — лёд 2 уровня на 2 удара', () => {
    const layout = ['iJg', '...'];
    expect(iceTemplate(level({ layout }))[0]).toEqual([1, 2, 2]);
    expect(iceStyles(level({ layout }))[0]).toEqual(['classic', 'plain', 'gold']);
    expect(iceTemplate(level({ layout }))[1]).toEqual([0, 0, 0]);
  });

  it('этап трещин (iceCracks) — на удар больше только льду 2 уровня', () => {
    expect(iceTemplate(level({ layout: ['iJg'], iceCracks: true }))[0]).toEqual([1, 3, 3]);
    expect(() => parseLevel({ ...level(), iceCracks: 'да' })).toThrow('iceCracks');
  });

  it('удар превращает лёд 2 уровня в лёд 1 уровня, в цель идёт только сломанный целиком', () => {
    const session = new LevelSession(1, parseLevel(level()));
    strike(session);
    expect(session.ice[0]?.[0]).toBe(1);
    expect(session.progress.ice).toBe(0);
    strike(session);
    expect(session.ice[0]?.[0]).toBe(0);
    expect(session.progress.ice).toBe(2);
  });

  it('с этапом трещин лёд держит три удара', () => {
    const session = new LevelSession(1, parseLevel(level({ iceCracks: true })));
    strike(session);
    strike(session);
    expect(session.ice[0]?.[0]).toBe(1);
    expect(session.progress.ice).toBe(0);
  });

  it('лёд со слитками: сломан — засчитывается и в золото, и в лёд', () => {
    const session = new LevelSession(1, parseLevel(level({ goals: [{ kind: 'gold', count: 1 }] })));
    strike(session);
    expect(session.progress.gold).toBe(0);
    strike(session);
    expect(session.ice[0]?.[2]).toBe(0);
    expect(session.progress.gold).toBe(1);
  });

  it('цель на лёд считает все виды льда, цель на золото — только лёд со слитками', () => {
    expect(() => parseLevel(level({ goals: [{ kind: 'ice', count: 2 }] }))).not.toThrow();
    expect(() => parseLevel(level({ goals: [{ kind: 'ice', count: 3 }] }))).toThrow('больше');
    expect(() => parseLevel(level({ goals: [{ kind: 'gold', count: 2 }] }))).toThrow('больше');
    expect(() => parseLevel(level({ layout: ['j..', '...', '...'] }))).toThrow('символ');
  });
});
