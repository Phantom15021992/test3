// Калибровка мастерства бота по живым игрокам:
// vite-node scripts/calibrateBot.ts <партий> <внимание> <уровень.json> [<уровень.json> …] [--focus=N]
//
// Играет уровни теми версиями, что были у игроков (их достают из git по версии попытки в level_results),
// и печатает долю побед опытного бота при таком внимании (botSkill.attention). Внимание подбирается так,
// чтобы доли совпали с людьми. Ноябрь 2026: на 1-1 (версия bfbbcb8, 17 ячеек 3 уровня, 25 ходов) люди
// выиграли 3 из 8 попыток (38%), на 1-5 (лёд 52 и 28 ячеек 3 уровня, 34 хода) — 1 из 17 (6%).

import { parseLevel } from '../src/core/level';
import { botSkill, play } from './levelBots';

declare const process: { argv: string[] };
declare function require(name: 'node:fs'): { readFileSync(path: string, encoding: 'utf8'): string };

const games = Number(process.argv[2]) || 100;
const attention = Number(process.argv[3]);
if (Number.isFinite(attention) && attention > 0) botSkill.attention = attention;
const focusArg = process.argv.find((arg) => arg.startsWith('--focus='));
if (focusArg) botSkill.focus = Number(focusArg.slice('--focus='.length));

const fs = require('node:fs');
for (const path of process.argv.slice(4).filter((arg) => !arg.startsWith('--'))) {
  const level = parseLevel(JSON.parse(fs.readFileSync(path, 'utf8')));
  let wins = 0;
  let done = 0;
  for (let i = 0; i < games; i++) {
    const game = play(level, 31000 + i, 'expert');
    if (game.won) wins++;
    done += game.done;
  }
  const name = path.split(/[\\/]/).pop();
  console.log(
    `${name}: внимание ${botSkill.attention}, фокус ${botSkill.focus}, побед ${Math.round((wins / games) * 100)}%, целей в среднем ${Math.round((done / games) * 100)}%`,
  );
}
