// Насколько ходы бота похожи на ходы живых игроков — и подбор мастерства бота по ним:
// npm run levels:humans -- <выгрузка level_moves.json> [--samples=N] [--grid]
// npm run levels:humans -- --synthetic=<партий> --levels=1,5 [--true-t=N] [--grid]
//
// Попытки людей лежат в Supabase (таблица level_moves, supabase/level_moves.sql): уровень, версия игры,
// seed, звёзды на начало и журнал. Выгрузка — результат запроса в SQL Editor
//   select json_agg(m) from level_moves m where version <> 'dev';
// сохранённый в файл (массив строк таблицы). Поле уровня берётся из git той версии, что играл человек.
//
// Каждая попытка проигрывается заново (core/levelReplay.ts), и в каждой позиции бот samples раз
// выбирает ход со своим случайным вниманием. Метрики:
//   «заметил» — как часто ход человека попадал в число ходов, которые бот вообще рассматривает;
//   «совпал»  — средняя вероятность, что бот сделает ровно ход человека;
//   «правдоподобие» — среднее log вероятности хода человека (чем ближе к 0, тем лучше; без шансов — log 1e-3).
// --grid перебирает внимание, фокус и температуру (botSkill) и печатает лучшие сочетания по правдоподобию.
// --synthetic — проверка самого способа: «люди» здесь — бот с известными параметрами (внимание
// и фокус текущие, температура --true-t), и перебор должен их узнать.

import { parseLevel, FLOOR_SIZE, type Level } from '../src/core/level';
import { applyLevelAction, parseLevelActions } from '../src/core/levelReplay';
import { LevelSession, type LevelAction } from '../src/core/levelSession';
import { createRng } from '../src/core/rng';
import { LEVELS } from '../src/levels';
import { botSkill, choiceOdds, play, weighMoves, type WeighedMove } from './levelBots';

declare const process: { argv: string[] };
declare function require(name: 'node:fs'): { readFileSync(path: string, encoding: 'utf8'): string };
declare function require(name: 'node:child_process'): {
  execSync(command: string, options: { encoding: 'utf8'; stdio?: unknown[] }): string;
};

/** Вероятность «без шансов»: ход человека бот не сделал бы никогда */
const FLOOR_PROBABILITY = 1e-3;
const ATTENTIONS = [1, 1.5, 2.25, 3, 5, 10];
const FOCUSES = [0, 3, 6];
const TEMPERATURES = [0, 25, 50, 100, 200, 400, 800];

interface Attempt {
  level: Level;
  seed: number;
  wallet: number;
  actions: LevelAction[];
}

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const samples = Number(arg('samples') ?? 12);
const grid = process.argv.includes('--grid');

