// История уровня по замерам бота и откат к старой версии:
//   npm run levels:history -- 4-10            все версии уровня и их результаты
//   npm run levels:history -- 4-10 <хеш>      вернуть уровень к этой версии (файл JSON)
// После отката — обычные test, lint, typecheck и коммит.

import { FLOOR_SIZE, floorOf, type Goal } from '../src/core/level';
import { LEVELS } from '../src/levels';
import { levelHash, parseLevelNumber, readLevelVersions, readRuns, type BotRun } from './botStats';

// Скрипт запускается в Node (vite-node), а типов Node в проекте нет
declare const process: { argv: string[]; exitCode?: number };
declare function require(name: 'node:fs'): {
  writeFileSync(path: string, data: string): void;
};

const [numberText = '', wantedHash] = process.argv.slice(2);
const levelId = parseLevelNumber(numberText, FLOOR_SIZE);
const goalsText = (goals: readonly Goal[]) =>
  goals.map((goal) => `${goal.kind} ${goal.count}`).join(', ');

function restore(id: number, hash: string): void {
  const version = readLevelVersions().find(
    (item) => item.hash.startsWith(hash) && item.level.id === id,
  );
  if (!version) {
    console.log(`Версии ${hash} у уровня ${numberText} нет`);
    process.exitCode = 1;
    return;
  }
  const floor = String(floorOf(id)).padStart(2, '0');
  const place = String(((id - 1) % FLOOR_SIZE) + 1).padStart(2, '0');
  const path = `src/levels/floor${floor}/${place}.json`;
  require('node:fs').writeFileSync(path, `${JSON.stringify(version.level, null, 2)}\n`);
  console.log(`Уровень ${numberText} возвращён к версии ${version.hash}: ${path}`);
}

function show(id: number): void {
  const current = LEVELS[id - 1];
  const runs = readRuns().filter((run) => run.levelId === id);
  if (runs.length === 0) console.log(`Замеров уровня ${numberText} нет`);
  const versions = readLevelVersions().filter((item) => item.level.id === id);
  for (const { hash, level } of versions) {
    const mark = current && levelHash(current) === hash ? ' (текущая)' : '';
    console.log(`\nВерсия ${hash}${mark}: ходов ${level.moves}, ${goalsText(level.goals)}`);
    runs
      .filter((run: BotRun) => run.hash === hash)
      .forEach((run) => {
        console.log(
          `  ${run.date.slice(0, 10)} ${run.commit}: опытный ${run.expert}%, новичок ${run.novice}%, ` +
            `с покупками ${run.buyer}%, 3★ ${run.threeStars}% (${run.games} партий)`,
        );
      });
  }
}

if (levelId === null) {
  console.log('Укажите уровень: npm run levels:history -- 4-10 [хеш версии]');
  process.exitCode = 1;
} else if (wantedHash) {
  restore(levelId, wantedHash);
} else {
  show(levelId);
}
