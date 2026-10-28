// Детерминированный ГСЧ (mulberry32): одинаковый seed — одинаковая игра.
// Нужен для воспроизводимых тестов и багов.

export interface Rng {
  /** Число в [0, 1) */
  next(): number;
  /** Целое в [0, maxExclusive) */
  int(maxExclusive: number): number;
  /** Внутреннее состояние: createRng(getState()) продолжит ту же последовательность */
  getState(): number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    getState: () => state,
  };
}
