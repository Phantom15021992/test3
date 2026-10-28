import { describe, expect, it } from 'vitest';
import { getCell } from '../../src/core/board';
import { addToMeter, canTakeBonus, nextBonus, placeBonus } from '../../src/core/bonus';
import { createRng } from '../../src/core/rng';
import { parseBoard } from '../helpers/parseBoard';

describe('шкала бонусов', () => {
  it('копит очки и останавливается на 1000', () => {
    expect(addToMeter(0, 30)).toBe(30);
    expect(addToMeter(980, 50)).toBe(1000);
  });

  it('бонус доступен, когда набрана его цена', () => {
    expect(canTakeBonus(249, 'bomb')).toBe(false);
    expect(canTakeBonus(250, 'bomb')).toBe(true);
    expect(canTakeBonus(600, 'rocket')).toBe(true);
    expect(canTakeBonus(600, 'manipulator')).toBe(false);
    expect(canTakeBonus(1000, 'rainbow')).toBe(true);
  });

  it('сколько осталось до следующего бонуса', () => {
    expect(nextBonus(0)).toEqual({ type: 'bomb', remaining: 250 });
    expect(nextBonus(250)).toEqual({ type: 'rocket', remaining: 250 });
    expect(nextBonus(720)).toEqual({ type: 'manipulator', remaining: 30 });
    expect(nextBonus(1000)).toBeNull();
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
