import { describe, expect, it } from 'vitest';
import { coalStage } from '../../src/view/coalStage';

describe('стадия картинки угля', () => {
  it('глыба начинается с самой большой картинки и кончается самой маленькой при любом числе слоёв', () => {
    for (let start = 1; start <= 9; start++) {
      expect(coalStage(start, start)).toBe(1);
      if (start > 1) expect(coalStage(1, start)).toBe(9);
    }
  });

  it('стадии делятся поровну и идут только вперёд', () => {
    expect([3, 2, 1].map((layers) => coalStage(layers, 3))).toEqual([1, 5, 9]);
    expect([9, 8, 7, 6, 5, 4, 3, 2, 1].map((layers) => coalStage(layers, 9))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    for (let start = 2; start <= 9; start++) {
      for (let layers = start; layers > 1; layers--) {
        expect(coalStage(layers - 1, start)).toBeGreaterThan(coalStage(layers, start));
      }
    }
  });
});
