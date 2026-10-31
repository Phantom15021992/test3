import { describe, expect, it } from 'vitest';
import { strongestMove } from '../../src/core/hint';
import type { Level } from '../../src/core/level';
import { LevelSession } from '../../src/core/levelSession';
import { findPossibleMoves } from '../../src/core/moves';
import { GameSession, replayGame } from '../../src/core/session';
import { parseBoard } from '../helpers/parseBoard';

const p = (row: number, col: number) => ({ row, col });

const session = (board: string, colors = 4) => {
  const game = new GameSession(5, colors);
  game.board = parseBoard(board);
  return game;
};

const iceLevel: Level = {
  id: 1,
  title: 'Проба',
  hint: '',
  layout: ['....', '....', '....', '....'],
  colors: 4,
  moves: 10,
  goals: [{ kind: 'ice', count: 3 }],
  stars: [
    { kind: 'movesLeft', count: 1 },
    { kind: 'movesLeft', count: 2 },
  ],
};

function play(seed: number, withHints: boolean): GameSession {
  const game = new GameSession(seed, 5);
  const drain = (steps: Generator<unknown, void, undefined>) => {
    let next = steps.next();
    while (!next.done) next = steps.next();
  };
  while (!game.isOver) {
    if (withHints) strongestMove(game);
    const { from, to } = findPossibleMoves(game.board)[0]!;
    drain(game.play({ type: 'swap', from, to }));
    game.shuffleIfStuck();
  }
  drain(game.finale());
  return game;
}

describe('подсказка самого сильного хода', () => {
  it('выбирает ход, дающий больше очков: ячейки 2 уровня дороже фишек', () => {
    const hint = strongestMove(
      session(`
        R1 R1 G1 B2 B2 Y1
        G1 B1 R1 Y1 G1 B2
      `),
    );
    expect(hint?.kind).toBe('swap');
    expect(hint?.cells).toEqual([p(0, 5), p(1, 5)]);
  });

  it('предпочитает ход бомбой слабому обмену', () => {
    const hint = strongestMove(
      session(`
        R2 G2 B2 Y2
        G2 * Y2 R2
        B2 Y2 R2 G2
        R1 R1 G1 B2
        G1 B1 R1 Y2
      `),
    );
    expect(hint?.cells).toContainEqual(p(1, 1));
  });

  it('у радуги показывает её и фишку самого частого цвета', () => {
    const hint = strongestMove(
      session(`
        @ R1 G1 R1
        G1 R1 B1 R1
        B1 Y1 G1 Y1
      `),
    );
    expect(hint?.kind).toBe('rainbow');
    expect(hint?.cells[0]).toEqual(p(0, 0));
    expect(hint?.move).toMatchObject({ type: 'rainbow', color: 0 });
  });

  it('на уровне цель важнее очков: выбирает ход, ломающий лёд', () => {
    const level = new LevelSession(5, iceLevel);
    level.board = parseBoard(`
      R1 R1 G1 B2 B2 Y1
      G1 B1 R1 Y1 G1 B2
    `);
    level.ice = [
      [true, true, true, false, false, false],
      [false, false, false, false, false, false],
    ];
    expect(strongestMove(level)?.cells).toEqual([p(0, 2), p(1, 2)]);
  });

  it('нет ходов — нет подсказки', () => {
    expect(
      strongestMove(
        session(`
          R1 G1 B1
          B1 R1 G1
        `),
      ),
    ).toBeNull();
  });

  it('не меняет поле', () => {
    const game = session(`
      R1 R1 G1
      G1 B1 R1
    `);
    const before = JSON.stringify(game.board);
    strongestMove(game);
    expect(JSON.stringify(game.board)).toBe(before);
  });

  it('не влияет на партию: журнал с подсказками проходит проверку сервера', () => {
    const plain = play(11, false);
    const hinted = play(11, true);
    expect(hinted.score).toBe(plain.score);
    expect(hinted.actions).toEqual(plain.actions);
    expect(replayGame(11, 5, hinted.actions)).toBe(hinted.score);
  }, 60_000);
});
