import type { GoalKind, StarTask } from '../core/level';
import { LevelSession } from '../core/levelSession';
import type { GameSession } from '../core/session';

const GOAL_NAMES: Readonly<Record<GoalKind, string>> = {
  level2: 'Ячейки 2 ур.',
  level3: 'Ячейки 3 ур.',
  megaBomb: 'Мега-бомбы',
  rainbow: 'Радуги',
  ice: 'Лёд',
  stone: 'Камни',
  item: 'Кристаллы',
};

/** Прогресс целей одной строкой: «Лёд 3/12 · Камни 0/4» */
export function goalsText(session: LevelSession): string {
  return session.level.goals
    .map((goal) => `${GOAL_NAMES[goal.kind]} ${session.goalValue(goal)}/${goal.count}`)
    .join('  ·  ');
}

export function starTaskText(task: StarTask): string {
  if (task.kind === 'movesLeft') return `Осталось ${task.count}+ ходов`;
  if (task.kind === 'noBuy') return 'Без покупок';
  return `Ячейки 3 ур.: ${task.count}`;
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
