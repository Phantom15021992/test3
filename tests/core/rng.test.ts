import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';

describe('createRng', () => {
  it('с одинаковым seed выдаёт одинаковую последовательность', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('с разным seed выдаёт разные последовательности', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('int() не выходит за границы', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const n = rng.int(6);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(6);
      expect(Number.isInteger(n)).toBe(true);
    }
  });
});
