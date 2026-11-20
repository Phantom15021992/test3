import Phaser from 'phaser';
import {
  drawStar,
  HUE_MAPS,
  recolor,
  SPARKLE_COLORS,
  STAR_KEY,
  STAR_TINTS,
  type SparkleColor,
} from './sparkleGems';

// Кристаллы тестового уровня. Сейчас — третий набор художника: лист со всеми цветами (CRYSTAL_SHEET, ниже).
// Второй набор (public/assets/crystals/level1–3): 1 уровень — неогранённый
// камень, 2 — грубый кристалл, 3 — огранённый самоцвет. Нарисованы синими, красный и зелёный получаются
// той же перекраской, что у ромба (HUE_MAPS). По образцу художника: фишка занимает ~84% клетки, у 1 уровня
// сияния нет, у 2 — мягкий белый ореол, у 3 — ярче; поле — ровный синий фон с полупрозрачными плитками клеток.

/** Плитка клетки под фишкой */
export const CRYSTAL_CELL = 'crystal-cell';

/**
 * Третий набор художника: один лист 3×5 (gems-sheet.webp) — уровни по столбцам, цвета по строкам, на
 * прозрачном фоне, сияние уже нарисовано. Лист режется при загрузке уровня. false возвращает второй набор (синие
 * кристаллы с перекраской)
 */
export const CRYSTAL_SHEET = true;

type SheetColor = 'red' | 'blue' | 'green' | 'orange' | 'yellow' | 'cyan';

/**
 * Наборы кристаллов-листов: кампания — третий набор художника, тестовый уровень — четвёртый (на пробу).
 * rows — цвета строк листа сверху вниз (лишние строки ниже не берутся); byPalette — цвет палитры игры
 * (синий, жёлтый, красный, зелёный, фиолетовый, оранжевый, голубой) → строка листа: чего на листе нет,
 * то берётся похожим
 */
interface SheetSet {
  key: string;
  path: string;
  rows: readonly SheetColor[];
  byPalette: readonly SheetColor[];
  /** Сколько камней в ряду листа (по умолчанию 3) и какие столбцы идут на 1, 2 и 3 уровень */
  columns?: number;
  levelColumns?: readonly [number, number, number];
  /** Лист на белом фоне: фон вычитается при нарезке */
  whiteBackground?: boolean;
  /** У рисунка нет нарисованного сияния — дышать нечему */
  noGlow?: boolean;
  /**
   * Не лист, а отдельные картинки: `<files>/<цвет>-<уровень>.png` на прозрачном фоне; `cell.png` в той же папке —
   * плитка клетки поля
   */
  files?: string;
}

export type CrystalSet = 'campaign' | 'test';

/**
 * Отдельные иконки владельца (assets/crystals/set5): жеода, кристалл, самоцвет в 4 цветах (синий, жёлтый, красный,
 * зелёный) и лавандовая плитка клетки. Цветов палитры, которых нет (фиолетовый, оранжевый, голубой), в кампании
 * не бывает: на её полях 3–4 цвета
 */
const SET5: SheetSet = {
  key: 'crystal-set5',
  path: '',
  rows: ['yellow', 'blue', 'green', 'red'],
  byPalette: ['blue', 'yellow', 'red', 'green', 'blue', 'yellow', 'blue'],
  noGlow: true,
  files: 'assets/crystals/set5',
};

/**
 * Кампания и тестовый уровень — на иконках владельца (по его просьбе). Прежний набор кампании — лист третьего
 * набора художника: key 'crystal-sheet', path 'assets/crystals/gems-sheet.webp', rows red, blue, green, orange,
 * yellow; byPalette blue, yellow, red, green, blue, orange, blue
 */
const SHEETS: Record<CrystalSet, SheetSet> = { campaign: SET5, test: SET5 };

/** Какую часть клетки занимает плитка набора: между плитками узкий зазор */
export const TILE_CELL_SHARE = 0.96;

/** Лавандовая плитка клетки из набора: владелец вернул тёмную шахматку — true вернёт плитку */
const SET_TILES = false;

/** Ключ плитки клетки набора из отдельных картинок; у листов плитки нет, и когда плитка выключена — тоже */
export function crystalCellKey(set: CrystalSet): string | null {
  return SET_TILES && SHEETS[set].files ? `${SHEETS[set].key}-cell` : null;
}

