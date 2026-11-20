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
import { floorColors, placeChains, placeLayer, symmetryOf } from './levelLayout';

declare const process: { argv: string[] };
declare function require(name: 'node:fs'): {
  readFileSync(path: string, encoding: 'utf8'): string;
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

/** Путь короны до дна (клеток) на лёгких и трудных местах */
const CROWN_PATH = { easy: [3, 6], hard: [3, 7] } as const;

const HINTS: Readonly<Record<Mechanic, string>> = {
  ice: 'Лёд ломается, когда на его клетке исчезает фишка',
  gold: 'Золото — в угле и в сундуках: доломай их',
  chests: 'Сундук ломается от совпадения рядом или от взрыва',
  crowns: 'Опусти корону на дно поля',
  coal: 'Совпадения рядом с углём откалывают слои',
  stones: 'Камни разбивает только взрыв',
  cells: 'Собирай ячейки 3 уровня',
  color: 'Собирай ячейки 3 уровня нужного цвета',
};

const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const first = Number(args[0]) || 11;
const last = Number(args[1]) || first;
const seed = Number(args[2]) || 2026;
/** --only=12-6,13-1: переложить только эти уровни с прежним набором механик (из title), своим ГСЧ */
const only = process.argv
  .find((arg) => arg.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',');

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
      if (block.every((s) => s === '.') && ring.every((s) => s !== '#' && s !== 'c' && s !== 'k')) {
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

/** Сколько клеток проходит корона от верхней клетки столбца до его дна (дыры не клетки) */
function crownPath(layout: readonly string[], col: number): number {
  const cells = layout.map((line) => line[col] !== '#');
  const length = cells.indexOf(false) < 0 ? cells.length : cells.indexOf(false);
  // Столбец без разрывов: над дырой бот корону не доводит (она ждёт, пока опустеет клетка за дырой)
  return cells.slice(length).some(Boolean) ? -1 : length - 1;
}

/**
 * Столбцы для корон: начинаются в верхней строке, путь до дна — CROWN_PATH. На сплошном поле 10×10 корону
 * и от середины поля (ниже правило не пускает) бот не доводит за 45 ходов в 90% партий, а в коротком столбце
 * буквы, креста или сердца подгонка добирает сложность высотой короны, как на уровнях 8-2 и 10-2
 */
function pickCrownColumns(
  layout: readonly string[],
  count: number,
  hard: boolean,
  rng: Rng,
): number[] {
  const [low, high] = hard ? CROWN_PATH.hard : CROWN_PATH.easy;
  const columns = Array.from({ length: layout[0]!.length }, (_, c) => c).filter((c) => {
    const path = crownPath(layout, c);
    return layout[0]![c] !== '#' && path >= low && path <= high;
  });
  const shuffled = columns.sort(() => rng.int(3) - 1);
  const width = layout[0]!.length;
  // Две короны — зеркально (уровни симметричные), если у столбца есть подходящее отражение
  if (count === 2) {
    const pair = shuffled.find((col) => {
      const other = width - 1 - col;
      return other !== col && Math.abs(other - col) >= 2 && columns.includes(other);
    });
    if (pair !== undefined) return [pair, width - 1 - pair];
  }
  const used: number[] = [];
  for (const col of shuffled) {
    if (used.length >= count) break;
    if (used.some((c) => Math.abs(c - col) < 2)) continue;
    used.push(col);
  }
  return used.length >= count ? used : [];
}

const BLOCK = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
] as const;

/** Левая верхняя клетка отражения глыбы 2×2 (уровни симметричные) */
function blockImage(layout: readonly string[], row: number, col: number) {
  const image = symmetryOf(layout);
  const cells = BLOCK.map(([dr, dc]) => image({ row: row + dr, col: col + dc }));
  return {
    row: Math.min(...cells.map((c) => c.row)),
    col: Math.min(...cells.map((c) => c.col)),
  };
}

/**
 * Глыбы угля — парами отражений; нечётная — на оси, если там есть место. Без места для пары — по одной
 */
function placeCoal(
  layout: string[],
  blocks: number,
  banned: Set<number>,
  rng: Rng,
  symbol: 'c' | 'k' = 'c',
): number {
  let placed = 0;
  const put = (row: number, col: number) => {
    for (const [dr, dc] of BLOCK) setCell(layout, row + dr, col + dc, symbol);
    placed++;
  };
  while (placed < blocks) {
    const spots = coalSpots(layout, banned);
    if (spots.length === 0) break;
    const onAxis = spots.filter(({ row, col }) => {
      const img = blockImage(layout, row, col);
      return img.row === row && img.col === col;
    });
    if (blocks - placed === 1 && onAxis.length > 0) {
      const { row, col } = onAxis[rng.int(onAxis.length)]!;
      put(row, col);
      continue;
    }
    const { row, col } = spots[rng.int(spots.length)]!;
    put(row, col);
    if (placed >= blocks) break;
    const img = blockImage(layout, row, col);
    if (coalSpots(layout, banned).some((s) => s.row === img.row && s.col === img.col)) {
      put(img.row, img.col);
    }
  }
  return placed;
}

/** Первые blocks глыб угля становятся глыбами с золотом (k): сверху вниз, слева направо */
function goldenCoal(layout: readonly string[], blocks: number): string[] {
  const grid = [...layout];
  let left = blocks;
  for (let row = 0; row < grid.length && left > 0; row++) {
    for (let col = 0; col < grid[0]!.length && left > 0; col++) {
      if (grid[row]![col] !== 'c') continue;
      for (const [dr, dc] of BLOCK) setCell(grid, row + dr, col + dc, 'k');
      left--;
    }
  }
  return grid;
}

/** Камни — помеха без цели: в середине поля, не на краю; парами отражений */
function placeStones(layout: string[], count: number, rng: Rng): void {
  const image = symmetryOf(layout);
  const free: { row: number; col: number }[] = [];
  for (let r = 2; r < layout.length - 2; r++) {
    for (let c = 1; c < layout[0]!.length - 1; c++)
      if (layout[r]![c] === '.') free.push({ row: r, col: c });
  }
  let placed = 0;
  while (placed < count && free.length > 0) {
    const cell = free.splice(rng.int(free.length), 1)[0]!;
    setCell(layout, cell.row, cell.col, 's');
    placed++;
    const img = image(cell);
    const index = free.findIndex((c) => c.row === img.row && c.col === img.col);
    if (index >= 0) {
      free.splice(index, 1);
      setCell(layout, img.row, img.col, 's');
      placed++;
    }
  }
}

const count = (layout: readonly string[], symbols: string) =>
  [...layout.join('')].filter((s) => symbols.includes(s)).length;

/** Механики этажа: тема на всех уровнях, остальные — поровну, без пар из CLASH и без повторов на уровне */
function planFloor(theme: Mechanic, rng: Rng): Mechanic[][] {
  const pool = MECHANICS.filter((m) => m !== theme);
  const used = new Map<Mechanic, number>(pool.map((m) => [m, 0]));
  return Array.from({ length: FLOOR_SIZE }, (_, place) => {
    if (HARD_PLACES.includes(place)) return hardPlace(theme, place, used, rng);
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

/** Препятствия: всё, кроме заданий на ячейки 3 уровня */
const OBSTACLES: readonly Mechanic[] = MECHANICS.filter((m) => m !== 'cells' && m !== 'color');

/**
 * 5, 9 и 10 места этажа (по просьбе владельца): главное задание — ячейки 3 уровня одного или двух цветов
 * (`color`), рядом препятствия: на 5 и 9 — два вида, на 10 — три. Тема этажа — одно из них, если это препятствие.
 * Камни без цели — не единственное препятствие: иначе задание этажа было бы пустым
 */
function hardPlace(
  theme: Mechanic,
  place: number,
  used: Map<Mechanic, number>,
  rng: Rng,
): Mechanic[] {
  const level: Mechanic[] = OBSTACLES.includes(theme) ? [theme] : [];
  const need = place === FLOOR_SIZE - 1 ? 3 : 2;
  while (level.length < need) {
    const fits = OBSTACLES.filter(
      (m) => !level.includes(m) && !(m === 'stones' && level.every((x) => x === 'stones')),
    );
    const least = Math.min(...fits.map((m) => used.get(m) ?? 0));
    const choices = fits.filter((m) => (used.get(m) ?? 0) === least);
    const pick = choices[rng.int(choices.length)]!;
    level.push(pick);
    used.set(pick, (used.get(pick) ?? 0) + 1);
  }
  return [...level, 'color'];
}

function buildLevel(id: number, mechanics: Mechanic[], rng: Rng): Level {
  const place = (id - 1) % FLOOR_SIZE;
  const hard = HARD_PLACES.includes(place);
  // Трудным местам и уровням с углём и коронами — поля побольше
  const big = hard || mechanics.includes('coal');
  const crowns = mechanics.includes('crowns') ? (hard ? 2 : 1) : 0;
  // Короны — только на формах с коротким столбцом (pickCrownColumns), поэтому размер поля им не важен
  const shapes = SHAPES.filter(
    (s) =>
      cellCount(s) >= (big && crowns === 0 ? 70 : 55) &&
      (crowns === 0 || pickCrownColumns(s, crowns, hard, createRng(1)).length > 0),
  );
  let layout = [...shapes[rng.int(shapes.length)]!];
  const goals: Goal[] = [];
  let coalLayers: number | undefined;
  let hiddenGold: number | undefined;

  let crownColumns = new Set<number>();
  if (crowns > 0) {
    crownColumns = new Set(pickCrownColumns(layout, crowns, hard, rng));
    for (const col of crownColumns) setCell(layout, 0, col, 'o');
    goals.push({ kind: 'item', count: crownColumns.size });
  }
  if (mechanics.includes('coal')) {
    // С коронами или льдом — 2–3 глыбы, иначе 1–2
    // Уголь — единственная цель (рядом одни камни): одна глыба даже в 9 слоёв проходится за 25 ходов (17-1)
    const alone = mechanics.every((m) => m === 'coal' || m === 'stones');
    const withOthers = alone || mechanics.includes('crowns') || mechanics.includes('ice');
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
    // Лёд — две прочности: на лёгких местах тонкий (1 удар), на трудных — крепкий (целый → треснувший)
    layout = placeLayer(layout, hard ? 'J' : 'i', hard ? 10 : 14);
  }
  if (mechanics.includes('gold')) {
    // Золото — в угле и сундуках (во льду его больше нет). Есть уголь — золото в половине его глыб
    const coal = count(layout, 'c') / 4;
    if (coal > 0) layout = goldenCoal(layout, Math.ceil(coal / 2));
    else if (rng.int(2) === 0) {
      // Своя глыба с золотом: на лёгких местах одна, на трудных две
      if (placeCoal(layout, hard ? 2 : 1, crownColumns, rng, 'k') > 0) coalLayers = hard ? 6 : 4;
    } else if (!hard) layout = placeLayer(layout, 't', 3);
    else {
      // Спрятанное золото: в части простых сундуков, каждая попытка — в других
      layout = placeLayer(layout, 'b', count(layout, 'b') + 6);
      hiddenGold = 3;
    }
  }
  if (mechanics.includes('stones')) placeStones(layout, hard ? 4 : 3, rng);

  if (mechanics.includes('chests')) goals.push({ kind: 'box', count: count(layout, 'bt123uvw') });
  if (mechanics.includes('ice')) goals.push({ kind: 'ice', count: count(layout, 'iJ') });
  if (mechanics.includes('gold')) {
    goals.push({
      kind: 'gold',
      count: count(layout, 'tuvw') + count(layout, 'k') / 4 + (hiddenGold ?? 0),
    });
  }
  if (mechanics.includes('cells')) goals.push({ kind: 'level3', count: 6 });
  if (mechanics.includes('color')) {
    // На 5, 9 и 10 местах — цвета этажа (один или два на весь этаж), по 3 ячейки для начала: число подгоняет подбор
    const colors = hard ? floorColors(Math.ceil(id / FLOOR_SIZE)) : [rng.int(3)];
    for (const color of colors) goals.push({ kind: 'level3color', count: hard ? 3 : 4, color });
  }

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
  } as Level);
}

const fs = require('node:fs');
const fileOf = (floor: number, place: number) =>
  `src/levels/floor${String(floor).padStart(2, '0')}/${String(place + 1).padStart(2, '0')}.json`;

function write(floor: number, place: number, mechanics: Mechanic[], rng: Rng): void {
  const id = (floor - 1) * FLOOR_SIZE + place + 1;
  const level = buildLevel(id, mechanics, rng);
  fs.writeFileSync(
    fileOf(floor, place),
    `${JSON.stringify(level, null, 2)}
`,
  );
  console.log(
    `${floor}-${place + 1}: ${mechanics.join(' + ')} → ${level.goals.map((g) => `${g.kind} ${g.count}`).join(', ')}`,
  );
}

if (only) {
  for (const name of only) {
    const [floor, place] = name.split('-').map(Number) as [number, number];
    const title = (JSON.parse(fs.readFileSync(fileOf(floor, place - 1), 'utf8')) as Level).title;
    const mechanics = title.replace('Уровень ', '').split(' + ') as Mechanic[];
    write(floor, place - 1, mechanics, createRng(seed * 1000 + (floor - 1) * FLOOR_SIZE + place));
  }
} else {
  const rng = createRng(seed);
  for (let floor = first; floor <= last; floor++) {
    const theme = THEMES[(floor - 11) % THEMES.length]!;
    fs.mkdirSync(`src/levels/floor${String(floor).padStart(2, '0')}`, { recursive: true });
    planFloor(theme, rng).forEach((mechanics, place) => write(floor, place, mechanics, rng));
  }
}
