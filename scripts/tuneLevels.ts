// Подгонка уровней под кривую сложности: npm run levels:tune -- <партий> <этаж> [--keep-moves]
// [--only=9,10]
//
// Опытный бот играет уровень почти без лимита ходов и запоминает, на каком ходу продвинулась
// каждая цель. Серия партий сразу показывает, сколько партий он прошёл бы при любом лимите.
// Размер целей подбирается так, чтобы на уровень с кривой уходило задуманное число ходов
// (MOVES_CURVE): цели растут или уменьшаются, препятствий на поле — ровно по цели (levelLayout.ts).
// Затем ходы выставляются под долю побед с кривой. Звёзды: вторая — за очки, третья — за ячейки
// (2 уровня на нечётных местах этажа, 3 — на чётных);
// 10-е место: без покупок почти не проходится, а с покупкой спецфишек — в окне BOMB_WINS; размер целей
// (у угля — слои) подбирается под это окно.
// пороги берутся из тех же партий: сколько очков и ячеек было к концу партии.
// С --keep-moves цели и ходы не трогаются: только условия звёзд.
// С --only подгоняются только эти места этажа: остальные уровни могли быть поправлены вручную.

import {
  FLOOR_SIZE,
  floorOf,
  type Goal,
  type Level,
  type StarTask,
  type StarTaskKind,
} from '../src/core/level';
import { LEVELS } from '../src/levels';
import { levelNumber } from '../src/ui/levelText';
import { play, type GameResult } from './levelBots';
import { lowerCrowns, resizeLevel, type SizedLevel } from './levelLayout';

// Скрипт запускается в Node (vite-node), а типов Node в проекте нет
declare const process: { argv: string[] };
declare function require(name: 'node:fs'): {
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, data: string): void;
};

const NO_LIMIT = 50;
const MIN_MOVES = 25;
/** Партий на одну примерку размера целей: точная серия — только для выбранного */
const SEARCH_GAMES = 40;
/** Во сколько раз меняются цели при поиске */
const SCALES = [0.25, 0.35, 0.45, 0.6, 0.8, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5];

/**
 * Какую долю партий опытный бот без покупок проходит на каждом месте этажа и какую — на три звезды.
 * Кривая владельца (одна на все этажи): места 1–4 и 6–8 — около 10% поражений, 5 и 9 — 45–55%,
 * 10 — 85–95% без покупок
 */
const WIN_CURVE = [0.9, 0.9, 0.9, 0.9, 0.5, 0.9, 0.9, 0.9, 0.5, 0.1];
const THREE_STARS_CURVE = [0.8, 0.8, 0.8, 0.8, 0.3, 0.8, 0.8, 0.8, 0.3, 0.04];
/**
 * 10-е место с покупкой спецфишек за звёзды (по правилам: бомба — одна за попытку): поражений 50–70%,
 * то есть побед 30–50%. Звёзд у бота — сколько игрок обычно собирает на 9 уровнях этажа
 */
const BOSS_WALLET = 20;
const BOMB_WINS = { min: 0.3, max: 0.5, target: 0.4 };
const BOSS = FLOOR_SIZE - 1;
/** Сколько ходов задумано на уровне: от 25 до 40, к концу этажа длиннее; ходов на уровне — 25–50 */
const MOVES_CURVE = [25, 26, 27, 28, 32, 28, 29, 30, 35, 40];

const games = Number(process.argv[2]) || 200;
const floor = Number(process.argv[3]) || 1;
const keepMoves = process.argv.includes('--keep-moves');
const only = process.argv
  .find((arg) => arg.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',')
  .map(Number);

/** Значение, не больше которого share партий */
const quantile = (sorted: readonly number[], share: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * share) - 1)]!;

/** На каком ходу партия выполнила бы такие цели; Infinity — не выполнила за лимит */
function finishedAt(game: GameResult, goals: readonly Goal[]): number {
  const moves = goals.map((goal, i) => game.reached[i]?.[goal.count - 1] ?? Infinity);
  return Math.max(...moves);
}

/** Порог, которого достигает доля share значений: берём снизу, чтобы доля не вышла меньше */
function threshold(values: readonly number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 1;
  return sorted[Math.max(0, Math.floor(sorted.length * (1 - share)))]!;
}

/**
 * Вторая звезда — очки: её берут примерно (win + three) / 2 партий. Третья — ячейки: обе задачи
 * вместе — примерно three. Значения берутся на конец партии: ход, когда выполнены цели, а с коронами —
 * когда на дне все короны или кончились ходы.
 */