/** Картинки, которые сцене нужно загрузить для набора */
export function crystalFiles(set: CrystalSet): readonly { key: string; path: string }[] {
  if (!CRYSTAL_SHEET) {
    return [
      { key: 'crystal-src-1', path: 'assets/crystals/level1.png' },
      { key: 'crystal-src-2', path: 'assets/crystals/level2.png' },
      { key: 'crystal-src-3', path: 'assets/crystals/level3.webp' },
      { key: CRYSTAL_CELL, path: 'assets/crystals/cell.png' },
    ];
  }
  const sheet = SHEETS[set];
  if (sheet.files) {
    return [
      ...sheet.rows.flatMap((color) =>
        [1, 2, 3].map((level) => ({
          key: `${sheet.key}-${color}-${level}`,
          path: `${sheet.files}/${color}-${level}.png`,
        })),
      ),
      { key: `${sheet.key}-cell`, path: `${sheet.files}/cell.png` },
    ];
  }
  return [
    { key: sheet.key, path: sheet.path },
    { key: CRYSTAL_CELL, path: 'assets/crystals/cell.png' },
  ];
}

const SHEET_STAR_TINTS: Record<SheetColor, number> = {
  red: 0xffd0b8,
  blue: 0xa8f4ff,
  green: 0xb8ffd0,
  orange: 0xffdcb0,
  yellow: 0xfff4b0,
  cyan: 0xb8fff6,
};
/** Нарисованное сияние «дышит»: поверх фишки проступает его копия — у 1 уровня сияния нет */
const SHEET_GLOWS: Record<1 | 2 | 3, number> = { 1: 0, 2: 0.45, 3: 0.975 };

/**
 * Синее поле с плитками клеток, как на образце художника. Владелец вернул тёмную шахматку, как у всей
 * игры, — синее поле выключено, но осталось в коде: true возвращает его
 */
export const CRYSTAL_BLUE_FIELD = false;

/** Фон поля и плитки клеток — как на образце */
export const CRYSTAL_FIELD_COLOR = 0x6686bd;
export const CRYSTAL_CELL_ALPHA = 0.6;
/** Плитка клетки чуть меньше клетки: между плитками узкий зазор, как на образце (~4%) */
export const CRYSTAL_CELL_SHARE = 0.96;
/** Какую часть клетки занимает фишка */
export const CRYSTAL_PIECE_SHARE = 0.84;

/** Ореол: размытие (доля размера фишки) и как ярко он сияет — у 1 уровня ореола нет */
const GLOW_BLUR = 0.05;
const GLOWS: Record<1 | 2 | 3, [number, number]> = {
  1: [0, 0],
  2: [0.35, 0.6],
  3: [0.6, 0.9],
};
/** Сколько блёсток мерцает вокруг фишки уровня */
const SPARKLES: Record<1 | 2 | 3, number> = { 1: 0, 2: 1, 3: 4 };
/**
 * Во сколько раз быстрее сияние и блёстки уровня. У 3 уровня (по просьбе владельца) блёстка вспыхивает в полтора раза
 * быстрее, а гаснет как прежде, паузы между вспышками в полтора раза короче; сияние 0,975 вместо 0,65
 */
const SHINE_SPEED: Record<1 | 2 | 3, number> = { 1: 1, 2: 1, 3: 1.5 };
/** Сила блёсток уровня: насколько она непрозрачна в пике и во сколько раз больше обычной */
const SPARKLE_POWER: Record<1 | 2 | 3, { alpha: number; scale: number }> = {
  1: { alpha: 0.75, scale: 1 },
  2: { alpha: 0.75, scale: 1 },
  3: { alpha: 1, scale: 1.25 },
};
/** Сколько длится вспышка блёстки и её угасание при обычной скорости */
const SPARKLE_MS = 650;

/**
 * Лучи за фишкой 3 уровня (по просьбе владельца): остроугольные, чуть размытые; пульсируют — то разгораются и растут, то гаснут — и медленно
 * поворачиваются. Цвет — как у блёсток этого цвета
 */
