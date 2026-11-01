import type { CellLevel, PieceType, Position } from '../core/board';
import {
  MATCH_REWARDS,
  SEVEN_CROSS_LEVEL1_POINTS,
  SEVEN_CROSS_REWARDS,
  type MatchReward,
} from '../core/config';
import { isSevenCross } from '../core/match';
import { matchPoints } from '../core/resolve';

// Фигуры для экрана «Комбинации». Что они дают, считается из тех же данных, что и в игре,
// а tests/ui/matchFigures.test.ts сверяет каждую фигуру с настоящим разбором хода.

export type RewardIcon = CellLevel | PieceType;

export interface MatchFigure {
  title: string;
  /** Рисунок фигуры: # — клетка группы */
  rows: readonly string[];
}

export const MATCH_FIGURES: readonly MatchFigure[] = [
  { title: 'Линия из 3', rows: ['###'] },
  { title: 'Линия из 4', rows: ['####'] },
  { title: 'Квадрат 2×2', rows: ['##', '##'] },
  { title: 'Линия из 5', rows: ['#####'] },
  { title: 'Угол', rows: ['#..', '#..', '###'] },
  { title: 'Буква Т', rows: ['###', '.#.', '.#.'] },
  { title: 'Плюс', rows: ['.#.', '###', '.#.'] },
  { title: 'Квадрат и клетка', rows: ['##.', '###'] },
  { title: 'Линия из 6+', rows: ['######'] },
  { title: 'Блок 2×3', rows: ['###', '###'] },
  { title: 'Буква Т из 7', rows: ['#####', '..#..', '..#..'] },
  { title: 'Крест из 7', rows: ['..#..', '#####', '..#..'] },
];

export function figureCells(rows: readonly string[]): Position[] {
  return rows.flatMap((line, row) =>
    [...line].flatMap((symbol, col) => (symbol === '#' ? [{ row, col }] : [])),
  );
}

/** Значки награды по порядку: фишки или спецфишки, затем ракета за линию */
export function rewardIcons(reward: MatchReward): RewardIcon[] {
  const main = reward.kind === 'tiles' ? reward.level : reward.type;
  const icons: RewardIcon[] = Array.from({ length: reward.count }, () => main);
  if (reward.kind === 'tiles' && reward.lineRocket) icons.push('rocket');
  return icons;
}

export interface FigureValue {
  icons: RewardIcon[];
  points: number;
}

/** Что даёт фигура из клеток этого уровня */
export function figureValue(figure: MatchFigure, level: CellLevel): FigureValue {
  const cells = figureCells(figure.rows);
  const seven = level !== 3 && isSevenCross(cells) ? level : null;
  if (seven) {
    return {
      icons: rewardIcons(SEVEN_CROSS_REWARDS[seven]),
      points: seven === 1 ? SEVEN_CROSS_LEVEL1_POINTS : matchPoints(3, 5),
    };
  }
  const size = Math.min(cells.length, 5) as 3 | 4 | 5;
  const straight = figure.rows.length === 1;
  return {
    icons: rewardIcons(MATCH_REWARDS[level][size]).filter((icon) => straight || icon !== 'rocket'),
    points: matchPoints(level, cells.length),
  };
}
