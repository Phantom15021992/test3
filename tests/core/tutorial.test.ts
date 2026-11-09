import { describe, expect, it } from 'vitest';
import { isPiece, type Board } from '../../src/core/board';
import { findMatches } from '../../src/core/match';
import { hasTileMove, isValidSwap, swapCells } from '../../src/core/moves';
import { createRng } from '../../src/core/rng';
import { runMove } from '../../src/core/resolve';
import {
  swapFigure,
  TUTORIALS,
  tutorialBoard,
  tutorialMove,
  tutorialSession,
  type TutorialSession,
} from '../../src/core/tutorial';
import { parseBoard } from '../helpers/parseBoard';

const drain = (steps: Generator<unknown, void, undefined>) => {
  for (let next = steps.next(); !next.done; next = steps.next());
};

const pieces = (board: Board) => board.flat().filter((cell) => isPiece(cell)).length;

/** Проигрывает шаги обучения; на каждом ходу вызывает check с партией до хода */
function playSteps(session: TutorialSession, check?: (i: number) => void): void {
  let move = 0;
  for (const step of session.tutorial.steps) {
    if (step.kind === 'info') continue;
    check?.(move);
    const next = tutorialMove(session.board, step);
    expect(next, `ход ${move + 1}`).not.toBeNull();
    if (next!.type === 'swap') expect(isValidSwap(session.board, next!.from, next!.to)).toBe(true);
    drain(session.play(next!));
    move++;
  }
}

const [first, second, third] = TUTORIALS;

describe('обучение', () => {
  it('поля без готовых совпадений', () => {
    for (const tutorial of TUTORIALS) expect(findMatches(tutorialBoard(tutorial))).toEqual([]);
  });

  it('обучение 1 проходится при любом seed: новые фишки сверху не ломают заготовку', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const session = tutorialSession(first!, seed);
      playSteps(session, () => {
        expect(session.isOver, `seed ${seed}`).toBe(false);
        expect(hasTileMove(session.board)).toBe(true);
      });
      expect(session.goalsDone, `seed ${seed}`).toBe(true);
      expect(session.isOver).toBe(true);
    }
  });

  it('обучение 1: фишка 2 уровня встаёт над двумя такими же, потом получается фишка 3 уровня', () => {
    const session = tutorialSession(first!);
    playSteps(session, (move) => {
      if (move === 1) {
        expect(session.board[4]![2]).toEqual({ kind: 'tile', color: 2, level: 2 });
        expect(session.progress.level2).toBe(1);
      }
    });
    expect(session.board[5]![2]).toEqual({ kind: 'tile', color: 2, level: 3 });
  });

  it('подсказка выделяет всю фигуру: клетки совпадения и откуда пришла фишка', () => {
    const board = tutorialBoard(first!);
    const cells = swapFigure(board, { row: 3, col: 2 }, { row: 4, col: 2 });
    expect(cells).toHaveLength(4);
    expect(cells).toEqual(
      expect.arrayContaining([
        { row: 3, col: 2 },
        { row: 4, col: 2 },
        { row: 4, col: 3 },
        { row: 4, col: 4 },
      ]),
    );
  });

  it('обучение 2: каждая подсказка собирает свою фигуру, спецфишек нет, 7 ячеек 3 уровня по подсказкам', () => {
    const sizes = [5, 5, 5, 5, 7, 4, 3];
    const session = tutorialSession(second!);
    playSteps(session, (move) => {
      const step = second!.steps[move]!;
      if (step.kind !== 'swap' || typeof step.from === 'string' || typeof step.to === 'string') {
        throw new Error('шаги обучения 2 — обмены клеток');
      }
      const groups = findMatches(swapCells(session.board, step.from, step.to));
      expect(
        groups.map((g) => g.cells.length),
        `ход ${move + 1}`,
      ).toEqual([sizes[move]]);
      expect(pieces(session.board)).toBe(0);
      expect(session.isOver).toBe(false);
    });
    expect(pieces(session.board)).toBe(0);
    // Ровно 7 по подсказкам: последние 3 игрок собирает сам, обучение ещё идёт, ходов хватает
    expect(session.progress.level3).toBe(7);
    expect(session.isOver).toBe(false);
    expect(session.movesLeft).toBe(93);
    expect(hasTileMove(session.board)).toBe(true);
  });

  it('обучение 3: каждый ход тратит только свои спецфишки, после манипулятора обучение кончается', () => {
    const session = tutorialSession(third!);
    const left = [6, 5, 3, 2, 1];
    playSteps(session, (move) => {
      expect(pieces(session.board), `перед ходом ${move + 1}`).toBe(left[move]);
      expect(session.isOver).toBe(false);
    });
    expect(pieces(session.board)).toBe(0);
    expect(session.isOver).toBe(true);
  });
});

describe('совпадения без спецфишек', () => {
  it('три ячейки 3 уровня просто уходят, вместо мега-бомбы — ничего', () => {
    const board = parseBoard(`
      R3 R3 G1 R3
      G1 B1 B1 G1
    `);
    const ctx = { colorCount: 3, rng: createRng(1), noSpecials: true };
    const result = runMove(
      board,
      { type: 'swap', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
      ctx,
    );
    expect(pieces(result.board)).toBe(0);
    const withSpecials = runMove(
      board,
      { type: 'swap', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
      { colorCount: 3, rng: createRng(1) },
    );
    expect(pieces(withSpecials.board)).toBeGreaterThan(0);
  });
});
