import {
  allPositions,
  getCell,
  isPiece,
  isTile,
  type Board,
  type Cell,
  type Position,
} from './board';
import type { Level } from './level';
import { LevelSession } from './levelSession';
import { findMatches } from './match';
import { areAdjacent, swapCells } from './moves';
import type { PlayerMove } from './session';
import { mostFrequentColor } from './specials';

// Обучающие уровни кампании: стоят перед 1-1. Поле заранее подготовлено, на каждом шаге подсказка
// сразу показывает, что сделать, и сделать можно только это. Звёзд и кошелька у обучения нет.

/** Спецфишка, которую шаг ищет на поле: после взрывов и падений она могла сдвинуться */
export type PieceKind = 'bomb' | 'megaBomb' | 'rocket' | 'rainbow' | 'manipulator';
export type Target = Position | PieceKind;

export type TutorialStep =
  /** Обмен двух клеток: награда встаёт в клетку to */
  | { kind: 'swap'; from: Target; to: Target; text: string }
  /** Двойное нажатие: спецфишка срабатывает на месте */
  | { kind: 'fire'; at: Target; text: string }
  /** Нажать радугу, затем фишку подсказанного (самого частого) цвета */
  | { kind: 'rainbow'; at: Target; text: string; pickText: string }
  /** Нажать манипулятор, затем две подсказанные клетки — их обмен даёт совпадение */
  | { kind: 'manipulator'; at: Target; text: string; firstText: string; secondText: string }
  /** Только рассказ: окно с кнопкой «Дальше», хода нет */
  | { kind: 'info'; title: string; text: string };

export interface Tutorial {
  /** Номер обучения: 1, 2… */
  index: number;
  title: string;
  /**
   * Поле: клетки через пробел. Фишка — цвет палитры и уровень: B — синий, Y — жёлтый, R — красный,
   * G — зелёный («B1» — синяя фишка 1 уровня). Спецфишки: * бомба, X мега-бомба, @ радуга,
   * M манипулятор, - и | ракета по строке и по столбцу
   */
  board: readonly string[];
  colors: number;
  /** Seed попытки: новые фишки сверху падают одинаково при каждом прохождении */
  seed: number;
  /** Цель уровня; без неё обучение кончается, когда пройдены все шаги */
  goal?: Level['goals'][number];
  /** Сколько ходов на всё обучение; по умолчанию — по ходу на шаг */
  moves?: number;
  /** Совпадения не дают спецфишек */
  noSpecials?: boolean;
  steps: readonly TutorialStep[];
  /** Подсказка, когда шаги кончились и игрок продолжает сам */
  freeText?: string;
  /** Что сказать, когда обучение пройдено */
  done: string;
}

/** Буквы цветов — по порядку палитры игры (синий, жёлтый, красный, зелёный) */
const PALETTE_LETTERS = 'BYRG';

const SPECIAL_TOKENS: Readonly<Record<string, Cell>> = {
  '*': { kind: 'piece', type: 'bomb' },
  X: { kind: 'piece', type: 'megaBomb' },
  '@': { kind: 'piece', type: 'rainbow' },
  M: { kind: 'piece', type: 'manipulator' },
  '-': { kind: 'piece', type: 'rocket', direction: 'row' },
  '|': { kind: 'piece', type: 'rocket', direction: 'col' },
};

export function tutorialBoard(tutorial: Tutorial): Board {
  return tutorial.board.map((line) =>
    line
      .trim()
      .split(/\s+/)
      .map((token): Cell => {
        const special = SPECIAL_TOKENS[token];
        if (special) return { ...special };
        const color = PALETTE_LETTERS.indexOf(token[0] ?? '');
        const level = Number(token.slice(1));
        if (color < 0 || (level !== 1 && level !== 2 && level !== 3)) {
          throw new Error(`Клетка обучения: ${token}`);
        }
        return { kind: 'tile', color, level };
      }),
  );
}

