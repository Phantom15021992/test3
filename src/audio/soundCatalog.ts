import { CHAIN_LINK_MODES, note, type Synth } from './synth';

// Каталог звуков-кандидатов для отбора в лаборатории (sound-lab.html, только npm run dev).
// У каждого действия три варианта одного «кристального» характера, в одном порядке:
// а — хрусталь (стеклянный звон), б — мягкий (тёплый, как маримба из камня), в — искры (блёстки поверх звона).
// step — номер шага для звуков, которые растут: комбо в каскаде (1, 2, 3…), звёзды (1–3).
// Прошедшие отбор варианты переедут в звуки игры.

export type SoundRecipe = (s: Synth, step: number) => void;

export interface SoundEntry {
  id: number;
  /** Подпись в лаборатории вместо номера — у комбо: 16.1, 16.2… */
  code?: string;
  title: string;
  group: string;
  /** Сколько шагов проиграть подряд в лаборатории (комбо, звёзды); по умолчанию один */
  steps?: number;
  /** Номер варианта, который владелец выбрал на слух (0 — а, 1 — б, 2 — в…); он пойдёт в игру */
  chosen?: number;
  /** Выбран, но под сомнением, нужен ли звук вообще: решим, когда услышим его в игре */
  doubtful?: boolean;
  /** Первые три — а, б, в; дальше — дополнительные варианты (г, д, е…) по образцу понравившегося */
  variants: readonly SoundRecipe[];
}

/** Пентатоника от до третьей октавы: из неё звучит всё «хорошее» — ноты не спорят друг с другом */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
/** Звуки на октаву ниже первых вариантов: высокие резали слух */
const low = (semitones: number) => note(semitones - 12);
/** До второй октавы (523 Гц) — основа мелодий */
const C5 = 3;
const p = (i: number, base = C5) => note(base + PENTA[Math.min(i, PENTA.length - 1)]!);

/** Нисходящий или восходящий ряд звонов */
function run(
  s: Synth,
  kind: 'glass' | 'soft',
  notes: number[],
  gap: number,
  opts: { dur?: number; vol?: number; at?: number } = {},
) {
  notes.forEach((f, i) =>
    s[kind]({ f, dur: opts.dur ?? 0.5, vol: opts.vol ?? 0.22, at: (opts.at ?? 0) + i * gap }),
  );
}

/** Случайная нота пентатоники из диапазона [from, to]: частые звуки каждый раз звучат чуть иначе */
const anyNote = (from: number, to: number) => p(from + Math.floor(Math.random() * (to - from + 1)));
/** Насколько ниже первого варианта звучит 2в: владелец дважды просил опустить на полтона */
const SWAP_SHIFT = 2 ** (-2 / 12);
/** Насколько ниже первого варианта звучит 7в: владелец дважды просил ниже на полтора тона — всего на три тона */
const COMBO_SHIFT = 2 ** (-6 / 12);
/** Во сколько раз медленнее звучит перемешивание поля, чем в первых вариантах */
const SHUFFLE_SLOW = 1.6;
/** 13а — камни на октаву глуше первого варианта, сам взрыв — на пол-октавы выше камней */
const MEGA_OCTAVE = 0.5;
const MEGA_BOOM = MEGA_OCTAVE * Math.SQRT2;
/** Случайное число в диапазоне */
const rand = (from: number, to: number) => from + Math.random() * (to - from);

/**
 * Стук камешков: count коротких щелчков (полосовой шум) вразнобой за span секунд — так стучат
 * мелкие камни, падая друг на друга
 */
function pebbles(
  s: Synth,
  count: number,
  span: number,
  from: number,
  to: number,
  vol: number,
  at = 0,
) {
  for (let i = 0; i < count; i++) {
    s.noise({
      dur: rand(0.012, 0.025),
      vol: vol * rand(0.5, 1),
      at: at + Math.random() * span,
      filter: 'bandpass',
      f: rand(from, to),
      q: rand(3, 6),
      pan: rand(-0.6, 0.6),
    });
  }
}

/** Стук по дереву: щелчок и короткий резонанс полой деревяшки */
function woodKnock(s: Synth, at: number, vol: number) {
  s.noise({ dur: 0.012, vol: vol * 0.5, at, filter: 'bandpass', f: 2200, q: 1 });
  s.noise({ dur: 0.09, vol, at, filter: 'bandpass', f: rand(210, 240), q: 9 });
  s.noise({ dur: 0.05, vol: vol * 0.5, at, filter: 'bandpass', f: rand(520, 600), q: 6 });
}

/** Птичье «чирик»: быстрый тон вверх и обратно */
function birdChirp(s: Synth, f: number, at: number) {
  s.tone({ f, f2: f * 1.5, dur: 0.05, vol: 0.06, at, attack: 0.005 });
  s.tone({ f: f * 1.45, f2: f * 1.1, dur: 0.07, vol: 0.05, at: at + 0.05, attack: 0.005 });
}

/** Щелчок пальцами: сухой хлопок и тело щелчка пониже */
function fingerSnap(s: Synth, at: number) {
  s.noise({ dur: 0.02, vol: 0.3, at, filter: 'bandpass', f: rand(1700, 2100), q: 2 });
  s.noise({ dur: 0.05, vol: 0.15, at, filter: 'bandpass', f: 900, q: 3 });
}

/** Удар по стеклу: щелчок и вспышка яркого шума — момент, когда стекло лопается */
function glassHit(s: Synth, vol = 0.5, dur = 0.16, f = 3000) {
  s.noise({ dur: 0.012, vol: vol * 0.3, filter: 'highpass', f: 2500, q: 0.7 });
  s.noise({ dur, vol: vol * 0.5, filter: 'bandpass', f, f2: f * 0.6, q: 0.9, at: 0.004 });
}

/**
 * Осколки стекла: короткие звонкие «динь» вразнобой. Сначала их много, к концу всё реже — как будто
 * осколки разлетелись и последние ещё падают. Каждый раз высота и порядок другие
 */
function glassShards(
  s: Synth,
  { count = 12, span = 0.4, low = 1800, high = 4200, vol = 0.05, at = 0 } = {},
) {
  for (let i = 0; i < count; i++) {
    const t = Math.random() ** 1.8 * span;
    s.glass({
      f: rand(low, high),
      dur: rand(0.08, 0.22),
      vol: vol * rand(0.5, 1) * (1 - (t / span) * 0.5),
      at: at + 0.01 + t,
      pan: rand(-0.7, 0.7),
    });
  }
}

/**
 * Встряхнутая цепь по образцу владельца: удары звеньев со средней частотой rate в секунду
 * (промежутки 4–30 мс вразнобой), громкость нарастает к концу и обрывается (falling — наоборот,
 * громко в начале и затихает). Звено звенит тесной гроздью частот low–high (CHAIN_LINK_MODES)
 */
