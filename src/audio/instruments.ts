import type { Instrument } from './musicScore';

// Инструменты музыки: живые по звучанию, а не «электронные». Струнные щипковые (гитара, арфа, бас) —
// по Карплусу — Стронгу: шум в петле задержки сам становится струной; фортепиано — из обертонов
// с удара молоточка; смычковые — несколько чуть расстроенных пил с вибрато за мягким фильтром;
// флейта — тон с дыханием. Ударные мягкие: щётки, шейкер, приглушённая бочка. Хрустальный звон (bell)
// оставлен только для редких украшений.

export interface NoteRequest {
  /** Абсолютное время AudioContext, с */
  t: number;
  midi: number;
  dur: number;
  vel: number;
  pan: number;
}

type Play = (ctx: AudioContext, out: AudioNode, note: NoteRequest) => void;

const freqOf = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Узлы панорамы общие на выход и положение: у партии оно одно, а узел на каждую ноту дорог телефону */
const panners = new WeakMap<AudioNode, Map<number, StereoPannerNode>>();
function panned(ctx: AudioContext, out: AudioNode, pan: number): AudioNode {
  if (pan === 0) return out;
  let byPan = panners.get(out);
  if (!byPan) {
    byPan = new Map();
    panners.set(out, byPan);
  }
  let p = byPan.get(pan);
  if (!p) {
    p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(out);
    byPan.set(pan, p);
  }
  return p;
}

/**
 * Фильтр (по формулам RBJ) прямо над отсчётами: им запекаются звуки заранее, чтобы не держать
 * фильтр Web Audio на каждой ноте
 */
function biquad(
  data: Float32Array,
  sr: number,
  type: 'lowpass' | 'highpass' | 'bandpass' | 'peaking',
  f: number,
  q: number,
  gainDb = 0,
): void {
  const w = (2 * Math.PI * f) / sr;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const A = 10 ** (gainDb / 40);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (type === 'lowpass') {
    [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
    [a0, a1, a2] = [1 + alpha, -2 * cos, 1 - alpha];
  } else if (type === 'highpass') {
    [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    [a0, a1, a2] = [1 + alpha, -2 * cos, 1 - alpha];
  } else if (type === 'bandpass') {
    [b0, b1, b2] = [alpha, 0, -alpha];
    [a0, a1, a2] = [1 + alpha, -2 * cos, 1 - alpha];
  } else {
    [b0, b1, b2] = [1 + alpha * A, -2 * cos, 1 - alpha * A];
    [a0, a1, a2] = [1 + alpha / A, -2 * cos, 1 - alpha / A];
  }
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i]!;
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    data[i] = y;
  }
}

/** Огибающая: атака, затухание до уровня sustain за decay, отпускание release после конца ноты */
function adsr(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  peak: number,
  {
    attack,
    decay,
    sustain,
    release,
    dur,
  }: { attack: number; decay: number; sustain: number; release: number; dur: number },
): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(peak * sustain, t + attack, decay / 3);
  const end = t + Math.max(dur, attack);
  g.gain.setTargetAtTime(0.0001, end, release / 4);
  g.connect(out);
  return g;
}

let noise: AudioBuffer | null = null;
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (!noise || noise.sampleRate !== ctx.sampleRate) {
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
}

function noiseBurst(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  {
    vol,
    dur,
    type,
    f,
    q = 1,
    attack = 0.002,
  }: { vol: number; dur: number; type: BiquadFilterType; f: number; q?: number; attack?: number },
) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = f;
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(out);
  const offset = Math.random() * 1.5;
  src.start(t, offset);
  src.stop(t + dur + 0.05);
}

function osc(
  ctx: AudioContext,
  type: OscillatorType,
  f: number,
  t: number,
  stop: number,
): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.start(t);
  o.stop(stop);
  return o;
}

// --- Щипковые: Карплус — Стронг ---------------------------------------------------------------

interface StringModel {
  /** Сколько секунд звучит струна */
  seconds: number;
  /** Время затухания на 60 дБ для ноты ля малой октавы (220 Гц), с */
  t60: number;
  /** 0 — тёмный начальный щипок, 1 — яркий */
  brightness: number;
  /** Доля сглаживания в петле: больше — быстрее гаснут верхи */
  damping: number;
}

const STRINGS: Record<'guitar' | 'harp' | 'bass', StringModel> = {
  guitar: { seconds: 2.6, t60: 3.2, brightness: 0.45, damping: 0.5 },
  harp: { seconds: 3.4, t60: 4.5, brightness: 0.6, damping: 0.42 },
  bass: { seconds: 2.2, t60: 2.4, brightness: 0.15, damping: 0.5 },
};

const stringCache = new Map<string, { buffer: AudioBuffer; rate: number }>();

