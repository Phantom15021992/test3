import { allPositions, getCell, isPiece, isTile, type Board, type Position } from './board';
import { LevelSession } from './levelSession';
import { findPossibleMoves } from './moves';
import { runMove, type ResolveStep } from './resolve';
import { createRng } from './rng';
import type { GameSession, PlayerMove } from './session';
import { comboNeedsColor, mostFrequentColor } from './specials';

// Подсказка: самый сильный ход на текущем поле.
// Ходы примеряются на копии поля и на своём ГСЧ: ГСЧ партии трогать нельзя, иначе журнал партии
// разойдётся с тем, что сервер получит при проверке. Поэтому фишки, которые упадут сверху,
// подсказка не знает, как и игрок.

export type HintKind = 'swap' | 'fire' | 'rainbow';

export interface Hint {
  kind: HintKind;
  /** Клетки, которые нужно показать игроку */
  cells: Position[];
  move: PlayerMove;
}

/** Постоянный seed: одно и то же поле всегда даёт одну и ту же подсказку */
const PREVIEW_SEED = 20261031;
// На уровне важнее цели, чем очки: сколько очков стоит единица прогресса
const GOAL_STEP_VALUE = 100;
const ITEM_VALUE = 400;
const ITEM_ROW_VALUE = 40;

function candidates(board: Board): Hint[] {
  const hints: Hint[] = [];
  const color = mostFrequentColor(board) ?? 0;
  for (const { from, to } of findPossibleMoves(board)) {
    const move: PlayerMove = comboNeedsColor(board, from, to)
      ? { type: 'swap', from, to, color }
      : { type: 'swap', from, to };
    hints.push({ kind: 'swap', cells: [from, to], move });
  }
  for (const at of allPositions(board)) {
    const cell = getCell(board, at);
    if (!isPiece(cell)) continue;
    if (cell.type === 'rocket' || cell.type === 'bomb' || cell.type === 'megaBomb') {
      hints.push({ kind: 'fire', cells: [at], move: { type: 'fire', at } });
    }
    if (cell.type === 'rainbow') {
      const tile = allPositions(board).find((pos) => {
        const other = getCell(board, pos);
        return isTile(other) && other.color === color;
      });
      if (tile)
        hints.push({ kind: 'rainbow', cells: [at, tile], move: { type: 'rainbow', at, color } });
    }
  }
  return hints;
}

function itemRows(board: Board): number {
  return allPositions(board)
    .filter((pos) => getCell(board, pos)?.kind === 'item')
    .reduce((sum, pos) => sum + pos.row, 0);
}

/** Сколько ход даёт для целей уровня */
function goalValue(session: LevelSession, steps: ResolveStep[], after: Board): number {
  const need = (kind: string) =>
    session.level.goals.some((goal) => goal.kind === kind && session.goalValue(goal) < goal.count);
  let value = need('item') ? (itemRows(after) - itemRows(session.board)) * ITEM_ROW_VALUE : 0;
  const broken = new Set<string>();
  for (const step of steps) {
    if (step.kind === 'clear') {
      if (need('stone')) value += (step.stones ?? 0) * GOAL_STEP_VALUE;
      if (need('box')) value += (step.boxes ?? 0) * GOAL_STEP_VALUE;
      if (need('chain')) value += (step.links?.length ?? 0) * GOAL_STEP_VALUE;
      if (need('item')) value += (step.items ?? 0) * ITEM_VALUE;
      for (const { row, col } of step.cells) {
        if (need('ice') && session.ice[row]?.[col]) broken.add(`${row},${col}`);
      }
    }
    if (step.kind === 'transform') {
      for (const { cell } of step.placements) {
        const reached =
          cell?.kind === 'tile'
            ? (`level${cell.level}` as const)
            : cell?.kind === 'piece' && cell.type;
        if (typeof reached === 'string' && need(reached)) value += GOAL_STEP_VALUE;
      }
    }
  }
  return value + broken.size * GOAL_STEP_VALUE;
}

/**
 * Считается только то, что ход делает сразу, до падения новых фишек: их цвета случайны,
 * и иначе подсказка выбирала бы не сильный ход, а удачный каскад.
 */
function hintValue(session: GameSession, hint: Hint): number {
  const { steps, board } = runMove(session.board, hint.move, {
    colorCount: session.colorCount,
    rng: createRng(PREVIEW_SEED),
  });
  const drop = steps.findIndex((step) => step.kind === 'drop');
  const immediate = drop < 0 ? steps : steps.slice(0, drop);
  const points = immediate.reduce(
    (sum, step) => sum + (step.kind === 'clear' ? step.points : 0),
    0,
  );
  return session instanceof LevelSession ? points + goalValue(session, immediate, board) : points;
}

/** Самый сильный ход; null — если ходов нет */
export function strongestMove(session: GameSession): Hint | null {
  let best: Hint | null = null;
  let bestValue = -Infinity;
  for (const hint of candidates(session.board)) {
    const value = hintValue(session, hint);
    if (value > bestValue) {
      bestValue = value;
      best = hint;
    }
  }
  return best;
}
