// Что покупает бот-покупатель на 10-х уровнях этажей: сколько спецфишек каждого вида за партию
// Запуск: npx vite-node scripts/tmp/buys.ts
import { LEVELS } from '../../src/levels';
import { play } from '../levelBots';

declare const console: { log(...a: unknown[]): void };

const GAMES = 30;
/** Звёзд у бота на попытку — как при подгонке 10-х уровней */
const WALLET = 20;

for (const id of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
  const level = LEVELS.find((l) => l.id === id)!;
  const totals: Record<string, number> = {};
  let wins = 0;
  for (let i = 0; i < GAMES; i++) {
    const result = play(level, 9000 * id + i + 1, 'buyer', WALLET);
    if (result.won) wins++;
    for (const [type, count] of Object.entries(result.boughtBy)) {
      totals[type] = (totals[type] ?? 0) + count;
    }
  }
  const per = Object.entries(totals)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${type} ${(count / GAMES).toFixed(1)}`)
    .join(', ');
  console.log(
    `${id / 10}-10: побед ${Math.round((wins / GAMES) * 100)}%; покупок за партию: ${per || 'нет'}`,
  );
}
