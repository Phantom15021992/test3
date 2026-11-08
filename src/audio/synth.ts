// Синтез коротких звуков игры через Web Audio: без файлов, всё из генераторов и шума.
// Фишки в игре — кристаллы, поэтому основа — звон: несколько негармоничных обертонов, быстрая атака
// и долгое затухание. Чтобы звук не казался электронным: у звона есть щелчок удара, каждый обертон
// раздвоен на два почти равных тона (живые биения, как у настоящего стекла), верх мягко срезан,
// и всё звучит в небольшой «комнате» (реверберация). Время — в секундах от «сейчас».

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
/** Мягкий звук — как маримба из камня: верхние обертоны далеко и быстро гаснут, звук тёплый */
const SOFT: readonly (readonly [number, number])[] = [
  [1, 1],
  [3.93, 0.22],
  [9.24, 0.05],
];
/** Металл (гвоздь, монета): обертоны гуще и выше, чем у стекла, звон короче и суше */
const METAL: readonly (readonly [number, number])[] = [
  [1, 1],
  [2.32, 0.7],
  [4.25, 0.45],
  [6.63, 0.25],
];
/** Призвон звена цепи: несоразмерные высоты резонаторов (доли от основной) и их громкости */
const CLANK_MODES: readonly (readonly [number, number])[] = [
  [1, 1],
  [1.43, 0.85],
  [1.83, 0.7],
  [2.47, 0.55],
  [3.11, 0.4],
];
/** Калимба (пальцевое пианино): основной тон и высокий обертон язычка, который быстро гаснет */
const KALIMBA: readonly (readonly [number, number])[] = [
  [1, 1],
  [5.4, 0.16],
];
/** Обертон раздваивается на два тона, разнесённых на эту долю: слышны медленные биения */
const BEAT_SPREAD = 0.0025;
/** Отзвук комнаты: длина и доля «мокрого» сигнала */
const REVERB_SECONDS = 1.3;
const REVERB_WET = 0.22;
/** У металла отзвука почти нет: он звучит сухо */
const BRIGHT_REVERB_WET = 0.05;
/** Выше этой частоты звук мягко срезан: резкий верх и делал звуки «компьютерными» */
const TOP_CUT = 6500;

/** Нота по номеру полутона от ля первой октавы (0 — 440 Гц) */
export const note = (semitones: number) => 440 * 2 ** (semitones / 12);

export class Synth {
  readonly ctx: AudioContext;
  readonly out: GainNode;
  /**
   * Яркий путь для металла: мимо среза высоких частот и почти без отзвука комнаты. Звон металла живёт
   * выше 6 кГц, и со срезом и отзвуком цепь звучала как мягкий хрусталь
   */
  readonly bright: GainNode;
  private noiseBuffer: AudioBuffer | null = null;

  constructor(ctx: AudioContext = new AudioContext()) {
    this.ctx = ctx;
    // Лёгкий компрессор: громкие взрывы и тихие блёстки звучат ровнее
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.out = ctx.createGain();
    this.out.gain.value = 0.7;
    const top = ctx.createBiquadFilter();
    top.type = 'lowpass';
    top.frequency.value = TOP_CUT;
    top.Q.value = 0.5;
    this.out.connect(top);
    top.connect(comp);
    const reverb = ctx.createConvolver();
    reverb.buffer = this.room();
    const wet = ctx.createGain();
    wet.gain.value = REVERB_WET;
    top.connect(reverb).connect(wet).connect(comp);
    this.bright = ctx.createGain();
    this.bright.gain.value = this.out.gain.value;
    this.bright.connect(comp);
    const brightWet = ctx.createGain();
    brightWet.gain.value = BRIGHT_REVERB_WET;
    this.bright.connect(reverb);
    reverb.connect(brightWet).connect(comp);
    comp.connect(ctx.destination);
  }

