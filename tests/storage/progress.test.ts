import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  floorWallet,
  isLevelOpen,
  loadLevelStars,
  saveLevelStars,
  saveLevelSpending,
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
    saveLevelSpending(1, 2);
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

describe('возврат при повторной победе', () => {
  it('победа с меньшими тратами возвращает разницу', () => {
    saveLevelStars(1, 3);
    saveLevelSpending(1, 2);
    expect(floorWallet(1)).toBe(1);
    saveLevelSpending(1, 1);
    expect(floorWallet(1)).toBe(2);
    saveLevelSpending(1, 0);
    expect(floorWallet(1)).toBe(3);
  });

  it('победа с большими тратами списывает только разницу', () => {
    saveLevelStars(1, 3);
    saveLevelSpending(1, 1);
    saveLevelSpending(1, 3);
    expect(floorWallet(1)).toBe(0);
  });

  it('траты одного уровня не трогают другой и другой этаж', () => {
    saveLevelStars(1, 3);
    saveLevelStars(2, 3);
    saveLevelStars(11, 3);
    saveLevelSpending(1, 2);
    saveLevelSpending(2, 1);
    saveLevelSpending(11, 1);
    saveLevelSpending(1, 0);
    expect(floorWallet(1)).toBe(5);
    expect(floorWallet(2)).toBe(2);
  });

  it('траты до появления учёта по уровням остаются списанными', () => {
    saveLevelStars(1, 3);
    localStorage.setItem('match3.floorSpent', '{"1":2}');
    saveLevelSpending(1, 0);
    expect(floorWallet(1)).toBe(1);
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
