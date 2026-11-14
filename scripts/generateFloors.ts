// Новые этажи кампании: npx vite-node scripts/generateFloors.ts <первый этаж> <последний этаж> [seed]
//
// Поля и механики раскладываются здесь, а число целей, ходы и звёзды потом выставляет подгонка ботом
// (npm run levels:tune -- <партий> <этаж>). Правила владельца:
// - у этажа одна механика-тема на всех 10 уровнях, остальные меняются от уровня к уровню так, чтобы
//   кроме темы почти ничего не повторялось;
// - на лёгких местах (1–4, 6–8) — 2 механики, на 5, 9 и 10 — 3;
// - механики — из первых 100 уровней: лёд, золото, сундуки, короны, уголь, камни, ячейки 3 уровня, ячейки
//   3 уровня одного цвета. На трудных местах — тяжёлые варианты (лёд 2 уровня и трещины, цепи, спрятанное
//   золото, две короны);
// - формы поля — те же, что у первых 100 уровней.
// Препятствия ставятся по правилам кампании (scripts/levelLayout.ts): лёд — в толстых местах, сундуки —
// не на краю, цепи — не ближе 3 клеток, корона — наверху (подгонка опустит её), уголь — не в столбцах корон.

import { FLOOR_SIZE, parseLevel, type Goal, type Level } from '../src/core/level';
import { createRng, type Rng } from '../src/core/rng';
import { LEVELS } from '../src/levels';
import { placeChains, placeLayer } from './levelLayout';

declare const process: { argv: string[] };
declare function require(name: 'node:fs'): {
  writeFileSync(path: string, data: string): void;
  mkdirSync(path: string, options: { recursive: boolean }): void;
};

type Mechanic = 'ice' | 'gold' | 'chests' | 'crowns' | 'coal' | 'stones' | 'cells' | 'color';

const MECHANICS: readonly Mechanic[] = [
  'ice',
  'gold',
  'chests',
  'crowns',
  'coal',
  'stones',
  'cells',
  'color',
];

/** Тема этажа по порядку этажей от 11-го: повторяется по кругу */
const THEMES: readonly Mechanic[] = [
  'ice',
  'chests',
  'crowns',
  'coal',
  'gold',
  'color',
  'stones',
  'cells',
  'chests',
  'coal',
];

/** Ячейки 3 уровня и ячейки одного цвета — почти одно и то же: на одном уровне не вместе */
const CLASH: readonly [Mechanic, Mechanic][] = [['cells', 'color']];

/** Места этажа (с нуля), где механик три и варианты тяжёлые */
const HARD_PLACES = [4, 8, 9];

const HINTS: Readonly<Record<Mechanic, string>> = {
  ice: 'Лёд ломается, когда на его клетке исчезает фишка',
  gold: 'Золото — во льду и в сундуках: доломай их',
  chests: 'Сундук ломается от совпадения рядом или от взрыва',
  crowns: 'Опусти корону на дно поля',
  coal: 'Совпадения рядом с углём откалывают слои',
  stones: 'Камни разбивает только взрыв',
  cells: 'Собирай ячейки 3 уровня',
  color: 'Собирай ячейки 3 уровня нужного цвета',
};

const first = Number(process.argv[2]) || 11;
const last = Number(process.argv[3]) || first;
const seed = Number(process.argv[4]) || 2026;