const isMove = (step: TutorialStep) => step.kind !== 'info';

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
    moves: tutorial.moves ?? tutorial.steps.filter(isMove).length,
    goals: tutorial.goal ? [tutorial.goal] : [],
    stars: [],
  };
}

/** Партия обучения: обычная партия уровня, только поле подставлено заранее */
export class TutorialSession extends LevelSession {
  constructor(
    readonly tutorial: Tutorial,
    seed = tutorial.seed,
  ) {
    super(seed, tutorialLevel(tutorial));
    this.board = tutorialBoard(tutorial);
  }

  override get noSpecials(): boolean {
    return this.tutorial.noSpecials ?? false;
  }

  /** Без цели обучение кончается с последним шагом; с целью — как уровень: цель или ходы */
  override get isOver(): boolean {
    if (this.tutorial.goal) return super.isOver;
    return this.moves >= this.level.moves;
  }
}

export function tutorialSession(tutorial: Tutorial, seed = tutorial.seed): TutorialSession {
  return new TutorialSession(tutorial, seed);
}

/** Где на поле цель шага; спецфишка ищется по типу (на поле обучения она одна такая) */
export function locate(board: Board, target: Target): Position | null {
  if (typeof target !== 'string') return target;
  return (
    allPositions(board).find((pos) => {
      const cell = getCell(board, pos);
      return isPiece(cell) && cell.type === target;
    }) ?? null
  );
}

/** Фишка для радуги: самый частый цвет (уйдёт больше всего фишек), нижняя левая фишка этого цвета */
export function rainbowPick(board: Board): { color: number; at: Position } | null {
  const color = mostFrequentColor(board);
  if (color === null) return null;
  const tiles = allPositions(board).filter((pos) => {
    const cell = getCell(board, pos);
    return isTile(cell) && cell.color === color && cell.level === 1;
  });
  const at = tiles.sort((a, b) => b.row - a.row || a.col - b.col)[0];
  return at ? { color, at } : null;
}

/**
 * Две клетки для манипулятора: не соседние (так видно, что он меняет любые клетки), и обмен даёт
 * совпадение. Перебор снизу вверх: внизу совпадение заметнее
 */
export function manipulatorPick(board: Board): { a: Position; b: Position } | null {
  const tiles = allPositions(board)
    .filter((pos) => {
      const cell = getCell(board, pos);
      return isTile(cell) && cell.level === 1;
    })
    .sort((a, b) => b.row - a.row || a.col - b.col);
  for (const a of tiles) {
    for (const b of tiles) {
      if (samePlace(a, b) || areAdjacent(a, b)) continue;
      if (Math.abs(a.row - b.row) + Math.abs(a.col - b.col) > 3) continue;
      const ca = getCell(board, a);
      const cb = getCell(board, b);
      if (!isTile(ca) || !isTile(cb) || ca.color === cb.color) continue;
      if (findMatches(swapCells(board, a, b)).length > 0) return { a, b };
    }
  }
  return null;
}

const samePlace = (a: Position, b: Position) => a.row === b.row && a.col === b.col;

/** Ход, которого ждёт шаг (для проверки сценария в тестах; сцена собирает его из нажатий) */
export function tutorialMove(board: Board, step: TutorialStep): PlayerMove | null {
  switch (step.kind) {
    case 'swap': {
      const from = locate(board, step.from);
      const to = locate(board, step.to);
      return from && to ? { type: 'swap', from, to } : null;
    }
    case 'fire': {
      const at = locate(board, step.at);
      return at ? { type: 'fire', at } : null;
    }
    case 'rainbow': {
      const at = locate(board, step.at);
      const pick = rainbowPick(board);
      return at && pick ? { type: 'rainbow', at, color: pick.color } : null;
    }
    case 'manipulator': {
      const at = locate(board, step.at);
      const pick = manipulatorPick(board);
      return at && pick ? { type: 'manipulator', at, a: pick.a, b: pick.b } : null;
    }
    case 'info':
      return null;
  }
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
      kind: 'swap',
      from: { row: 3, col: 2 },
      to: { row: 4, col: 2 },
      text: 'Сдвинь красный камень вниз: три одинаковые фишки 1 уровня в ряд превратятся в фишку 2 уровня',
    },
    {
      kind: 'swap',
      from: { row: 4, col: 2 },
      to: { row: 5, col: 2 },
      text: 'Теперь сдвинь новую фишку вниз, к двум таким же: три фишки 2 уровня станут фишкой 3 уровня',
    },
  ],
  done: 'Три одинаковые фишки одного уровня всегда объединяются в фишку уровнем выше. Чем выше уровень — тем больше очков',
};

