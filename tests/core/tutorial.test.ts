import { describe, expect, it } from 'vitest';
import { findMatches } from '../../src/core/match';
import { hasTileMove, isValidSwap } from '../../src/core/moves';
import { TUTORIALS, tutorialBoard, tutorialSession } from '../../src/core/tutorial';

const drain = (steps: Generator<unknown, void, undefined>) => {
  for (let next = steps.next(); !next.done; next = steps.next());
};

describe('обучение', () => {
  it.each(TUTORIALS.map((t) => [t.index, t] as const))(
    'обучение %i: поле без готовых совпадений, и каждый подсказанный ход проходит при любом seed',
    (_, tutorial) => {
      expect(findMatches(tutorialBoard(tutorial))).toEqual([]);
      // Новые фишки сверху случайны: сценарий не должен ломаться ни при каком их раскладе
      for (let seed = 1; seed <= 300; seed++) {
        const session = tutorialSession(tutorial, seed);
        tutorial.steps.forEach((step, i) => {
          expect(session.isOver, `seed ${seed}, шаг ${i + 1}`).toBe(false);
          expect(isValidSwap(session.board, step.from, step.to), `seed ${seed}, шаг ${i + 1}`).toBe(
            true,
          );
          // Ходов на поле хватает: перемешивание не тронет подготовленные фишки
          expect(hasTileMove(session.board)).toBe(true);
          drain(session.play({ type: 'swap', from: step.from, to: step.to }));
        });
        expect(session.goalsDone, `seed ${seed}`).toBe(true);
        expect(session.isOver).toBe(true);
      }
    },
  );

  it('обучение 1: первый ход даёт красную фишку 2 уровня над двумя такими же, второй — фишку 3 уровня', () => {
    const tutorial = TUTORIALS[0]!;
    const session = tutorialSession(tutorial);
    const [first, second] = tutorial.steps;
    drain(session.play({ type: 'swap', from: first!.from, to: first!.to }));
    expect(session.board[4]![2]).toEqual({ kind: 'tile', color: 2, level: 2 });
    expect(session.board[5]!.slice(0, 2)).toEqual([
      { kind: 'tile', color: 2, level: 2 },
      { kind: 'tile', color: 2, level: 2 },
    ]);
    expect(session.progress.level2).toBe(1);
    drain(session.play({ type: 'swap', from: second!.from, to: second!.to }));
    expect(session.board[5]![2]).toEqual({ kind: 'tile', color: 2, level: 3 });
    expect(session.progress.level3).toBe(1);
  });
});
