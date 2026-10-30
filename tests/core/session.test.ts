import { describe, expect, it } from 'vitest';
import { allPositions, getCell, isTile } from '../../src/core/board';
import { bonusCost, type BonusType } from '../../src/core/bonus';
import { BONUS_TIERS, MOVE_LIMIT } from '../../src/core/config';
import { findPossibleMoves } from '../../src/core/moves';
import { createRng, type Rng } from '../../src/core/rng';
import {
  GameSession,
  parseActions,
  replayGame,
  type GameAction,
  type PlayerMove,
} from '../../src/core/session';
import { comboNeedsColor } from '../../src/core/specials';

const COLORS = 5;

/** Случайный ход из всех возможных: обмены, радуга, мега-бомба, манипулятор */
function randomMove(session: GameSession, rng: Rng): PlayerMove {
  const { board } = session;
  const moves: PlayerMove[] = [];
  const tileColor = (): number => {
    const tiles = allPositions(board).flatMap((pos) => {
      const cell = getCell(board, pos);
      return isTile(cell) ? [cell.color] : [];
    });
    return tiles[rng.int(tiles.length)]!;
  };
  for (const { from, to } of findPossibleMoves(board)) {
    moves.push(
      comboNeedsColor(board, from, to)
        ? { type: 'swap', from, to, color: tileColor() }
        : { type: 'swap', from, to },
    );
  }
  for (const at of allPositions(board)) {
    const cell = getCell(board, at);
    if (cell?.kind !== 'piece') continue;
    if (cell.type === 'megaBomb') moves.push({ type: 'megaBomb', at });
    if (cell.type === 'rainbow') moves.push({ type: 'rainbow', at, color: tileColor() });
    if (cell.type === 'manipulator') {
      const others = allPositions(board).filter((pos) => pos.row !== at.row || pos.col !== at.col);
      moves.push({ type: 'manipulator', at, a: others[0]!, b: others[1]! });
    }
  }
  return moves[rng.int(moves.length)]!;
}

/** Партия в том же порядке вызовов, что и в GameScene */
function playGame(seed: number): GameSession {
  const session = new GameSession(seed, COLORS);
  const rng = createRng(seed + 1);
  const drain = (steps: Generator<unknown, void, undefined>) => {
    let next = steps.next();
    while (!next.done) next = steps.next();
  };
  while (!session.isOver) {
    const tier = BONUS_TIERS[rng.int(BONUS_TIERS.length)]!;
    if (session.score >= tier.cost && session.buy(tier.type)) session.shuffleIfStuck();
    drain(session.play(randomMove(session, rng)));
    session.shuffleIfStuck();
  }
  drain(session.finale());
  return session;
}

const swapOf = (session: GameSession): PlayerMove => {
  const { from, to } = findPossibleMoves(session.board)[0]!;
  return { type: 'swap', from, to };
};

describe('проверка партии повтором', () => {
  it('по seed и журналу получается тот же счёт, включая покупки и спецфишки', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const session = playGame(seed);
      const actions = JSON.parse(JSON.stringify(session.actions)) as unknown;
      expect(replayGame(seed, COLORS, parseActions(actions)!)).toBe(session.score);
    }
  });

  it('в партиях встречаются покупки — повтор проверен не только на обменах', () => {
    const buys = Array.from({ length: 6 }, (_, i) => playGame(i + 1).actions)
      .flat()
      .filter((action) => action.type === 'buy');
    expect(buys.length).toBeGreaterThan(0);
  });

  it('с другим seed тот же журнал не проходит', () => {
    const { actions } = playGame(7);
    expect(replayGame(8, COLORS, actions)).toBeNull();
  });

  it('недоигранная партия не проходит', () => {
    const { actions } = playGame(7);
    expect(replayGame(7, COLORS, actions.slice(0, -1))).toBeNull();
  });

  it('лишние ходы после конца партии не проходят', () => {
    const { actions } = playGame(7);
    const extra: GameAction = { type: 'swap', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } };
    expect(replayGame(7, COLORS, [...actions, extra])).toBeNull();
  });

  it('покупка без очков не проходит', () => {
    expect(replayGame(7, COLORS, [{ type: 'buy', bonus: 'rainbow' }])).toBeNull();
  });

  it('обмен без совпадения и обмен за пределами поля не проходят', () => {
    const session = new GameSession(7, COLORS);
    const far = { row: 0, col: 9 };
    expect(session.canApply({ type: 'swap', from: { row: 0, col: 0 }, to: far })).toBe(false);
    const outside = { type: 'swap', from: { row: -1, col: 0 }, to: { row: 0, col: 0 } } as const;
    expect(session.canApply(outside)).toBe(false);
    expect(session.canApply(swapOf(session))).toBe(true);
  });

  it('спецфишку, которой нет на поле, использовать нельзя', () => {
    const session = new GameSession(7, COLORS);
    const at = { row: 0, col: 0 };
    expect(session.canApply({ type: 'megaBomb', at })).toBe(false);
    expect(session.canApply({ type: 'rainbow', at, color: 0 })).toBe(false);
    const a = { row: 1, col: 1 };
    const b = { row: 2, col: 2 };
    expect(session.canApply({ type: 'manipulator', at, a, b })).toBe(false);
  });

  it('цвет у обычного обмена не принимается', () => {
    const session = new GameSession(7, COLORS);
    expect(session.canApply({ ...swapOf(session), color: 0 } as PlayerMove)).toBe(false);
  });

  it('покупка списывает очки и попадает в журнал', () => {
    const session = new GameSession(7, COLORS);
    const type: BonusType = 'bomb';
    session.score = bonusCost(type) + 5;
    expect(session.buy(type)).not.toBeNull();
    expect(session.score).toBe(5);
    expect(session.actions).toEqual([{ type: 'buy', bonus: 'bomb' }]);
    expect(session.buy(type)).toBeNull();
    expect(session.actions).toHaveLength(1);
  });
});

describe('разбор журнала из запроса', () => {
  it('принимает все виды действий', () => {
    const at = { row: 1, col: 2 };
    const actions: GameAction[] = [
      { type: 'swap', from: at, to: at },
      { type: 'swap', from: at, to: at, color: 1 },
      { type: 'rainbow', at, color: 0 },
      { type: 'megaBomb', at },
      { type: 'manipulator', at, a: at, b: at },
      { type: 'buy', bonus: 'bomb' },
    ];
    expect(parseActions(actions)).toEqual(actions);
  });

  it.each([
    ['не массив', { type: 'buy' }],
    ['финал вручную', [{ type: 'finale' }]],
    ['неизвестная покупка', [{ type: 'buy', bonus: 'gold' }]],
    ['дробная клетка', [{ type: 'megaBomb', at: { row: 0.5, col: 1 } }]],
    ['клетка строкой', [{ type: 'megaBomb', at: { row: '0', col: 1 } }]],
    ['пустая запись', [null]],
    ['огромный журнал', Array.from({ length: 1001 }, () => ({ type: 'buy', bonus: 'bomb' }))],
  ])('отклоняет: %s', (_, value) => {
    expect(parseActions(value)).toBeNull();
  });

  it('число ходов в партии соответствует лимиту', () => {
    const moves = playGame(3).actions.filter((action) => action.type !== 'buy');
    expect(moves).toHaveLength(MOVE_LIMIT);
  });
});
