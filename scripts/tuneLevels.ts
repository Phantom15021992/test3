// Подгонка уровней под кривую сложности: npm run levels:tune -- <партий> <этаж> [--keep-moves]
// [--only=9,10]
//
// Опытный бот играет уровень почти без лимита ходов и запоминает, на каком ходу продвинулась
// каждая цель. Серия партий сразу показывает, сколько партий он прошёл бы при любом лимите.
// Размер целей подбирается так, чтобы на уровень с кривой уходило задуманное число ходов
// (MOVES_CURVE): цели растут или уменьшаются, препятствий на поле — ровно по цели (levelLayout.ts).
// Затем ходы выставляются под долю побед с кривой. Звёзды: вторая — за очки, третья — за ячейки
// (2 уровня на нечётных местах этажа, 3 — на чётных; с коронами — за все короны поля);
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
const MIN_MOVES = 15;
/** Партий на одну примерку размера целей: точная серия — только для выбранного */
const SEARCH_GAMES = 60;
/** Во сколько раз меняются цели при поиске */
const SCALES = [0.6, 0.8, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5];

/**
 * Какую долю партий опытный бот без покупок проходит на каждом месте этажа и какую — на три звезды.
 * Кривая владельца (одна на все этажи): к 10-му месту поражений около 80%, на три звезды — 90–95%
 */
const WIN_CURVE = [0.9, 0.9, 0.89, 0.88, 0.86, 0.83, 0.78, 0.7, 0.55, 0.2];
const THREE_STARS_CURVE = [0.9, 0.89, 0.88, 0.86, 0.82, 0.77, 0.7, 0.55, 0.38, 0.07];
/** Сколько ходов задумано на уровне: как на первом этаже, чуть длиннее к концу этажа */
const MOVES_CURVE = [20, 22, 25, 25, 28, 28, 30, 30, 32, 35];

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
 * когда на дне все короны или кончились ходы. С коронами третья задача — все короны, и под three
 * подгоняются очки.
 */
function starTasks(
  layout: readonly string[],
  played: readonly GameResult[],
  goals: readonly Goal[],
  moves: number,
  place: number,
  win: number,
  three: number,
): StarTask[] {
  const crowns = layout.join('').split('o').length - 1;
  const cells = cellsTask(layout, place);
  const won = played.flatMap((game) => {
    const at = finishedAt(game, goals);
    if (at > moves) return [];
    // Выполнив цели, игрок играет до конца ходов (или пока не взял все звёзды): значения — на последний ход
    const end = Math.min(moves, game.track.score.length);
    return [{ score: game.track.score[end - 1] ?? 0, cells: game.track[cells][end - 1] ?? 0 }];
  });
  const middle = (win + three) / 2;
  const round = (value: number) => Math.max(10, Math.floor(value / 10) * 10);
  if (crowns > 0) {
    const full = won.filter((game) => game.cells >= crowns);
    const scores = full.length / games > three ? full : won;
    const share = scores === full ? three / (full.length / games) : middle / win;
    const score = round(
      threshold(
        scores.map((game) => game.score),
        share,
      ),
    );
    return [
      { kind: 'score', count: score },
      { kind: 'item', count: crowns },
    ];
  }
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

/** Третья звезда: ячейки 2 уровня на нечётных местах этажа, 3 — на чётных, с коронами — все короны */
function cellsTask(layout: readonly string[], place: number): StarTaskKind {
  if (layout.join('').includes('o')) return 'item';
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
    { kind: cellsTask(sized.layout, place), count: Infinity },
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
function chooseSize(level: Level, place: number): SizedLevel {
  const winShare = WIN_CURVE[place]!;
  const wanted = MOVES_CURVE[place]!;
  if (level.layout.join('').includes('o')) return chooseCrownHeight(level, winShare, wanted);
  const tried: { scale: number; sized: SizedLevel; moves: number }[] = [];
  const attempt = (scale: number) => {
    const sized = resizeLevel(level.layout, level.goals, scale);
    // Тот же размер уже примеряли: на поле не осталось места для препятствий
    const known = tried.find((t) => JSON.stringify(t.sized) === JSON.stringify(sized));
    if (known) return null;
    const played = playAll(level, sized, SEARCH_GAMES);
    const moves = quantile(usedMoves(played, sized.goals), winShare);
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
  const distance = (moves: number) => Math.abs(Math.min(moves, NO_LIMIT * 2) - wanted);
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

function tune(level: Level, place: number) {
  const winShare = WIN_CURVE[place]!;
  const sized = keepMoves
    ? { layout: [...level.layout], goals: [...level.goals] }
    : chooseSize(level, place);
  const played = playAll(level, sized, games);
  const used = usedMoves(played, sized.goals);
  const moves = keepMoves
    ? level.moves
    : Math.min(NO_LIMIT, Math.max(MIN_MOVES, quantile(used, winShare)));
  const win = used.filter((value) => value <= moves).length / games;
  const three = Math.min(THREE_STARS_CURVE[place]!, win);
  const stars = starTasks(sized.layout, played, sized.goals, moves, place, win, three);
  return { ...sized, moves, stars, win, target: winShare };
}

const fs = require('node:fs');
for (const level of LEVELS) {
  if (floorOf(level.id) !== floor) continue;
  const place = (level.id - 1) % FLOOR_SIZE;
  if (only && !only.includes(place + 1)) continue;
  const { layout, goals, moves, stars, win, target } = tune(level, place);
  const name = String(place + 1).padStart(2, '0');
  const path = `src/levels/floor${String(floor).padStart(2, '0')}/${name}.json`;
  const file = JSON.parse(fs.readFileSync(path, 'utf8')) as Level;
  fs.writeFileSync(
    path,
    `${JSON.stringify({ ...file, layout, goals, moves, stars }, null, 2)}
`,
  );
  const text = goals.map((goal) => `${goal.kind} ${goal.count}`).join(', ');
  const short = win < target - 0.05 ? ` — ниже кривой (${Math.round(target * 100)}%)` : '';
  console.log(
    `${levelNumber(level)}: ${text}; ходов ${moves}; победы ${Math.round(win * 100)}%${short}`,
  );
}