const at = (row: number, col: number): Position => ({ row, col });

/**
 * Обучение 2: какие бывают фигуры. Заготовки фигур разложены сверху вниз так, что каждый ход сдвигает
 * только то, что выше него, и следующие заготовки остаются целыми; поле и seed подобраны скриптом
 * scripts/designTutorials.ts. Первые 6 ячеек 3 уровня — по подсказкам, остальные 4 игрок собирает сам.
 * Спецфишек нет совсем: награда за фигуры — только ячейки
 */
const FIGURES: Tutorial = {
  index: 2,
  title: 'Обучение: фигуры',
  board: [
    'B1 R1 Y1 Y1 B1 Y1 Y1 B1 Y1 Y1',
    'R1 B1 R1 B1 R1 B1 B1 Y1 B1 B1',
    'Y1 R1 B1 R1 B1 Y1 R1 Y1 R1 Y1',
    'Y1 R1 Y1 B1 R1 B1 Y1 B1 B1 Y1',
    'B1 B1 Y1 B1 B1 R1 R1 Y1 B1 B1',
    'R1 R1 B1 R1 R1 B1 B1 R1 R1 B1',
    'Y1 B1 R1 Y1 Y1 R1 R1 Y1 B1 Y1',
    'Y1 R1 Y1 Y1 B1 B1 R1 Y1 B1 R1',
    'B1 B1 B2 B1 R1 Y1 Y1 B1 Y1 Y1',
    'B1 R1 B1 R1 B1 R1 B1 Y1 R1 R1',
  ],
  colors: 3,
  seed: 7,
  goal: { kind: 'level3', count: 10 },
  moves: 100,
  noSpecials: true,
  steps: [
    {
      kind: 'swap',
      from: at(0, 1),
      to: at(1, 1),
      text: 'Фигура «Т»: пять фишек одного цвета дают сразу фишку 3 уровня! Сдвинь красный камень вниз',
    },
    {
      kind: 'swap',
      from: at(0, 6),
      to: at(0, 7),
      text: 'Фигура «Г» — тоже пять фишек и тоже фишка 3 уровня. Сдвинь жёлтый камень вправо',
    },
    {
      kind: 'swap',
      from: at(2, 4),
      to: at(3, 4),
      text: 'Квадрат с хвостиком — пять фишек: фишка 3 уровня. Сдвинь синий камень вниз',
    },
    {
      kind: 'swap',
      from: at(6, 2),
      to: at(5, 2),
      text: 'Пять в линию — фишка 3 уровня. Сдвинь красный камень вверх',
    },
    {
      kind: 'swap',
      from: at(9, 7),
      to: at(8, 7),
      text: 'Пять в линию и ещё две фишки от её середины — семь фишек дают сразу две фишки 3 уровня! Сдвинь жёлтый камень вверх',
    },
    {
      kind: 'swap',
      from: at(9, 2),
      to: at(9, 1),
      text: 'Квадрат из четырёх фишек даёт две фишки 2 уровня. Сдвинь синий камень влево',
    },
  ],
  freeText: 'Теперь сам: собери фишки 3 уровня',
  done: 'Пять фишек в фигуре — «Т», «Г», линия или квадрат с хвостиком — сразу дают фишку 3 уровня, семь — две. Квадрат из четырёх даёт две фишки 2 уровня',
};

