// Синтез коротких звуков игры через Web Audio: без файлов, всё из генераторов и шума.
// Фишки в игре — кристаллы, поэтому основа — стеклянный звон: несколько негармоничных обертонов,
// как у бокала или колокольчика, быстрая атака и долгое затухание. Время — в секундах от «сейчас».

export type Wave = OscillatorType;

export interface ToneOptions {
  /** Частота, Гц; f2 — к какой частоте скользит за время звука */
  f: number;
  f2?: number;
  dur: number;
  vol?: number;
  type?: Wave;
  /** Задержка от начала звука, с */
  at?: number;
  attack?: number;
  /** Панорама: -1 слева … 1 справа */
  pan?: number;
}

export interface NoiseOptions {
  dur: number;
  vol?: number;
  at?: number;
  attack?: number;
  filter?: BiquadFilterType;
  /** Частота фильтра и куда она уходит к концу звука */
  f?: number;
  f2?: number;
  q?: number;
  pan?: number;
}

/** Обертоны стекла: отношения частот и громкостей (как у бокала — негармоничные) */
const GLASS: readonly (readonly [number, number])[] = [
  [1, 1],
  [2.76, 0.42],
  [5.4, 0.18],
  [8.93, 0.08],
];
/** Колокольчик мягче: обертоны ближе к гармоническим и тише */
const BELL: readonly (readonly [number, number])[] = [
  [1, 1],
  [2, 0.3],
  [3.01, 0.12],
  [4.2, 0.05],
];

/** Нота по номеру полутона от ля первой октавы (0 — 440 Гц) */
export const note = (semitones: number) => 440 * 2 ** (semitones / 12);

export class Synth {
  readonly ctx: AudioContext;
  readonly out: GainNode;
  private noiseBuffer: AudioBuffer | null = null;

  constructor(ctx: AudioContext = new AudioContext()) {
    this.ctx = ctx;
    // Лёгкий компрессор: громкие взрывы и тихие блёстки звучат ровнее
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.out = ctx.createGain();
    this.out.gain.value = 0.7;
    this.out.connect(comp).connect(ctx.destination);
  }

  set volume(value: number) {
    this.out.gain.value = value;
  }

  private start(at = 0) {
    return this.ctx.currentTime + 0.01 + at;
  }

  /** Огибающая громкости: быстрая атака и экспоненциальное затухание к концу */
  private envelope(t: number, vol: number, attack: number, dur: number, pan = 0): GainNode {
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (pan !== 0) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner).connect(this.out);
    } else {
      gain.connect(this.out);
    }
    return gain;
  }

  /** Простой тон с возможным скольжением частоты */
  tone({
    f,
    f2,
    dur,
    vol = 0.3,
    type = 'sine',
    at = 0,
    attack = 0.005,
    pan = 0,
  }: ToneOptions): void {
    const t = this.start(at);
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (f2 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), t + dur);
    osc.connect(this.envelope(t, vol, attack, dur, pan));
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Звон из обертонов: высокие гаснут быстрее, как у настоящего стекла */
  private partials(
    partials: readonly (readonly [number, number])[],
    { f, f2, dur, vol = 0.3, at = 0, attack = 0.003, pan = 0 }: ToneOptions,
  ): void {
    partials.forEach(([ratio, level], i) =>
      this.tone({
        f: f * ratio,
        f2: f2 === undefined ? undefined : f2 * ratio,
        dur: dur / (1 + i * 0.6),
        vol: vol * level,
        at,
        attack,
        pan,
      }),
    );
  }

  /** Хрустальный звон (бокал) */
  glass(options: ToneOptions): void {
    this.partials(GLASS, options);
  }

  /** Мягкий колокольчик */
  bell(options: ToneOptions): void {
    this.partials(BELL, options);
  }

  /** Шум с фильтром: шорох, хруст, свист */
  noise({
    dur,
    vol = 0.2,
    at = 0,
    attack = 0.005,
    filter = 'bandpass',
    f = 3000,
    f2,
    q = 1,
    pan = 0,
  }: NoiseOptions): void {
    const t = this.start(at);
    const source = this.ctx.createBufferSource();
    source.buffer = this.whiteNoise();
    const biquad = this.ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.Q.value = q;
    biquad.frequency.setValueAtTime(f, t);
    if (f2 !== undefined) biquad.frequency.exponentialRampToValueAtTime(f2, t + dur);
    source.connect(biquad).connect(this.envelope(t, vol, attack, dur, pan));
    source.start(t);
    source.stop(t + dur + 0.02);
  }

  /** Россыпь высоких блёсток: count звонких точек за span секунд */
  sparkle({
    count = 6,
    span = 0.4,
    low = 2500,
    high = 6500,
    vol = 0.08,
    at = 0,
    dur = 0.25,
  } = {}): void {
    for (let i = 0; i < count; i++) {
      this.glass({
        f: low + Math.random() * (high - low),
        dur,
        vol: vol * (0.6 + Math.random() * 0.4),
        at: at + Math.random() * span,
        pan: Math.random() * 1.4 - 0.7,
      });
    }
  }

  /** Осколки стекла: хрусткий шум и звонкие обломки */
  shatter({ vol = 0.3, at = 0, dur = 0.5, size = 1 } = {}): void {
    this.noise({ dur: dur * 0.6, vol: vol * 0.8, at, filter: 'highpass', f: 2500 / size, q: 0.7 });
    this.noise({ dur: dur * 0.25, vol: vol * 0.6, at, filter: 'bandpass', f: 1200 / size, q: 1.5 });
    this.sparkle({
      count: Math.round(8 * size),
      span: dur * 0.5,
      low: 1800 / size,
      high: 7000,
      vol: vol * 0.3,
      at,
      dur: dur * 0.5,
    });
  }

  private whiteNoise(): AudioBuffer {
    if (!this.noiseBuffer) {
      const length = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }
}