/** Цепь после разбора образца: на октаву ниже и на 25% громче (по просьбе владельца) */
const CHAIN_PITCH = 0.5;
const CHAIN_LOUD = 1.25;

function shakenChain(
  s: Synth,
  { dur = 0.75, rate = 60, low = 11000, high = 14000, vol = 0.05, falling = false, at = 0 } = {},
) {
  let t = 0;
  while (t < dur) {
    const p = t / dur;
    // Нарастание к концу и резкий обрыв в последние 15%; при falling — зеркально
    const shape = falling ? (1 - p) ** 1.3 : p < 0.85 ? 0.15 + p ** 1.2 : (1 - p) / 0.15;
    s.clank({
      f: rand(low, high) * CHAIN_PITCH,
      ring: rand(0.02, 0.05),
      vol: vol * CHAIN_LOUD * shape * rand(0.4, 1),
      at: at + t,
      pan: rand(-0.6, 0.6),
      modes: CHAIN_LINK_MODES,
      clickFrom: 6000 * CHAIN_PITCH,
    });
    // Тихий телесный отзвук звена пониже: в образце его около 3% энергии, но на слух он заметен
    s.noise({
      dur: 0.025,
      vol: vol * CHAIN_LOUD * shape * 1.5,
      at: at + t,
      filter: 'bandpass',
      f: rand(900, 2000) * CHAIN_PITCH,
      q: 1.5,
    });
    t += (1 / rate) * rand(0.35, 1.8);
  }
}

/** Глухой удар снизу — основа взрывов и тяжёлых предметов */
function thump(s: Synth, f: number, dur: number, vol = 0.5, at = 0) {
  // Удар — больше шум, чем тон: чистый низкий синус звучит как электронная «бочка»
  s.tone({ f, f2: f * 0.5, dur: dur * 0.6, vol: vol * 0.5, at, attack: 0.004 });
  s.noise({ dur, vol: vol * 0.7, at, filter: 'lowpass', f: 350, f2: 120, q: 0.7 });
}

/** Шорох движения: шум, фильтр которого скользит */
function whoosh(s: Synth, from: number, to: number, dur: number, vol = 0.15, at = 0, pan = 0) {
  s.noise({ dur, vol, at, filter: 'bandpass', f: from, f2: to, q: 2, attack: dur * 0.4, pan });
}

// ---------- Выбранные звуки спецфишек ----------
// Комбо двух спецфишек (16.x) собираются из них, поэтому это функции с размером: size 1 — звук
// ровно как выбран в лаборатории, больше — взрыв крупнее, ниже и дольше.

/** Разница между двумя ракетами в комбо, с */
const ROCKET_PAIR_GAP = 0.1;

interface SpecialOptions {
  at?: number;
  pan?: number;
  size?: number;
}

/** Ракета (выбран 11в): шорох-полёт и искры */
function rocketSound(s: Synth, { at = 0, pan = 0, size = 1 }: SpecialOptions = {}) {
  whoosh(s, 2000 / size, 8000 / size, 0.5 * size, 0.15, at, pan);
  s.sparkle({ count: Math.round(10 * size), span: 0.5 * size, vol: 0.04, at });
}

/** Две ракеты внахлёст с разницей ROCKET_PAIR_GAP — так звучит ракета во всех комбо (по просьбе владельца) */
function rocketPair(
  s: Synth,
  { at = 0, size = 1, gap = ROCKET_PAIR_GAP }: SpecialOptions & { gap?: number } = {},
) {
  rocketSound(s, { at, pan: -0.5, size });
  rocketSound(s, { at: at + gap, pan: 0.5, size });
}

/** Бомба (выбран 12в): глухой удар и россыпь искр */
function bombSound(s: Synth, { at = 0, pan = 0, size = 1 }: SpecialOptions = {}) {
  const low = Math.sqrt(size);
  s.noise({
    dur: 0.22 * size,
    vol: 1.6 * Math.min(size, 1.5),
    at,
    filter: 'lowpass',
    f: 300 / low,
    f2: 110 / low,
    q: 0.8,
    pan,
  });
  s.sparkle({ count: Math.floor(rand(5, 8) * size), span: 0.4 * size, at: at + 0.04, vol: 0.08 });
}

/** Мега-бомба (выбран 13а): тяжёлый хлопок, низкий рокот, долгая россыпь камней и искры */
function megaSound(s: Synth, { at = 0, pan = 0, size = 1 }: SpecialOptions = {}) {
  const low = Math.sqrt(size);
  s.noise({
    dur: 0.35 * size,
    vol: 1.3 * Math.min(size, 1.4),
    at,
    filter: 'lowpass',
    f: (420 * MEGA_BOOM) / low,
    f2: (120 * MEGA_BOOM) / low,
    q: 0.8,
    pan,
  });
  // Объём, как у 13в: низкий рокот медленно стихает под камнями
  s.noise({
    dur: Math.min(size, 1.35),
    vol: 1.4 * Math.min(size, 1.4),
    filter: 'lowpass',
    f: (380 * MEGA_BOOM) / low,
    f2: (90 * MEGA_BOOM) / low,
    q: 0.7,
    at: at + 0.03,
    attack: 0.04,
  });
  pebbles(
    s,
    Math.floor(rand(14, 20) * size),
    Math.min(0.7 * size, 1.1),
    900 * MEGA_OCTAVE,
    2600 * MEGA_OCTAVE,
    0.9,
    at + 0.04,
  );
  s.sparkle({
    count: Math.round(8 * size),
    span: Math.min(0.6 * size, 1),
    at: at + 0.08,
    vol: 0.08,
  });
}

/** Радуга (выбран 14а): звон бежит вверх по восьми нотам; octave 0.5 — на октаву ниже */
function rainbowSound(
  s: Synth,
  {
    at = 0,
    octave = 1,
    gap = 0.06,
    pan = 0,
  }: { at?: number; octave?: number; gap?: number; pan?: number } = {},
) {
  [0, 1, 2, 3, 4, 5, 6, 7].forEach((i) =>
    s.glass({ f: p(i) * octave, dur: 0.5, vol: 0.1, at: at + i * gap, pan }),
  );
}

