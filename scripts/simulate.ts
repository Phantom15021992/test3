// Симуляция партий ботом — для оценки баланса очков.
// Запуск: npm run simulate [-- <партий> <ходов>]
//
// Бот на каждом ходу пробует все доступные ходы и выбирает тот, что даёт больше очков.
// Оценка хода идёт на отдельном ГСЧ, поэтому бот не «подглядывает», какие фишки упадут сверху.

import {
  allPositions,
  createEmptyBoard,
  getCell,
  type Board,
  type Position,
} from '../src/core/board';
import { buyBonus, placeBonus, type BonusType } from '../src/core/bonus';
import {
  BONUS_TIERS,
  DEMO_BOARD_COLS,
  DEMO_BOARD_ROWS,
  DEMO_COLOR_COUNT,
} from '../src/core/config';
import { generateStartBoard } from '../src/core/generate';
import { findPossibleMoves, hasTileMove, shuffleBoard } from '../src/core/moves';
import { runMove, type Move } from '../src/core/resolve';
import { createRng, type Rng } from '../src/core/rng';
import { comboNeedsColor } from '../src/core/specials';

// Скрипт запускается в Node (vite-node), а типов Node в проекте нет
declare const process: { argv: string[] };

type Mode = 'plain' | 'specials' | 'buyAlways' | 'buySmart';

const MODE_TITLES: Record<Mode, string> = {
  plain: 'Без спецфишек',
  specials: 'Спецфишки с поля (из 3 уровня)',
  buyAlways: 'С поля + покупка при каждой возможности',
  buySmart: 'С поля + покупка, только если окупается',
};

const MANIPULATOR_SAMPLES = 150;

interface GameResult {
  score: number;
  specialsUsed: number;
  bought: number;
  level3Created: number;
}

function isTileAt(board: Board, pos: Position): boolean {
  return getCell(board, pos)?.kind === 'tile';
}

function colorsOnBoard(board: Board): number[] {
  const colors = new Set<number>();
  for (const pos of allPositions(board)) {
    const cell = getCell(board, pos);
    if (cell?.kind === 'tile') colors.add(cell.color);
  }
  return [...colors];
}

/** Все ходы, которые бот рассматривает в этом режиме */
function candidateMoves(board: Board, mode: Mode, rng: Rng): Move[] {
  const moves: Move[] = [];
  for (const { from, to } of findPossibleMoves(board)) {
    const plainSwap = isTileAt(board, from) && isTileAt(board, to);
    if (mode === 'plain' && !plainSwap) continue;
    if (comboNeedsColor(board, from, to)) {
      for (const color of colorsOnBoard(board)) moves.push({ type: 'swap', from, to, color });
    } else {
      moves.push({ type: 'swap', from, to });
    }
  }
  if (mode === 'plain') return moves;

  const positions = allPositions(board);
  for (const at of positions) {
    const cell = getCell(board, at);
    if (cell?.kind !== 'piece') continue;
    if (cell.type === 'megaBomb') moves.push({ type: 'megaBomb', at });
    if (cell.type === 'rainbow') {
      for (const color of colorsOnBoard(board)) moves.push({ type: 'rainbow', at, color });
    }
    if (cell.type === 'manipulator') {
      // Все пары клеток перебирать долго — берём случайную выборку
      for (let i = 0; i < MANIPULATOR_SAMPLES; i++) {
        const a = positions[rng.int(positions.length)]!;
        const b = positions[rng.int(positions.length)]!;
        if (a.row === b.row && a.col === b.col) continue;
        if ([a, b].some((p) => p.row === at.row && p.col === at.col)) continue;
        moves.push({ type: 'manipulator', at, a, b });
      }
    }
  }
  return moves;
}

/** Лучший ход на поле по оценке на отдельном ГСЧ */
function bestMove(
  board: Board,
  mode: Mode,
  rng: Rng,
  evalSeed: number,
): { move: Move; score: number } | null {
  let best: { move: Move; score: number } | null = null;
  for (const move of candidateMoves(board, mode, rng)) {
    const result = runMove(board, move, { colorCount: DEMO_COLOR_COUNT, rng: createRng(evalSeed) });
    if (!best || result.score > best.score) best = { move, score: result.score };
  }
  return best;
}

function usesSpecial(board: Board, move: Move): boolean {
  if (move.type !== 'swap') return true;
  return !isTileAt(board, move.from) || !isTileAt(board, move.to);
}

