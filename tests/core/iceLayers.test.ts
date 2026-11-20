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
    layout: ['J.i', '...', '...'],
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

describe('лёд: две прочности', () => {
  it('символы поля: i — тонкий лёд на 1 удар, J — крепкий на 2; льда со слитками (g) больше нет', () => {
    const layout = ['iJ.', '...'];
    expect(iceTemplate(level({ layout }))[0]).toEqual([1, 2, 0]);
    expect(iceStyles(level({ layout }))[0]).toEqual(['classic', 'plain', null]);
    expect(() => parseLevel(level({ layout: ['g..', '...', '...'] }))).toThrow('символ');
  });

  it('этапа трещин больше нет: поле iceCracks в уровне — ошибка', () => {
    expect(() => parseLevel({ ...level(), iceCracks: true } as Level)).toThrow('iceCracks');
  });

  it('крепкий лёд: целый → треснувший → нет, в цель идёт только сломанный', () => {
    const session = new LevelSession(1, parseLevel(level()));
    strike(session);
    expect(session.ice[0]?.[0]).toBe(1);
    expect(session.ice[0]?.[2]).toBe(0);
    expect(session.progress.ice).toBe(1);
    strike(session);
    expect(session.ice[0]?.[0]).toBe(0);
    expect(session.progress.ice).toBe(2);
  });

  it('цель на лёд считает и тонкий, и крепкий лёд', () => {
    expect(() => parseLevel(level({ goals: [{ kind: 'ice', count: 2 }] }))).not.toThrow();
    expect(() => parseLevel(level({ goals: [{ kind: 'ice', count: 3 }] }))).toThrow('больше');
    expect(() => parseLevel(level({ layout: ['j..', '...', '...'] }))).toThrow('символ');
  });
});