const RAYS_KEY = 'crystal-rays';
const RAYS = {
  /** Размер лучей — во сколько раз больше камня */
  size: 1.55,
  count: 8,
  /** Пульс: прозрачность и масштаб от … до */
  alpha: [0.25, 0.75] as const,
  scale: [0.85, 1.05] as const,
  /** Полный оборот за столько миллисекунд */
  turnMs: 48000,
  /** Пульс лучей — в полтора раза медленнее обычного сияния (владелец попросил движение лучей медленнее) */
  pulseMs: 3600,
  /** Размытие лучей в пикселях текстуры 256×256 (Safari без ctx.filter рисует их чёткими) */
  blur: 5,
};

/** Текстура лучей: узкие светлые клинья из центра, к концам тают; белые — цвет задаёт оттенок (tint) */
function drawRays(scene: Phaser.Scene): void {
  if (scene.textures.exists(RAYS_KEY)) return;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.filter = `blur(${RAYS.blur}px)`;
  const c = size / 2;
  const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(1, 'rgba(255,255,255,0.08)');
  ctx.fillStyle = gradient;
  for (let i = 0; i < RAYS.count; i++) {
    const angle = (i / RAYS.count) * Math.PI * 2;
    // Через один луч короче: так сияние не похоже на шестерёнку
    const length = c * (i % 2 === 0 ? 1 : 0.7);
    // Остроугольные (по просьбе владельца): луч шире у камня и сходится в острый кончик, который почти не тает
    const shoulder = length * 0.3;
    const width = 0.2;
    const at = (r: number, a: number) => [c + Math.cos(a) * r, c + Math.sin(a) * r] as const;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(...at(shoulder, angle - width));
    ctx.lineTo(...at(length, angle));
    ctx.lineTo(...at(shoulder, angle + width));
    ctx.closePath();
    ctx.fill();
  }
  scene.textures.addCanvas(RAYS_KEY, canvas);
}
const PULSE_MS = 2400;

interface Layer {
  originX: number;
  originY: number;
  /** Больший размер непрозрачной части — по нему фишка вписывается в клетку */
  bodySize: number;
}
const layers = new Map<string, Layer>();
/** Ключи текстур; у листов — с набором, у второго набора (перекраска) — без него */
const bodyKey = (level: number, color: string, set = '') => `crystal-${set}${color}-${level}`;
const glowKey = (level: number, color: string, set = '') => `crystal-glow-${set}${color}-${level}`;
const setPrefix = (set: CrystalSet) => (CRYSTAL_SHEET ? `${set}-` : '');

/** Готовит фишки из картинок: режет лист или перекрашивает второй набор; картинки должны быть уже загружены */
export function createCrystalTextures(scene: Phaser.Scene, set: CrystalSet = 'campaign'): void {
  if (CRYSTAL_SHEET) {
    const sheet = SHEETS[set];
    if (scene.textures.exists(bodyKey(3, sheet.rows[0]!, setPrefix(set)))) return;
    if (sheet.files) loadFiles(scene, sheet, setPrefix(set));
    else cutSheet(scene, sheet, setPrefix(set));
    drawStar(scene);
    drawRays(scene);
    return;
  }
  if (layers.size > 0 && scene.textures.exists(bodyKey(3, 'red'))) return;
  for (const level of [1, 2, 3] as const) {
    const source = scene.textures.get(`crystal-src-${level}`).getSourceImage() as HTMLImageElement;
    const base = document.createElement('canvas');
    base.width = source.width;
    base.height = source.height;
    base.getContext('2d')!.drawImage(source, 0, 0);
    const box = opaqueBox(base);
    // Новый рисунок голубее прежнего листа (~200° против 233°): перекраска сдвигается на разницу,
    // иначе красный выходит розовым, а зелёный — жёлтым
    const shift = BLUE_HUE - medianHue(base);
    for (const color of SPARKLE_COLORS) {
      const map = HUE_MAPS[color];
      const body = tone(recolor(base, map && ((hue) => map(hue + shift))), TONES[color]);
      const key = bodyKey(level, color);
      if (scene.textures.exists(key)) scene.textures.remove(key);
      scene.textures.addCanvas(key, body);
      const layer = {
        originX: (box.x + box.w / 2) / base.width,
        originY: (box.y + box.h / 2) / base.height,
        bodySize: Math.max(box.w, box.h),
      };
      layers.set(key, layer);
      if (GLOWS[level][1] > 0) {
        const glow = glowCanvas(body, layer.bodySize * GLOW_BLUR);
        const gKey = glowKey(level, color);
        if (scene.textures.exists(gKey)) scene.textures.remove(gKey);
        scene.textures.addCanvas(gKey, glow);
      }
    }
  }
  drawStar(scene);
  drawRays(scene);
}

