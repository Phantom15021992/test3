import { describe, expect, it } from 'vitest';
import { choiceOdds, type WeighedMove } from '../../scripts/levelBots';

const pick = (total: number): WeighedMove => ({
  move: { type: 'fire', at: { row: 0, col: total } },
  value: total,
  total,
});

describe('выбор хода ботом', () => {
  it('температура 0 — всегда лучший ход (при равенстве — первый)', () => {
    expect(choiceOdds([pick(10), pick(30), pick(30)], 0)).toEqual([0, 1, 0]);
  });

  it('с температурой ценный ход вероятнее, но слабые тоже возможны', () => {
    const odds = choiceOdds([pick(0), pick(100), pick(200)], 100);
    expect(odds.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(odds[2]!).toBeGreaterThan(odds[1]!);
    expect(odds[1]!).toBeGreaterThan(odds[0]!);
    // Разница в одну температуру — шансы в e раз
    expect(odds[2]! / odds[1]!).toBeCloseTo(Math.E);
  });

  it('чем выше температура, тем ровнее выбор', () => {
    const hot = choiceOdds([pick(0), pick(100)], 10_000);
    expect(hot[0]!).toBeCloseTo(0.5, 1);
  });
});