/**
 * Обучение 3: спецфишки и их комбо. Бомба в левом верхнем углу, маленькая и большая бомбы — в левом
 * нижнем, радуга — в правом верхнем, манипулятор через клетку от неё, ракета по строке — в правом
 * нижнем: каждый ход задевает только свою спецфишку (проверяет тест). Поле подобрано скриптом
 * scripts/designTutorials.ts
 */
const SPECIALS: Tutorial = {
  index: 3,
  title: 'Обучение: спецфишки',
  board: [
    '* Y1 B1 Y1 R1 R1 B1 M Y1 @',
    'R1 Y1 R1 Y1 Y1 B1 Y1 B1 B1 Y1',
    'B1 R1 B1 B1 Y1 Y1 R1 B1 Y1 Y1',
    'R1 B1 R1 Y1 R1 R1 B1 R1 B1 B1',
    'Y1 B1 B1 R1 Y1 B1 B1 Y1 R1 B1',
    'R1 R1 Y1 B1 R1 R1 Y1 R1 R1 Y1',
    'B1 Y1 B1 Y1 Y1 B1 R1 R1 B1 B1',
    'B1 R1 B1 B1 Y1 Y1 B1 B1 R1 Y1',
    'Y1 Y1 R1 B1 R1 R1 B1 R1 B1 R1',
    'X * R1 R1 B1 B1 Y1 Y1 B1 -',
  ],
  colors: 3,
  seed: 1,
  noSpecials: true,
  steps: [
    {
      kind: 'info',
      title: 'Спецфишки',
      text: 'Кроме камней на поле бывают спецфишки: бомбы, ракета, радуга и манипулятор. Они получаются из больших совпадений, а на 10-м уровне этажа их можно купить за звёзды. Попробуем каждую!',
    },
    {
      kind: 'fire',
      at: at(0, 0),
      text: 'Бомба взрывает всё вокруг себя — квадрат 3×3. Нажми на неё дважды: она взорвётся на месте',
    },
    {
      kind: 'swap',
      from: at(9, 1),
      to: at(9, 0),
      text: 'Спецфишки можно совмещать! Сдвинь маленькую бомбу на большую: вместе они взорвут 7×7 — намного больше',
    },
    {
      kind: 'fire',
      at: 'rocket',
      text: 'Ракета пробивает весь ряд, вдоль которого лежит (стоящая — весь столбец). Нажми на неё дважды',
    },
    {
      kind: 'rainbow',
      at: 'rainbow',
      text: 'Радуга убирает с поля все фишки одного цвета. Нажми на радугу',
      pickText: 'Теперь нажми на подсвеченную фишку — уйдут все фишки этого цвета',
    },
    {
      kind: 'manipulator',
      at: 'manipulator',
      text: 'Манипулятор меняет местами любые две фишки, даже не соседние. Нажми на него',
      firstText: 'Выбери первую подсвеченную фишку',
      secondText: 'Теперь вторую — они поменяются местами',
    },
  ],
  done: 'Спецфишки получаются из больших совпадений. Совмещай их — две спецфишки вместе бьют намного сильнее',
};

/**
 * Фигура, которую соберёт обмен: клетки совпадения после обмена и клетка, откуда пришла фишка, —
 * её подсказка подсвечивает целиком. Для обмена спецфишек (комбо) — просто две клетки обмена
 */
export function swapFigure(board: Board, from: Position, to: Position): Position[] {
  const group = findMatches(swapCells(board, from, to)).find((g) =>
    g.cells.some((cell) => samePlace(cell, to)),
  );
  const cells = [from, to];
  for (const cell of group?.cells ?? []) {
    if (!cells.some((c) => samePlace(c, cell))) cells.push(cell);
  }
  return cells;
}

export const TUTORIALS: readonly Tutorial[] = [MERGE_LEVELS, FIGURES, SPECIALS];