function ensureMoves(board: Board, rng: Rng): Board {
  return hasTileMove(board) ? board : shuffleBoard(board, DEMO_COLOR_COUNT, rng);
}

function affordable(score: number): BonusType[] {
  return BONUS_TIERS.filter((tier) => score >= tier.cost).map((tier) => tier.type);
}

/**
 * Какую спецфишку купить перед ходом.
 * buyAlways — самую дорогую из доступных; buySmart — ту, с которой лучший ход минус цена
 * даёт больше, чем лучший ход без покупки (место спецфишки угадывается на копии ГСЧ).
 */
function chooseBonus(
  board: Board,
  score: number,
  mode: Mode,
  rng: Rng,
  evalSeed: number,
): BonusType | null {
  const options = affordable(score);
  if (options.length === 0) return null;
  if (mode === 'buyAlways') return options[options.length - 1]!;

  const withoutBuying = bestMove(board, mode, createRng(evalSeed), evalSeed)?.score ?? 0;
  let choice: { type: BonusType; gain: number } | null = null;
  for (const type of options) {
    const placed = placeBonus(board, type, createRng(rng.getState()));
    if (!placed) continue;
    const best = bestMove(placed.board, mode, createRng(evalSeed), evalSeed)?.score ?? 0;
    const gain = best - (score - buyBonus(score, type)!);
    if (gain > withoutBuying && (!choice || gain > choice.gain)) choice = { type, gain };
  }
  return choice?.type ?? null;
}

function playGame(seed: number, moves: number, mode: Mode): GameResult {
  const rng = createRng(seed);
  let board = generateStartBoard(
    createEmptyBoard(DEMO_BOARD_ROWS, DEMO_BOARD_COLS),
    DEMO_COLOR_COUNT,
    rng,
  );
  let score = 0;
  let specialsUsed = 0;
  let bought = 0;
  let level3Created = 0;

  for (let turn = 0; turn < moves; turn++) {
    const evalSeed = rng.int(2 ** 31);

    if (mode === 'buyAlways' || mode === 'buySmart') {
      const type = chooseBonus(board, score, mode, rng, evalSeed);
      const placed = type ? placeBonus(board, type, rng) : null;
      if (type && placed) {
        score = buyBonus(score, type)!;
        board = ensureMoves(placed.board, rng);
        bought++;
      }
    }

    const best = bestMove(board, mode, rng, evalSeed);
    if (!best) break;
    if (usesSpecial(board, best.move)) specialsUsed++;
    const result = runMove(board, best.move, { colorCount: DEMO_COLOR_COUNT, rng });
    for (const step of result.steps) {
      if (step.kind !== 'transform') continue;
      level3Created += step.placements.filter(
        (p) => p.cell?.kind === 'tile' && p.cell.level === 3,
      ).length;
    }
    score += result.score;
    board = ensureMoves(result.board, rng);
  }
  return { score, specialsUsed, bought, level3Created };
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const mid = sorted.length / 2;
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[Math.floor(mid)]!;
  return { min: sorted[0]!, max: sorted[sorted.length - 1]!, avg: sum / sorted.length, median };
}

const games = Number(process.argv[2] ?? 100);
const moves = Number(process.argv[3] ?? 35);
const modes: Mode[] = ['plain', 'specials', 'buyAlways', 'buySmart'];
const summary: Record<string, string | number>[] = [];
const perGame = (results: GameResult[], key: keyof GameResult) =>
  (results.reduce((s, r) => s + r[key], 0) / games).toFixed(1);

for (const mode of modes) {
  const started = Date.now();
  const results = Array.from({ length: games }, (_, i) => playGame(i + 1, moves, mode));
  const score = stats(results.map((r) => r.score));
  summary.push({
    режим: MODE_TITLES[mode],
    мин: score.min,
    макс: score.max,
    среднее: Math.round(score.avg),
    медиана: score.median,
    'спецфишек использовано': perGame(results, 'specialsUsed'),
    куплено: perGame(results, 'bought'),
    'ячеек 3 ур.': perGame(results, 'level3Created'),
    'время, с': ((Date.now() - started) / 1000).toFixed(1),
  });
  console.log(`${MODE_TITLES[mode]}: готово`);
}

console.log(`\n${games} партий по ${moves} ходов, поле ${DEMO_BOARD_ROWS}×${DEMO_BOARD_COLS}`);
console.table(summary);
console.log(JSON.stringify(summary));
