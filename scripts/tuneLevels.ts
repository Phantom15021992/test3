// Подгонка уровней под кривую сложности: npm run levels:tune -- <партий> <этаж> [--keep-moves]
// [--only=9,10]
//
// Опытный бот играет уровень почти без лимита ходов и запоминает, на каком ходу продвинулась
// каждая цель. Эта одна серия партий сразу показывает, сколько партий он прошёл бы при любом лимите
// и любом размере целей. Поэтому скрипт берёт самые большие цели, которые укладываются в разумное
// число ходов (лишние препятствия остаются на поле помехой), и выставляет ходы и условия звёзд.
// Уменьшил цель — лишние препятствия убираются с поля. Звёзды: вторая — за очки, третья — за ячейки
// (2 уровня на нечётных местах этажа, 3 — на чётных; с коронами — за все короны поля);
// пороги берутся из тех же партий: сколько очков и ячеек было к ходу, когда выполнены цели.
// С --keep-moves цели и ходы не трогаются: только условия звёзд (их на первом этаже задал владелец).
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

// Скрипт запускается в Node (vite-node), а типов Node в проекте нет
declare const process: { argv: string[] };
declare function require(name: 'node:fs'): {
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, data: string): void;
};

const NO_LIMIT = 50;
const MIN_MOVES = 15;

/** Какую долю партий проходит опытный бот на каждом месте этажа и какую — на три звезды */
const WIN_CURVE = [0.99, 0.98, 0.95, 0.95, 0.9, 0.95, 0.9, 0.65, 0.42, 0.125];
const THREE_STARS_CURVE = [0.95, 0.95, 0.85, 0.85, 0.8, 0.8, 0.75, 0.55, 0.33, 0.07];
/** Больше стольких ходов на уровне не даём: как на первом этаже, чуть длиннее к концу этажа */
const MOVES_CURVE = [20, 22, 25, 25, 28, 28, 30, 30, 32, 35];
const GOAL_SHARES = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2];

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

const scaled = (goal: Goal, share: number): Goal => ({
  kind: goal.kind,
  count: Math.max(1, Math.ceil(goal.count * share)),
});

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
 * вместе — примерно three. Считается по ходу, на котором партия выполнила цели.
 */
function starTasks(
  level: Level,
  played: readonly GameResult[],
  goals: readonly Goal[],
  moves: number,
  place: number,
  win: number,
  three: number,
): StarTask[] {
  const cells: StarTaskKind = place % 2 === 0 ? 'level2' : 'level3';
  const won = played.flatMap((game) => {
    const at = finishedAt(game, goals);
    return at <= moves
      ? [{ score: game.track.score[at - 1] ?? 0, cells: game.track[cells][at - 1] ?? 0 }]
      : [];
  });
  const middle = (win + three) / 2;
  const score = Math.max(
    10,
    Math.floor(
      threshold(
        won.map((game) => game.score),
        middle / win,
      ) / 10,
    ) * 10,
  );
  const rich = won.filter((game) => game.score >= score);
  const count = Math.max(
    1,
    threshold(
      rich.map((game) => game.cells),
      three / middle,
    ),
  );
  // С коронами третья звезда — за все короны поля, цель — одна
  const crowns = level.layout.join('').split('o').length - 1;
  return [
    { kind: 'score', count: score },
    crowns > 0 ? { kind: 'item', count: crowns } : { kind: cells, count },
  ];
}

const OBSTACLES: Partial<Record<Goal['kind'], string>> = { ice: 'i', box: 'b', chain: '123' };

/**
 * Лишние препятствия убираются: их на поле ровно столько, сколько требует цель, иначе у игрока
 * остаётся чувство незавершённости. Убираем сверху, парами зеркальных клеток, чтобы поле осталось
 * симметричным.
 */
function trimLayout(layout: readonly string[], goals: readonly Goal[]): string[] {
  const grid = layout.map((line) => [...line]);
  const width = grid[0]?.length ?? 0;
  for (const goal of goals) {
    const symbols = OBSTACLES[goal.kind];
    if (!symbols) continue;
    const cells = () =>
      grid.flatMap((line, row) =>
        line.flatMap((symbol, col) => (symbols.includes(symbol) ? [{ row, col }] : [])),
      );
    for (let list = cells(); list.length > goal.count; list = cells()) {
      const mirror = (col: number) => width - 1 - col;
      const single = list.find(({ col }) => col === mirror(col));
      const pair = list.find(
        ({ row, col }) => col !== mirror(col) && symbols.includes(grid[row]![mirror(col)]!),
      );
      if ((list.length - goal.count) % 2 === 1 || !pair) {
        const { row, col } = single ?? list[0]!;
        grid[row]![col] = '.';
      } else {
        grid[pair.row]![pair.col] = '.';
        grid[pair.row]![mirror(pair.col)] = '.';
      }
    }
  }
  return grid.map((line) => line.join(''));
}

function tune(level: Level, place: number) {
  const open: Level = { ...level, moves: NO_LIMIT };
  const played = Array.from({ length: games }, (_, i) =>
    play(open, 7000 * level.id + i + 1, 'expert'),
  );
  const usedFor = (goals: readonly Goal[]) =>
    played.map((game) => finishedAt(game, goals)).sort((a, b) => a - b);

  const winShare = WIN_CURVE[place]!;
  const limit = MOVES_CURVE[place]!;
  const options = keepMoves
    ? [level.goals]
    : GOAL_SHARES.map((share) => level.goals.map((goal) => scaled(goal, share)));
  const goals =
    options.find((goals) => quantile(usedFor(goals), winShare) <= limit) ??
    options[options.length - 1]!;

  const used = usedFor(goals);
  const moves = keepMoves
    ? level.moves
    : Math.min(NO_LIMIT, Math.max(MIN_MOVES, quantile(used, winShare)));
  const win = used.filter((value) => value <= moves).length / games;
  const three = Math.min(THREE_STARS_CURVE[place]!, win);
  const stars = starTasks(level, played, goals, moves, place, win, three);
  return { goals, moves, stars, win, layout: trimLayout(level.layout, goals) };
}

const fs = require('node:fs');
for (const level of LEVELS) {
  if (floorOf(level.id) !== floor) continue;
  const place = (level.id - 1) % FLOOR_SIZE;
  if (only && !only.includes(place + 1)) continue;
  const { goals, moves, stars, win, layout } = tune(level, place);
  const name = String(place + 1).padStart(2, '0');
  const path = `src/levels/floor${String(floor).padStart(2, '0')}/${name}.json`;
  const file = JSON.parse(fs.readFileSync(path, 'utf8')) as Level;
  fs.writeFileSync(
    path,
    `${JSON.stringify({ ...file, layout, goals, moves, stars }, null, 2)}
`,
  );
  const text = goals.map((goal) => `${goal.kind} ${goal.count}`).join(', ');
  console.log(`${levelNumber(level)}: ${text}; ходов ${moves}; победы ${Math.round(win * 100)}%`);
}