function addTexture(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
}

/**
 * Режет лист третьего набора на фишки. Фон листа уже прозрачный, сияние нарисовано полупрозрачным —
 * фишки берутся как есть, ищутся по пустым полосам между ними
 */
function cutSheet(scene: Phaser.Scene, set: SheetSet, prefix: string): void {
  const source = scene.textures.get(set.key).getSourceImage() as HTMLImageElement;
  const sheet = document.createElement('canvas');
  sheet.width = source.width;
  sheet.height = source.height;
  const sctx = sheet.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(source, 0, 0);
  if (set.whiteBackground) clearWhite(sctx, sheet.width, sheet.height);
  const pixels = sctx.getImageData(0, 0, sheet.width, sheet.height).data;
  const columns = set.columns ?? 3;
  const levelColumns = set.levelColumns ?? [0, 1, 2];
  // Ряды и столбцы листа неровные: фишки ищутся по прозрачным просветам между ними
  const rows = inkSpans(sheet.height, (y) =>
    countInk(pixels, sheet.width, 0, sheet.width, y, 'row'),
  );
  if (rows.length < set.rows.length) throw new Error(`На листе ${rows.length} рядов фишек`);
  set.rows.forEach((color, row) => {
    const [top, bottom] = rows[row]!;
    // Сияния соседних фишек в ряду бывают сомкнуты: столбцы делятся по самому пустому месту у доли ширины
    const ink = (x: number) => countInk(pixels, sheet.width, top, bottom, x, 'col');
    const cut = (around: number) => {
      let best = around;
      for (let x = around - SHEET_SEARCH; x <= around + SHEET_SEARCH; x++)
        if (ink(x) < ink(best)) best = x;
      return best;
    };
    const bounds = [
      0,
      ...Array.from({ length: columns - 1 }, (_, i) =>
        cut(Math.round((sheet.width * (i + 1)) / columns)),
      ),
      sheet.width,
    ];
    const cols = levelColumns.map((i): [number, number] => {
      const spans = inkSpans(bounds[i + 1]! - bounds[i]!, (x) => ink(bounds[i]! + x));
      const first = spans[0];
      const last = spans[spans.length - 1];
      if (!first || !last) throw new Error(`В ряду ${row + 1} листа нет фишки ${i + 1}`);
      return [bounds[i]! + first[0], bounds[i]! + last[1]];
    });
    for (const level of [1, 2, 3] as const) {
      const [left, right] = cols[level - 1]!;
      const sx = Math.max(0, left - SHEET_MARGIN);
      const sy = Math.max(0, top - SHEET_MARGIN);
      const cellW = Math.min(sheet.width, right + SHEET_MARGIN) - sx;
      const cellH = Math.min(sheet.height, bottom + SHEET_MARGIN) - sy;
      const canvas = document.createElement('canvas');
      canvas.width = cellW;
      canvas.height = cellH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(sheet, sx, sy, cellW, cellH, 0, 0, cellW, cellH);
      // Размер и центр фишки — по плотной части (без сияния), иначе фишки с сиянием были бы мельче
      const box = opaqueBox(canvas, 250);
      const key = bodyKey(level, color, prefix);
      addTexture(scene, key, canvas);
      layers.set(key, {
        originX: (box.x + box.w / 2) / cellW,
        originY: (box.y + box.h / 2) / cellH,
        bodySize: Math.max(box.w, box.h),
      });
      if (SHEET_GLOWS[level] > 0 && !set.noGlow) {
        addTexture(scene, glowKey(level, color, prefix), glowOnly(canvas));
      }
    }
  });
}