/** Формы полей первых 100 уровней: только клетки и дыры, без препятствий */
const SHAPES: string[][] = [
  ...new Set(
    LEVELS.map((level) => level.layout.map((line) => line.replace(/[^#]/g, '.')).join('|')),
  ),
].map((joined) => joined.split('|'));

const cellCount = (shape: readonly string[]) => shape.join('').split('.').length - 1;

/** Сплошные квадраты 2×2 внутри поля (у всех четырёх клеток со всех сторон — клетки поля) */
function coalSpots(layout: readonly string[], banned: Set<number>): { row: number; col: number }[] {
  const at = (r: number, c: number) => layout[r]?.[c] ?? '#';
  const spots: { row: number; col: number }[] = [];
  for (let r = 1; r < layout.length - 2; r++) {
    for (let c = 1; c < layout[0]!.length - 2; c++) {
      if (banned.has(c) || banned.has(c + 1)) continue;
      const block = [at(r, c), at(r, c + 1), at(r + 1, c), at(r + 1, c + 1)];
      const ring = [
        at(r - 1, c),
        at(r - 1, c + 1),
        at(r + 2, c),
        at(r + 2, c + 1),
        at(r, c - 1),
        at(r + 1, c - 1),
        at(r, c + 2),
        at(r + 1, c + 2),
      ];
      if (block.every((s) => s === '.') && ring.every((s) => s !== '#' && s !== 'c')) {
        spots.push({ row: r, col: c });
      }
    }
  }
  return spots;
}

function setCell(layout: string[], row: number, col: number, symbol: string): void {
  const line = layout[row]!;
  layout[row] = line.slice(0, col) + symbol + line.slice(col + 1);
}

/** Короны — в верхней строке поля, в разных столбцах ближе к середине, где столбец доходит до середины */
function placeCrowns(layout: string[], count: number, rng: Rng): Set<number> {
  const width = layout[0]!.length;
  const middle = Math.floor((layout.length - 1) / 2);
  const columns = Array.from({ length: width }, (_, c) => c).filter((c) =>
    layout.slice(0, middle + 1).every((line) => line[c] !== '#'),
  );
  const used = new Set<number>();
  const order = columns.sort(
    (a, b) => Math.abs(2 * a - width + 1) - Math.abs(2 * b - width + 1) || rng.int(3) - 1,
  );
  for (const col of order) {
    if (used.size >= count) break;
    if ([...used].some((c) => Math.abs(c - col) < 2)) continue;
    setCell(layout, 0, col, 'o');
    used.add(col);
  }
  return used;
}

function placeCoal(layout: string[], blocks: number, banned: Set<number>, rng: Rng): number {
  let placed = 0;
  for (let i = 0; i < blocks; i++) {
    const spots = coalSpots(layout, banned);
    if (spots.length === 0) break;
    const { row, col } = spots[rng.int(spots.length)]!;
    for (const [dr, dc] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ] as const) {
      setCell(layout, row + dr, col + dc, 'c');
    }
    placed++;
  }
  return placed;
}

/** Камни — помеха без цели: в середине поля, не на краю */
function placeStones(layout: string[], count: number, rng: Rng): void {
  const free: { row: number; col: number }[] = [];
  for (let r = 2; r < layout.length - 2; r++) {
    for (let c = 1; c < layout[0]!.length - 1; c++)
      if (layout[r]![c] === '.') free.push({ row: r, col: c });
  }
  for (let i = 0; i < count && free.length > 0; i++) {
    const { row, col } = free.splice(rng.int(free.length), 1)[0]!;
    setCell(layout, row, col, 's');
  }
}

const count = (layout: readonly string[], symbols: string) =>
  [...layout.join('')].filter((s) => symbols.includes(s)).length;

/** Механики этажа: тема на всех уровнях, остальные — поровну, без пар из CLASH и без повторов на уровне */
function planFloor(theme: Mechanic, rng: Rng): Mechanic[][] {
  const pool = MECHANICS.filter((m) => m !== theme);
  const used = new Map<Mechanic, number>(pool.map((m) => [m, 0]));
  return Array.from({ length: FLOOR_SIZE }, (_, place) => {
    const level: Mechanic[] = [theme];
    const extras = HARD_PLACES.includes(place) ? 2 : 1;
    for (let i = 0; i < extras; i++) {
      const fits = pool.filter(
        (m) =>
          !level.includes(m) &&
          !CLASH.some(
            ([a, b]) => (level.includes(a) && m === b) || (level.includes(b) && m === a),
          ) &&
          // Уровень с одними камнями без цели не бывает: камни — только рядом с целью
          !(m === 'stones' && level.every((x) => x === 'stones')),
      );
      const least = Math.min(...fits.map((m) => used.get(m)!));
      const choices = fits.filter((m) => used.get(m) === least);
      const pick = choices[rng.int(choices.length)]!;
      level.push(pick);
      used.set(pick, used.get(pick)! + 1);
    }
    return level;
  });
}

function buildLevel(id: number, mechanics: Mechanic[], rng: Rng): Level {
  const place = (id - 1) % FLOOR_SIZE;
  const hard = HARD_PLACES.includes(place);
  // Трудным местам и уровням с углём и коронами — поля побольше
  const big = hard || mechanics.includes('coal') || mechanics.includes('crowns');
  const shapes = SHAPES.filter((s) => cellCount(s) >= (big ? 70 : 55));
  let layout = [...shapes[rng.int(shapes.length)]!];
  const goals: Goal[] = [];
  let coalLayers: number | undefined;
  let hiddenGold: number | undefined;
  let iceCracks = false;

  let crownColumns = new Set<number>();
  if (mechanics.includes('crowns')) {
    const crowns = hard ? 2 : 1;
    crownColumns = placeCrowns(layout, crowns, rng);
    goals.push({ kind: 'item', count: crownColumns.size });
  }
  if (mechanics.includes('coal')) {
    // С коронами или льдом — 2–3 глыбы, иначе 1–2
    const withOthers = mechanics.includes('crowns') || mechanics.includes('ice');
    const blocks = placeCoal(layout, (withOthers ? 2 : 1) + (hard ? 1 : 0), crownColumns, rng);
    if (blocks > 0) {
      goals.push({ kind: 'coal', count: blocks });
      coalLayers = hard ? 6 : 4;
    }
  }
  if (mechanics.includes('chests')) {
    layout = hard ? placeChains(layout, 4) : placeLayer(layout, 'b', 4);
  }
  if (mechanics.includes('ice')) {
    layout = placeLayer(layout, hard ? 'J' : 'i', hard ? 10 : 14);
    // Трещины — только на 5, 9 и 10 местах этажа
    iceCracks = hard && rng.int(2) === 0;
  }
  if (mechanics.includes('gold')) {
    if (!hard) layout = placeLayer(layout, 'g', 4);
    else if (rng.int(2) === 0) layout = placeLayer(layout, 't', 3);
    else {
      // Спрятанное золото: в части льдин 2 уровня, каждая попытка — в других
      layout = placeLayer(layout, 'J', count(layout, 'J') + 8);
      hiddenGold = 3;
    }
  }
  if (mechanics.includes('stones')) placeStones(layout, hard ? 4 : 3, rng);

  if (mechanics.includes('chests')) goals.push({ kind: 'box', count: count(layout, 'bt123uvw') });
  if (mechanics.includes('ice')) goals.push({ kind: 'ice', count: count(layout, 'iJg') });
  if (mechanics.includes('gold')) {
    goals.push({ kind: 'gold', count: count(layout, 'gtuvw') + (hiddenGold ?? 0) });
  }
  if (mechanics.includes('cells')) goals.push({ kind: 'level3', count: 6 });
  if (mechanics.includes('color')) goals.push({ kind: 'level3color', count: 4, color: rng.int(3) });

  return parseLevel({
    id,
    title: `Уровень ${mechanics.join(' + ')}`,
    hint: HINTS[mechanics[0]!],
    layout,
    colors: 3,
    moves: 35,
    goals: goals.filter((goal) => goal.count > 0),
    stars: [
      { kind: 'level3', count: 10 },
      { kind: 'level3', count: 15 },
    ],
    ...(coalLayers !== undefined && { coalLayers }),
    ...(hiddenGold !== undefined && { hiddenGold }),
    ...(iceCracks && { iceCracks }),
  } as Level);
}

const fs = require('node:fs');
const rng = createRng(seed);
for (let floor = first; floor <= last; floor++) {
  const theme = THEMES[(floor - 11) % THEMES.length]!;
  const plan = planFloor(theme, rng);
  const dir = `src/levels/floor${String(floor).padStart(2, '0')}`;
  fs.mkdirSync(dir, { recursive: true });
  plan.forEach((mechanics, place) => {
    const id = (floor - 1) * FLOOR_SIZE + place + 1;
    const level = buildLevel(id, mechanics, rng);
    fs.writeFileSync(
      `${dir}/${String(place + 1).padStart(2, '0')}.json`,
      `${JSON.stringify(level, null, 2)}\n`,
    );
    console.log(
      `${floor}-${place + 1}: ${mechanics.join(' + ')} → ${level.goals.map((g) => `${g.kind} ${g.count}`).join(', ')}`,
    );
  });
}
