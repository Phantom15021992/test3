// Подбор полей обучений 2 и 3: раскладывает заготовки, заполняет остальное без готовых совпадений
// и проигрывает сценарий на настоящей логике, пока не найдёт поле и seed, где каждый шаг идёт как задумано.
// Запуск: npx vite-node scripts/designTutorials.ts
import { getCell, isPiece, type Board, type Cell, type Position } from '../src/core/board';
import { findMatches } from '../src/core/match';
import { hasTileMove, isValidSwap, swapCells } from '../src/core/moves';
import { createRng } from '../src/core/rng';
import {
  locate,
  manipulatorPick,
  rainbowPick,
  tutorialMove,
  TutorialSession,
  type Tutorial,
  type TutorialStep,
} from '../src/core/tutorial';

const N = 10;
const LETTERS = 'BYRG';
const B = 0;
const Y = 1;
const R = 2;
const p = (row: number, col: number): Position => ({ row, col });

function tokens(board: Board): string[] {
  return board.map((line) =>
    line
      .map((cell) => {
        if (cell?.kind === 'tile') return `${LETTERS[cell.color]}${cell.level}`;
        if (cell?.kind === 'piece') {
          if (cell.type === 'bomb') return '*';
          if (cell.type === 'megaBomb') return 'X';
          if (cell.type === 'rainbow') return '@';
          if (cell.type === 'manipulator') return 'M';
          return 'direction' in cell && cell.direction === 'row' ? '-' : '|';
        }
        return '?';
      })
      .join(' '),
  );
}

/** Заполняет пустые клетки случайными фишками 1 уровня так, чтобы готовых совпадений не было */
function fill(fixed: Map<string, Cell>, banned: Map<string, number[]>, seed: number): Board | null {
  const rng = createRng(seed);
  const board: Board = Array.from({ length: N }, () => Array.from({ length: N }, () => null));
  for (const [key, cell] of fixed) {
    const [r, c] = key.split(',').map(Number);
    board[r!]![c!] = cell;
  }
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (board[r]![c]) continue;
      const options = [B, Y, R].filter((color) => !(banned.get(`${r},${c}`) ?? []).includes(color));
      let placed = false;
      for (let attempt = 0; attempt < 12 && !placed; attempt++) {
        const color = options[rng.int(options.length)]!;
        board[r]![c] = { kind: 'tile', color, level: 1 };
        placed = findMatches(board.map((l) => l.map((x) => x ?? { kind: 'hole' }))).length === 0;
      }
      if (!placed) return null;
    }
  }
  return findMatches(board).length === 0 ? board : null;
}

const drain = (steps: Generator<unknown, void, undefined>) => {
  for (let next = steps.next(); !next.done; next = steps.next());
};

function countPieces(board: Board): number {
  return board.flat().filter((cell) => isPiece(cell)).length;
}

// ---------- Обучение 2: фигуры ----------

interface Figure {
  color: number;
  cells: Position[];
  hole: Position;
  donor: Position;
}

const figures: Figure[] = [
  // Т: перекладина в строке 1, ножка вниз; не хватает перекрестья, фишка приходит сверху
  { color: R, cells: [p(1, 0), p(1, 2), p(2, 1), p(3, 1)], hole: p(1, 1), donor: p(0, 1) },
  // Г: перекладина в строке 0, столбец вниз от левого края; не хватает угла, фишка приходит слева
  { color: Y, cells: [p(0, 8), p(0, 9), p(1, 7), p(2, 7)], hole: p(0, 7), donor: p(0, 6) },
  // Квадрат с хвостиком: не хватает общей клетки линии и квадрата, фишка приходит сверху
  { color: B, cells: [p(3, 3), p(3, 5), p(4, 3), p(4, 4)], hole: p(3, 4), donor: p(2, 4) },
  // Пять в линию: не хватает середины, фишка приходит снизу
  { color: R, cells: [p(5, 0), p(5, 1), p(5, 3), p(5, 4)], hole: p(5, 2), donor: p(6, 2) },
  // Фигура из 7: линия из 5 и две клетки вверх от середины; не хватает середины, фишка снизу
  {
    color: Y,
    cells: [p(8, 5), p(8, 6), p(8, 8), p(8, 9), p(7, 7), p(6, 7)],
    hole: p(8, 7),
    donor: p(9, 7),
  },
  // Квадрат 2×2: не хватает правой нижней клетки, фишка приходит справа
  { color: B, cells: [p(8, 0), p(8, 1), p(9, 0)], hole: p(9, 1), donor: p(9, 2) },
];

