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

// Кристаллы тестового уровня — второй набор художника (public/assets/crystals): 1 уровень — неогранённый
// камень, 2 — грубый кристалл, 3 — огранённый самоцвет. Нарисованы синими, красный и зелёный получаются
// той же перекраской, что у ромба (HUE_MAPS). По образцу художника: фишка занимает ~84% клетки, у 1 уровня
// сияния нет, у 2 — мягкий белый ореол, у 3 — ярче; поле — ровный синий фон с полупрозрачными плитками клеток.

/** Плитка клетки под фишкой */
export const CRYSTAL_CELL = 'crystal-cell';

export const CRYSTAL_FILES: readonly { key: string; path: string }[] = [
  { key: 'crystal-src-1', path: 'assets/crystals/level1.png' },
  { key: 'crystal-src-2', path: 'assets/crystals/level2.png' },
  { key: 'crystal-src-3', path: 'assets/crystals/level3.webp' },
  { key: CRYSTAL_CELL, path: 'assets/crystals/cell.png' },
];

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
const SPARKLES: Record<1 | 2 | 3, number> = { 1: 0, 2: 1, 3: 2 };
const PULSE_MS = 2400;

interface Layer {
  originX: number;
  originY: number;
  /** Больший размер непрозрачной части — по нему фишка вписывается в клетку */
  bodySize: number;
}
const layers = new Map<string, Layer>();
const bodyKey = (level: number, color: SparkleColor) => `crystal-${color}-${level}`;
const glowKey = (level: number, color: SparkleColor) => `crystal-glow-${color}-${level}`;

/** Перекрашивает фишки в три цвета и готовит ореолы; картинки должны быть уже загружены */
export function createCrystalTextures(scene: Phaser.Scene): void {
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
function opaqueBox(canvas: HTMLCanvasElement) {
  const { width, height } = canvas;
  const data = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! < 128) continue;
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
): Phaser.GameObjects.Container {
  const color = SPARKLE_COLORS[colorIndex] ?? SPARKLE_COLORS[0];
  const layer = layers.get(bodyKey(level, color))!;
  const scale = size / layer.bodySize;
  const container = scene.add.container(x, y);
  const phase = Math.random() * PULSE_MS;
  const [glowFrom, glowTo] = GLOWS[level];
  if (glowTo > 0) {
    const glow = scene.add
      .image(0, 0, glowKey(level, color))
      .setOrigin(layer.originX, layer.originY)
      .setScale(scale * 1.08)
      .setAlpha(glowFrom);
    container.add(glow);
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
  const body = scene.add
    .image(0, 0, bodyKey(level, color))
    .setOrigin(layer.originX, layer.originY)
    .setScale(scale);
  container.add(body);
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
    const star = scene.add.image(0, 0, STAR_KEY).setScale(0).setAlpha(0).setTint(STAR_TINTS[color]);
    container.add(star);
    const twinkle = () => {
      if (!star.active) return;
      const angle = Math.random() * Math.PI * 2;
      const radius = size * (0.25 + Math.random() * 0.2);
      star.setPosition(Math.cos(angle) * radius, Math.sin(angle) * radius);
      scene.tweens.add({
        targets: star,
        scale: (size / 64) * (0.16 + Math.random() * 0.12),
        alpha: 0.75,
        angle: { from: 0, to: 45 },
        duration: 650,
        yoyo: true,
        ease: 'Sine.easeInOut',
        onComplete: () => later(1000 + Math.random() * 2000, twinkle),
      });
    };
    later(i * 500 + Math.random() * 1500, twinkle);
  }
  container.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.tweens.killTweensOf(container.list);
    timers.forEach((timer) => timer.remove());
  });
  return container;
}
