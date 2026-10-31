import {
  allPositions,
  cloneBoard,
  getCell,
  isChained,
  setCell,
  type Board,
  type Piece,
  type Position,
} from './board';
import { BONUS_TIERS } from './config';
import type { Rng } from './rng';

// Покупка спецфишек: в свободной игре за очки счёта, в кампании за звёзды. Хода не тратит.

export type BonusType = (typeof BONUS_TIERS)[number]['type'];

export function bonusCost(type: BonusType): number {
  return BONUS_TIERS.find((tier) => tier.type === type)!.cost;
}

export function bonusStars(type: BonusType): number {
  return BONUS_TIERS.find((tier) => tier.type === type)!.stars;
}

export function canBuyBonus(score: number, type: BonusType): boolean {
  return score >= bonusCost(type);
}

/** Счёт после покупки, или null — если очков не хватает */
export function buyBonus(score: number, type: BonusType): number | null {
  return canBuyBonus(score, type) ? score - bonusCost(type) : null;
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
    return cell?.kind === 'tile' && cell.level === 1 && !isChained(cell);
  });
  if (candidates.length === 0) return null;
  const pos = candidates[rng.int(candidates.length)]!;
  const piece = bonusPiece(type, rng);
  const next = cloneBoard(board);
  setCell(next, pos, piece);
  return { board: next, pos, piece };
}