function design2(): { board: string[]; seed: number } | null {
  const fixed = new Map<string, Cell>();
  const banned = new Map<string, number[]>();
  for (const f of figures) {
    for (const c of f.cells)
      fixed.set(`${c.row},${c.col}`, { kind: 'tile', color: f.color, level: 1 });
    fixed.set(`${f.donor.row},${f.donor.col}`, { kind: 'tile', color: f.color, level: 1 });
    banned.set(`${f.hole.row},${f.hole.col}`, [f.color]);
    // Вокруг фигуры — другие цвета: иначе соседняя фишка того же цвета приросла бы к фигуре
    for (const c of [...f.cells, f.hole]) {
      for (const [dr, dc] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ] as const) {
        const key = `${c.row + dr},${c.col + dc}`;
        banned.set(key, [...(banned.get(key) ?? []), f.color]);
      }
    }
  }
  // Третья синяя фишка 2 уровня — над клеткой, куда встанет вторая фишка 2 уровня из квадрата
  fixed.set('8,2', { kind: 'tile', color: B, level: 2 });
  const steps = tutorial2Steps();
  for (let fillSeed = 1; fillSeed < 3000; fillSeed++) {
    const board = fill(fixed, banned, fillSeed);
    if (!board) {
      fail('fill');
      continue;
    }
    const t: Tutorial = { ...TUTORIAL2_BASE, board: tokens(board), steps };
    for (let seed = 1; seed <= 20; seed++) {
      if (checkTutorial2(t, seed)) return { board: tokens(board), seed };
    }
  }
  console.log(fails);
  return null;
}

/** Сколько клеток в фигуре, которую собирает каждый подсказанный ход */
const SIZES = [5, 5, 5, 5, 7, 4, 3];

/** Совпадения, которые даёт сам обмен (без каскадов): должно быть одно — задуманная фигура */
function swapGroups(board: Board, from: Position, to: Position): number[] {
  return findMatches(swapCells(board, from, to)).map((g) => g.cells.length);
}

/** Сколько ячеек 3 и 2 уровня должен дать каждый подсказанный шаг (не меньше: каскады добавляют свои) */
const EXPECTED: readonly [number, number][] = [
  [1, 0],
  [1, 0],
  [1, 0],
  [1, 0],
  [2, 0],
  [0, 2],
  [1, 0],
];

function tutorial2Steps(): TutorialStep[] {
  const swap = (f: Figure): TutorialStep => ({ kind: 'swap', from: f.donor, to: f.hole, text: '' });
  return [...figures.map(swap), { kind: 'swap', from: p(8, 2), to: p(9, 2), text: '' }];
}

const TUTORIAL2_BASE: Tutorial = {
  index: 2,
  title: 'Обучение',
  board: [],
  colors: 3,
  seed: 1,
  goal: { kind: 'level3', count: 10 },
  moves: 100,
  noSpecials: true,
  steps: [],
  done: '',
};

export const fails: Record<string, number> = {};
const fail = (why: string) => {
  fails[why] = (fails[why] ?? 0) + 1;
  return false;
};

function checkTutorial2(t: Tutorial, seed: number): boolean {
  const session = new TutorialSession(t, seed);
  for (let i = 0; i < t.steps.length; i++) {
    const step = t.steps[i]!;
    if (step.kind !== 'swap') return false;
    const from = locate(session.board, step.from)!;
    const to = locate(session.board, step.to)!;
    if (!isValidSwap(session.board, from, to)) return fail(`invalid ${i}`);
    if (!hasTileMove(session.board)) return fail(`nomove ${i}`);
    const groups = swapGroups(session.board, from, to);
    if (groups.length !== 1 || groups[0] !== SIZES[i])
      return fail(`shape ${i}: ${groups.join('+')}`);
    const before3 = session.progress.level3;
    const before2 = session.progress.level2;
    drain(session.play({ type: 'swap', from, to }));
    const [want3, want2] = EXPECTED[i]!;
    if (session.progress.level3 - before3 < want3) return fail(`l3 ${i}`);
    if (session.progress.level2 - before2 < want2) return fail(`l2 ${i}`);
    if (session.progress.level3 > 8) return fail(`many ${i}`);
    if (countPieces(session.board) > 0 || session.isOver) return false;
  }
  // Ровно 7 ячеек 3 уровня по подсказкам: последние 3 игрок собирает сам
  if (session.progress.level3 !== 7) return fail(`total ${session.progress.level3}`);
  return hasTileMove(session.board);
}

