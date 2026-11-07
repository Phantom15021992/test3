import { note, type Synth } from './synth';

// Каталог звуков-кандидатов для отбора в лаборатории (sound-lab.html, только npm run dev).
// У каждого действия три варианта одного «кристального» характера, в одном порядке:
// а — хрусталь (стеклянный звон), б — мягкий (тёплый, как маримба из камня), в — искры (блёстки поверх звона).
// step — номер шага для звуков, которые растут: комбо в каскаде (1, 2, 3…), звёзды (1–3).
// Прошедшие отбор варианты переедут в звуки игры.

export type SoundRecipe = (s: Synth, step: number) => void;

export interface SoundEntry {
  id: number;
  title: string;
  group: string;
  /** Сколько шагов проиграть подряд в лаборатории (комбо, звёзды); по умолчанию один */
  steps?: number;
  /** Номер варианта, который владелец выбрал на слух (0 — а, 1 — б, 2 — в…); он пойдёт в игру */
  chosen?: number;
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

/** Глухой удар снизу — основа взрывов и тяжёлых предметов */
function thump(s: Synth, f: number, dur: number, vol = 0.5, at = 0) {
  // Удар — больше шум, чем тон: чистый низкий синус звучит как электронная «бочка»
  s.tone({ f, f2: f * 0.5, dur: dur * 0.6, vol: vol * 0.5, at, attack: 0.004 });
  s.noise({ dur, vol: vol * 0.7, at, filter: 'lowpass', f: 350, f2: 120, q: 0.7 });
}

/** Шорох движения: шум, фильтр которого скользит */
function whoosh(s: Synth, from: number, to: number, dur: number, vol = 0.15, at = 0) {
  s.noise({ dur, vol, at, filter: 'bandpass', f: from, f2: to, q: 2, attack: dur * 0.4 });
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
    variants: [
      (s) => {
        run(s, 'glass', [p(0), p(2), p(4), p(5)], 0.06, { dur: 0.8, vol: 0.16 });
        s.sparkle({ count: 5, span: 0.3, at: 0.2, vol: 0.05 });
      },
      (s) => run(s, 'soft', [p(0), p(3), p(5), p(8)], 0.07, { dur: 0.9, vol: 0.15 }),
      (s) => {
        s.swell({ dur: 0.35, vol: 0.16 });
        s.glass({ f: p(7), dur: 0.9, vol: 0.16, at: 0.3 });
        s.sparkle({ count: 8, span: 0.6, at: 0.25, vol: 0.05 });
      },
    ],
  },
  {
    id: 7,
    group: 'Ходы и фишки',
    title: 'Комбо в каскаде (тон растёт с каждым шагом)',
    steps: 6,
    variants: [
      (s, k) => s.glass({ f: p(k + 1), dur: 0.5, vol: 0.15 }),
      (s, k) => run(s, 'soft', [p(k), p(k + 2)], 0.05, { dur: 0.5, vol: 0.13 }),
      (s, k) => {
        s.glass({ f: p(k + 2), dur: 0.4, vol: 0.12 });
        s.sparkle({ count: 2 + k, span: 0.15, vol: 0.04, low: 1500 + k * 150 });
      },
    ],
  },
  {
    id: 8,
    group: 'Ходы и фишки',
    title: 'Перемешивание поля',
    variants: [
      (s) => {
        whoosh(s, 800, 4000, 0.6, 0.14);
        run(s, 'glass', [p(6), p(3), p(5), p(1), p(4), p(2)], 0.08, {
          dur: 0.3,
          vol: 0.08,
          at: 0.1,
        });
      },
      (s) => {
        whoosh(s, 600, 2500, 0.5, 0.12);
        run(s, 'soft', [p(1), p(4), p(2), p(5), p(3)], 0.09, { dur: 0.35, vol: 0.09, at: 0.1 });
      },
      (s) => {
        whoosh(s, 1500, 7000, 0.7, 0.12);
        s.sparkle({ count: 14, span: 0.7, vol: 0.05 });
      },
    ],
  },
  {
    id: 9,
    group: 'Ходы и фишки',
    title: 'Подсказка хода',
    variants: [
      (s) => run(s, 'glass', [p(5), p(5)], 0.18, { dur: 0.35, vol: 0.08 }),
      (s) => run(s, 'soft', [p(4), p(6)], 0.14, { dur: 0.45, vol: 0.09 }),
      (s) => s.sparkle({ count: 4, span: 0.4, low: 1750, high: 3000, vol: 0.05, dur: 0.3 }),
    ],
  },

