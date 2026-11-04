import {
  allPositions,
  getCell,
  isPiece,
  isTile,
  posKey,
  type Board,
  type PieceType,
  type Position,
} from './board';
import { LevelSession } from './levelSession';
import { findPossibleMoves } from './moves';
import { runMove, type ResolveStep } from './resolve';
import { createRng } from './rng';
import type { GameSession, PlayerMove } from './session';
import { activationSwapTarget, comboNeedsColor, isCombo, mostFrequentColor } from './specials';

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
      if (need('coal')) value += (step.coal?.length ?? 0) * GOAL_STEP_VALUE;
      if (need('item')) value += (step.items ?? 0) * ITEM_VALUE;
      for (const { row, col } of step.cells) {
        const iced = (session.ice[row]?.[col] ?? 0) > 0;
        const gold = iced && session.iceStyle[row]?.[col] === 'gold';
        if ((need('ice') && iced) || (need('gold') && gold)) broken.add(`${row},${col}`);
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

/** Что ход делает сразу, до падения новых фишек: их цвета случайны, и иначе подсказка
 * выбирала бы не сильный ход, а удачный каскад */
function preview(session: GameSession, hint: Hint): { steps: ResolveStep[]; board: Board } {
  const { steps, board } = runMove(session.board, hint.move, {
    colorCount: session.colorCount,
    rng: createRng(PREVIEW_SEED),
    campaign: session.campaign,
  });
  const drop = steps.findIndex((step) => step.kind === 'drop');
  return { steps: drop < 0 ? steps : steps.slice(0, drop), board };
}

function hintValue(session: GameSession, steps: ResolveStep[], board: Board): number {
  const points = steps.reduce((sum, step) => sum + (step.kind === 'clear' ? step.points : 0), 0);
  return session instanceof LevelSession ? points + goalValue(session, steps, board) : points;
}

/**
 * Какую спецфишку ход тратит: срабатывание на месте, радуга по цвету, комбо двух спецфишек или сдвиг
 * взрывной спецфишки. Радуга и манипулятор, сдвинутые в совпадение, просто переезжают — их ход не тратит
 */
function spentPiece(board: Board, hint: Hint): PieceType | null {
  const { move } = hint;
  if (move.type === 'fire' || move.type === 'rainbow') {
    const cell = getCell(board, move.at);
    return isPiece(cell) ? cell.type : null;
  }
  if (move.type !== 'swap') return null;
  const fireAt = isCombo(board, move.from, move.to)
    ? move.to
    : activationSwapTarget(board, move.from, move.to);
  if (!fireAt) return null;
  const cell = getCell(board, posKey(fireAt) === posKey(move.to) ? move.from : move.to);
  return isPiece(cell) ? cell.type : null;
}

/**
 * Спецфишку ради одних очков подсказка не предлагает: только если цветная комбинация, которую
 * собирает сдвинутая навстречу фишка, даёт такую же спецфишку или продвигает задание уровня.
 * Срабатывание на месте, радуга по цвету и комбо двух спецфишек цветной комбинации не собирают
 */
function spendsWisely(session: GameSession, hint: Hint, steps: ResolveStep[]): boolean {
  const spent = spentPiece(session.board, hint);
  if (!spent) return true;
  const { move } = hint;
  if (move.type !== 'swap' || isCombo(session.board, move.from, move.to)) return false;
  const fireAt = activationSwapTarget(session.board, move.from, move.to)!;
  // Совпадение срабатывает раньше взрыва: его шаги — до первой очистки, задевшей спецфишку
  const blast = steps.findIndex(
    (step) => step.kind === 'clear' && step.cells.some((pos) => posKey(pos) === posKey(fireAt)),
  );
  const match = steps.slice(0, blast < 0 ? steps.length : blast);
  const sameAgain = match.some(
    (step) =>
      step.kind === 'transform' &&
      step.placements.some(({ cell }) => isPiece(cell) && cell.type === spent),
  );
  if (sameAgain) return true;
  return session instanceof LevelSession && goalValue(session, match, session.board) > 0;
}

/** Самый сильный ход; null — если ходов нет */
export function strongestMove(session: GameSession): Hint | null {
  let best: Hint | null = null;
  let bestValue = -Infinity;
  // Если без спецфишек ходов нет (так почти не бывает), лучше подсказать хоть что-то
  let fallback: Hint | null = null;
  let fallbackValue = -Infinity;
  for (const hint of candidates(session.board)) {
    const { steps, board } = preview(session, hint);
    const value = hintValue(session, steps, board);
    if (value > fallbackValue) {
      fallbackValue = value;
      fallback = hint;
    }
    if (value > bestValue && spendsWisely(session, hint, steps)) {
      bestValue = value;
      best = hint;
    }
  }
  return best ?? fallback;
}
