// Анализ сложности уровней: боты играют каждый уровень много раз.
// Запуск: npm run levels [-- <партий на уровень> [номер этажа] [--fresh]]
//
// Результаты копятся в stats/ (см. botStats.ts): уровень, который уже мерили на этой же логике,
// не пересчитывается. --fresh считает заново и добавляет новую запись.
// Бот с покупками начинает с двумя звёздами этажа за каждый предыдущий уровень этажа.

import { FLOOR_SIZE, floorOf, type Level } from '../src/core/level';
import { LEVELS } from '../src/levels';
import { levelNumber } from '../src/ui/levelText';
import {
  currentCommit,
  engineHash,
  findRun,
  levelHash,
  readRuns,
  saveRun,
  type BotRun,
} from './botStats';
import { BOTS, play, type GameResult } from './levelBots';

// Скрипт запускается в Node (vite-node), а типов Node в проекте нет
declare const process: { argv: string[] };

const STARS_PER_LEVEL = 2;

const average = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
const share = (part: number, whole: number) => Math.round((part / whole) * 100);
const oneDecimal = (value: number) => Math.round(value * 10) / 10;

const args = process.argv.slice(2);
const fresh = args.includes('--fresh');
const [gamesArg, onlyArg] = args.filter((arg) => !arg.startsWith('--'));
const games = Number(gamesArg) || 40;
const only = Number(onlyArg);

function measure(level: Level, hash: string, engine: string, commit: string): BotRun {
  const wallet = ((level.id - 1) % FLOOR_SIZE) * STARS_PER_LEVEL;
  const results = BOTS.map((bot) =>
    Array.from({ length: games }, (_, i) =>
      play(level, 1000 * level.id + i + 1, bot, bot === 'buyer' ? wallet : 0),
    ),
  );
  const [novice, expert, buyer] = results as [GameResult[], GameResult[], GameResult[]];
  const wins = (list: GameResult[]) => list.filter((game) => game.won);
  const lost = expert.filter((game) => !game.won);
  return {
    date: new Date().toISOString(),
    commit,
    engine,
    levelId: level.id,
    number: levelNumber(level),
    hash,
    moves: level.moves,
    colors: level.colors,
    games,
    novice: share(wins(novice).length, games),
    expert: share(wins(expert).length, games),
    buyer: share(wins(buyer).length, games),
    threeStars: share(expert.filter((game) => game.stars === 3).length, games),
    leftExpert: oneDecimal(average(wins(expert).map((game) => game.movesLeft))),
    leftBuyer: oneDecimal(average(wins(buyer).map((game) => game.movesLeft))),
    lostGoals: lost.length > 0 ? Math.round(average(lost.map((game) => game.done)) * 100) : null,
  };
}

const engine = engineHash();
const commit = currentCommit();
const known = readRuns();

console.log(`Партий на уровень и бота: ${games}\n`);
console.log(
  '  ур | ходов | новичок | опытный | с покупками | запас опытн. | запас покуп. | ★★★ | цели проигр.',
);
for (const level of LEVELS) {
  if (only && floorOf(level.id) !== only) continue;
  const hash = levelHash(level);
  const cached = fresh ? undefined : findRun(known, hash, engine, games);
  const run = cached ?? measure(level, hash, engine, commit);
  if (!cached) saveRun(run, level);
  console.log(
    [
      run.number.padStart(4),
      String(run.moves).padStart(5),
      `${run.novice}%`.padStart(7),
      `${run.expert}%`.padStart(7),
      `${run.buyer}%`.padStart(11),
      run.leftExpert.toFixed(1).padStart(12),
      run.leftBuyer.toFixed(1).padStart(12),
      `${run.threeStars}%`.padStart(3),
      run.lostGoals === null ? '—' : `${run.lostGoals}%`,
    ].join(' | '),
  );
}
