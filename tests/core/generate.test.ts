import { describe, expect, it } from 'vitest';
import { createEmptyBoard } from '../../src/core/board';
import { generateStartBoard, withLevels } from '../../src/core/generate';
import { findMatches } from '../../src/core/match';
import { hasPossibleMove, hasTileMove } from '../../src/core/moves';
import { createRng } from '../../src/core/rng';
import { parseBoard } from '../helpers/parseBoard';

describe('generateStartBoard', () => {
  it('на разных seed поле без совпадений и с хотя бы одним ходом', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const board = generateStartBoard(createEmptyBoard(8, 8), 6, createRng(seed));
      expect(findMatches(board)).toEqual([]);
      expect(hasPossibleMove(board)).toBe(true);
      expect(board.flat().every((cell) => cell?.kind === 'tile' && cell.level === 1)).toBe(true);
    }
  });

  it('работает и при малом числе цветов', () => {
    const board = generateStartBoard(createEmptyBoard(7, 7), 3, createRng(3));
    expect(findMatches(board)).toEqual([]);
    expect(hasPossibleMove(board)).toBe(true);
  });

  it('одинаковый seed — одинаковое поле', () => {
    const a = generateStartBoard(createEmptyBoard(8, 8), 5, createRng(99));
    const b = generateStartBoard(createEmptyBoard(8, 8), 5, createRng(99));
    expect(a).toEqual(b);
  });

  it('сохраняет дыры и уже стоящие фишки шаблона', () => {
    const template = parseBoard(`
      #  .  .  .
      .  R2 .  .
      .  .  .  #
      .  .  .  .
    `);
    const board = generateStartBoard(template, 5, createRng(5));
    expect(board[0]?.[0]).toEqual({ kind: 'hole' });
    expect(board[2]?.[3]).toEqual({ kind: 'hole' });
    expect(board[1]?.[1]).toEqual({ kind: 'tile', color: 0, level: 2 });
    expect(board.flat().filter((cell) => cell === null)).toEqual([]);
  });

  it('бросает ошибку, если поле невозможно', () => {
    expect(() => generateStartBoard(createEmptyBoard(3, 3), 1, createRng(1))).toThrow();
  });
});

describe('withLevels — стартовое поле с уже собранными ячейками', () => {
  it('30% ячеек 2 уровня и 15% — 3 уровня, без готовых совпадений и с ходом, цвета — из набора', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const start = generateStartBoard(createEmptyBoard(10, 10), 4, createRng(seed));
      const board = withLevels(start, 4, { 2: 0.3, 3: 0.15 }, createRng(seed + 1000));
      const tiles = board.flat().filter((c) => c?.kind === 'tile');
      const level = (n: number) => tiles.filter((c) => c?.kind === 'tile' && c.level === n).length;
      expect(level(2), `seed ${seed}`).toBe(30);
      expect(level(3)).toBe(15);
      expect(level(1)).toBe(55);
      expect(findMatches(board)).toEqual([]);
      expect(hasTileMove(board)).toBe(true);
      for (const c of tiles) if (c?.kind === 'tile') expect(c.color).toBeLessThan(4);
    }
  });

  it('исходное поле не меняется', () => {
    const start = generateStartBoard(createEmptyBoard(10, 10), 4, createRng(7));
    const copy = JSON.stringify(start);
    withLevels(start, 4, { 2: 0.3, 3: 0.15 }, createRng(8));
    expect(JSON.stringify(start)).toBe(copy);
  });
});