/** Звук струны заранее: шум в петле задержки длиной в период; высоту точно подгоняет скорость проигрывания */
function stringBuffer(ctx: AudioContext, model: keyof typeof STRINGS, midi: number) {
  const key = `${model}:${midi}:${ctx.sampleRate}`;
  const cached = stringCache.get(key);
  if (cached) return cached;
  const m = STRINGS[model];
  const sr = ctx.sampleRate;
  const f = freqOf(midi);
  const period = Math.max(2, Math.floor(sr / f));
  const length = Math.round(sr * m.seconds);
  const buffer = ctx.createBuffer(1, length, sr);
  const y = buffer.getChannelData(0);
  // Затухание за один проход петли: чтобы за t60 секунд звук ослаб на 60 дБ
  const t60 = m.t60 * Math.sqrt(220 / f);
  const loss = 10 ** (-3 / (t60 * (sr / period)));
  let lp = 0;
  const alpha = 0.1 + m.brightness * 0.85;
  for (let i = 0; i < period; i++) {
    lp += alpha * (Math.random() * 2 - 1 - lp);
    y[i] = lp;
  }
  // Щипок не у самого края струны: вычитание отражения гасит часть обертонов, как у пальца
  const pluck = Math.max(1, Math.floor(period * 0.18));
  for (let i = period - 1; i >= pluck; i--) y[i] = y[i]! - 0.5 * y[i - pluck]!;
  const d = m.damping;
  for (let i = period; i < length; i++) {
    y[i] = loss * ((1 - d) * y[i - period]! + d * y[i - period - 1 >= 0 ? i - period - 1 : 0]!);
  }
  // Бас — мягкий, у гитары и арфы — тёплый горб корпуса около 220 Гц
  if (model === 'bass') biquad(y, sr, 'lowpass', 900, 0.7);
  else biquad(y, sr, 'peaking', 220, 1, 4);
  // Нормировка: громкость не должна зависеть от случайного шума
  let peak = 0;
  for (let i = 0; i < Math.min(length, period * 8); i++) peak = Math.max(peak, Math.abs(y[i]!));
  if (peak > 0) for (let i = 0; i < length; i++) y[i] = y[i]! / peak;
  const result = { buffer, rate: (f * period) / sr };
  stringCache.set(key, result);
  return result;
}

function plucked(model: keyof typeof STRINGS, gain: number, ringOut: boolean): Play {
  return (ctx, out, { t, midi, dur, vel, pan }) => {
    const { buffer, rate } = stringBuffer(ctx, model, midi);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain * vel;
    // Гитару глушат ладонью к концу ноты, арфа звенит до конца
    const end =
      t + (ringOut ? STRINGS[model].seconds : Math.min(dur + 0.25, STRINGS[model].seconds));
    if (!ringOut) {
      g.gain.setValueAtTime(gain * vel, Math.max(t, end - 0.25));
      g.gain.linearRampToValueAtTime(0.0001, end);
    }
    src.connect(g).connect(panned(ctx, out, pan));
    src.start(t);
    src.stop(end + 0.05);
    if (model === 'bass') {
      // Под струной — чистый низ, чтобы бас держал опору и на маленьких динамиках
      const sub = osc(ctx, 'sine', freqOf(midi), t, end + 0.05);
      const sg = adsr(ctx, panned(ctx, out, pan), t, gain * vel * 0.35, {
        attack: 0.01,
        decay: 0.6,
        sustain: 0.5,
        release: 0.2,
        dur: Math.min(dur, STRINGS.bass.seconds - 0.3),
      });
      sub.connect(sg);
    }
  };
}

// --- Фортепиано ----------------------------------------------------------------------------------

/** Тембр струны фортепиано: обертоны 1/n — одна волна вместо десятка генераторов (бережёт телефон) */
const pianoWaves = new WeakMap<BaseAudioContext, PeriodicWave>();
function pianoWave(ctx: BaseAudioContext): PeriodicWave {
  let wave = pianoWaves.get(ctx);
  if (!wave) {
    const n = 12;
    const real = new Float32Array(n + 1);
    const imag = new Float32Array(n + 1);
    for (let k = 1; k <= n; k++) imag[k] = 1 / k ** 1.15;
    wave = ctx.createPeriodicWave(real, imag);
    pianoWaves.set(ctx, wave);
  }
  return wave;
}

/**
 * Фортепиано: две чуть расстроенные струны (живые биения) за фильтром, который темнеет после удара, —
 * у настоящего рояля верхние обертоны гаснут быстрее основного тона
 */
