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
  box: 'Коробки',
  chain: 'Цепи',
  item: 'Короны',
};

/** Ячейка 3 уровня, собранная сразу из фишек, засчитывается как две ячейки 2 уровня */
const DIRECT3_NOTE = ' (3 ур. из фишек — за две)';

/** Прогресс целей одной строкой: «Лёд 3/12 · Камни 0/4» */
export function goalsText(session: LevelSession): string {
  return session.level.goals
    .map((goal) => `${GOAL_NAMES[goal.kind]} ${session.goalValue(goal)}/${goal.count}`)
    .join('  ·  ');
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

function goalTaskText({ kind, count }: Goal): string {
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
      return `сломай ${n} ${plural(count, 'коробку', 'коробки', 'коробок')}`;
    case 'chain':
      return `освободи из цепей ${n} ${plural(count, 'фишку', 'фишки', 'фишек')}`;
    case 'item':
      return `опусти на дно ${n} ${plural(count, 'корону', 'короны', 'корон')}`;
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

/** Задание и условия звёзд — подробно, внизу экрана уровня */
export function levelBriefing(level: Level): string {
  const tasks = level.goals.map(goalTaskText).join(' и ');
  return [
    `Задание: ${tasks}`,
    '★ Выполнить задание',
    ...level.stars.map((task) => `★ ${starTaskText(task)}`),
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