function starTasks(
  played: readonly GameResult[],
  goals: readonly Goal[],
  moves: number,
  place: number,
  win: number,
  three: number,
): StarTask[] {
  const cells = cellsTask(place);
  const won = played.flatMap((game) => {
    const at = finishedAt(game, goals);
    if (at > moves) return [];
    // Выполнив цели, игрок играет до конца ходов (или пока не взял все звёзды): значения — на последний ход
    const end = Math.min(moves, game.track.score.length);
    return [{ score: game.track.score[end - 1] ?? 0, cells: game.track[cells][end - 1] ?? 0 }];
  });
  const middle = (win + three) / 2;
  const round = (value: number) => Math.max(10, Math.floor(value / 10) * 10);
  const score = round(
    threshold(
      won.map((game) => game.score),
      middle / win,
    ),
  );
  const rich = won.filter((game) => game.score >= score);
  const count = Math.max(
    1,
    threshold(
      rich.map((game) => game.cells),
      three / middle,
    ),
  );
  return [
    { kind: 'score', count: score },
    { kind: cells, count },
  ];
}

/** Третья звезда: ячейки 2 уровня на нечётных местах этажа, 3 — на чётных */
function cellsTask(place: number): StarTaskKind {
  return place % 2 === 0 ? 'level2' : 'level3';
}

/**
 * Партии почти без лимита ходов. Задачи на звёзды — недостижимые: партия идёт до последнего хода,
 * а бот после целей добирает то же, что и игрок, — очки и ячейки для звёзд
 */
function playAll(level: Level, sized: SizedLevel, count: number): GameResult[] {
  const place = (level.id - 1) % FLOOR_SIZE;
  const stars: StarTask[] = [
    { kind: 'score', count: Infinity },
    { kind: cellsTask(place), count: Infinity },
  ];
  const open: Level = { ...level, ...sized, stars, moves: NO_LIMIT };
  return Array.from({ length: count }, (_, i) => play(open, 7000 * level.id + i + 1, 'expert'));
}

const usedMoves = (played: readonly GameResult[], goals: readonly Goal[]) =>
  played.map((game) => finishedAt(game, goals)).sort((a, b) => a - b);

/**
 * Цели, на которые уходит ближе всего к задуманному числу ходов: сначала примеряем как есть, потом
 * больше или меньше по шкале SCALES, а между двумя соседними размерами по разные стороны от
 * задуманного — ещё и середину
 */
function chooseSize(source: Level, place: number): SizedLevel {
  let level = source;
  const winShare = WIN_CURVE[place]!;
  const wanted = MOVES_CURVE[place]!;
  if (place === BOSS) return chooseBossSize(level);
  const onlyCrowns = level.goals.every((goal) => goal.kind === 'item');
  if (onlyCrowns) return chooseCrownHeight(level, winShare, wanted);
  // Короны вместе с другими целями: сначала опускаем короны, потом подбираем размер остальных целей
  if (level.layout.join('').includes('o')) {
    level = { ...level, layout: chooseCrownHeight(level, winShare, wanted).layout };
  }
  const tried: { scale: number; sized: SizedLevel; moves: number }[] = [];
  const attempt = (scale: number) => {
    const sized = resizeLevel(level.layout, level.goals, scale, level.coalLayers);
    // Тот же размер уже примеряли: на поле не осталось места для препятствий
    const known = tried.find((t) => JSON.stringify(t.sized) === JSON.stringify(sized));
    if (known) return null;
    const played = playAll(level, sized, SEARCH_GAMES);
    const used = usedMoves(played, sized.goals);
    // Не уложились в лимит: чем больше партий всё же прошли, тем ближе размер к нужному
    const finished = used.filter((value) => value <= NO_LIMIT).length / used.length;
    const reached = quantile(used, winShare);
    const moves = reached === Infinity ? NO_LIMIT * 2 + Math.round((1 - finished) * 100) : reached;
    tried.push({ scale, sized, moves });
    return moves;
  };
  const start = attempt(1)!;
  const step = start > wanted ? -1 : 1;
  for (let i = SCALES.indexOf(1) + step; i >= 0 && i < SCALES.length; i += step) {
    const moves = attempt(SCALES[i]!);
    if (moves === null || (step < 0 ? moves <= wanted : moves >= wanted)) break;
  }
  const [last, before] = [tried.at(-1)!, tried.at(-2)];
  if (before && (last.moves - wanted) * (before.moves - wanted) < 0) {
    attempt((last.scale + before.scale) / 2);
  }
  const distance = (moves: number) => Math.abs(moves - wanted);
  return tried.reduce((best, t) => (distance(t.moves) < distance(best.moves) ? t : best)).sized;
}

/**
 * На уровнях с коронами рычаг сложности — высота корон: они опускаются, пока на уровень не будет
 * уходить не больше задуманного числа ходов. Остальные цели не меняются
 */
function chooseCrownHeight(level: Level, winShare: number, wanted: number): SizedLevel {
  const goals = [...level.goals];
  let layout = [...level.layout];
  for (let rows = 1; rows <= level.layout.length; rows++) {
    const played = playAll(level, { layout, goals }, SEARCH_GAMES);
    if (quantile(usedMoves(played, goals), winShare) <= wanted) break;
    const lower = lowerCrowns(level.layout, rows);
    // Ниже некуда: короны уже над самым дном
    if (lower.join() === layout.join()) break;
    layout = lower;
  }
  return { layout, goals };
}