  /** Отклик небольшой комнаты: затухающий шум, высокие гаснут быстрее */
  private room(): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const length = Math.round(rate * REVERB_SECONDS);
    const buffer = this.ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let smooth = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        // Сглаживание шума усиливается к концу: хвост отзвука темнее начала
        smooth += (Math.random() * 2 - 1 - smooth) * (0.9 - t * 0.75);
        data[i] = smooth * (1 - t) ** 3;
      }
    }
    return buffer;
  }

  set volume(value: number) {
    this.out.gain.value = value;
    this.bright.gain.value = value;
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

  /**
   * Звон из обертонов: высокие гаснут быстрее, каждый раздвоен ради живых биений, а в начале —
   * короткий щелчок удара. decay — во сколько раз быстрее гаснет каждый следующий обертон
   */
  private partials(
    partials: readonly (readonly [number, number])[],
    { f, f2, dur, vol = 0.3, at = 0, attack = 0.002, pan = 0 }: ToneOptions,
    decay: number,
    strike: number,
  ): void {
    partials.forEach(([ratio, level], i) => {
      for (const side of [-1, 1]) {
        const spread = 1 + side * BEAT_SPREAD * (0.6 + Math.random() * 0.8);
        this.tone({
          f: f * ratio * spread,
          f2: f2 === undefined ? undefined : f2 * ratio * spread,
          dur: dur / (1 + i * decay),
          vol: (vol * level) / 2,
          at,
          attack,
          pan,
        });
      }
    });
    this.noise({
      dur: 0.02,
      vol: vol * strike,
      at,
      filter: 'bandpass',
      f: Math.min(f * 3, 5000),
      q: 1.2,
      pan,
    });
  }

  /** Хрустальный звон (бокал) */
  glass(options: ToneOptions): void {
    this.partials(GLASS, options, 0.6, 0.35);
  }

  /** Мягкий тёплый звон, как у маримбы из камня */
  soft(options: ToneOptions): void {
    this.partials(SOFT, options, 2.5, 0.5);
  }

  /** Металлический звяк: гвоздь, монета */
  metal(options: ToneOptions): void {
    this.partials(METAL, options, 1.4, 0.7);
  }

  /**
   * Удар металла о металл, как у звена настоящей цепи: щелчок в несколько миллисекунд проходит через
   * узкие резонаторы на высоких частотах и коротко звенит. Высоты у резонаторов несоразмерные, поэтому
   * звук шумный, «без ноты», как у настоящего железа. f — основная частота призвона, ring — как долго звенит
   */
  clank({
    f,
    ring = 0.06,
    vol = 0.1,
    at = 0,
    pan = 0,
  }: {
    f: number;
    ring?: number;
    vol?: number;
    at?: number;
    pan?: number;
  }): void {
    const t = this.start(at);
    const source = this.ctx.createBufferSource();
    source.buffer = this.whiteNoise();
    const hit = this.ctx.createGain();
    hit.gain.setValueAtTime(1, t);
    hit.gain.exponentialRampToValueAtTime(0.001, t + 0.004);
    source.connect(hit);
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(this.bright);
    // Жёсткий сухой щелчок удара, сам по себе, мимо резонаторов: металл о металл звучит резко
    const click = this.ctx.createBiquadFilter();
    click.type = 'highpass';
    click.frequency.value = 4000;
    const clickGain = this.ctx.createGain();
    clickGain.gain.value = vol * 1.5;
    hit.connect(click).connect(clickGain).connect(panner);
    for (const [ratio, level] of CLANK_MODES) {
      const freq = Math.min(f * ratio, 12000);
      // Добротность из времени звона: резонатор с Q звенит примерно Q / (π·f) секунд
      const q = Math.min((Math.PI * freq * ring) / 2, 900);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = this.ctx.createGain();
      // Узкий резонатор пропускает мало энергии короткого щелчка — громкость возмещается по добротности
      gain.gain.value = vol * level * Math.sqrt(q) * 18;
      hit.connect(filter).connect(gain).connect(panner);
    }
    source.start(t);
    source.stop(t + 0.01);
  }

  /** Калимба: тёплый щипок металлического язычка — приятный и не «кристальный» */
  kalimba(options: ToneOptions): void {
    this.partials(KALIMBA, options, 8, 0.25);
  }

  /** Пузырёк: короткий тон, быстро взлетающий вверх, — как капля или пузырь в воде */
  bubble({
    f,
    vol = 0.12,
    at = 0,
    pan = 0,
  }: {
    f: number;
    vol?: number;
    at?: number;
    pan?: number;
  }): void {
    this.tone({ f, f2: f * 2.2, dur: 0.07, vol, at, attack: 0.004, pan });
  }

  /** Подъём воздуха (или спад, falling): «волшебный» нарастающий шорох вместо скользящего тона */
  swell({
    dur,
    vol = 0.12,
    at = 0,
    falling = false,
  }: {
    dur: number;
    vol?: number;
    at?: number;
    falling?: boolean;
  }): void {
    const [from, to] = falling ? [2200, 400] : [400, 2200];
    this.noise({
      dur,
      vol,
      at,
      filter: 'bandpass',
      f: from,
      f2: to,
      q: 1.5,
      attack: falling ? 0.02 : dur * 0.7,
    });
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
    low = 1400,
    high = 3600,
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
    this.noise({ dur: dur * 0.6, vol: vol * 0.6, at, filter: 'bandpass', f: 2200 / size, q: 0.8 });
    this.noise({ dur: dur * 0.25, vol: vol * 0.6, at, filter: 'bandpass', f: 900 / size, q: 1.5 });
    this.sparkle({
      count: Math.round(8 * size),
      span: dur * 0.5,
      low: 1100 / size,
      high: 3800,
      vol: vol * 0.3,
      at,
      dur: dur * 0.5,
    });
  }

  /**
   * Зернистая текстура, рассчитанная по отсчётам: тихий шум, по которому бегут частые мелкие всплески
   * (density в секунду, каждый гаснет за 2–6 мс), — так звучит снег или песок под давлением.
   * Громкость сначала нарастает за attack (снег продавливают), потом спадает к концу. body —
   * доля ровного шума под всплесками: чем больше, тем мягче и «пушистее»
   */
  texture({
    dur,
    vol = 0.3,
    at = 0,
    density = 180,
    body = 0.3,
    attack = 0.06,
    f = 1400,
    pan = 0,
  }: {
    dur: number;
    vol?: number;
    at?: number;
    density?: number;
    body?: number;
    attack?: number;
    /** Частота, выше которой звук приглушён: ниже — глуше */
    f?: number;
    pan?: number;
  }): void {
    const rate = this.ctx.sampleRate;
    const length = Math.round(dur * rate);
    const buffer = this.ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    let burst = 0;
    let decay = 0;
    const chance = density / rate;
    for (let i = 0; i < length; i++) {
      if (Math.random() < chance) {
        burst = 0.5 + Math.random() * 0.5;
        decay = Math.exp(-1 / (rate * (0.002 + Math.random() * 0.004)));
      }
      burst *= decay;
      const t = i / length;
      const press = Math.min(1, t / Math.max(attack / dur, 0.001)) * (1 - t) ** 1.5;
      data[i] = (Math.random() * 2 - 1) * (body + burst) * press;
    }
    const t0 = this.start(at);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = f;
    filter.Q.value = 0.6;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    source.connect(filter).connect(gain).connect(panner).connect(this.out);
    source.start(t0);
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