// ---------- Обучение 3: спецфишки ----------

const SPECIALS3: [Position, Cell][] = [
  // Бомбы отодвинуты от углов: взрыв 3×3 и 7×7 целиком на поле, радиус виден
  [p(1, 1), { kind: 'piece', type: 'bomb' }],
  [p(6, 3), { kind: 'piece', type: 'megaBomb' }],
  [p(6, 2), { kind: 'piece', type: 'bomb' }],
  [p(0, 9), { kind: 'piece', type: 'rainbow' }],
  [p(0, 7), { kind: 'piece', type: 'manipulator' }],
  [p(9, 9), { kind: 'piece', type: 'rocket', direction: 'row' }],
];

const STEPS3: TutorialStep[] = [
  { kind: 'info', title: '', text: '' },
  { kind: 'fire', at: p(1, 1), text: '' },
  { kind: 'swap', from: p(6, 2), to: p(6, 3), text: '' },
  { kind: 'fire', at: 'rocket', text: '' },
  { kind: 'rainbow', at: 'rainbow', text: '', pickText: '' },
  { kind: 'manipulator', at: 'manipulator', text: '', firstText: '', secondText: '' },
];

/** Сколько спецфишек должно остаться после каждого хода: каждый ход тратит только свои */
const LEFT3 = [6, 5, 3, 2, 1, 0];

function design3(): { board: string[]; seed: number } | null {
  const fixed = new Map<string, Cell>(
    SPECIALS3.map(([pos, cell]) => [`${pos.row},${pos.col}`, cell]),
  );
  for (let fillSeed = 1; fillSeed < 300; fillSeed++) {
    const board = fill(fixed, new Map(), fillSeed);
    if (!board) continue;
    const t: Tutorial = {
      index: 3,
      title: '',
      board: tokens(board),
      colors: 3,
      seed: 1,
      noSpecials: true,
      steps: STEPS3,
      done: '',
    };
    for (let seed = 1; seed <= 40; seed++) {
      if (checkTutorial3(t, seed)) return { board: tokens(board), seed };
    }
  }
  return null;
}

function checkTutorial3(t: Tutorial, seed: number): boolean {
  const session = new TutorialSession(t, seed);
  let moveIndex = 0;
  for (const step of t.steps) {
    if (step.kind === 'info') continue;
    if (step.kind === 'rainbow' && !rainbowPick(session.board)) return fail('rainbow');
    if (step.kind === 'manipulator' && !manipulatorPick(session.board)) return fail('manip');
    const move = tutorialMove(session.board, step);
    if (!move) return fail(`move ${moveIndex}`);
    if (move.type === 'swap' && !isValidSwap(session.board, move.from, move.to))
      return fail('swap');
    if (session.isOver) return fail('over');
    drain(session.play(move));
    moveIndex++;
    if (countPieces(session.board) !== LEFT3[moveIndex])
      return fail(`left ${moveIndex}: ${countPieces(session.board)}`);
  }
  return session.isOver;
}

// Какое обучение подбирать: npx vite-node scripts/designTutorials.ts [2|3]
const which = process.argv[2];
const two = which === '3' ? null : design2();
console.log('Обучение 2:', two ? `seed ${two.seed}` : 'не найдено');
if (two) console.log(two.board.map((l) => `    '${l}',`).join('\n'));
const three = which === '2' ? null : design3();
console.log('Обучение 3:', three ? `seed ${three.seed}` : 'не найдено');
if (three) console.log(three.board.map((l) => `    '${l}',`).join('\n'));
void getCell;