const piano: Play = (ctx, out, { t, midi, dur, vel, pan }) => {
  const f = freqOf(midi);
  const dest = panned(ctx, out, pan);
  const sustainTime = 3.2 * (220 / f) ** 0.45;
  const release = 0.25;
  const end = t + Math.min(dur + release, sustainTime * 1.5);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.4;
  const top = Math.min(f * (3 + 6 * vel), 6000);
  filter.frequency.setValueAtTime(top, t);
  filter.frequency.setTargetAtTime(Math.max(f * 1.5, 300), t + 0.01, sustainTime / 4);
  const g = ctx.createGain();
  const amp = 0.28 * vel;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(amp, t + 0.004);
  // Двухступенчатое затухание: быстрый спад после удара и долгий хвост
  g.gain.setTargetAtTime(amp * 0.45, t + 0.004, 0.08);
  g.gain.setTargetAtTime(0.0001, t + 0.25, sustainTime / 3);
  g.gain.setTargetAtTime(0.0001, t + dur, release / 3);
  filter.connect(g).connect(dest);
  for (const side of [-1, 1]) {
    const o = ctx.createOscillator();
    o.setPeriodicWave(pianoWave(ctx));
    o.frequency.value = f * (1 + side * 0.0006);
    o.connect(filter);
    o.start(t);
    o.stop(end + 0.05);
  }
  noiseBurst(ctx, dest, t, {
    vol: 0.05 * vel,
    dur: 0.03,
    type: 'lowpass',
    f: Math.min(f * 4, 3000),
  });
};

// --- Смычковые и флейта --------------------------------------------------------------------------

function bowed({
  gain,
  cutoff,
  voices,
  attack,
  vibrato,
}: {
  gain: number;
  cutoff: number;
  voices: number;
  attack: number;
  vibrato: number;
}): Play {
  return (ctx, out, { t, midi, dur, vel, pan }) => {
    const f = freqOf(midi);
    const release = 0.9;
    const end = t + dur + release;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.min(cutoff, f * 6);
    filter.Q.value = 0.6;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;
    const env = adsr(ctx, panned(ctx, out, pan), t, gain * vel, {
      attack,
      decay: 0.5,
      sustain: 0.85,
      release,
      dur,
    });
    filter.connect(hp).connect(env);
    // Вибрато вступает не сразу, как у живого исполнителя
    const lfo = osc(ctx, 'sine', 5 + Math.random() * 0.6, t, end + 0.05);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * vibrato, t + Math.min(0.6, dur));
    lfo.connect(depth);
    for (let v = 0; v < voices; v++) {
      const detune = voices === 1 ? 0 : ((v / (voices - 1)) * 2 - 1) * 0.004;
      const o = osc(ctx, 'sawtooth', f * (1 + detune), t, end + 0.05);
      depth.connect(o.frequency);
      const g = ctx.createGain();
      g.gain.value = 1 / voices;
      o.connect(g).connect(filter);
    }
  };
}

const flute: Play = (ctx, out, { t, midi, dur, vel, pan }) => {
  const f = freqOf(midi);
  const dest = panned(ctx, out, pan);
  const release = 0.18;
  const end = t + dur + release;
  const env = adsr(ctx, dest, t, 0.17 * vel, {
    attack: 0.06,
    decay: 0.3,
    sustain: 0.85,
    release,
    dur,
  });
  const lfo = osc(ctx, 'sine', 5.2, t, end + 0.05);
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(f * 0.004, t + Math.min(0.5, dur));
  lfo.connect(depth);
  for (const [n, amp] of [
    [1, 1],
    [2, 0.22],
    [3, 0.08],
  ] as const) {
    const o = osc(ctx, 'sine', f * n, t, end + 0.05);
    depth.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.value = amp;
    o.connect(g).connect(env);
  }
  // Дыхание: шум около второго обертона на всю ноту и короткий «чиф» в начале
  noiseBurst(ctx, dest, t, { vol: 0.03 * vel, dur: 0.08, type: 'bandpass', f: f * 3, q: 2 });
  const breath = adsr(ctx, dest, t, 0.012 * vel, {
    attack: 0.08,
    decay: 0.3,
    sustain: 0.8,
    release,
    dur,
  });
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = f * 2;
  bp.Q.value = 3;
  src.connect(bp).connect(breath);
  src.start(t, Math.random());
  src.stop(end + 0.05);
};

// --- Ударные по высоте: маримба и редкий звон ----------------------------------------------------

function mallet(
  partials: readonly (readonly [number, number])[],
  gain: number,
  length: number,
): Play {
  return (ctx, out, { t, midi, vel, pan }) => {
    const f = freqOf(midi);
    const dest = panned(ctx, out, pan);
    const dur = length * (440 / f) ** 0.3;
    partials.forEach(([ratio, level], i) => {
      if (f * ratio > 7000) return;
      const o = osc(ctx, 'sine', f * ratio, t, t + dur + 0.05);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain * vel * level, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur / (1 + i * 2));
      o.connect(g).connect(dest);
    });
    noiseBurst(ctx, dest, t, {
      vol: 0.04 * vel,
      dur: 0.015,
      type: 'bandpass',
      f: Math.min(f * 2, 4000),
    });
  };
}

