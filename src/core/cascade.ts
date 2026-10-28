import type { Board, Position } from './board';
import { applyGravity, refill, removeCells, type Fall, type Spawn } from './gravity';
import { findMatches, type MatchGroup } from './match';
import type { Rng } from './rng';

// Разбор поля после хода: совпадения → удаление → падение → заполнение → снова совпадения.
// Возвращает шаги для анимации и итоговое поле.
//
// Пока без спецфишек, объединения и выбора игрока: все совпадения просто удаляются.

export type CascadeStep =
  | { kind: 'clear'; groups: MatchGroup[]; cells: Position[] }
  | { kind: 'drop'; falls: Fall[]; spawns: Spawn[] };

/** Защита от бесконечного цикла при ошибке в логике */
const MAX_WAVES = 1000;

export function resolveCascades(
  board: Board,
  colorCount: number,
  rng: Rng,
): { board: Board; steps: CascadeStep[] } {
  const steps: CascadeStep[] = [];
  let current = board;

  for (let wave = 0; wave < MAX_WAVES; wave++) {
    const groups = findMatches(current);
    if (groups.length === 0) return { board: current, steps };

    const cells = groups.flatMap((group) => group.cells);
    steps.push({ kind: 'clear', groups, cells });
    current = removeCells(current, cells);

    const fallen = applyGravity(current);
    const filled = refill(fallen.board, colorCount, rng);
    steps.push({ kind: 'drop', falls: fallen.falls, spawns: filled.spawns });
    current = filled.board;
  }

  throw new Error(`Каскад не завершился за ${MAX_WAVES} волн`);
}
