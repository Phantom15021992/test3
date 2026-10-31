// Анализ сложности уровней: боты играют каждый уровень много раз.
// Запуск: npm run levels [-- <партий на уровень> [номер этажа]]
//
// Бот с покупками начинает с двумя звёздами этажа за каждый предыдущий уровень этажа.

import { FLOOR_SIZE, floorOf } from '../src/core/level';
import { LEVELS } from '../src/levels';
import { levelNumber } from '../src/ui/levelText';
import { BOTS, play, type GameResult } from './levelBots';

// Скрипт запускается в Node (vite-node), а типов Node в проекте нет
declare const process: { argv: string[] };

const STARS_PER_LEVEL = 2;

const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;
const average = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;

const games = Number(process.argv[2]) || 40;
const only = Number(process.argv[3]);

console.log(`Партий на уровень и бота: ${games}\n`);
console.log(
  '  ур | ходов | новичок | опытный | с покупками | запас опытн. | запас покуп. | ★★★ | цели проигр.',
);
for (const level of LEVELS) {
  if (only && floorOf(level.id) !== only) continue;
  const place = (level.id - 1) % FLOOR_SIZE;
  const wallet = place * STARS_PER_LEVEL;
  const results = BOTS.map((bot) =>
    Array.from({ length: games }, (_, i) =>
      play(level, 1000 * level.id + i + 1, bot, bot === 'buyer' ? wallet : 0),
    ),
  );
  const [novice, expert, buyer] = results as [GameResult[], GameResult[], GameResult[]];
  const wins = (list: GameResult[]) => list.filter((game) => game.won).length;
  const wonExpert = expert.filter((game) => game.won);
  const lostExpert = expert.filter((game) => !game.won);
  console.log(
    [
      levelNumber(level).padStart(4),
      String(level.moves).padStart(5),
      percent(wins(novice), games).padStart(7),
      percent(wins(expert), games).padStart(7),
      percent(wins(buyer), games).padStart(11),
      average(wonExpert.map((game) => game.movesLeft))
        .toFixed(1)
        .padStart(12),
      average(buyer.filter((game) => game.won).map((game) => game.movesLeft))
        .toFixed(1)
        .padStart(12),
      percent(expert.filter((game) => game.stars === 3).length, games).padStart(3),
      lostExpert.length > 0 ? percent(average(lostExpert.map((game) => game.done)), 1) : '—',
    ].join(' | '),
  );
}