/** Поле уровня той версии игры, что играл человек */
const levelCache = new Map<string, Level | null>();
function levelAt(levelId: number, version: string): Level | null {
  const key = `${levelId}@${version}`;
  if (!levelCache.has(key)) {
    const floor = String(Math.ceil(levelId / FLOOR_SIZE)).padStart(2, '0');
    const place = String(((levelId - 1) % FLOOR_SIZE) + 1).padStart(2, '0');
    let level: Level | null = null;
    if (/^[0-9a-f]{7,40}$/.test(version)) {
      try {
        const { execSync } = require('node:child_process');
        const json = execSync(`git show ${version}:src/levels/floor${floor}/${place}.json`, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        level = parseLevel(JSON.parse(json));
      } catch {
        level = null; // такой версии нет в этом репозитории
      }
    }
    levelCache.set(key, level);
  }
  return levelCache.get(key)!;
}

function loadAttempts(path: string): Attempt[] {
  const fs = require('node:fs');
  const rows = JSON.parse(fs.readFileSync(path, 'utf8')) as Record<string, unknown>[];
  const attempts: Attempt[] = [];
  let skipped = 0;
  for (const row of rows) {
    const raw = typeof row.actions === 'string' ? JSON.parse(row.actions) : row.actions;
    const actions = parseLevelActions(raw);
    const level = levelAt(Number(row.level_id), String(row.version));
    if (!actions || !level) {
      skipped++;
      continue;
    }
    attempts.push({ level, seed: Number(row.seed), wallet: Number(row.wallet), actions });
  }
  if (skipped > 0)
    console.log(`Пропущено попыток: ${skipped} (нет версии уровня в git или журнал испорчен)`);
  return attempts;
}

/** «Люди» для проверки способа: бот с известной температурой играет уровни */
function syntheticAttempts(games: number, levelIds: number[], temperature: number): Attempt[] {
  const saved = botSkill.temperature;
  botSkill.temperature = temperature;
  const attempts = levelIds.flatMap((id) => {
    const level = LEVELS.find((l) => l.id === id)!;
    return Array.from({ length: games }, (_, i) => {
      const seed = 52000 + i;
      return { level, seed, wallet: 0, actions: [...play(level, seed, 'expert').journal] };
    });
  });
  botSkill.temperature = saved;
  return attempts;
}

const moveKey = (move: LevelAction) => JSON.stringify(move);

/** Ход человека, который бот мог бы сделать сам (покупки он оценивает отдельно) */
const isChoice = (action: LevelAction) =>
  action.type === 'swap' ||
  action.type === 'fire' ||
  action.type === 'rainbow' ||
  action.type === 'manipulator';

interface Position {
  /** По выборкам внимания: что бот рассматривал и как ценил */
  draws: WeighedMove[][];
  human: string;
}

/** Все позиции, где человек выбирал ход, с выборками бота при текущем botSkill */
function collect(attempts: readonly Attempt[]): Position[] {
  const positions: Position[] = [];
  attempts.forEach((attempt, a) => {
    const session = new LevelSession(attempt.seed, attempt.level, attempt.wallet);
    for (const action of attempt.actions) {
      if (isChoice(action)) {
        const draws = Array.from({ length: samples }, (_, s) =>
          weighMoves(session, createRng(attempt.seed * 31 + a * 7919 + s * 104729 + session.moves)),
        );
        positions.push({ draws, human: moveKey(action) });
      }
      if (!applyLevelAction(session, action)) break; // журнал разошёлся с полем — дальше не смотрим
    }
  });
  return positions;
}

interface Score {
  seen: number;
  match: number;
  likelihood: number;
}

function score(positions: readonly Position[], temperature: number): Score {
  let seen = 0;
  let match = 0;
  let likelihood = 0;
  for (const { draws, human } of positions) {
    let p = 0;
    let found = 0;
    for (const weighed of draws) {
      const i = weighed.findIndex((pick) => moveKey(pick.move) === human);
      if (i < 0) continue;
      found++;
      p += choiceOdds(weighed, temperature)[i]!;
    }
    seen += found / draws.length;
    p /= draws.length;
    match += p;
    likelihood += Math.log(Math.max(p, FLOOR_PROBABILITY));
  }
  const n = Math.max(positions.length, 1);
  return { seen: seen / n, match: match / n, likelihood: likelihood / n };
}

const percent = (x: number) => `${Math.round(x * 100)}%`;
const line = (s: Score) =>
  `заметил ${percent(s.seen)}, совпал ${percent(s.match)}, правдоподобие ${s.likelihood.toFixed(3)}`;

const synthetic = arg('synthetic');
const attempts = synthetic
  ? syntheticAttempts(
      Number(synthetic),
      (arg('levels') ?? '1').split(',').map(Number),
      Number(arg('true-t') ?? 100),
    )
  : loadAttempts(process.argv[2] ?? '');
console.log(`Попыток: ${attempts.length}`);

if (!grid) {
  const positions = collect(attempts);
  console.log(`Позиций: ${positions.length}`);
  console.log(
    `Бот сейчас (внимание ${botSkill.attention}, фокус ${botSkill.focus}, температура ${botSkill.temperature}): ${line(score(positions, botSkill.temperature))}`,
  );
} else {
  const results: { attention: number; focus: number; temperature: number; s: Score }[] = [];
  for (const attention of ATTENTIONS) {
    for (const focus of FOCUSES) {
      Object.assign(botSkill, { attention, focus });
      const positions = collect(attempts);
      for (const temperature of TEMPERATURES) {
        results.push({ attention, focus, temperature, s: score(positions, temperature) });
      }
    }
  }
  results.sort((a, b) => b.s.likelihood - a.s.likelihood);
  console.log('Лучшие сочетания по правдоподобию ходов людей:');
  for (const r of results.slice(0, 10)) {
    console.log(
      `  внимание ${r.attention}, фокус ${r.focus}, температура ${r.temperature}: ${line(r.s)}`,
    );
  }
}
