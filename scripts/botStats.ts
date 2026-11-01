// Журнал замеров бота: stats/bot-runs.jsonl и версии уровней stats/level-versions.jsonl.
// Файлы лежат в репозитории, а не в базе: данные не секретны, их историю ведёт git, а ключ
// в публичном репозитории ничего бы не защитил. В сборку игры они не попадают.
//
// Замер привязан к хешу уровня и к хешу логики (src/core и боты): пока оба те же, результат
// партий не изменится, и пересчитывать незачем. Изменилось правило или бот — замер устарел сам.

import type { Level } from '../src/core/level';

// Скрипты запускаются в Node (vite-node), а типов Node в проекте нет
declare function require(name: 'node:fs'): {
  appendFileSync(path: string, data: string): void;
  existsSync(path: string): boolean;
  mkdirSync(path: string, options: { recursive: boolean }): void;
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: 'utf8'): string;
};
declare function require(name: 'node:crypto'): {
  createHash(algorithm: 'sha256'): {
    update(data: string): { digest(encoding: 'hex'): string };
  };
};
declare function require(name: 'node:child_process'): {
  execSync(command: string, options: { encoding: 'utf8' }): string;
};

const STATS_DIR = 'stats';
const RUNS_FILE = `${STATS_DIR}/bot-runs.jsonl`;
const LEVELS_FILE = `${STATS_DIR}/level-versions.jsonl`;
const HASH_LENGTH = 12;

export interface BotRun {
  date: string;
  /** Коммит игры на момент замера; с «+» — были незакоммиченные правки */
  commit: string;
  engine: string;
  levelId: number;
  number: string;
  hash: string;
  moves: number;
  colors: number;
  games: number;
  /** Победы, % */
  novice: number;
  expert: number;
  buyer: number;
  threeStars: number;
  /** Средний запас ходов при победе */
  leftExpert: number;
  leftBuyer: number;
  /** Какая доля целей выполнена в проигрышах опытного бота, %; null — проигрышей нет */
  lostGoals: number | null;
}

export interface LevelVersion {
  hash: string;
  level: Level;
}

const sha = (text: string) =>
  require('node:crypto').createHash('sha256').update(text).digest('hex').slice(0, HASH_LENGTH);

/** Хеш не зависит от порядка полей и форматирования: важно только содержимое уровня */
export function levelHash(level: Level): string {
  const sorted = Object.keys(level)
    .sort()
    .map((key) => [key, level[key as keyof Level]]);
  return sha(JSON.stringify(sorted));
}

/** Хеш всего, от чего зависит результат партий, кроме самого уровня */
export function engineHash(): string {
  const fs = require('node:fs');
  const core = fs
    .readdirSync('src/core')
    .sort()
    .map((name) => `src/core/${name}`);
  const texts = [...core, 'scripts/levelBots.ts'].map((path) =>
    fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n'),
  );
  return sha(texts.join('\n'));
}

export function currentCommit(): string {
  const { execSync } = require('node:child_process');
  const commit = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
  const dirty = execSync('git status --porcelain -- src scripts', { encoding: 'utf8' }).trim();
  return dirty ? `${commit}+` : commit;
}

function readLines<T>(path: string): T[] {
  const fs = require('node:fs');
  if (!fs.existsSync(path)) return [];
  return fs
    .readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as T);
}

export const readRuns = () => readLines<BotRun>(RUNS_FILE);
export const readLevelVersions = () => readLines<LevelVersion>(LEVELS_FILE);

/** Свежий замер этого уровня на этой логике, в котором партий не меньше нужного */
export function findRun(
  runs: readonly BotRun[],
  hash: string,
  engine: string,
  games: number,
): BotRun | undefined {
  return runs
    .filter((run) => run.hash === hash && run.engine === engine && run.games >= games)
    .at(-1);
}

/** Запись дописывается одной строкой: несколько этажей можно мерить параллельно */
export function saveRun(run: BotRun, level: Level): void {
  const fs = require('node:fs');
  fs.mkdirSync(STATS_DIR, { recursive: true });
  fs.appendFileSync(RUNS_FILE, `${JSON.stringify(run)}\n`);
  if (!readLevelVersions().some((version) => version.hash === run.hash)) {
    fs.appendFileSync(LEVELS_FILE, `${JSON.stringify({ hash: run.hash, level })}\n`);
  }
}

/** «4-10» → 40; null — не номер уровня */
export function parseLevelNumber(text: string, floorSize: number): number | null {
  const match = /^(\d+)-(\d+)$/.exec(text);
  if (!match) return null;
  const place = Number(match[2]);
  if (place < 1 || place > floorSize) return null;
  return (Number(match[1]) - 1) * floorSize + place;
}