/** Ходы под долю побед: не меньше MIN_MOVES и не больше NO_LIMIT */
const movesFor = (used: readonly number[], share: number) =>
  Math.min(NO_LIMIT, Math.max(MIN_MOVES, quantile(used, share)));

/** Доля побед бота, покупающего спецфишки за звёзды, при лимите ходов */
function bombWins(level: Level, sized: SizedLevel, moves: number, count: number): number {
  const open: Level = { ...level, ...sized, moves };
  const games = Array.from({ length: count }, (_, i) =>
    play(open, 9000 * level.id + i + 1, 'buyer', BOSS_WALLET),
  );
  // Что бот покупал — в среднем за партию, для отчёта
  lastBuys = {};
  for (const game of games) {
    for (const [type, bought] of Object.entries(game.boughtBy)) {
      lastBuys[type] = (lastBuys[type] ?? 0) + bought / count;
    }
  }
  return games.filter((game) => game.won).length / count;
}

/** Покупки бота в последнем замере 10-го места: вид спецфишки → сколько в среднем за партию */
let lastBuys: Record<string, number> = {};

/**
 * 10-е место: ходы ставятся под 10% побед без покупок (окно 5–15%), а размер целей (у угля — слои) — так,
 * чтобы с покупкой спецфишек побед было ближе всего к BOMB_WINS.target
 */
function chooseBossSize(level: Level): SizedLevel {
  let best: { sized: SizedLevel; distance: number } | null = null;
  for (const scale of [0.5, 0.7, 1, 1.4, 2, 2.8, 4]) {
    const sized = resizeLevel(level.layout, level.goals, scale, level.coalLayers);
    const played = playAll(level, sized, SEARCH_GAMES);
    const used = usedMoves(played, sized.goals);
    const moves = movesFor(used, WIN_CURVE[BOSS]!);
    const share = bombWins(level, sized, moves, SEARCH_GAMES);
    // Ходов не меньше MIN_MOVES: мелкие цели и без бомб проходятся чаще задуманного — это тоже промах
    const plain = used.filter((value) => value <= moves).length / used.length;
    const distance =
      Math.abs(share - BOMB_WINS.target) + Math.max(0, plain - WIN_CURVE[BOSS]! - 0.05) * 2;
    if (!best || distance < best.distance) best = { sized, distance };
  }
  return best!.sized;
}

function tune(level: Level, place: number) {
  const winShare = WIN_CURVE[place]!;
  const sized = keepMoves
    ? { layout: [...level.layout], goals: [...level.goals] }
    : chooseSize(level, place);
  const played = playAll(level, sized, games);
  const used = usedMoves(played, sized.goals);
  const moves = keepMoves ? level.moves : movesFor(used, winShare);
  const win = used.filter((value) => value <= moves).length / games;
  const three = Math.min(THREE_STARS_CURVE[place]!, win);
  const stars = starTasks(played, sized.goals, moves, place, win, three);
  const bombs = place === BOSS ? bombWins(level, sized, moves, games) : undefined;
  return { ...sized, moves, stars, win, target: winShare, bombs };
}

const fs = require('node:fs');
for (const level of LEVELS) {
  if (floorOf(level.id) !== floor) continue;
  const place = (level.id - 1) % FLOOR_SIZE;
  if (only && !only.includes(place + 1)) continue;
  const { layout, goals, moves, stars, win, target, bombs, coalLayers } = tune(level, place);
  const name = String(place + 1).padStart(2, '0');
  const path = `src/levels/floor${String(floor).padStart(2, '0')}/${name}.json`;
  const file = JSON.parse(fs.readFileSync(path, 'utf8')) as Level;
  fs.writeFileSync(
    path,
    `${JSON.stringify({ ...file, layout, goals, moves, stars, ...(coalLayers !== undefined && { coalLayers }) }, null, 2)}
`,
  );
  const text = goals.map((goal) => `${goal.kind} ${goal.count}`).join(', ');
  const short =
    Math.abs(win - target) > 0.05 ? ` — мимо кривой (${Math.round(target * 100)}%)` : '';
  const withBombs =
    bombs === undefined
      ? ''
      : `; с покупками ${Math.round(bombs * 100)}%${bombs < BOMB_WINS.min || bombs > BOMB_WINS.max ? ' — мимо окна 30–50%' : ''}` +
        ` (куплено за партию: ${
          Object.entries(lastBuys)
            .filter(([, value]) => value > 0)
            .map(([type, value]) => `${type} ${value.toFixed(1)}`)
            .join(', ') || 'ничего'
        })`;
  console.log(
    `${levelNumber(level)}: ${text}; ходов ${moves}; победы ${Math.round(win * 100)}%${short}${withBombs}`,
  );
}