/** Фишки из отдельных картинок: прозрачный фон уже есть, остаётся найти сам камень для размера и центра */
function loadFiles(scene: Phaser.Scene, set: SheetSet, prefix: string): void {
  for (const color of set.rows) {
    for (const level of [1, 2, 3] as const) {
      const source = scene.textures
        .get(`${set.key}-${color}-${level}`)
        .getSourceImage() as HTMLImageElement;
      const canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height;
      canvas.getContext('2d', { willReadFrequently: true })!.drawImage(source, 0, 0);
      const box = opaqueBox(canvas, 128);
      const key = bodyKey(level, color, prefix);
      addTexture(scene, key, canvas);
      layers.set(key, {
        originX: (box.x + box.w / 2) / canvas.width,
        originY: (box.y + box.h / 2) / canvas.height,
        bodySize: Math.max(box.w, box.h),
      });
    }
  }
}

/** Светлее этого (по самому тёмному каналу) — кандидат в белый фон листа */
const WHITE_LIGHT = 150;

/**
 * Белый фон листа становится прозрачным: светлые пиксели, связанные с краем листа, вычитаются из белого —
 * края камней и тень остаются полупрозрачными, а белые блики внутри камней (их обводит контур) не задеты
 */
function clearWhite(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const image = ctx.getImageData(0, 0, width, height);
  const d = image.data;
  const background = new Uint8Array(width * height);
  const light = (p: number) =>
    d[p * 4 + 3]! < 40 || Math.min(d[p * 4]!, d[p * 4 + 1]!, d[p * 4 + 2]!) > WHITE_LIGHT;
  const stack: number[] = [];
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
  while (stack.length > 0) {
    const p = stack.pop()!;
    if (background[p] || !light(p)) continue;
    background[p] = 1;
    const x = p % width;
    if (x > 0) stack.push(p - 1);
    if (x < width - 1) stack.push(p + 1);
    if (p >= width) stack.push(p - width);
    if (p < width * (height - 1)) stack.push(p + width);
  }
  for (let p = 0; p < width * height; p++) {
    if (!background[p]) continue;
    const i = p * 4;
    const darkest = Math.min(d[i]!, d[i + 1]!, d[i + 2]!);
    const alpha = ((255 - darkest) / 255) * (d[i + 3]! / 255);
    for (let k = 0; k < 3; k++)
      d[i + k] = alpha > 0.02 ? Math.max(0, 255 - (255 - d[i + k]!) / alpha) : 0;
    d[i + 3] = Math.round(alpha * 255);
  }
  ctx.putImageData(image, 0, 0);
}

/** Пиксель листа «закрашен», если он заметно непрозрачен */
const INK_ALPHA = 12;
/** Запас вокруг найденной фишки, чтобы не срезать край сияния */
const SHEET_MARGIN = 4;
/** Насколько далеко от трети ширины искать просвет между фишками ряда */
const SHEET_SEARCH = 90;

function countInk(
  d: Uint8ClampedArray,
  width: number,
  from: number,
  to: number,
  at: number,
  dir: 'row' | 'col',
): number {
  let count = 0;
  for (let k = from; k < to; k++) {
    const i = dir === 'row' ? (at * width + k) * 4 : (k * width + at) * 4;
    if (d[i + 3]! > INK_ALPHA) count++;
  }
  return count;
}

/** Участки, где есть рисунок, разделённые пустыми полосами (короткие — шум сжатия — отбрасываются) */
function inkSpans(length: number, ink: (at: number) => number): [number, number][] {
  const spans: [number, number][] = [];
  let start = -1;
  for (let at = 0; at <= length; at++) {
    const has = at < length && ink(at) > 2;
    if (has && start < 0) start = at;
    if (!has && start >= 0) {
      if (at - start > 20) spans.push([start, at]);
      start = -1;
    }
  }
  return spans;
}

/** Одно сияние: полупрозрачная часть картинки, без плотной фишки */
function glowOnly(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  const ctx = copy.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0);
  const image = ctx.getImageData(0, 0, copy.width, copy.height);
  const d = image.data;
  for (let i = 3; i < d.length; i += 4) if (d[i]! >= 240) d[i] = 0;
  ctx.putImageData(image, 0, 0);
  return copy;
}

/**
 * Яркость и насыщенность фишек по цветам (доли от рисунка) — по просьбе владельца: сначала синие на 30% темнее,
 * зелёные и красные на 50% темнее и на 20% бледнее, потом яркость поднята; в итоге все цвета — с яркостью и
 * насыщенностью рисунка, как синие, а зелёный затемнён до прежнего зелёного кружка (#00A443), иначе уходит в салатовый
 */
