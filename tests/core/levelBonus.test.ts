import { describe, expect, it } from 'vitest';
import { getCell, setCell, type Board } from '../../src/core/board';
import { bonusStars, isBonusTarget } from '../../src/core/bonus';
import type { Level } from '../../src/core/level';
import { LevelSession } from '../../src/core/levelSession';
import type { ResolveStep } from '../../src/core/resolve';
import type { GameSession } from '../../src/core/session';
import { parseBoard } from '../helpers/parseBoard';

const level: Level = {
  id: 1,
  title: 'Тест',
  hint: '',
  layout: ['....', '....', '....', '....'],
  colors: 4,
  moves: 10,
  goals: [{ kind: 'level3', count: 50 }],
  stars: [
    { kind: 'movesLeft', count: 1 },
    { kind: 'movesLeft', count: 2 },
  ],
};

const board = () =>
  parseBoard(`
    R1 G1 B1 Y1
    G1 B1 Y1 R1
    B1 Y1 R1 G1
    Y1 R1 G1 B1
  `);

function sessionOn(cells: Board, wallet: number): LevelSession {
  const session = new LevelSession(5, level, wallet);
  session.board = cells;
  return session;
}

function finish(steps: Generator<ResolveStep, void, undefined>): ResolveStep[] {
  const seen: ResolveStep[] = [];
  let next = steps.next();
  while (!next.done) {
    seen.push(next.value);
    next = steps.next();
  }
  return seen;
}

const firstClear = (steps: ResolveStep[]) => {
  const clear = steps.find((step) => step.kind === 'clear');
  if (clear?.kind !== 'clear') throw new Error('нет удаления');
  return clear;
};

describe('покупка спецфишек в кампании', () => {
  it('цены в звёздах: 3, 5, 5 и 15', () => {
    expect(['bomb', 'rocket', 'manipulator', 'rainbow'].map((t) => bonusStars(t as never))).toEqual(
      [3, 5, 5, 15],
    );
  });

  it('бомба срабатывает сразу в выбранной клетке и тратит ход', () => {
    const session = sessionOn(board(), 3);
    expect(session.aimBonus('bomb', { row: 1, col: 1 })).toEqual({ kind: 'piece', type: 'bomb' });
    const steps = finish(session.play({ type: 'fire', at: { row: 1, col: 1 } }));
    expect(firstClear(steps).cells).toHaveLength(9);
    expect(session.moves).toBe(1);
    expect(session.starsLeft).toBe(0);
    expect(session.stats.bought.bomb).toBe(1);
  });

  it('покупная ракета всегда бьёт по строке', () => {
    const session = sessionOn(board(), 5);
    const piece = session.aimBonus('rocket', { row: 2, col: 1 });
    expect(piece).toEqual({ kind: 'piece', type: 'rocket', direction: 'row' });
    const steps = finish(session.play({ type: 'fire', at: { row: 2, col: 1 } }));
    expect(firstClear(steps).cells.every((pos) => pos.row === 2)).toBe(true);
  });

  it('ракета разбивает камень', () => {
    const cells = board();
    setCell(cells, { row: 2, col: 3 }, { kind: 'stone' });
    const session = sessionOn(cells, 5);
    session.aimBonus('rocket', { row: 2, col: 0 });
    const steps = finish(session.play({ type: 'fire', at: { row: 2, col: 0 } }));
    expect(firstClear(steps).stones).toBe(1);
    expect(session.progress.stone).toBe(1);
  });

  it('целиться можно только в обычную фишку 1 уровня', () => {
    const cells = parseBoard(`
      R1 G2 B3
      G1 Y1 R1
      B1 .  #
    `);
    setCell(cells, { row: 1, col: 1 }, { kind: 'tile', color: 0, level: 1, chain: 2 });
    expect(isBonusTarget(cells, { row: 0, col: 0 })).toBe(true);
    expect(isBonusTarget(cells, { row: 0, col: 1 })).toBe(false);
    expect(isBonusTarget(cells, { row: 0, col: 2 })).toBe(false);
    expect(isBonusTarget(cells, { row: 1, col: 1 })).toBe(false);
    expect(isBonusTarget(cells, { row: 2, col: 1 })).toBe(false);
    expect(isBonusTarget(cells, { row: 2, col: 2 })).toBe(false);
  });

  it('рядом со спецфишкой целиться нельзя, по диагонали можно', () => {
    const cells = parseBoard(`
      R1 G1 B1
      G1 *  R1
      B1 Y1 R1
    `);
    expect(isBonusTarget(cells, { row: 0, col: 1 })).toBe(false);
    expect(isBonusTarget(cells, { row: 1, col: 0 })).toBe(false);
    expect(isBonusTarget(cells, { row: 1, col: 2 })).toBe(false);
    expect(isBonusTarget(cells, { row: 2, col: 1 })).toBe(false);
    expect(isBonusTarget(cells, { row: 0, col: 0 })).toBe(true);
    expect(isBonusTarget(cells, { row: 2, col: 2 })).toBe(true);
  });

  it('без звёзд или в запрещённую клетку ничего не списывается', () => {
    const poor = sessionOn(board(), 2);
    expect(poor.aimBonus('bomb', { row: 0, col: 0 })).toBeNull();
    expect(poor.starsSpent).toBe(0);

    const cells = board();
    setCell(cells, { row: 0, col: 1 }, { kind: 'piece', type: 'bomb' });
    const rich = sessionOn(cells, 9);
    expect(rich.aimBonus('bomb', { row: 0, col: 0 })).toBeNull();
    expect(rich.starsSpent).toBe(0);
    expect(getCell(rich.board, { row: 0, col: 0 })?.kind).toBe('tile');
  });

  it('купленная радуга убирает цвет без фишки на поле', () => {
    const session = sessionOn(board(), 15);
    expect(session.payBonus('rainbow')).toBe(true);
    const steps = finish(session.play({ type: 'boughtRainbow', color: 0 }));
    expect(firstClear(steps).cells).toHaveLength(4);
    expect(session.moves).toBe(1);
    expect(session.starsLeft).toBe(0);
  });

  it('купленный манипулятор меняет две любые клетки без фишки на поле', () => {
    const session = sessionOn(board(), 5);
    expect(session.payBonus('manipulator')).toBe(true);
    const a = { row: 0, col: 0 };
    const b = { row: 3, col: 3 };
    const before = getCell(session.board, a);
    const steps = finish(session.play({ type: 'boughtManipulator', a, b }));
    expect(steps[0]).toEqual({ kind: 'swap', a, b });
    expect(session.moves).toBe(1);
    expect(before).not.toBeUndefined();
  });

  it('без звёзд оплатить нельзя', () => {
    const session = sessionOn(board(), 14);
    expect(session.payBonus('rainbow')).toBe(false);
    expect(session.starsSpent).toBe(0);
  });

  it('старая покупка на случайную клетку в кампании не работает', () => {
    const session = sessionOn(board(), 20);
    session.score = 100000;
    expect((session as GameSession).buy('bomb')).toBeNull();
    expect(session.score).toBe(100000);
    expect(session.starsSpent).toBe(0);
  });

  it('покупка не влияет на полученные звёзды', () => {
    const session = sessionOn(board(), 5);
    session.payBonus('manipulator');
    session.progress.level3 = 50;
    expect(session.stars).toBe(3);
  });
});
