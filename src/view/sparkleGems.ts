import Phaser from 'phaser';

// Анимированные объекты с листа художника (public/assets/sparkle/sheet.webp): сияющий кристалл
// с блёстками, круг — сияет слабее, и камень. Лист один, слои вырезаются при запуске: тело —
// всё внутри тёмного контура, ореол и лучи — всё снаружи. Так ореол и лучи живут своей анимацией,
// а тело остаётся чётким. Блёстки рисуются в коде, чтобы мерцали в разных местах, а не на одном.

export const SPARKLE_SHEET = 'sparkle-sheet';
export const SPARKLE_SHEET_PATH = 'assets/sparkle/sheet.webp';

export type SparkleKind = 'crystal' | 'circle' | 'stone';

/** Область листа с одним рисунком (x, y, ширина, высота) */
type Region = readonly [number, number, number, number];

/** Верхний ряд листа — тела с ореолом; лучи — у нижнего кристалла; камень — посередине */
const REGIONS: Record<'crystal' | 'circle' | 'stone' | 'rays', Region> = {
  crystal: [250, 130, 560, 480],
  circle: [1050, 100, 560, 540],
  stone: [650, 560, 550, 480],
  rays: [300, 1020, 520, 520],
};

/**
 * Блёстки, нарисованные прямо на гранях (центр и полуразмах лучей по x и y, в координатах листа):
 * они не мерцают и спорят с анимированными, поэтому закрашиваются цветом грани вокруг
 */
const PAINTED_STARS: Partial<
  Record<keyof typeof REGIONS, readonly (readonly [number, number, number, number])[]>
> = {
  crystal: [[482, 314, 36, 46]],
  circle: [[1302, 288, 30, 46]],
};
/** Запас вокруг блёстки: у неё тёмная кайма */
const STAR_MARGIN = 6;
/** Сколько раз сглаживать закраску: цвет должен дотечь от краёв до середины звезды */
const STAR_ERASE_PASSES = 400;

/** Тёмный контур рисунка: по нему тело отделяется от ореола */
const OUTLINE_BRIGHTNESS = 330;
const OUTLINE_ALPHA = 150;
/** Контур нарисован от руки — расширяем его, чтобы заливка снаружи не протекала в щели */
const OUTLINE_GROW = 3;

const STAR_KEY = 'sparkle-star';
const STAR_COLOR = 0xa8f4ff;

interface Layer {
  key: string;
  /** Центр тела в текстуре слоя (доли) — точка привязки всех слоёв одного объекта */
  originX: number;
  originY: number;
  /** Ширина тела в пикселях листа — по ней задаётся размер на экране */
  bodyWidth: number;
}

const layers = new Map<string, Layer>();

/** Режет лист на слои один раз за запуск; лист должен быть уже загружен */
export function createSparkleTextures(scene: Phaser.Scene): void {
  if (layers.size > 0 && scene.textures.exists(STAR_KEY)) return;
  const sheet = scene.textures.get(SPARKLE_SHEET).getSourceImage() as HTMLImageElement;
  for (const name of ['crystal', 'circle', 'stone', 'rays'] as const) {
    const cut = cutRegion(sheet, REGIONS[name], PAINTED_STARS[name] ?? []);
    const add = (part: 'body' | 'halo', canvas: HTMLCanvasElement) => {
      const key = `sparkle-${name}-${part}`;
      if (scene.textures.exists(key)) scene.textures.remove(key);
      scene.textures.addCanvas(key, canvas);
      layers.set(key, { key, ...cut.anchor });
    };
    add('body', cut.body);
    add('halo', cut.halo);
  }
  drawStar(scene);
}

