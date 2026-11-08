import {
  FLOOR_SIZE,
  floorOf,
  type Goal,
  type GoalKind,
  type Level,
  type StarTask,
} from '../core/level';
import { LevelSession } from '../core/levelSession';
import type { GameSession } from '../core/session';

const GOAL_NAMES: Readonly<Record<GoalKind, string>> = {
  level2: 'Ячейки 2 ур.',
  level3: 'Ячейки 3 ур.',
  megaBomb: 'Мега-бомбы',
  rainbow: 'Радуги',
  ice: 'Лёд',
  stone: 'Камни',
  box: 'Сундуки',
  item: 'Короны',
  coal: 'Уголь',
  gold: 'Золото',
  level3color: 'Звёзды',
};

/**
 * Цвета палитры (порядок — как в игре) в формах для цели level3color:
 * «синие звёзды», «собери 1 синюю / 2 синие / 5 синих звёзд»
 */
const COLOR_FORMS: readonly (readonly [string, string, string])[] = [
  ['синюю', 'синие', 'синих'],
  ['жёлтую', 'жёлтые', 'жёлтых'],
  ['красную', 'красные', 'красных'],
  ['зелёную', 'зелёные', 'зелёных'],
  ['фиолетовую', 'фиолетовые', 'фиолетовых'],
  ['оранжевую', 'оранжевые', 'оранжевых'],
  ['голубую', 'голубые', 'голубых'],
];

/** Название цели в строке прогресса: у цели по цвету — «Синие звёзды» */
function goalName(goal: Goal): string {
  if (goal.kind !== 'level3color') return GOAL_NAMES[goal.kind];
  const few = COLOR_FORMS[goal.color ?? 0]?.[1] ?? '';
  return `${few.charAt(0).toUpperCase()}${few.slice(1)} звёзды`;
}

/** Ячейка 3 уровня, собранная сразу из фишек, засчитывается как две ячейки 2 уровня */
const DIRECT3_NOTE = ' (3 ур. из фишек — за две)';

/** Разделитель целей в строке прогресса */
export const GOALS_SEPARATOR = '  ·  ';

/** Прогресс целей одной строкой: «Лёд 3/12 · Камни 0/4» */
export function goalsText(session: LevelSession): string {
  return goalItems(session).join(GOALS_SEPARATOR);
}

/**
 * Прогресс каждой цели отдельно — экран переносит их на вторую строку, если не помещаются.
 * Короны — из всех на поле («1/2»): уровень идёт до последней короны, и «1/1» выглядело бы так,
 * будто он уже закончен
 */
export function goalItems(session: LevelSession): string[] {
  return session.level.goals.map((goal) => {
    if (goal.kind === 'item') {
      return `${GOAL_NAMES.item} ${Math.min(session.progress.item, session.crowns)}/${session.crowns}`;
    }
    const text = `${goalName(goal)} ${session.goalValue(goal)}/${goal.count}`;
    // У угля виден и остаток слоёв: иначе удары по глыбе не видны в прогрессе
    const layers = session.coalLeft;
    return goal.kind === 'coal' && layers > 0 ? `${text} (слоёв ${layers})` : text;
  });
}

/** Номер уровня: этаж-уровень, например «1-10» */
export function levelNumber(level: Level): string {
  const floor = floorOf(level.id);
  return `${floor}-${level.id - (floor - 1) * FLOOR_SIZE}`;
}

/** Заголовок экрана уровня — только номер: название в JSON остаётся для редактора */
export function levelTitle(level: Level): string {
  return levelNumber(level);
}

/** Русское склонение после числа: 1 льдина, 2 льдины, 5 льдин, 21 льдина */
function plural(count: number, one: string, few: string, many: string): string {
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (units === 1) return one;
  return units >= 2 && units <= 4 ? few : many;
}

/** Цель уровня словами: «сломай 14 льдин», «собери 5 синих звёзд» */
export function goalTaskText({ kind, count, color }: Goal): string {
  const n = String(count);
  switch (kind) {
    case 'level2':
      return `собери ${n} ${plural(count, 'ячейку', 'ячейки', 'ячеек')} 2 уровня${DIRECT3_NOTE}`;
    case 'level3':
      return `собери ${n} ${plural(count, 'ячейку', 'ячейки', 'ячеек')} 3 уровня`;
    case 'megaBomb':
      return `создай ${n} ${plural(count, 'мега-бомбу', 'мега-бомбы', 'мега-бомб')}`;
    case 'rainbow':
      return `создай ${n} ${plural(count, 'радугу', 'радуги', 'радуг')}`;
    case 'ice':
      return `сломай ${n} ${plural(count, 'льдину', 'льдины', 'льдин')}`;
    case 'stone':
      return `разбей взрывом ${n} ${plural(count, 'камень', 'камня', 'камней')}`;
    case 'box':
      return `открой и сломай ${n} ${plural(count, 'сундук', 'сундука', 'сундуков')}`;
    case 'item':
      return `опусти на дно ${n} ${plural(count, 'корону', 'короны', 'корон')}`;
    case 'coal':
      return `разбей ${n} ${plural(count, 'глыбу', 'глыбы', 'глыб')} угля`;
    case 'level3color': {
      const [one, few, many] = COLOR_FORMS[color ?? 0] ?? ['', '', ''];
      return `собери ${n} ${plural(count, `${one} звезду`, `${few} звезды`, `${many} звёзд`)} (ячейки 3 уровня)`;
    }
    case 'gold':
      return `достань золото: ${n} (слитки во льду и сундуки с сокровищами)`;
  }
}

export function starTaskText({ kind, count }: StarTask): string {
  const cells = plural(count, 'ячейку', 'ячейки', 'ячеек');
  switch (kind) {
    case 'score':
      return `Набрать ${count} ${plural(count, 'очко', 'очка', 'очков')}`;
    case 'level2':
      return `Собрать ${count} ${cells} 2 уровня${DIRECT3_NOTE}`;
    case 'level3':
      return `Собрать ${count} ${cells} 3 уровня`;
    case 'item':
      return `Опустить на дно ${count} ${plural(count, 'корону', 'короны', 'корон')}`;
  }
}

const DONE = ' — готово';

/**
 * Задание и условия звёзд — подробно, внизу экрана уровня. С партией у каждой звезды виден прогресс:
 * прогресс задания крупно над полем, а сколько набрано для звёзд, иначе было бы не понять
 */
export function levelBriefing(level: Level, session?: LevelSession): string {
  const progress = (task: StarTask) => {
    if (!session) return '';
    const value = session.starTaskValue(task);
    return value >= task.count ? DONE : ` — ${value}/${task.count}`;
  };
  return [
    `★ Выполнить задание${session?.goalsDone ? DONE : ''}`,
    // Перед условием — сколько звёзд оно приносит: ★, ★★, ★★★
    ...level.stars.map((task, i) => `${'★'.repeat(i + 2)} ${starTaskText(task)}${progress(task)}`),
  ].join('\n');
}

/** Что осталось сделать: для окна поражения, каждая цель на своей строке */
export function missingGoalsText(session: LevelSession): string {
  return session.level.goals
    .filter((goal) => session.goalValue(goal) < goal.count)
    .map((goal) => `${GOAL_NAMES[goal.kind]} ${session.goalValue(goal)}/${goal.count}`)
    .join('\n');
}

/** Сколько ходов осталось: у уровня свой лимит, у свободной игры — общий */
export function levelMoveLimit(session: GameSession, freeLimit: number): number {
  return session instanceof LevelSession ? session.movesLeft : freeLimit - session.moves;
}