// --- Ударные -------------------------------------------------------------------------------------

const kick: Play = (ctx, out, { t, vel }) => {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.7 * vel, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.45);
  noiseBurst(ctx, out, t, { vol: 0.05 * vel, dur: 0.02, type: 'lowpass', f: 1500 });
};

/** Малый барабан щётками: шуршание и негромкий корпус */
const snare: Play = (ctx, out, { t, vel, pan }) => {
  const dest = panned(ctx, out, pan);
  noiseBurst(ctx, dest, t, {
    vol: 0.35 * vel,
    dur: 0.2,
    type: 'bandpass',
    f: 2200,
    q: 0.7,
    attack: 0.004,
  });
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(200, t);
  o.frequency.exponentialRampToValueAtTime(160, t + 0.1);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.12 * vel, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.15);
};

/** Удар по ободу: короткий деревянный щелчок */
const rim: Play = (ctx, out, { t, vel, pan }) => {
  const dest = panned(ctx, out, pan);
  const o = osc(ctx, 'sine', 820, t, t + 0.08);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.18 * vel, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g).connect(dest);
  noiseBurst(ctx, dest, t, { vol: 0.1 * vel, dur: 0.03, type: 'bandpass', f: 1800, q: 2 });
};

/** Шумовые удары запекаются заранее: тарелочка и шейкер звучат десятки раз за такт */
const noiseHits = new Map<string, AudioBuffer>();
function noiseHit(
  ctx: AudioContext,
  key: string,
  {
    dur,
    attack,
    type,
    f,
    q,
  }: { dur: number; attack: number; type: 'highpass' | 'bandpass'; f: number; q: number },
): AudioBuffer {
  const id = `${key}:${ctx.sampleRate}`;
  let buffer = noiseHits.get(id);
  if (!buffer) {
    const sr = ctx.sampleRate;
    buffer = ctx.createBuffer(1, Math.round(sr * dur), sr);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    biquad(d, sr, type, f, q);
    for (let i = 0; i < d.length; i++) {
      const time = i / sr;
      const env = time < attack ? time / attack : Math.exp((-(time - attack) / (dur - attack)) * 6);
      d[i] = d[i]! * env;
    }
    noiseHits.set(id, buffer);
  }
  return buffer;
}

function playHit(ctx: AudioContext, out: AudioNode, buffer: AudioBuffer, t: number, vol: number) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(out);
  src.start(t);
}

const hat: Play = (ctx, out, { t, vel, pan, dur }) => {
  const open = dur > 0.2;
  const buffer = noiseHit(ctx, open ? 'hat-open' : 'hat', {
    dur: open ? 0.22 : 0.05,
    attack: 0.002,
    type: 'highpass',
    f: 6500,
    q: 0.7,
  });
  playHit(ctx, panned(ctx, out, pan), buffer, t, 0.1 * vel);
};

const shaker: Play = (ctx, out, { t, vel, pan }) => {
  const buffer = noiseHit(ctx, 'shaker', {
    dur: 0.07,
    attack: 0.015,
    type: 'bandpass',
    f: 4800,
    q: 1.2,
  });
  playHit(ctx, panned(ctx, out, pan), buffer, t, 0.18 * vel);
};

/** Том — мягкий барабан с высотой: в тёмных композициях держит ритм вместо бочки */
const tom: Play = (ctx, out, { t, vel, pan, midi }) => {
  const dest = panned(ctx, out, pan);
  const f = 80 * 2 ** ((midi - 60) / 12);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f * 1.5, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.45 * vel, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.5);
  noiseBurst(ctx, dest, t, { vol: 0.05 * vel, dur: 0.04, type: 'lowpass', f: 1200 });
};

export const INSTRUMENTS: Record<Instrument, Play> = {
  piano,
  guitar: plucked('guitar', 0.45, false),
  harp: plucked('harp', 0.38, true),
  bass: plucked('bass', 0.45, false),
  strings: bowed({ gain: 0.1, cutoff: 1800, voices: 2, attack: 0.5, vibrato: 0.003 }),
  cello: bowed({ gain: 0.34, cutoff: 1500, voices: 2, attack: 0.12, vibrato: 0.005 }),
  flute,
  marimba: mallet(
    [
      [1, 1],
      [3.93, 0.2],
      [9.24, 0.04],
    ],
    0.3,
    0.9,
  ),
  bell: mallet(
    [
      [1, 1],
      [2.76, 0.35],
      [5.4, 0.12],
    ],
    0.14,
    2.2,
  ),
  kick,
  snare,
  rim,
  hat,
  shaker,
  tom,
};
