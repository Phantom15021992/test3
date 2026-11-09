import type { Board, CellLevel, Position } from './board';
import type { Level } from './level';
import { LevelSession } from './levelSession';

// Обучающие уровни кампании: стоят перед 1-1. Поле заранее подготовлено, на каждом шаге подсказка
// сразу показывает, что сдвинуть, и сделать можно только этот ход. Звёзд и кошелька у обучения нет.

export interface TutorialStep {
  /** Какую фишку сдвинуть и куда: награда встаёт в клетку to */
  from: Position;
  to: Position;
  text: string;
}

export interface Tutorial {
  /** Номер обучения: 1, 2… */
  index: number;
  title: string;
  /**
   * Поле: клетки через пробел — цвет палитры и уровень. B — синий, Y — жёлтый, R — красный,
   * G — зелёный; «B1» — синяя фишка 1 уровня
   */
  board: readonly string[];
  colors: number;
  /** Seed попытки: новые фишки сверху падают одинаково при каждом прохождении */
  seed: number;
  goal: Level['goals'][number];
  steps: readonly TutorialStep[];
  /** Что сказать, когда обучение пройдено */
  done: string;
}

/** Буквы цветов — по порядку палитры игры (синий, жёлтый, красный, зелёный) */
const PALETTE_LETTERS = 'BYRG';

export function tutorialBoard(tutorial: Tutorial): Board {
  return tutorial.board.map((line) =>
    line
      .trim()
      .split(/\s+/)
      .map((token) => {
        const color = PALETTE_LETTERS.indexOf(token[0] ?? '');
        const level = Number(token.slice(1));
        if (color < 0 || ![1, 2, 3].includes(level)) throw new Error(`Клетка обучения: ${token}`);
        return { kind: 'tile' as const, color, level: level as CellLevel };
      }),
  );
}

/** Уровень, на котором идёт обучение: номер отрицательный, чтобы не смешиваться с уровнями этажей */
export function tutorialLevel(tutorial: Tutorial): Level {
  const rows = tutorial.board.length;
  const cols = tutorial.board[0]!.trim().split(/\s+/).length;
  return {
    id: -tutorial.index,
    title: tutorial.title,
    hint: '',
    layout: Array.from({ length: rows }, () => '.'.repeat(cols)),
    colors: tutorial.colors,
    moves: tutorial.steps.length,
    goals: [tutorial.goal],
    stars: [],
  };
}

/** Партия обучения: обычная партия уровня, только поле подставлено заранее */
export function tutorialSession(tutorial: Tutorial, seed = tutorial.seed): LevelSession {
  const session = new LevelSession(seed, tutorialLevel(tutorial));
  session.board = tutorialBoard(tutorial);
  return session;
}

/**
 * Обучение 1: из трёх фишек 1 уровня — фишка 2 уровня, из трёх фишек 2 уровня — фишка 3 уровня.
 * Первый ход собирает красную фишку 2 уровня прямо над двумя заранее положенными красными 2 уровня
 * (в нижнем ряду); второй ход опускает её к ним. Под ней — синяя фишка 2 уровня: с фишками 1 уровня
 * она не совпадает, поэтому падение новых фишек после первого хода её не сдвинет
 */
const MERGE_LEVELS: Tutorial = {
  index: 1,
  title: 'Обучение',
  board: [
    'B1 Y1 R1 B1 Y1 B1',
    'Y1 R1 B1 Y1 B1 R1',
    'B1 Y1 B1 R1 Y1 Y1',
    'Y1 B1 R1 B1 Y1 B1',
    'B1 Y1 Y1 R1 R1 B1',
    'R2 R2 B2 Y1 B1 Y1',
  ],
  colors: 3,
  seed: 1,
  goal: { kind: 'level3', count: 1 },
  steps: [
    {
      from: { row: 3, col: 2 },
      to: { row: 4, col: 2 },
      text: 'Сдвинь красный камень вниз: три одинаковые фишки 1 уровня в ряд превратятся в фишку 2 уровня',
    },
    {
      from: { row: 4, col: 2 },
      to: { row: 5, col: 2 },
      text: 'Теперь сдвинь новую фишку вниз, к двум таким же: три фишки 2 уровня станут фишкой 3 уровня',
    },
  ],
  done: 'Три одинаковые фишки одного уровня всегда объединяются в фишку уровнем выше. Чем выше уровень — тем больше очков',
};

export const TUTORIALS: readonly Tutorial[] = [MERGE_LEVELS];