/** Слои области: тело внутри контура и всё, что снаружи (ореол, лучи, блёстки художника) */
function cutRegion(
  sheet: HTMLImageElement,
  [rx, ry, rw, rh]: Region,
  stars: readonly (readonly [number, number, number, number])[],
) {
  const canvas = document.createElement('canvas');
  canvas.width = rw;
  canvas.height = rh;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(sheet, rx, ry, rw, rh, 0, 0, rw, rh);
  const image = ctx.getImageData(0, 0, rw, rh);
  const d = image.data;
  const n = rw * rh;
  for (const [sx, sy, ax, ay] of stars) eraseStar(d, rw, rh, sx - rx, sy - ry, ax, ay);

  const dark = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (
      d[i * 4 + 3]! > OUTLINE_ALPHA &&
      d[i * 4]! + d[i * 4 + 1]! + d[i * 4 + 2]! < OUTLINE_BRIGHTNESS
    ) {
      dark[i] = 1;
    }
  }
  const wall = new Uint8Array(n);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      if (!dark[y * rw + x]) continue;
      for (let dy = -OUTLINE_GROW; dy <= OUTLINE_GROW; dy++) {
        for (let dx = -OUTLINE_GROW; dx <= OUTLINE_GROW; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < rh && nx >= 0 && nx < rw) wall[ny * rw + nx] = 1;
        }
      }
    }
  }
  // Снаружи — всё, куда можно дойти от края области, не пересекая контур
  const outside = new Uint8Array(n);
  const stack: number[] = [];
  for (let x = 0; x < rw; x++) stack.push(x, (rh - 1) * rw + x);
  for (let y = 0; y < rh; y++) stack.push(y * rw, y * rw + rw - 1);
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (outside[i] || wall[i]) continue;
    outside[i] = 1;
    const x = i % rw;
    if (x > 0) stack.push(i - 1);
    if (x < rw - 1) stack.push(i + 1);
    if (i >= rw) stack.push(i - rw);
    if (i < n - rw) stack.push(i + rw);
  }

  const body = new ImageData(rw, rh);
  const halo = new ImageData(rw, rh);
  let minX = rw;
  let maxX = 0;
  let minY = rh;
  let maxY = 0;
  for (let i = 0; i < n; i++) {
    const inBody = !outside[i] && d[i * 4 + 3]! > 0;
    const target = inBody ? body : halo;
    for (let j = 0; j < 4; j++) target.data[i * 4 + j] = d[i * 4 + j]!;
    if (inBody && d[i * 4 + 3]! > OUTLINE_ALPHA) {
      const x = i % rw;
      const y = (i / rw) | 0;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const toCanvas = (data: ImageData) => {
    const c = document.createElement('canvas');
    c.width = rw;
    c.height = rh;
    c.getContext('2d')!.putImageData(data, 0, 0);
    return c;
  };
  return {
    body: toCanvas(body),
    halo: toCanvas(halo),
    anchor: {
      originX: (minX + maxX) / 2 / rw,
      originY: (minY + maxY) / 2 / rh,
      bodyWidth: Math.max(maxX - minX, 1),
    },
  };
}

/**
 * Закрашивает четырёхлучевую звезду с центром (cx, cy) цветом грани вокруг: точки звезды многократно
 * усредняются с соседями, а точки за её краем не меняются — цвет плавно затекает внутрь с краёв
 * (уравнение Лапласа), без следов от лучей
 */
function eraseStar(
  d: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  ax: number,
  ay: number,
): void {
  // Ромб по размаху лучей: кончики лучей и кайма звезды должны попасть внутрь, иначе подкрасят закраску
  const rx = ax + STAR_MARGIN;
  const ry = ay + STAR_MARGIN;
  const cells: number[] = [];
  for (let y = Math.max(1, Math.floor(cy - ry)); y <= Math.min(h - 2, cy + ry); y++) {
    for (let x = Math.max(1, Math.floor(cx - rx)); x <= Math.min(w - 2, cx + rx); x++) {
      if (Math.abs((x - cx) / rx) + Math.abs((y - cy) / ry) <= 1) cells.push(y * w + x);
    }
  }
  for (let pass = 0; pass < STAR_ERASE_PASSES; pass++) {
    for (const i of cells) {
      for (let c = 0; c < 4; c++) {
        const k = i * 4 + c;
        d[k] = (d[k - 4]! + d[k + 4]! + d[k - w * 4]! + d[k + w * 4]!) / 4;
      }
    }
  }
}

/** Блёстка — четырёхлучевая звёздочка, как на рисунке */
function drawStar(scene: Phaser.Scene): void {
  if (scene.textures.exists(STAR_KEY)) return;
  const size = 64;
  const c = size / 2;
  const g = scene.make.graphics({}, false);
  const ray = (long: number, thin: number) => [
    new Phaser.Math.Vector2(c, c - long),
    new Phaser.Math.Vector2(c + thin, c - thin),
    new Phaser.Math.Vector2(c + long, c),
    new Phaser.Math.Vector2(c + thin, c + thin),
    new Phaser.Math.Vector2(c, c + long),
    new Phaser.Math.Vector2(c - thin, c + thin),
    new Phaser.Math.Vector2(c - long, c),
    new Phaser.Math.Vector2(c - thin, c - thin),
  ];
  g.fillStyle(STAR_COLOR, 0.35);
  g.fillCircle(c, c, 9);
  g.fillStyle(STAR_COLOR, 1);
  g.fillPoints(ray(c, 5), true);
  g.fillStyle(0xffffff, 1);
  g.fillPoints(ray(c * 0.55, 2.5), true);
  g.generateTexture(STAR_KEY, size, size);
  g.destroy();
}

/** Темп спокойной анимации: один вдох-выдох ореола и тела, оборот лучей */
const PULSE_MS = 2400;
const RAYS_TURN_MS = 32000;
/** Блёстка: вспышка и пауза до следующей */
const TWINKLE_MS = 650;
const TWINKLE_PAUSE_MS = 1000;

/** Как сияет объект: сила ореола, лучи и сколько блёсток мерцает разом */
const LOOKS: Record<
  SparkleKind,
  { glow: [number, number]; rays: boolean; sparkles: number; breathe: number }
> = {
  crystal: { glow: [0.3, 0.55], rays: true, sparkles: 3, breathe: 0.015 },
  circle: { glow: [0.12, 0.3], rays: false, sparkles: 1, breathe: 0.01 },
  stone: { glow: [0, 0], rays: false, sparkles: 0, breathe: 0 },
};

/**
 * Анимированный объект: size — ширина тела на экране. Контейнер сам останавливает свои
 * твины и таймеры, когда его уничтожают
 */
export function addSparkleObject(
  scene: Phaser.Scene,
  kind: SparkleKind,
  x: number,
  y: number,
  size: number,
): Phaser.GameObjects.Container {
  const look = LOOKS[kind];
  const container = scene.add.container(x, y);
  const image = (key: string, scale = 1) => {
    const layer = layers.get(key)!;
    const img = scene.add
      .image(0, 0, key)
      .setOrigin(layer.originX, layer.originY)
      .setScale((size / layer.bodyWidth) * scale);
    container.add(img);
    return img;
  };
  const tweens: Phaser.Tweens.Tween[] = [];
  // Таймер вспышки у каждой блёстки один: следующий заводится, когда сработал прошлый
  const timers = new Set<Phaser.Time.TimerEvent>();
  const later = (delay: number, callback: () => void) => {
    const timer = scene.time.delayedCall(delay, () => {
      timers.delete(timer);
      callback();
    });
    timers.add(timer);
  };

  if (look.rays) {
    const rays = image('sparkle-rays-halo');
    rays.setAlpha(0.25);
    tweens.push(
      scene.tweens.add({ targets: rays, angle: 360, duration: RAYS_TURN_MS, repeat: -1 }),
      scene.tweens.add({
        targets: rays,
        alpha: 0.45,
        duration: PULSE_MS,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      }),
    );
  }
  if (look.glow[1] > 0) {
    const glow = image(`sparkle-${kind}-halo`);
    const scale = glow.scale;
    glow.setAlpha(look.glow[0]);
    tweens.push(
      scene.tweens.add({
        targets: glow,
        alpha: look.glow[1],
        scale: scale * 1.04,
        duration: PULSE_MS,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      }),
    );
  }

  const body = image(`sparkle-${kind}-body`);
  const bodyScale = body.scale;
  if (look.breathe > 0) {
    tweens.push(
      scene.tweens.add({
        targets: body,
        scale: bodyScale * (1 + look.breathe),
        duration: PULSE_MS,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      }),
    );
  } else {
    // Камень не сияет: только чуть покачивается, чтобы было видно, что он живой объект поля
    tweens.push(
      scene.tweens.add({
        targets: body,
        y: -size * 0.015,
        angle: 1,
        duration: PULSE_MS * 1.3,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      }),
    );
  }

  for (let i = 0; i < look.sparkles; i++) {
    const star = scene.add.image(0, 0, STAR_KEY).setScale(0).setAlpha(0);
    container.add(star);
    const twinkle = () => {
      if (!star.active) return;
      // Блёстка вспыхивает на краю тела или чуть снаружи, каждый раз в новом месте
      const angle = Math.random() * Math.PI * 2;
      const radius = size * (0.35 + Math.random() * 0.3);
      star.setPosition(Math.cos(angle) * radius, Math.sin(angle) * radius);
      const peak = (size / 64) * (0.16 + Math.random() * 0.12);
      scene.tweens.add({
        targets: star,
        scale: peak,
        alpha: 0.75,
        angle: { from: 0, to: 45 },
        duration: TWINKLE_MS,
        yoyo: true,
        ease: 'Sine.easeInOut',
        onComplete: () => later(TWINKLE_PAUSE_MS + Math.random() * TWINKLE_PAUSE_MS * 2, twinkle),
      });
    };
    later(i * 400 + Math.random() * 300, twinkle);
  }

  container.once(Phaser.GameObjects.Events.DESTROY, () => {
    tweens.forEach((tween) => tween.remove());
    scene.tweens.killTweensOf(container.list);
    timers.forEach((timer) => timer.remove());
  });
  return container;
}