const TONES: Record<SparkleColor, { value: number; saturation: number }> = {
  blue: { value: 1, saturation: 1 },
  green: { value: 0.7, saturation: 1.2 },
  red: { value: 1, saturation: 1 },
};

/** Меняет яркость (V) и насыщенность (S) каждого пикселя; прозрачность не трогает */
function tone(
  canvas: HTMLCanvasElement,
  { value, saturation }: { value: number; saturation: number },
) {
  // Всегда на копии: для синего перекраска отдаёт сам исходник, а он нужен и другим цветам
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  const ctx = copy.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0);
  const image = ctx.getImageData(0, 0, copy.width, copy.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const max = Math.max(d[i]!, d[i + 1]!, d[i + 2]!);
    // В HSV: насыщенность — расстояние до серого той же яркости, яркость — множитель всего пикселя
    for (let k = 0; k < 3; k++) {
      const channel = d[i + k]!;
      d[i + k] = (max - (max - channel) * saturation) * value;
    }
  }
  ctx.putImageData(image, 0, 0);
  return copy;
}

/** Оттенок синего тела на прежнем листе: от него считаются HUE_MAPS */
const BLUE_HUE = 233;

/** Средний оттенок насыщенных пикселей рисунка (градусы) */
function medianHue(canvas: HTMLCanvasElement): number {
  const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  const hues: number[] = [];
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3]! < 200) continue;
    const r = data[i]! / 255;
    const g = data[i + 1]! / 255;
    const b = data[i + 2]! / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 0.25) continue;
    const d = max - min;
    hues.push(
      max === r
        ? ((g - b) / d + (g < b ? 6 : 0)) * 60
        : max === g
          ? ((b - r) / d + 2) * 60
          : ((r - g) / d + 4) * 60,
    );
  }
  hues.sort((a, b) => a - b);
  return hues[hues.length >> 1] ?? BLUE_HUE;
}

/** Непрозрачная часть картинки: у файлов разные поля, а вписывать в клетку нужно сам камень */
function opaqueBox(canvas: HTMLCanvasElement, threshold = 128) {
  const { width, height } = canvas;
  const data = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! < threshold) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return { x: minX, y: minY, w: Math.max(maxX - minX, 1), h: Math.max(maxY - minY, 1) };
}