  // ---------- Спецфишки ----------
  {
    id: 10,
    group: 'Спецфишки',
    title: 'Появление спецфишки',
    variants: [
      (s) => {
        s.glass({ f: p(4), f2: p(9), dur: 0.3, vol: 0.12 });
        s.glass({ f: p(9), dur: 0.7, vol: 0.14, at: 0.25 });
      },
      (s) => run(s, 'soft', [p(4), p(6), p(9)], 0.04, { dur: 0.8, vol: 0.13 }),
      (s) => {
        s.swell({ dur: 0.4, vol: 0.12 });
        s.sparkle({ count: 10, span: 0.5, at: 0.2, vol: 0.05 });
      },
    ],
  },
  {
    id: 11,
    group: 'Спецфишки',
    title: 'Ракета',
    variants: [
      (s) => {
        s.noise({ dur: 0.5, vol: 0.2, filter: 'highpass', f: 800, f2: 6000, q: 0.8, attack: 0.02 });
        s.glass({ f: p(7), dur: 0.4, vol: 0.1, at: 0.35 });
      },
      (s) => {
        s.noise({ dur: 0.45, vol: 0.2, filter: 'lowpass', f: 500, f2: 2500, attack: 0.05 });
        whoosh(s, 1000, 5000, 0.45, 0.15);
      },
      (s) => {
        whoosh(s, 2000, 8000, 0.5, 0.15);
        s.sparkle({ count: 10, span: 0.5, vol: 0.04 });
      },
    ],
  },
  {
    id: 12,
    group: 'Спецфишки',
    title: 'Бомба 3×3',
    variants: [
      (s) => {
        thump(s, 140, 0.35, 0.5);
        s.shatter({ vol: 0.3, dur: 0.6 });
      },
      (s) => {
        thump(s, 120, 0.4, 0.45);
        run(s, 'soft', [p(2), p(0)], 0.08, { dur: 0.5, vol: 0.1, at: 0.05 });
      },
      (s) => {
        thump(s, 160, 0.25, 0.4);
        s.sparkle({ count: 16, span: 0.35, vol: 0.06 });
      },
    ],
  },
  {
    id: 13,
    group: 'Спецфишки',
    title: 'Мега-бомба 5×5',
    variants: [
      (s) => {
        thump(s, 90, 0.7, 0.65);
        s.shatter({ vol: 0.4, dur: 1, size: 1.6 });
      },
      (s) => {
        thump(s, 80, 0.8, 0.6);
        s.noise({ dur: 0.9, vol: 0.25, filter: 'lowpass', f: 900, f2: 200 });
        run(s, 'soft', [p(4), p(2), p(0)], 0.1, { dur: 0.7, vol: 0.1, at: 0.1 });
      },
      (s) => {
        thump(s, 100, 0.6, 0.55);
        s.sparkle({ count: 30, span: 0.9, vol: 0.06 });
      },
    ],
  },
  {
    id: 14,
    group: 'Спецфишки',
    title: 'Радуга',
    variants: [
      (s) =>
        run(
          s,
          'glass',
          [0, 1, 2, 3, 4, 5, 6, 7].map((i) => p(i)),
          0.06,
          { dur: 0.5, vol: 0.1 },
        ),
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
    group: 'Спецфишки',
    title: 'Комбо двух спецфишек',
    variants: [
      (s) => {
        thump(s, 80, 0.8, 0.65);
        s.shatter({ vol: 0.4, dur: 1.1, size: 1.8 });
        run(s, 'glass', [p(4), p(7), p(9)], 0.06, { dur: 1, vol: 0.12, at: 0.15 });
      },
      (s) => {
        thump(s, 70, 0.9, 0.6);
        run(s, 'soft', [p(0), p(4), p(7), p(9), p(12)], 0.07, { dur: 0.9, vol: 0.12, at: 0.1 });
      },
      (s) => {
        thump(s, 90, 0.7, 0.55);
        s.swell({ dur: 0.6, vol: 0.12 });
        s.sparkle({ count: 36, span: 1.1, vol: 0.06 });
      },
    ],
  },
  {
    id: 17,
    group: 'Спецфишки',
    title: 'Покупка спецфишки',
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
    title: 'Удар по льду (трещина)',
    variants: [
      (s) => {
        s.noise({ dur: 0.08, vol: 0.18, filter: 'highpass', f: 3000 });
        s.glass({ f: low(20), dur: 0.2, vol: 0.06 });
      },
      (s) => {
        s.noise({ dur: 0.06, vol: 0.3, filter: 'bandpass', f: 2500, q: 3 });
        s.soft({ f: low(17), dur: 0.15, vol: 0.05, at: 0.02 });
      },
      (s) =>
        [0, 0.03, 0.07].forEach((at) =>
          s.noise({ dur: 0.03, vol: 0.12, at, filter: 'highpass', f: 4000 }),
        ),
    ],
  },
  {
    id: 19,
    group: 'Препятствия',
    title: 'Лёд сломан',
    variants: [
      (s) => s.shatter({ vol: 0.22, dur: 0.45, size: 0.8 }),
      (s) => {
        s.noise({ dur: 0.2, vol: 0.18, filter: 'highpass', f: 2000 });
        run(s, 'soft', [low(24), low(20)], 0.05, { dur: 0.3, vol: 0.06 });
      },
      (s) => {
        s.noise({ dur: 0.15, vol: 0.15, filter: 'highpass', f: 3500 });
        s.sparkle({ count: 8, span: 0.3, vol: 0.05 });
      },
    ],
  },
  {
    id: 20,
    group: 'Препятствия',
    title: 'Сундук: снято звено цепи',
    variants: [
      (s) => {
        s.glass({ f: 1150, dur: 0.18, vol: 0.12 });
        s.noise({ dur: 0.06, vol: 0.15, filter: 'bandpass', f: 4500, q: 4 });
      },
      (s) => {
        s.glass({ f: 850, dur: 0.2, vol: 0.12 });
        s.glass({ f: 1270, dur: 0.15, vol: 0.09, at: 0.05 });
      },
      (s) =>
        [0, 0.05].forEach((at) =>
          s.noise({ dur: 0.05, vol: 0.3, at, filter: 'bandpass', f: 5000, q: 5 }),
        ),
    ],
  },
  {
    id: 21,
    group: 'Препятствия',
    title: 'Сундук открыт / сломан',
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
