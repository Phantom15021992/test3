import { hasPieces, type Position } from './board';
import type { AimedBonus, BonusType } from './bonus';
import { BONUS_TIERS } from './config';
import type { Level } from './level';
import { LevelSession, type LevelAction } from './levelSession';
import { parseActions, type Steps } from './session';

// Попытка уровня заново по seed, звёздам на начало и журналу (LevelSession.journal): так ходы
// живых игроков из level_moves сравниваются с ходами бота. Порядок вызовов — как в GameScene:
// ход, затем перемешивание, если ходов не осталось; покупка ставит спецфишку или платит за свой ход.

function finish(steps: Steps): void {
  for (let next = steps.next(); !next.done; next = steps.next());
}

/** Применяет действие журнала к попытке; false — действие невозможно в этой позиции */
export function applyLevelAction(session: LevelSession, action: LevelAction): boolean {
  if (session.isOver) return false;
  switch (action.type) {
    case 'aim':
      return session.aimBonus(action.bonus, action.at) !== null;
    case 'pay':
      return session.payBonus(action.bonus);
    // Купленные радуга и манипулятор: оплата уже прошла отдельным действием 'pay'
    case 'boughtRainbow':
    case 'boughtManipulator':
      break;
    default:
      if (!session.canApply(action)) return false;
  }
  finish(session.play(action));
  session.shuffleIfStuck();
  return true;
}

/**
 * Проигрывает попытку целиком. null — журнал не сходится с уровнем (другая версия поля или
 * испорченная запись). Если уровень кончился, финал кампании проигрывается тоже.
 */
export function replayLevel(
  seed: number,
  level: Level,
  wallet: number,
  actions: readonly LevelAction[],
): LevelSession | null {
  const session = new LevelSession(seed, level, wallet);
  for (const action of actions) {
    if (!applyLevelAction(session, action)) return null;
  }
  if (session.isOver && hasPieces(session.board)) finish(session.campaignFinale());
  return session;
}

// ---------- Разбор журнала из непроверенного JSON ----------

const isInt = (value: unknown): value is number => Number.isInteger(value);

function parsePosition(value: unknown): Position | null {
  if (typeof value !== 'object' || value === null) return null;
  const { row, col } = value as Record<string, unknown>;
  return isInt(row) && isInt(col) ? { row, col } : null;
}

const isBonus = (value: unknown): value is BonusType =>
  BONUS_TIERS.some((tier) => tier.type === value);

function parseLevelAction(value: unknown): LevelAction | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  switch (v.type) {
    case 'aim': {
      const at = parsePosition(v.at);
      return at && (v.bonus === 'bomb' || v.bonus === 'rocket')
        ? { type: 'aim', bonus: v.bonus as AimedBonus, at }
        : null;
    }
    case 'pay':
      return isBonus(v.bonus) ? { type: 'pay', bonus: v.bonus } : null;
    case 'boughtRainbow':
      return isInt(v.color) ? { type: 'boughtRainbow', color: v.color } : null;
    case 'boughtManipulator': {
      const a = parsePosition(v.a);
      const b = parsePosition(v.b);
      return a && b ? { type: 'boughtManipulator', a, b } : null;
    }
    case 'buy':
      return null; // покупка на случайную клетку бывает только в свободной игре
    default: {
      const parsed = parseActions([value])?.[0];
      return parsed && parsed.type !== 'buy' ? parsed : null;
    }
  }
}

/** Журнал попытки из JSON (например, выгрузки level_moves); null — если он неправильного вида */
export function parseLevelActions(value: unknown): LevelAction[] | null {
  if (!Array.isArray(value)) return null;
  const actions = value.map(parseLevelAction);
  return actions.every((action) => action !== null) ? (actions as LevelAction[]) : null;
}
