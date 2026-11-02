import {
  allPositions,
  cloneBoard,
  getCell,
  isChained,
  isPiece,
  setCell,
  type Board,
  type Piece,
  type Position,
} from './board';
import { BONUS_TIERS } from './config';
import type { Rng } from './rng';

// Покупка спецфишек: в свободной игре за очки счёта, встаёт на случайную фишку и хода не тратит.
// В кампании — за звёзды: бомба и ракета срабатывают сразу в клетке, которую выбрал игрок.

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

/** Спецфишки, которые в кампании срабатывают сразу в выбранной клетке */
export type AimedBonus = Extract<BonusType, 'bomb' | 'rocket'>;

const SIDES = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
] as const;

/**
 * Куда можно направить покупку: только обычная фишка 1 уровня и не рядом со спецфишкой, иначе
 * покупка срабатывала бы как дешёвое комбо со спецфишкой, заработанной на поле.
 */
export function isBonusTarget(board: Board, pos: Position): boolean {
  const cell = getCell(board, pos);
  if (cell?.kind !== 'tile' || cell.level !== 1 || isChained(cell)) return false;
  return !SIDES.some(([dr, dc]) =>
    isPiece(getCell(board, { row: pos.row + dr, col: pos.col + dc })),
  );
}

/** Покупная ракета бьёт только по строке: по столбцу она сразу роняла бы корону на дно */
export function aimedPiece(type: AimedBonus): Piece {
  return type === 'rocket' ? { kind: 'piece', type, direction: 'row' } : { kind: 'piece', type };
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
