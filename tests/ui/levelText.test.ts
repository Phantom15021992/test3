import { describe, expect, it } from 'vitest';
import type { Level } from '../../src/core/level';
import { LEVELS } from '../../src/levels';
import { LevelSession } from '../../src/core/levelSession';
import {
  goalsText,
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

  it('задание и все три звезды расписаны подробно', () => {
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
      'Задание: сломай 14 льдин',
      '★ Выполнить задание',
      '★ Набрать 1500 очков',
      '★ Собрать 2 ячейки 3 уровня',
    ]);
  });

  it('второй этаж нумеруется своими 1–10', () => {
    expect(levelNumber(level({ id: 11 }))).toBe('2-1');
    expect(levelNumber(level({ id: 20 }))).toBe('2-10');
  });

  it('две цели идут через «и»', () => {
    const text = levelBriefing(LEVELS[8]!);
    expect(text.split('\n')[0]).toBe('Задание: сломай 10 льдин и собери 9 ячеек 3 уровня');
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
    const first = levelBriefing(level({ goals: [{ kind: 'ice', count }] })).split('\n')[0];
    expect(first).toBe(`Задание: ${expected}`);
  });

  it('задачи на звёзды: очки и ячейки', () => {
    expect(starTaskText({ kind: 'score', count: 1 })).toBe('Набрать 1 очко');
    expect(starTaskText({ kind: 'score', count: 3 })).toBe('Набрать 3 очка');
    expect(starTaskText({ kind: 'level2', count: 5 })).toBe(
      'Собрать 5 ячеек 2 уровня (3 ур. из фишек — за две)',
    );
  });
});
