import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  floorWallet,
  isLevelOpen,
  loadLevelStars,
  saveLevelStars,
  spendFloorStars,
} from '../../src/storage/progress';

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
});

describe('кошелёк этажа', () => {
  it('считает звёзды только своего этажа', () => {
    saveLevelStars(1, 3);
    saveLevelStars(10, 2);
    saveLevelStars(11, 1);
    expect(floorWallet(1)).toBe(5);
    expect(floorWallet(2)).toBe(1);
  });

  it('потраченное вычитается, а звёзды уровня остаются на месте', () => {
    saveLevelStars(1, 3);
    spendFloorStars(1, 2);
    expect(floorWallet(1)).toBe(1);
    expect(floorWallet(2)).toBe(0);
    expect(loadLevelStars()[1]).toBe(3);
  });

  it('повторное прохождение даёт только прибавку к лучшему результату', () => {
    saveLevelStars(1, 2);
    saveLevelStars(1, 2);
    expect(floorWallet(1)).toBe(2);
    saveLevelStars(1, 3);
    expect(floorWallet(1)).toBe(3);
  });
});

describe('порядок уровней', () => {
  it('открыт первый уровень и следующий за пройденным, в том числе на новом этаже', () => {
    const stars = { 1: 1, 10: 2 };
    expect(isLevelOpen(1, {})).toBe(true);
    expect(isLevelOpen(2, {})).toBe(false);
    expect(isLevelOpen(2, stars)).toBe(true);
    expect(isLevelOpen(3, stars)).toBe(false);
    expect(isLevelOpen(11, stars)).toBe(true);
  });
});
