import { describe, expect, it } from 'vitest';
import type { Level } from '../../src/core/level';
import { LEVELS } from '../../src/levels';
import { levelBriefing, levelNumber, levelTitle, starTaskText } from '../../src/ui/levelText';

const level = (overrides: Partial<Level>): Level => ({ ...LEVELS[0]!, ...overrides });

describe('подписи уровня', () => {
  it('номер — этаж-уровень', () => {
    expect(levelNumber(LEVELS[9]!)).toBe('1-10');
    expect(levelTitle(LEVELS[9]!)).toBe('1-10 · Ледяной ромб');
  });

  it('задание и все три звезды расписаны подробно', () => {
    const text = levelBriefing(
      level({
        goals: [{ kind: 'ice', count: 14 }],
        stars: [
          { kind: 'movesLeft', count: 6 },
          { kind: 'level3', count: 2 },
        ],
      }),
    );
    expect(text.split('\n')).toEqual([
      'Задание: сломай 14 льдин',
      '★ Выполнить задание',
      '★ Закончить, когда осталось 6 ходов или больше',
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

  it('склоняется и запас ходов', () => {
    expect(starTaskText({ kind: 'movesLeft', count: 1 })).toContain('1 ход или больше');
    expect(starTaskText({ kind: 'movesLeft', count: 3 })).toContain('3 хода или больше');
  });
});