export const SOUND_CATALOG: readonly SoundEntry[] = [
  // ---------- Ходы и фишки ----------
  {
    id: 1,
    group: 'Ходы и фишки',
    title: 'Нажатие на фишку',
    chosen: 2,
    variants: [
      (s) => s.glass({ f: low(27), dur: 0.18, vol: 0.12 }),
      (s) => s.soft({ f: low(19), dur: 0.25, vol: 0.14 }),
      (s) => s.sparkle({ count: 3, span: 0.06, low: 2000, high: 3500, vol: 0.07, dur: 0.15 }),
    ],
  },
  {
    id: 2,
    group: 'Ходы и фишки',
    title: 'Обмен фишек',
    chosen: 2,
    variants: [
      (s) => {
        s.glass({ f: p(2), dur: 0.2, vol: 0.12 });
        s.glass({ f: p(4), dur: 0.25, vol: 0.12, at: 0.07 });
      },
      (s) => {
        whoosh(s, 1200, 3000, 0.16, 0.08);
        s.soft({ f: p(3), dur: 0.25, vol: 0.12, at: 0.08 });
      },
      // в — на тон ниже первого варианта: шорох и искры умножены на SWAP_SHIFT
      (s) => {
        whoosh(s, 2000 * SWAP_SHIFT, 6000 * SWAP_SHIFT, 0.18, 0.1);
        s.sparkle({
          count: 3,
          span: 0.12,
          low: 1400 * SWAP_SHIFT,
          high: 3600 * SWAP_SHIFT,
          vol: 0.05,
          at: 0.06,
        });
      },
      // г — шорох пониже и мягче, блёсток меньше и они ниже
      (s) => {
        const to = rand(2200, 3200);
        whoosh(s, 900, to, rand(0.14, 0.2), 0.09);
        s.sparkle({ count: 2, span: 0.1, low: 1200, high: 2600, vol: 0.05, at: 0.07 });
      },
      // д — шорох в случайную сторону (вверх или вниз) и одна тихая нота-искра
      (s) => {
        const up = Math.random() < 0.5;
        whoosh(s, up ? 1500 : 5000, up ? 5000 : 1500, rand(0.15, 0.2), 0.09);
        s.glass({
          f: anyNote(4, 8),
          dur: 0.25,
          vol: 0.06,
          at: rand(0.06, 0.1),
          pan: rand(-0.4, 0.4),
        });
      },
      // е — искристый шлейф: блёстки одна за другой, всё выше, как будто кристалл проскользил
      (s) => {
        whoosh(s, 1800, 4500, 0.16, 0.06);
        const start = Math.floor(rand(3, 6));
        [0, 1, 2, 3].forEach((i) =>
          s.glass({
            f: p(start + i),
            dur: 0.18,
            vol: 0.04 + Math.random() * 0.02,
            at: 0.03 + i * rand(0.025, 0.04),
            pan: -0.3 + i * 0.2,
          }),
        );
      },
      // ж — два кристалла коснулись друг друга: два коротких звона на близких случайных нотах
      (s) => {
        whoosh(s, 1600, 4200, 0.14, 0.06);
        const n = Math.floor(rand(4, 8));
        s.glass({ f: p(n), dur: 0.22, vol: 0.07, at: 0.07, pan: -0.2 });
        s.glass({
          f: p(n + (Math.random() < 0.5 ? 1 : 2)),
          dur: 0.26,
          vol: 0.06,
          at: 0.07 + rand(0.02, 0.05),
          pan: 0.2,
        });
      },
      // з — почти один воздух: лёгкий шорох с горстью тихих искр, самый незаметный
      (s) => {
        whoosh(s, rand(2200, 2800), rand(5000, 6500), rand(0.12, 0.18), 0.08);
        s.sparkle({
          count: Math.floor(rand(2, 5)),
          span: 0.14,
          low: 1800,
          high: 3400,
          vol: 0.035,
          at: 0.04,
          dur: 0.18,
        });
      },
    ],
  },
  {
    id: 3,
    group: 'Ходы и фишки',
    title: 'Неверный обмен (откат)',
    chosen: 3,
    variants: [
      (s) => {
        s.glass({ f: low(10), dur: 0.15, vol: 0.12 });
        s.glass({ f: low(5), dur: 0.25, vol: 0.12, at: 0.12 });
      },
      (s) => s.soft({ f: low(3), f2: low(-2), dur: 0.3, vol: 0.18 }),
      (s) => {
        s.noise({ dur: 0.1, vol: 0.12, filter: 'lowpass', f: 900 });
        s.glass({ f: low(7), f2: low(2), dur: 0.25, vol: 0.1, at: 0.04 });
      },
      // г — как обмен 2в, но туда и обратно: только шорох вверх и сразу вниз (стук владелец убрал)
      (s) => {
        const go = rand(0.1, 0.13);
        whoosh(s, 1700 * SWAP_SHIFT, 4500 * SWAP_SHIFT, go, 0.09);
        whoosh(s, 4500 * SWAP_SHIFT, 1500 * SWAP_SHIFT, go, 0.08, go);
      },
      // д — «не-а»: короткий шорох и две тихие ноты вниз, каждый раз на других соседних нотах
      (s) => {
        whoosh(s, 1500 * SWAP_SHIFT, 3600 * SWAP_SHIFT, 0.12, 0.07);
        const n = Math.floor(rand(2, 5));
        s.soft({ f: p(n) / 2, dur: 0.16, vol: 0.09, at: 0.08 });
        s.soft({ f: p(n - 2) / 2, dur: 0.24, vol: 0.09, at: 0.08 + rand(0.1, 0.13) });
      },
      // е — искры вспыхнули и погасли: горсть низких блёсток и спадающий шорох
      (s) => {
        s.sparkle({
          count: Math.floor(rand(2, 4)),
          span: 0.08,
          low: 1100,
          high: 2300,
          vol: 0.09,
          dur: 0.15,
        });
        s.noise({
          dur: 0.22,
          vol: 0.13,
          filter: 'bandpass',
          f: 2600 * SWAP_SHIFT,
          f2: 700,
          q: 1.5,
          at: 0.05,
        });
      },
    ],
  },
  {
    id: 4,
    group: 'Ходы и фишки',
    title: 'Приземление фишек',
    chosen: 5,
    doubtful: true,
    variants: [
      (s) => s.glass({ f: low(22), dur: 0.08, vol: 0.06 }),
      (s) => {
        s.noise({ dur: 0.05, vol: 0.08, filter: 'lowpass', f: 1500 });
        s.soft({ f: low(15), dur: 0.1, vol: 0.05 });
      },
      (s) => s.sparkle({ count: 2, span: 0.04, low: 1500, high: 2500, vol: 0.08, dur: 0.1 }),
      // г — россыпь мелких камешков: несколько сухих щелчков вразнобой
      (s) => pebbles(s, Math.floor(rand(4, 8)), 0.14, 1300, 2600, 0.4),
      // д — камни покрупнее: пара глухих стуков и мелкий камешек вдогонку
      (s) => {
        const count = Math.floor(rand(2, 4));
        for (let i = 0; i < count; i++) {
          s.noise({
            dur: 0.05,
            vol: rand(0.2, 0.3),
            at: i * rand(0.03, 0.06),
            filter: 'lowpass',
            f: rand(500, 800),
            q: 1,
          });
        }
        pebbles(s, 1, 0.02, 1600, 2200, 0.3, count * 0.05);
      },
      // е — камешки о кристалл: щелчки и одна-две тихие стеклянные ноты
      (s) => {
        pebbles(s, Math.floor(rand(3, 6)), 0.1, 1200, 2400, 0.35);
        s.glass({
          f: anyNote(2, 6),
          dur: 0.15,
          vol: 0.035,
          at: rand(0.01, 0.05),
          pan: rand(-0.4, 0.4),
        });
        if (Math.random() < 0.5)
          s.glass({ f: anyNote(3, 7), dur: 0.12, vol: 0.03, at: rand(0.05, 0.1) });
      },
    ],
  },
  {
    id: 5,
    group: 'Ходы и фишки',
    title: 'Совпадение: ячейка 2 уровня',
    chosen: 2,
    variants: [
      (s) => run(s, 'glass', [p(2), p(4)], 0.06, { dur: 0.45, vol: 0.16 }),
      (s) => run(s, 'soft', [p(0), p(2), p(4)], 0.05, { dur: 0.5, vol: 0.14 }),
      (s) => {
        s.glass({ f: p(3), dur: 0.4, vol: 0.14 });
        s.sparkle({ count: 4, span: 0.2, vol: 0.05 });
      },
    ],
  },
  {
    id: 6,
    group: 'Ходы и фишки',
    title: 'Объединение: ячейка 3 уровня',
    chosen: 2,
    variants: [
      (s) => {
        run(s, 'glass', [p(0), p(2), p(4), p(5)], 0.06, { dur: 0.8, vol: 0.16 });
        s.sparkle({ count: 5, span: 0.3, at: 0.2, vol: 0.05 });
      },
      (s) => run(s, 'soft', [p(0), p(3), p(5), p(8)], 0.07, { dur: 0.9, vol: 0.15 }),
      // в — без шороха (владелец убрал): звон сразу, без паузы, которую раньше занимал шорох
      (s) => {
        s.glass({ f: p(7), dur: 0.9, vol: 0.16 });
        s.sparkle({ count: 8, span: 0.6, at: 0.03, vol: 0.05 });
      },
    ],
  },
  {
    id: 7,
    group: 'Ходы и фишки',
    title: 'Комбо в каскаде (тон растёт с каждым шагом)',
    chosen: 2,
    steps: 6,
    variants: [
      (s, k) => s.glass({ f: p(k + 1), dur: 0.5, vol: 0.15 }),
      (s, k) => run(s, 'soft', [p(k), p(k + 2)], 0.05, { dur: 0.5, vol: 0.13 }),
      // в — на три тона ниже первого варианта (COMBO_SHIFT), звон и искры вместе
      (s, k) => {
        s.glass({ f: p(k + 2) * COMBO_SHIFT, dur: 0.4, vol: 0.12 });
        s.sparkle({
          count: 2 + k,
          span: 0.15,
          vol: 0.04,
          low: (1500 + k * 150) * COMBO_SHIFT,
          high: 3600 * COMBO_SHIFT,
        });
      },
    ],
  },
  {
    id: 8,
    group: 'Ходы и фишки',
    title: 'Перемешивание поля',
    chosen: 1,
    variants: [
      // Владелец попросил медленнее: все времена растянуты в SHUFFLE_SLOW раз
      (s) => {
        whoosh(s, 800, 4000, 0.6 * SHUFFLE_SLOW, 0.14);
        run(s, 'glass', [p(6), p(3), p(5), p(1), p(4), p(2)], 0.08 * SHUFFLE_SLOW, {
          dur: 0.3 * SHUFFLE_SLOW,
          vol: 0.08,
          at: 0.1 * SHUFFLE_SLOW,
        });
      },
      (s) => {
        whoosh(s, 600, 2500, 0.5 * SHUFFLE_SLOW, 0.12);
        run(s, 'soft', [p(1), p(4), p(2), p(5), p(3)], 0.09 * SHUFFLE_SLOW, {
          dur: 0.35 * SHUFFLE_SLOW,
          vol: 0.09,
          at: 0.1 * SHUFFLE_SLOW,
        });
      },
      (s) => {
        whoosh(s, 1500, 7000, 0.7 * SHUFFLE_SLOW, 0.12);
        s.sparkle({ count: 14, span: 0.7 * SHUFFLE_SLOW, vol: 0.05 });
      },
    ],
  },
  {
    id: 9,
    group: 'Ходы и фишки',
    title: 'Подсказка хода',
    chosen: 3,
    // Полностью новый набор: прежние кристальные, калимба, шкатулка, звонок, аккорд и пузырьки не подошли
    variants: [
      // а — «тук-тук»: два мягких стука по дереву, как будто постучали в дверь
      (s) => [0, rand(0.15, 0.18)].forEach((at, i) => woodKnock(s, at, i === 0 ? 0.7 : 0.58)),
      // б — поющая чаша: низкий тёплый звон с долгим мягким затуханием
      (s) => {
        s.noise({ dur: 0.03, vol: 0.06, filter: 'lowpass', f: 900 });
        s.glass({ f: rand(205, 225), dur: 1.4, vol: 0.2, attack: 0.01 });
      },
      // в — птичка: два коротких «чирик», каждый раз немного другие
      (s) => {
        const base = rand(2300, 2700);
        birdChirp(s, base, 0);
        birdChirp(s, base * rand(1.08, 1.18), rand(0.14, 0.2));
      },
      // г — щелчок пальцами, дважды: «эй!»
      (s) => [0, rand(0.18, 0.22)].forEach((at) => fingerSnap(s, at)),
      // д — тихие трубчатые колокольчики на других нотах каждый раз (ветерок владелец убрал)
      (s) => {
        [0, 1, 2].forEach((i) =>
          s.soft({
            f: anyNote(0, 5) / 2,
            dur: 0.9,
            vol: 0.09,
            at: i * rand(0.12, 0.2),
            pan: rand(-0.5, 0.5),
          }),
        );
      },
      // е — свист губами «фью-ить»: дыхание с тоном, вверх и ещё раз вверх
      (s) => {
        s.noise({
          dur: 0.16,
          vol: 1.2,
          filter: 'bandpass',
          f: 1300,
          f2: 1700,
          q: 28,
          attack: 0.04,
        });
        s.noise({
          dur: 0.22,
          vol: 1.2,
          filter: 'bandpass',
          f: 1500,
          f2: 2300,
          q: 28,
          attack: 0.04,
          at: 0.2,
        });
      },
    ],
  },

  // ---------- Спецфишки ----------
  {
    id: 10,
    group: 'Спецфишки',
    title: 'Появление спецфишки',
    chosen: 5,
    // Полностью новый набор: прежние варианты не подошли. Ниже, с искрами, каждый раз чуть разные
    variants: [
      // а — «зарядка»: четыре мягкие ноты быстро вверх и искры на вершине
      (s) => {
        const start = Math.floor(rand(0, 3));
        [0, 1, 2, 3].forEach((i) =>
          s.soft({ f: p(start + i) / 2, dur: 0.35, vol: 0.12, at: i * 0.05 }),
        );
        s.sparkle({ count: 5, span: 0.25, at: 0.18, vol: 0.05 });
      },
      // б — «вспышка силы»: мягкий глухой толчок, низкий звон и искры
      (s) => {
        s.noise({ dur: 0.12, vol: 0.2, filter: 'lowpass', f: 300 });
        s.glass({ f: anyNote(0, 3) / 2, dur: 0.8, vol: 0.18, at: 0.02 });
        s.sparkle({ count: 6, span: 0.35, at: 0.05, vol: 0.05 });
      },
      // в — волшебный аккорд: три ноты звона разом, каждый раз от другой ноты
      (s) => {
        const root = Math.floor(rand(0, 3));
        [0, 2, 4].forEach((step, i) =>
          s.glass({
            f: p(root + step) / 2,
            dur: 0.9,
            vol: 0.1,
            at: i * 0.012,
            pan: -0.3 + i * 0.3,
          }),
        );
        s.sparkle({ count: 6, span: 0.4, at: 0.08, vol: 0.045 });
      },
      // г — кристалл засиял: звон мягко разгорается, вокруг всё больше искр
      (s) => {
        s.glass({ f: anyNote(2, 5) / 2, dur: 1, vol: 0.16, attack: 0.08 });
        s.sparkle({ count: 9, span: 0.6, at: 0.05, vol: 0.05 });
      },
      // д — звон с эхом: одна нота и два её тихих повтора
      (s) => {
        const f = anyNote(3, 7) / 2;
        [0, 1, 2].forEach((i) =>
          s.glass({ f, dur: 0.6, vol: 0.16 * 0.55 ** i, at: i * 0.16, pan: [0, -0.4, 0.4][i] }),
        );
        s.sparkle({ count: 3, span: 0.2, vol: 0.04 });
      },
      // е — калимба вверх: две тёплые ноты, «та-да»; без хрустальных искр (владелец убрал искры и третью ноту)
      (s) => {
        const start = Math.floor(rand(0, 3));
        [0, 2].forEach((step, i) =>
          s.kalimba({ f: p(start + step) / 2, dur: 0.55, vol: 0.14, at: i * 0.08 }),
        );
      },
    ],
  },
  {
    id: 11,
    group: 'Спецфишки',
    title: 'Ракета',
    chosen: 2,
    variants: [
      (s) => {
        s.noise({ dur: 0.5, vol: 0.2, filter: 'highpass', f: 800, f2: 6000, q: 0.8, attack: 0.02 });
        s.glass({ f: p(7), dur: 0.4, vol: 0.1, at: 0.35 });
      },
      (s) => {
        s.noise({ dur: 0.45, vol: 0.2, filter: 'lowpass', f: 500, f2: 2500, attack: 0.05 });
        whoosh(s, 1000, 5000, 0.45, 0.15);
      },
      (s) => rocketSound(s),
    ],
  },
  {
    id: 12,
    group: 'Спецфишки',
    title: 'Бомба 3×3',
    chosen: 2,
    // Новый набор: прежние не подошли. Короче и легче мега-бомбы, каждый раз чуть разный
    variants: [
      // а — мягкий хлопок, камешки разлетаются, пара искр
      (s) => {
        s.noise({ dur: 0.18, vol: 0.8, filter: 'lowpass', f: 450, f2: 160, q: 0.8 });
        pebbles(s, Math.floor(rand(7, 11)), 0.35, 1000, 2600, 0.64, 0.03);
        s.sparkle({ count: 3, span: 0.3, at: 0.05, vol: 0.08 });
      },
      // б — треск кристалла: сухой треск, осколки и низкий звон
      (s) => {
        s.noise({ dur: 0.05, vol: 0.6, filter: 'bandpass', f: 1500, q: 1 });
        s.shatter({ vol: 0.44, dur: 0.5, size: 0.9 });
        s.glass({ f: anyNote(0, 3) / 2, dur: 0.5, vol: 0.16, at: 0.02 });
      },
      // в — глухой удар («барабан») и россыпь искр; камешки владелец убрал
      (s) => bombSound(s),
      // г — звонкий взрыв: хлопок и короткий низкий звон осколков
      (s) => {
        s.noise({ dur: 0.15, vol: 0.7, filter: 'lowpass', f: 500, f2: 180, q: 0.8 });
        const root = Math.floor(rand(0, 3));
        [0, 2, 4].forEach((step, i) =>
          s.glass({ f: p(root + step) / 2, dur: 0.4, vol: 0.12, at: 0.01 + i * 0.02 }),
        );
        s.sparkle({ count: 5, span: 0.3, at: 0.03, vol: 0.09 });
      },
    ],
  },
  {
    id: 13,
    group: 'Спецфишки',
    title: 'Мега-бомба 5×5',
    chosen: 0,
    // Новый набор: прежние не подошли. Взрыв кристаллов и камней — без электронного «бума», с разбросом
    variants: [
      // а — тяжёлый хлопок и долгая россыпь камней; удары, рокот и камни на октаву глуше первого варианта
      // (MEGA_OCTAVE), сам взрыв — хлопок и рокот — на пол-октавы выше камней (MEGA_BOOM), искры прежней высоты
      (s) => megaSound(s),
      // б — «бах-бах»: двойной удар и осколки после каждого
      (s) => {
        [0, rand(0.14, 0.2)].forEach((at, i) => {
          s.noise({
            dur: 0.22,
            vol: i === 0 ? 0.96 : 0.76,
            at,
            filter: 'lowpass',
            f: 380,
            f2: 130,
            q: 0.8,
          });
          s.shatter({ vol: 0.4, at: at + 0.01, dur: 0.5, size: 1.4 });
        });
      },
      // в — раскатистый: удар, низкий рокот, который медленно стихает, и камешки
      (s) => {
        s.noise({ dur: 0.18, vol: 1.5, filter: 'lowpass', f: 500, q: 0.8 });
        s.noise({
          dur: 1.1,
          vol: 1.1,
          filter: 'lowpass',
          f: 380,
          f2: 90,
          q: 0.7,
          at: 0.03,
          attack: 0.04,
        });
        pebbles(s, Math.floor(rand(8, 12)), 0.8, 800, 2000, 0.56, 0.15);
      },
      // г — взрыв с эхом: большие осколки, а через миг ещё горсть мелких, тише
      (s) => {
        s.noise({ dur: 0.25, vol: 0.9, filter: 'lowpass', f: 400, f2: 140, q: 0.8 });
        s.shatter({ vol: 0.6, dur: 0.8, size: 1.6 });
        s.shatter({ vol: 0.24, at: rand(0.32, 0.4), dur: 0.5, size: 1 });
      },
    ],
  },
  {
    id: 14,
    group: 'Спецфишки',
    title: 'Радуга',
    chosen: 0,
    doubtful: true,
    variants: [
      (s) => rainbowSound(s),
      (s) =>
        run(
          s,
          'soft',
          [0, 2, 4, 5, 7, 9].map((i) => p(i)),
          0.08,
          { dur: 0.6, vol: 0.11 },
        ),
      (s) => {
        s.swell({ dur: 0.8, vol: 0.12 });
        s.sparkle({ count: 24, span: 1, vol: 0.05 });
      },
    ],
  },
  {
    id: 15,
    group: 'Спецфишки',
    title: 'Манипулятор',
    chosen: 2,
    variants: [
      (s) => {
        s.glass({ f: p(3), f2: p(6), dur: 0.25, vol: 0.12 });
        s.glass({ f: p(6), f2: p(3), dur: 0.3, vol: 0.12, at: 0.22 });
      },
      (s) => {
        whoosh(s, 1500, 3000, 0.25, 0.1);
        whoosh(s, 3000, 1500, 0.25, 0.1, 0.22);
        s.soft({ f: p(5), dur: 0.4, vol: 0.1, at: 0.45 });
      },
      (s) => {
        whoosh(s, 1000, 6000, 0.5, 0.1);
        s.sparkle({ count: 8, span: 0.5, vol: 0.05 });
      },
    ],
  },
  {
    id: 16,
    code: '16.1',
    chosen: 0,
    group: 'Спецфишки',
    title: 'Комбо: ракета + ракета (крест)',
    variants: [
      (s) => {
        // Две ракеты внахлёст: одна слева, другая справа через 0,2 с (у других комбо — 0,1)
        rocketPair(s, { gap: 0.2 });
      },
    ],
  },
  {
    id: 16,
    code: '16.2',
    chosen: 0,
    group: 'Спецфишки',
    title: 'Комбо: ракета + бомба',
    variants: [
      (s) => {
        bombSound(s);
        rocketPair(s, { at: 0.03 });
      },
    ],
  },
  {
    id: 16,
    code: '16.3',
    chosen: 0,
    group: 'Спецфишки',
    title: 'Комбо: бомба + бомба (взрыв 5×5)',
    variants: [
      (s) => {
        // Больше одной бомбы: удар ниже, дольше и громче, искр больше, и низкий рокот под ним
        bombSound(s, { size: 1.7 });
        s.noise({
          dur: 0.7,
          vol: 1.3,
          filter: 'lowpass',
          f: 320,
          f2: 90,
          q: 0.7,
          at: 0.03,
          attack: 0.03,
        });
      },
    ],
  },
  {
    id: 16,
    code: '16.4',
    chosen: 0,
    doubtful: true,
    group: 'Спецфишки',
    title: 'Комбо: радуга + ракета',
    variants: [
      (s) => {
        // Радуга превращает фишки в ракеты — две ракеты внахлёст
        rainbowSound(s, { gap: 0.035 });
        rocketPair(s, { at: 0.3, size: 0.8 });
      },
    ],
  },
  {
    id: 16,
    code: '16.5',
    chosen: 0,
    doubtful: true,
    group: 'Спецфишки',
    title: 'Комбо: радуга + бомба',
    variants: [
      (s) => {
        // Радуга превращает фишки в бомбы — и они рвутся одна за другой
        rainbowSound(s, { gap: 0.035 });
        [-0.5, 0.5, 0].forEach((pan, i) => bombSound(s, { at: 0.3 + i * 0.13, pan, size: 0.9 }));
      },
    ],
  },
  {
    id: 16,
    code: '16.6',
    chosen: 0,
    doubtful: true,
    group: 'Спецфишки',
    title: 'Комбо: радуга + радуга (всё поле)',
    variants: [
      (s) => {
        // Две радуги: звон бежит сразу в двух октавах, и всё поле вспыхивает искрами
        rainbowSound(s, { pan: -0.3 });
        rainbowSound(s, { octave: 0.5, at: 0.02, pan: 0.3 });
        s.sparkle({ count: 20, span: 0.8, at: 0.25, vol: 0.06 });
      },
    ],
  },
  {
    id: 16,
    code: '16.7',
    chosen: 0,
    group: 'Спецфишки',
    title: 'Комбо: мега-бомба + ракета (5 строк + 5 столбцов)',
    variants: [
      (s) => {
        megaSound(s);
        rocketPair(s, { at: 0.03, size: 1.2 });
      },
    ],
  },
  {
    id: 16,
    code: '16.8',
    chosen: 0,
    group: 'Спецфишки',
    title: 'Комбо: мега-бомба + бомба (взрыв 7×7)',
    variants: [
      (s) => {
        megaSound(s, { size: 1.25 });
        bombSound(s, { at: 0.02 });
      },
    ],
  },
  {
    id: 16,
    code: '16.9',
    chosen: 0,
    group: 'Спецфишки',
    title: 'Комбо: мега-бомба + мега-бомба (всё поле)',
    variants: [
      (s) => {
        // Самый большой взрыв в игре: больше двух мега-бомб
        megaSound(s, { size: 1.5 });
      },
    ],
  },
  {
    id: 16,
    code: '16.10',
    chosen: 0,
    doubtful: true,
    group: 'Спецфишки',
    title: 'Комбо: мега-бомба + радуга',
    variants: [
      (s) => {
        // Радуга превращает фишки выбранного цвета в бомбы — и они рвутся каскадом
        rainbowSound(s, { gap: 0.035 });
        [-0.6, 0.6, -0.2, 0.2].forEach((pan, i) => bombSound(s, { at: 0.3 + i * 0.1, pan }));
      },
    ],
  },
  {
    id: 17,
    group: 'Спецфишки',
    title: 'Покупка спецфишки',
    chosen: 0,
    variants: [
      (s) => run(s, 'glass', [p(7), p(10)], 0.09, { dur: 0.5, vol: 0.13 }),
      (s) => run(s, 'soft', [p(5), p(7), p(10)], 0.06, { dur: 0.6, vol: 0.12 }),
      (s) => {
        s.glass({ f: p(9), dur: 0.5, vol: 0.12 });
        s.sparkle({ count: 6, span: 0.3, vol: 0.05, at: 0.05 });
      },
    ],
  },

  // ---------- Препятствия кампании ----------
  {
    id: 18,
    group: 'Препятствия',
    title: 'Удар по льду (приминание снега)',
    chosen: 1,
    // Приминание рыхлого снега (звонче первой версии: срез в 1,8 раза выше, зёрна отчётливее): не отдельные щелчки, а зернистая текстура под давлением
    // (Synth.texture) — громкость нарастает, пока снег продавливают, и спадает. Прежние варианты убраны
    variants: [
      // а — короткое приминание ладонью
      (s) =>
        s.texture({
          dur: rand(0.17, 0.21),
          vol: 0.5,
          density: 220,
          body: 0.22,
          attack: 0.05,
          f: 2880,
        }),
      // б — медленно продавили: дольше и плавнее
      (s) =>
        s.texture({
          dur: rand(0.3, 0.36),
          vol: 0.5,
          density: 160,
          body: 0.22,
          attack: 0.14,
          f: 2340,
        }),
      // в — совсем пушистый снег: мягче и глуше, зёрен меньше
      (s) =>
        s.texture({
          dur: rand(0.23, 0.27),
          vol: 0.55,
          density: 90,
          body: 0.38,
          attack: 0.08,
          f: 1800,
        }),
      // г — продавили до плотного слоя: в конце короткий глухой дожим
      (s) => {
        s.texture({
          dur: rand(0.22, 0.26),
          vol: 0.5,
          density: 180,
          body: 0.22,
          attack: 0.1,
          f: 2340,
        });
        s.noise({ dur: 0.06, vol: 0.12, filter: 'lowpass', f: 450, at: 0.17 });
      },
      // д — двумя ладонями: два приминания внахлёст, второе ниже
      (s) => {
        s.texture({
          dur: 0.18,
          vol: 0.45,
          density: 200,
          body: 0.22,
          attack: 0.05,
          f: 2880,
          pan: -0.3,
        });
        s.texture({
          dur: 0.2,
          vol: 0.4,
          density: 170,
          body: 0.26,
          attack: 0.06,
          f: 2070,
          pan: 0.3,
          at: rand(0.1, 0.14),
        });
      },
    ],
  },
  {
    id: 19,
    group: 'Препятствия',
    title: 'Лёд сломан',
    chosen: 0,
    // Разбитое стекло: резкий удар, вспышка яркого шума и россыпь звонких осколков вразнобой.
    // Прежние варианты (озёрный треск) убраны
    variants: [
      // а — бокал разбился: удар, звон и россыпь мелких осколков
      (s) => {
        glassHit(s, 0.5);
        glassShards(s, { count: Math.floor(rand(10, 15)), span: 0.4 });
      },
      // б — разбилось окно: тяжёлый удар, долгий звон и осколки, падающие следом
      (s) => {
        s.noise({ dur: 0.1, vol: 0.4, filter: 'lowpass', f: 320, q: 0.8 });
        glassHit(s, 0.7, 0.32);
        glassShards(s, { count: Math.floor(rand(16, 22)), span: 0.7, vol: 0.06 });
      },
      // в — разбилась маленькая стекляшка: короткий звонкий щелчок и пара осколков
      (s) => {
        glassHit(s, 0.35, 0.1);
        glassShards(s, { count: Math.floor(rand(4, 7)), span: 0.2, vol: 0.06 });
      },
      // г — стекло осыпалось: удар, хрусткая крошка и осколки
      (s) => {
        glassHit(s, 0.45);
        s.texture({ dur: 0.3, vol: 0.4, density: 280, body: 0.1, attack: 0.01, f: 4500, at: 0.02 });
        glassShards(s, { count: Math.floor(rand(8, 12)), span: 0.35 });
      },
      // д — стекло пониже и глуше: толстое стекло, осколки крупнее
      (s) => {
        s.noise({ dur: 0.08, vol: 0.35, filter: 'lowpass', f: 400, q: 0.8 });
        glassHit(s, 0.45, 0.2, 1800);
        glassShards(s, {
          count: Math.floor(rand(8, 12)),
          span: 0.45,
          low: 900,
          high: 2400,
          vol: 0.08,
        });
      },
    ],
  },
  {
    id: 20,
    group: 'Препятствия',
    title: 'Сундук: снято звено цепи',
    chosen: 2,
    // По образцу владельца (metal-chain.mp3): ~60 ударов звеньев в секунду (обычно через 9–13 мс),
    // громкость нарастает ~0,6 с и обрывается за 0,1 с; звон звеньев — гроздь частот 11–14 кГц.
    // Прежние варианты убраны
    variants: [
      // а — как в образце: цепь встряхнули, звяканье нарастает и обрывается
      (s) => shakenChain(s, { dur: rand(0.7, 0.8) }),
      // б — короче, для частого действия в игре
      (s) => shakenChain(s, { dur: rand(0.4, 0.5) }),
      // в — наоборот: громко в начале и затихает, как цепь бросили
      (s) => shakenChain(s, { dur: rand(0.6, 0.7), falling: true }),
      // г — та же цепь крупнее: звон ниже (7–10 кГц), удары чуть реже
      (s) => shakenChain(s, { dur: rand(0.7, 0.8), low: 7000, high: 10000, rate: 45 }),
      // д — два коротких рывка подряд
      (s) => {
        const first = rand(0.28, 0.34);
        shakenChain(s, { dur: first });
        shakenChain(s, { dur: rand(0.3, 0.36), at: first + rand(0.05, 0.1) });
      },
    ],
  },
  {
    id: 21,
    group: 'Препятствия',
    title: 'Сундук открыт / сломан',
    chosen: 0,
    variants: [
      (s) => {
        s.noise({ dur: 0.15, vol: 0.2, filter: 'lowpass', f: 600 });
        run(s, 'glass', [p(4), p(7), p(9)], 0.07, { dur: 0.6, vol: 0.12, at: 0.1 });
      },
      (s) => {
        s.noise({ dur: 0.25, vol: 0.15, filter: 'bandpass', f: 400, f2: 900, q: 2 });
        run(s, 'soft', [p(2), p(5)], 0.08, { dur: 0.6, vol: 0.12, at: 0.15 });
      },
      (s) => {
        s.noise({ dur: 0.12, vol: 0.18, filter: 'lowpass', f: 700 });
        s.sparkle({ count: 10, span: 0.4, vol: 0.05, at: 0.08 });
      },
    ],
  },
  {
    id: 22,
    group: 'Препятствия',
    title: 'Золото найдено',
    chosen: 1,
    variants: [
      (s) => run(s, 'glass', [p(9), p(12)], 0.07, { dur: 0.6, vol: 0.13 }),
      (s) => run(s, 'soft', [p(7), p(9), p(12)], 0.06, { dur: 0.6, vol: 0.12 }),
      (s) => {
        s.glass({ f: p(10), dur: 0.5, vol: 0.12 });
        s.sparkle({ count: 8, span: 0.4, low: 1750, vol: 0.05 });
      },
    ],
  },
  {
    id: 23,
    group: 'Препятствия',
    title: 'Корона дошла до дна',
    chosen: 1,
    variants: [
      (s) => {
        run(s, 'glass', [p(0), p(3), p(5), p(8)], 0.1, { dur: 0.9, vol: 0.15 });
        s.sparkle({ count: 6, span: 0.4, at: 0.35, vol: 0.05 });
      },
      (s) => run(s, 'soft', [p(0), p(2), p(4), p(7), p(9)], 0.09, { dur: 1, vol: 0.13 }),
      (s) => {
        s.swell({ dur: 0.3, vol: 0.12 });
        s.glass({ f: p(8), dur: 1, vol: 0.15, at: 0.25 });
        s.sparkle({ count: 14, span: 0.8, at: 0.25, vol: 0.05 });
      },
    ],
  },
  {
    id: 24,
    group: 'Препятствия',
    title: 'Уголь: снят слой',
    chosen: 0,
    variants: [
      (s) => {
        s.noise({ dur: 0.12, vol: 0.22, filter: 'lowpass', f: 500 });
        s.tone({ f: 160, f2: 90, dur: 0.12, vol: 0.2 });
      },
      (s) => s.noise({ dur: 0.18, vol: 0.4, filter: 'bandpass', f: 600, f2: 300, q: 1.5 }),
      (s) =>
        [0, 0.04, 0.09].forEach((at) =>
          s.noise({ dur: 0.05, vol: 0.14, at, filter: 'lowpass', f: 800 }),
        ),
    ],
  },
  {
    id: 25,
    group: 'Препятствия',
    title: 'Уголь разбит',
    chosen: 0,
    variants: [
      (s) => {
        thump(s, 110, 0.4, 0.45);
        [0, 0.06, 0.13, 0.2].forEach((at) =>
          s.noise({ dur: 0.08, vol: 0.15, at, filter: 'lowpass', f: 900 }),
        );
      },
      (s) => {
        s.noise({ dur: 0.5, vol: 0.25, filter: 'lowpass', f: 1200, f2: 200 });
        s.tone({ f: 120, f2: 50, dur: 0.4, vol: 0.3 });
      },
      (s) => {
        thump(s, 130, 0.3, 0.4);
        s.sparkle({ count: 6, span: 0.3, low: 750, high: 1500, vol: 0.05, at: 0.1 });
      },
    ],
  },
  {
    id: 26,
    group: 'Препятствия',
    title: 'Камень разбит',
    variants: [
      (s) => {
        s.noise({ dur: 0.25, vol: 0.25, filter: 'bandpass', f: 900, q: 1.2 });
        s.tone({ f: 200, f2: 80, dur: 0.2, vol: 0.25 });
      },
      (s) =>
        [0, 0.05, 0.11].forEach((at) =>
          s.noise({ dur: 0.07, vol: 0.18, at, filter: 'bandpass', f: 1100, q: 2 }),
        ),
      (s) => {
        thump(s, 180, 0.25, 0.35);
        s.noise({ dur: 0.2, vol: 0.15, filter: 'highpass', f: 1500 });
      },
    ],
  },

  // ---------- Итоги и интерфейс ----------
  {
    id: 27,
    group: 'Итоги и интерфейс',
    title: 'Цель или задача на звезду выполнена',
    variants: [
      (s) => run(s, 'glass', [p(4), p(7), p(9)], 0.08, { dur: 0.7, vol: 0.14 }),
      (s) => run(s, 'soft', [p(3), p(5), p(8)], 0.08, { dur: 0.8, vol: 0.13 }),
      (s) => {
        s.glass({ f: p(8), dur: 0.7, vol: 0.13 });
        s.sparkle({ count: 10, span: 0.5, vol: 0.05 });
      },
    ],
  },
  {
    id: 28,
    group: 'Итоги и интерфейс',
    title: 'Звезда за уровень (1, 2, 3)',
    steps: 3,
    variants: [
      (s, k) => {
        s.glass({ f: p(3 + k * 2), dur: 0.8, vol: 0.15 });
        s.sparkle({ count: 3 + k * 2, span: 0.3, vol: 0.05 });
      },
      (s, k) => run(s, 'soft', [p(2 + k * 2), p(4 + k * 2)], 0.06, { dur: 0.8, vol: 0.13 }),
      (s, k) => {
        s.swell({ dur: 0.25, vol: 0.12 });
        s.glass({ f: p(4 + k * 2), dur: 0.8, vol: 0.14, at: 0.2 });
        s.sparkle({ count: 4 * k, span: 0.4, at: 0.2, vol: 0.05 });
      },
    ],
  },
  {
    id: 29,
    group: 'Итоги и интерфейс',
    title: 'Поражение',
    variants: [
      (s) => run(s, 'glass', [low(10), low(8), low(5), low(3)], 0.22, { dur: 0.8, vol: 0.13 }),
      (s) => run(s, 'soft', [low(7), low(3), low(0)], 0.28, { dur: 0.9, vol: 0.14 }),
      (s) => {
        s.swell({ dur: 1.1, vol: 0.12, falling: true });
        s.glass({ f: low(3), dur: 1, vol: 0.1, at: 0.3 });
      },
    ],
  },
  {
    id: 30,
    group: 'Итоги и интерфейс',
    title: 'Конец игры / новый рекорд',
    variants: [
      (s) => {
        run(s, 'glass', [p(0), p(2), p(4), p(5), p(7)], 0.09, { dur: 1, vol: 0.14 });
        s.sparkle({ count: 16, span: 0.9, at: 0.4, vol: 0.05 });
      },
      (s) => {
        run(s, 'soft', [p(0), p(3), p(5)], 0.12, { dur: 0.8, vol: 0.13 });
        run(s, 'soft', [p(5), p(8)], 0.1, { dur: 1, vol: 0.14, at: 0.45 });
      },
      (s) => {
        s.swell({ dur: 0.6, vol: 0.12 });
        run(s, 'glass', [p(8), p(10)], 0.12, { dur: 0.8, vol: 0.14, at: 0.45 });
        s.sparkle({ count: 22, span: 0.9, at: 0.3, vol: 0.05 });
      },
    ],
  },
  {
    id: 31,
    group: 'Итоги и интерфейс',
    title: 'Кнопка в меню',
    variants: [
      (s) => s.glass({ f: low(19), dur: 0.12, vol: 0.1 }),
      (s) => s.soft({ f: low(15), dur: 0.18, vol: 0.12 }),
      (s) => {
        s.noise({ dur: 0.03, vol: 0.08, filter: 'highpass', f: 4000 });
        s.glass({ f: low(24), dur: 0.1, vol: 0.06 });
      },
    ],
  },
  {
    id: 32,
    group: 'Итоги и интерфейс',
    title: 'Последние ходы (осталось 5)',
    chosen: 1,
    variants: [
      (s) => run(s, 'glass', [low(12), low(10), low(12), low(10)], 0.13, { dur: 0.25, vol: 0.1 }),
      (s) => run(s, 'soft', [low(8), low(8)], 0.2, { dur: 0.35, vol: 0.12 }),
      (s) => {
        s.glass({ f: low(15), dur: 0.2, vol: 0.1 });
        s.glass({ f: low(9), dur: 0.35, vol: 0.1, at: 0.16 });
      },
    ],
  },
];
