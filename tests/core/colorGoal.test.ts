import { describe, expect, it } from 'vitest';
import { parseLevel, type Level } from '../../src/core/level';
import { LevelSession } from '../../src/core/levelSession';
import { goalTaskText, goalsText } from '../../src/ui/levelText';
import { parseBoard } from '../helpers/parseBoard';

const p = (row: number, col: number) => ({ row, col });

function level(color: number, overrides: Partial<Level> = {}): Level {
  return {
    id: 1,
    title: 'Цвет',
    hint: '',
    layout: ['...', '...', '...'],
    colors: 4,
    moves: 10,
    goals: [{ kind: 'level3color', count: 2, color }],
    stars: [
      { kind: 'score', count: 30 },
      { kind: 'level2', count: 1 },
    ],
    ...overrides,
  };
}

/** Ход собирает G2 G2 G2 в верхней строке: одна ячейка 3 уровня цвета 1 (в игре — жёлтый) */
function greenStar(session: LevelSession): void {
  session.board = parseBoard(`
    G2 G2 R1
    B1 Y1 G2
    Y1 B1 R1
  `);
  for (const step of session.play({ type: 'swap', from: p(1, 2), to: p(0, 2) })) void step;
}

describe('цель: ячейки 3 уровня одного цвета', () => {
  it('считаются только ячейки 3 уровня нужного цвета', () => {
    const green = new LevelSession(1, parseLevel(level(1)));
    greenStar(green);
    expect(green.goalValue(green.level.goals[0]!)).toBe(1);
    const red = new LevelSession(1, parseLevel(level(0)));
    greenStar(red);
    expect(red.goalValue(red.level.goals[0]!)).toBe(0);
    expect(red.progress.level3).toBe(1);
  });

  it('цвет обязателен, только у этой цели и в пределах палитры', () => {
    expect(() => parseLevel(level(4))).toThrow('палитры');
    expect(() => parseLevel(level(0, { goals: [{ kind: 'level3color', count: 1 }] }))).toThrow(
      'цвет',
    );
    expect(() => parseLevel(level(0, { goals: [{ kind: 'ice', count: 1, color: 0 }] }))).toThrow(
      'цвет',
    );
  });

  it('тексты: «Жёлтые звёзды 1/2» и «собери 2 жёлтые звезды»', () => {
    const session = new LevelSession(1, parseLevel(level(1)));
    greenStar(session);
    expect(goalsText(session)).toBe('Жёлтые звёзды 1/2');
    expect(goalTaskText(session.level.goals[0]!)).toContain('собери 2 жёлтые звезды');
    expect(goalTaskText({ kind: 'level3color', count: 5, color: 0 })).toContain(
      'собери 5 синих звёзд',
    );
  });
});
