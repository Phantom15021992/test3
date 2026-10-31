// Подгонка уровней под кривую сложности: npm run levels:tune -- <партий> <этаж> [--keep-moves]
//
// Опытный бот играет уровень почти без лимита ходов и запоминает, на каком ходу продвинулась
// каждая цель. Эта одна серия партий сразу показывает, сколько партий он прошёл бы при любом лимите
// и любом размере целей. Поэтому скрипт берёт самые большие цели, которые укладываются в разумное
// число ходов (лишние препятствия остаются на поле помехой), и выставляет ходы и условия звёзд.
// С --keep-moves цели и ходы не трогаются: только условия звёзд (их на первом этаже задал владелец).

import { FLOOR_SIZE, floorOf, type Goal, type Level, type StarTask } from '../src/core/level';
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
  const left = (share: number) => Math.max(1, moves - Math.min(moves, quantile(used, share)));
  const three = Math.min(THREE_STARS_CURVE[place]!, win);
  const first = Math.min(left((win + three) / 2), moves - 1);
  const second = Math.max(first + 1, Math.min(left(three), moves - 1));
  const stars: StarTask[] = [
    { kind: 'movesLeft', count: first },
    { kind: 'movesLeft', count: second },
  ];
  return { goals, moves, stars, win };
}

const fs = require('node:fs');
for (const level of LEVELS) {
  if (floorOf(level.id) !== floor) continue;
  const place = (level.id - 1) % FLOOR_SIZE;
  const { goals, moves, stars, win } = tune(level, place);
  const name = String(place + 1).padStart(2, '0');
  const path = `src/levels/floor${String(floor).padStart(2, '0')}/${name}.json`;
  const file = JSON.parse(fs.readFileSync(path, 'utf8')) as Level;
  fs.writeFileSync(
    path,
    `${JSON.stringify({ ...file, goals, moves, stars }, null, 2)}
`,
  );
  const text = goals.map((goal) => `${goal.kind} ${goal.count}`).join(', ');
  console.log(`${levelNumber(level)}: ${text}; ходов ${moves}; победы ${Math.round(win * 100)}%`);
}
