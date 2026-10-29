import { describe, expect, it } from 'vitest';
import { getCell } from '../../src/core/board';
import { buyBonus, canBuyBonus, placeBonus } from '../../src/core/bonus';
import { createRng } from '../../src/core/rng';
import { parseBoard } from '../helpers/parseBoard';

describe('покупка спецфишек за очки', () => {
  it('купить можно, когда очков хватает на цену', () => {
    expect(canBuyBonus(249, 'bomb')).toBe(false);
    expect(canBuyBonus(250, 'bomb')).toBe(true);
    expect(canBuyBonus(600, 'rocket')).toBe(true);
    expect(canBuyBonus(600, 'manipulator')).toBe(false);
    expect(canBuyBonus(1000, 'rainbow')).toBe(true);
  });

  it('цена списывается со счёта', () => {
    expect(buyBonus(600, 'bomb')).toBe(350);
    expect(buyBonus(1500, 'rainbow')).toBe(500);
    expect(buyBonus(740, 'manipulator')).toBeNull();
  });
});

describe('placeBonus', () => {
  it('ставит спецфишку только на место фишки 1 уровня', () => {
    const board = parseBoard(`
      R2 *  #
      G3 B1 .
    `);
    const result = placeBonus(board, 'bomb', createRng(5))!;
    expect(result.pos).toEqual({ row: 1, col: 1 });
    expect(getCell(result.board, result.pos)).toEqual({ kind: 'piece', type: 'bomb' });
    // Исходное поле не меняется
    expect(getCell(board, { row: 1, col: 1 })).toEqual({ kind: 'tile', color: 2, level: 1 });
  });

  it('ракета получает случайное направление', () => {
    const board = parseBoard(`
      R1 G1 B1
      Y1 P1 O1
    `);
    const directions = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
        const piece = placeBonus(board, 'rocket', createRng(seed))!.piece;
        return piece.type === 'rocket' ? piece.direction : null;
      }),
    );
    expect(directions).toEqual(new Set(['row', 'col']));
  });

  it('нет фишек 1 уровня — бонус поставить некуда', () => {
    const board = parseBoard(`
      R2 G3
    `);
    expect(placeBonus(board, 'rainbow', createRng(1))).toBeNull();
  });
});
