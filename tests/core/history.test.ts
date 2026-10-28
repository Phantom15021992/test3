import { describe, expect, it } from 'vitest';
import { History } from '../../src/core/history';
import { createRng } from '../../src/core/rng';

describe('History', () => {
  it('в начале некуда идти ни назад, ни вперёд', () => {
    const history = new History('a');
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
  });

  it('шаг назад и шаг вперёд', () => {
    const history = new History('a');
    history.push('b');
    history.push('c');
    expect(history.undo()).toBe('b');
    expect(history.undo()).toBe('a');
    expect(history.canUndo).toBe(false);
    expect(history.redo()).toBe('b');
    expect(history.redo()).toBe('c');
    expect(history.canRedo).toBe(false);
  });

  it('новый ход после шага назад отбрасывает шаги вперёд', () => {
    const history = new History('a');
    history.push('b');
    history.push('c');
    history.undo();
    history.push('d');
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toBe('b');
  });
});

describe('Rng.getState', () => {
  it('ГСЧ, восстановленный из состояния, продолжает ту же последовательность', () => {
    const rng = createRng(42);
    rng.next();
    const restored = createRng(rng.getState());
    expect(restored.next()).toBe(rng.next());
  });
});