/** Ореол: силуэт фишки, залитый белым и размытый, — того же размера, что картинка фишки */
function glowCanvas(body: HTMLCanvasElement, blur: number): HTMLCanvasElement {
  const silhouette = document.createElement('canvas');
  silhouette.width = body.width;
  silhouette.height = body.height;
  const s = silhouette.getContext('2d')!;
  s.drawImage(body, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = '#ffffff';
  s.fillRect(0, 0, body.width, body.height);
  const glow = document.createElement('canvas');
  glow.width = body.width;
  glow.height = body.height;
  const g = glow.getContext('2d')!;
  g.filter = `blur(${Math.round(blur)}px)`;
  g.drawImage(silhouette, 0, 0);
  g.drawImage(silhouette, 0, 0);
  return glow;
}

/**
 * Фишка-кристалл: size — размер камня на экране, color — индекс цвета (синий, зелёный, красный).
 * Анимация спокойная, как у прежних фишек: ореол дышит, блёстки вспыхивают в новых местах, у каждой фишки
 * своя фаза. Контейнер сам останавливает свои твины и таймеры, когда его уничтожают
 */
export function addCrystal(
  scene: Phaser.Scene,
  level: 1 | 2 | 3,
  colorIndex: number,
  x: number,
  y: number,
  size: number,
  set: CrystalSet = 'campaign',
): Phaser.GameObjects.Container {
  const color = CRYSTAL_SHEET
    ? (SHEETS[set].byPalette[colorIndex] ?? 'blue')
    : (SPARKLE_COLORS[colorIndex] ?? SPARKLE_COLORS[0]);
  const prefix = setPrefix(set);
  const tint = CRYSTAL_SHEET
    ? SHEET_STAR_TINTS[color as SheetColor]
    : STAR_TINTS[color as SparkleColor];
  const layer = layers.get(bodyKey(level, color, prefix))!;
  const scale = size / layer.bodySize;
  const container = scene.add.container(x, y);
  const phase = Math.random() * PULSE_MS;
  const [glowFrom, glowTo] = GLOWS[level];
  const body = scene.add
    .image(0, 0, bodyKey(level, color, prefix))
    .setOrigin(layer.originX, layer.originY)
    .setScale(scale);
  container.add(body);
  if (level === 3) {
    const rays = scene.add
      .image(0, 0, RAYS_KEY)
      .setTint(tint)
      .setAlpha(RAYS.alpha[0])
      .setScale(((size * RAYS.size) / 256) * RAYS.scale[0])
      .setBlendMode(Phaser.BlendModes.ADD);
    container.addAt(rays, 0);
    const base = (size * RAYS.size) / 256;
    scene.tweens.add({
      targets: rays,
      alpha: RAYS.alpha[1],
      scale: base * RAYS.scale[1],
      duration: RAYS.pulseMs,
      delay: phase,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    scene.tweens.add({ targets: rays, angle: 360, duration: RAYS.turnMs, repeat: -1 });
  }
  if (CRYSTAL_SHEET && SHEET_GLOWS[level] > 0 && !SHEETS[set].noGlow) {
    // Нарисованное сияние дышит: поверх фишки то проступает, то гаснет его копия
    const glow = scene.add
      .image(0, 0, glowKey(level, color, prefix))
      .setOrigin(layer.originX, layer.originY)
      .setScale(scale)
      .setAlpha(0);
    container.add(glow);
    scene.tweens.add({
      targets: glow,
      alpha: SHEET_GLOWS[level],
      duration: PULSE_MS / SHINE_SPEED[level],
      delay: phase,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  } else if (!CRYSTAL_SHEET && glowTo > 0) {
    const glow = scene.add
      .image(0, 0, glowKey(level, color, prefix))
      .setOrigin(layer.originX, layer.originY)
      .setScale(scale * 1.08)
      .setAlpha(glowFrom);
    container.addAt(glow, 0);
    scene.tweens.add({
      targets: glow,
      alpha: glowTo,
      scale: scale * 1.12,
      duration: PULSE_MS,
      delay: phase,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
  // Камень 1 уровня не сияет — только чуть покачивается; кристаллы еле заметно «дышат»
  scene.tweens.add({
    targets: body,
    ...(level === 1 ? { y: -size * 0.015, angle: 1 } : { scale: scale * 1.015 }),
    duration: PULSE_MS * (level === 1 ? 1.3 : 1),
    delay: phase,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  const timers = new Set<Phaser.Time.TimerEvent>();
  const later = (delay: number, fn: () => void) => {
    const timer = scene.time.delayedCall(delay, () => {
      timers.delete(timer);
      fn();
    });
    timers.add(timer);
  };
  for (let i = 0; i < SPARKLES[level]; i++) {
    const star = scene.add.image(0, 0, STAR_KEY).setScale(0).setAlpha(0).setTint(tint);
    container.add(star);
    const twinkle = () => {
      if (!star.active) return;
      const angle = Math.random() * Math.PI * 2;
      const radius = size * (0.25 + Math.random() * 0.2);
      star.setPosition(Math.cos(angle) * radius, Math.sin(angle) * radius);
      const power = SPARKLE_POWER[level];
      // Вспыхивает быстрее (SHINE_SPEED), гаснет с обычной скоростью
      scene.tweens.add({
        targets: star,
        scale: (size / 64) * (0.16 + Math.random() * 0.12) * power.scale,
        alpha: power.alpha,
        angle: { from: 0, to: 45 / 2 },
        duration: SPARKLE_MS / SHINE_SPEED[level],
        ease: 'Sine.easeOut',
        onComplete: () => {
          if (!star.active) return;
          scene.tweens.add({
            targets: star,
            scale: 0,
            alpha: 0,
            angle: 45,
            duration: SPARKLE_MS,
            ease: 'Sine.easeIn',
            onComplete: () => later((1000 + Math.random() * 2000) / SHINE_SPEED[level], twinkle),
          });
        },
      });
    };
    later((i * 500 + Math.random() * 1500) / SHINE_SPEED[level], twinkle);
  }
  container.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.tweens.killTweensOf(container.list);
    timers.forEach((timer) => timer.remove());
  });
  return container;
}
