import { INSTRUMENTS } from './instruments';
import { renderTrack, trackLength, type MusicEvent, type Track } from './musicScore';

// Проигрыватель музыки: ноты композиции ставятся в Web Audio с запасом вперёд, по таймеру.
// Композиции идут списком: кончилась одна — после короткой паузы начинается следующая, после
// последней — снова первая. Смена списка (меню → уровень) — плавное затухание старой музыки.

/** На сколько секунд вперёд ставятся ноты; таймер браузера неточен, а Web Audio — точен */
const LOOKAHEAD = 0.5;
const TICK_MS = 120;
/** Пауза между композициями: последняя нота успевает отзвучать */
const GAP = 1.5;
const FADE = 1.2;
/** Отзвук зала у музыки длиннее, чем у звуков игры */
const HALL_SECONDS = 2.6;
const HALL_WET = 0.28;
/** Верх срезан, как и у звуков: резкие высокие владелец не любит */
const TOP_CUT = 8000;

/** Небольшой разброс по времени и силе: ровная до миллисекунды игра звучит механически */
const JITTER_TIME = 0.008;
const JITTER_VEL = 0.1;

interface Playing {
  track: Track;
  events: MusicEvent[];
  next: number;
  /** Время AudioContext, когда композиция началась бы с начала */
  zero: number;
  length: number;
  gain: GainNode;
}

export class MusicPlayer {
  readonly ctx: AudioContext;
  private readonly bus: GainNode;
  private playlist: Track[] = [];
  private index = 0;
  private loopOne = false;
  private current: Playing | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly rendered = new Map<string, MusicEvent[]>();
  /** Вызывается при смене композиции */
  onTrack: ((track: Track | null) => void) | null = null;

  constructor(ctx: AudioContext = new AudioContext()) {
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.6;
    const top = ctx.createBiquadFilter();
    top.type = 'lowpass';
    top.frequency.value = TOP_CUT;
    top.Q.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    const hall = ctx.createConvolver();
    hall.buffer = this.hall();
    const wet = ctx.createGain();
    wet.gain.value = HALL_WET;
    this.bus.connect(top);
    top.connect(comp);
    top.connect(hall).connect(wet).connect(comp);
    comp.connect(ctx.destination);
  }

  set volume(value: number) {
    this.bus.gain.value = value;
  }

  /** Отклик зала: стереошум с плавным затуханием, верх гаснет быстрее */
  private hall(): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const length = Math.round(rate * HALL_SECONDS);
    const buffer = this.ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let smooth = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        smooth += (Math.random() * 2 - 1 - smooth) * (0.8 - t * 0.7);
        data[i] = smooth * (1 - t) ** 2.5 * (i < rate * 0.015 ? i / (rate * 0.015) : 1);
      }
    }
    return buffer;
  }

  private events(track: Track): MusicEvent[] {
    let events = this.rendered.get(track.id);
    if (!events) {
      events = renderTrack(track);
      this.rendered.set(track.id, events);
    }
    return events;
  }

  /**
   * Играть список по кругу, начиная с композиции index; offset — с какой секунды первой композиции.
   * loopOne — повторять одну композицию
   */
  play(playlist: Track[], { index = 0, offset = 0, loopOne = false } = {}): void {
    this.fadeOut();
    this.playlist = playlist;
    this.index = index;
    this.loopOne = loopOne;
    if (playlist.length === 0) return;
    this.startTrack(offset);
    this.timer ??= setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    this.fadeOut();
    this.playlist = [];
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.onTrack?.(null);
  }

  /** Что играет и с какой секунды */
  position(): { track: Track; time: number; length: number } | null {
    const c = this.current;
    if (!c) return null;
    return { track: c.track, time: Math.max(0, this.ctx.currentTime - c.zero), length: c.length };
  }

  private fadeOut(): void {
    const c = this.current;
    if (!c) return;
    const now = this.ctx.currentTime;
    c.gain.gain.cancelScheduledValues(now);
    c.gain.gain.setValueAtTime(c.gain.gain.value, now);
    c.gain.gain.linearRampToValueAtTime(0.0001, now + FADE);
    const gain = c.gain;
    setTimeout(() => gain.disconnect(), (FADE + 3) * 1000);
    this.current = null;
  }

  private startTrack(offset: number, at = this.ctx.currentTime + 0.1): void {
    const track = this.playlist[this.index]!;
    const events = this.events(track);
    const gain = this.ctx.createGain();
    gain.connect(this.bus);
    const next = events.findIndex((e) => e.time >= offset);
    this.current = {
      track,
      events,
      next: next < 0 ? events.length : next,
      zero: at - offset,
      length: trackLength(track),
      gain,
    };
    this.onTrack?.(track);
  }

  private tick(): void {
    const c = this.current;
    if (!c) return;
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    while (c.next < c.events.length) {
      const e = c.events[c.next]!;
      const t = c.zero + e.time;
      if (t > horizon) break;
      c.next++;
      if (t < this.ctx.currentTime - 0.05) continue;
      INSTRUMENTS[e.inst](this.ctx, c.gain, {
        t: Math.max(
          this.ctx.currentTime,
          t + (Math.random() * 2 - 1) * JITTER_TIME * (e.inst === 'kick' ? 0 : 1),
        ),
        midi: e.midi,
        dur: e.dur,
        vel: Math.min(1, e.vel * (1 + (Math.random() * 2 - 1) * JITTER_VEL)),
        pan: e.pan,
      });
    }
    const end = c.zero + c.length;
    if (c.next >= c.events.length && this.ctx.currentTime + LOOKAHEAD >= end + GAP) {
      // Старая композиция дозвучивает свои ноты, потом её узел отключается
      const old = c.gain;
      setTimeout(() => old.disconnect(), (end + GAP - this.ctx.currentTime + 8) * 1000);
      if (!this.loopOne) this.index = (this.index + 1) % this.playlist.length;
      this.startTrack(0, end + GAP);
    }
  }
}
