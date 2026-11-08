import { describe, expect, it } from 'vitest';
import type { Level } from '../../src/core/level';
import { LEVELS } from '../../src/levels';
import { LevelSession } from '../../src/core/levelSession';
import {
  goalsText,
  goalTaskText,
  levelBriefing,
  levelNumber,
  levelTitle,
  starTaskText,
} from '../../src/ui/levelText';

const level = (overrides: Partial<Level>): Level => ({ ...LEVELS[0]!, ...overrides });

describe('подписи уровня', () => {
  it('короны в прогрессе — из всех на поле: после первой «1/2»', () => {
    const session = new LevelSession(
      1,
      level({ layout: ['o...', '....', '....', '...o'], goals: [{ kind: 'item', count: 1 }] }),
    );
    expect(goalsText(session)).toBe('Короны 0/2');
    session.progress.item = 1;
    expect(goalsText(session)).toBe('Короны 1/2');
  });

  it('номер — этаж-уровень', () => {
    expect(levelNumber(LEVELS[9]!)).toBe('1-10');
    expect(levelTitle(LEVELS[9]!)).toBe('1-10');
  });

  it('все три звезды расписаны подробно, у каждой — сколько звёзд она даёт; цели видны в строке прогресса, задание не повторяется', () => {
    const text = levelBriefing(
      level({
        goals: [{ kind: 'ice', count: 14 }],
        stars: [
          { kind: 'score', count: 1500 },
          { kind: 'level3', count: 2 },
        ],
      }),
    );
    expect(text.split('\n')).toEqual([
      '★ Выполнить задание',
      '★★ Набрать 1500 очков',
      '★★★ Собрать 2 ячейки 3 уровня',
    ]);
  });

  it('во время партии у каждой звезды виден прогресс, выполненная — «готово»', () => {
    const played = level({
      goals: [{ kind: 'level2', count: 3 }],
      stars: [
        { kind: 'score', count: 1500 },
        { kind: 'level3', count: 18 },
      ],
    });
    const session = new LevelSession(1, played);
    session.score = 420;
    session.progress.level3 = 5;
    expect(levelBriefing(played, session).split('\n')).toEqual([
      '★ Выполнить задание',
      '★★ Набрать 1500 очков — 420/1500',
      '★★★ Собрать 18 ячеек 3 уровня — 5/18',
    ]);
    session.progress.level2 = 3;
    session.score = 1600;
    expect(levelBriefing(played, session).split('\n')).toEqual([
      '★ Выполнить задание — готово',
      '★★ Набрать 1500 очков — готово',
      '★★★ Собрать 18 ячеек 3 уровня — 5/18',
    ]);
  });

  it('второй этаж нумеруется своими 1–10', () => {
    expect(levelNumber(level({ id: 11 }))).toBe('2-1');
    expect(levelNumber(level({ id: 20 }))).toBe('2-10');
  });

  it('цели словами', () => {
    expect(goalTaskText({ kind: 'ice', count: 10 })).toBe('сломай 10 льдин');
    expect(goalTaskText({ kind: 'level3', count: 9 })).toBe('собери 9 ячеек 3 уровня');
  });

  it.each([
    [1, 'сломай 1 льдину'],
    [2, 'сломай 2 льдины'],
    [5, 'сломай 5 льдин'],
    [11, 'сломай 11 льдин'],
    [14, 'сломай 14 льдин'],
    [21, 'сломай 21 льдину'],
    [22, 'сломай 22 льдины'],
  ])('склонение после числа %i', (count, expected) => {
    expect(goalTaskText({ kind: 'ice', count })).toBe(expected);
  });

  it('задачи на звёзды: очки и ячейки', () => {
    expect(starTaskText({ kind: 'score', count: 1 })).toBe('Набрать 1 очко');
    expect(starTaskText({ kind: 'score', count: 3 })).toBe('Набрать 3 очка');
    expect(starTaskText({ kind: 'level2', count: 5 })).toBe(
      'Собрать 5 ячеек 2 уровня (3 ур. из фишек — за две)',
    );
  });
});
