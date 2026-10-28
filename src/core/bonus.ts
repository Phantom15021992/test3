import {
  allPositions,
  cloneBoard,
  getCell,
  setCell,
  type Board,
  type Piece,
  type Position,
} from './board';
import { BONUS_METER_MAX, BONUS_TIERS } from './config';
import type { Rng } from './rng';

// Шкала бонусов: очки копятся до BONUS_METER_MAX, за набранную сумму игрок берёт спецфишку.
// Взятие обнуляет шкалу (общий счёт не трогается) и хода не тратит.

export type BonusType = (typeof BONUS_TIERS)[number]['type'];

export function addToMeter(meter: number, points: number): number {
  return Math.min(BONUS_METER_MAX, meter + points);
}

export function bonusCost(type: BonusType): number {
  return BONUS_TIERS.find((tier) => tier.type === type)!.cost;
}

export function canTakeBonus(meter: number, type: BonusType): boolean {
  return meter >= bonusCost(type);
}

/** Ближайший ещё не накопленный бонус, или null — если шкала полна */
export function nextBonus(meter: number): { type: BonusType; remaining: number } | null {
  const tier = BONUS_TIERS.find((t) => meter < t.cost);
  return tier ? { type: tier.type, remaining: tier.cost - meter } : null;
}

function bonusPiece(type: BonusType, rng: Rng): Piece {
  if (type === 'rocket')
    return { kind: 'piece', type, direction: rng.int(2) === 0 ? 'row' : 'col' };
  return { kind: 'piece', type };
}

/**
 * Ставит спецфишку на место случайной фишки 1 уровня.
 * null — если таких фишек на поле нет.
 */
export function placeBonus(
  board: Board,
  type: BonusType,
  rng: Rng,
): { board: Board; pos: Position; piece: Piece } | null {
  const candidates = allPositions(board).filter((pos) => {
    const cell = getCell(board, pos);
    return cell?.kind === 'tile' && cell.level === 1;
  });
  if (candidates.length === 0) return null;
  const pos = candidates[rng.int(candidates.length)]!;
  const piece = bonusPiece(type, rng);
  const next = cloneBoard(board);
  setCell(next, pos, piece);
  return { board: next, pos, piece };
}
