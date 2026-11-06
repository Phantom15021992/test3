import { describe, expect, it } from 'vitest';
import { parseLevelActions, replayLevel } from '../../src/core/levelReplay';
import { LEVELS } from '../../src/levels';
import { play } from '../../scripts/levelBots';

describe('попытка уровня по журналу', () => {
  it('ходы и покупки за звёзды проигрываются заново с тем же итогом', () => {
    // 10-е место: магазин открыт, бот с покупками берёт бомбы, ракеты и радуги
    const level = LEVELS.find((l) => l.id === 10)!;
    const seed = 4242;
    const game = play(level, seed, 'buyer', 20);
    expect(game.journal.some((action) => action.type === 'aim' || action.type === 'pay')).toBe(
      true,
    );
    // Журнал уходит на сервер как JSON и возвращается оттуда же
    const actions = parseLevelActions(JSON.parse(JSON.stringify(game.journal)));
    expect(actions).toEqual(game.journal);
    const session = replayLevel(seed, level, 20, actions!);
    expect(session).not.toBeNull();
    expect(session!.score).toBe(game.score);
    expect(session!.stars).toBe(game.stars);
    expect(session!.moves).toBe(game.movesUsed);
  });

  it('журнал от другого поля не сходится', () => {
    const level = LEVELS.find((l) => l.id === 1)!;
    const game = play(level, 7, 'expert');
    expect(replayLevel(8, level, 0, game.journal)).toBeNull();
  });

  it('испорченный журнал не разбирается', () => {
    expect(parseLevelActions([{ type: 'buy', bonus: 'bomb' }])).toBeNull();
    expect(
      parseLevelActions([{ type: 'aim', bonus: 'rainbow', at: { row: 0, col: 0 } }]),
    ).toBeNull();
    expect(parseLevelActions({})).toBeNull();
  });
});
