// Нотная запись музыки игры и её разворот в список нот. Без Web Audio: всё здесь проверяется тестами.
// Композиция — разделы (вступление, тема, припев…); у раздела аккорды по тактам и партии инструментов.
// Партии записаны строками: мелодия — нотами с длительностями, аккомпанемент — ритмом по аккордам
// раздела (бас, арпеджио, аккорды, ударные), поэтому одна запись ритма служит для любых аккордов.

export type Instrument =
  | 'piano'
  | 'guitar'
  | 'harp'
  | 'bass'
  | 'strings'
  | 'cello'
  | 'violin'
  | 'spiccato'
  | 'pizz'
  | 'flute'
  | 'marimba'
  | 'bell'
  | 'kick'
  | 'snare'
  | 'rim'
  | 'hat'
  | 'shaker'
  | 'tom';

interface PartBase {
  inst: Instrument;
  /** Громкость партии (доля) */
  vol?: number;
  /** Панорама: -1 слева … 1 справа */
  pan?: number;
  /** Партия звучит только в тактах раздела [from, until) */
  from?: number;
  until?: number;
}

/**
 * Мелодия: ноты «A4:2» (нота и длительность в восьмых), паузы «r:2»; «!» в конце — акцент.
 * Черта «|» ничего не значит — ею удобно разделять такты при записи
 */
export interface MelodyPart extends PartBase {
  kind: 'melody';
  notes: string;
  /** Сдвиг на октавы */
  octave?: number;
}

/**
 * Ритмические партии: такты через «|», в такте — шаги через пробел (их число задаёт сетку: 8 — восьмые).
 * «.» — пауза, «-» — продлить предыдущую ноту. Рисунок повторяется по тактам раздела.
 * - comp — аккорд целиком: «x», «o» (акцент), «g» (тихо);
 * - arp — номер звука аккорда снизу вверх (1–9, выше — следующие октавы);
 * - bass — R основной тон (или бас аккорда «D/F#»), 3, 5, 7 — ступени аккорда над ним, 8 — октава,
 *   L — квинта вниз;
 * - drum — «x» удар, «o» акцент, «g» тихий удар; fill — рисунок последнего такта раздела (сбивка)
 */
export interface PatternPart extends PartBase {
  kind: 'comp' | 'arp' | 'bass' | 'drum';
  pattern: string;
  fill?: string;
  /** Нижняя граница расположения аккорда (MIDI-номер) */
  low?: number;
}

export type Part = MelodyPart | PatternPart;

export interface Section {
  name: string;
  bars: number;
  /** Аккорды по тактам через пробел; «Asus4+A» — два аккорда по полтакта. Запись повторяется по кругу */
  chords: string;
  parts: Part[];
}

export interface Track {
  id: string;
  title: string;
  kind: 'menu' | 'level';
  bpm: number;
  /** Долей в такте (4 — по умолчанию, 3 — вальс) */
  beats?: number;
  sections: Section[];
}

export interface MusicEvent {
  /** Время от начала композиции, с */
  time: number;
  inst: Instrument;
  midi: number;
  /** Длительность, с */
  dur: number;
  /** Сила 0–1 */
  vel: number;
  pan: number;
}

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** «F#4» → 66 (MIDI: до первой октавы C4 — 60) */
export function parseNote(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Нота не разобрана: ${name}`);
  const shift = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + PITCH[m[1]!]! + shift;
}

/** Ступени аккордов в полутонах от основного тона */
const QUALITIES: Record<string, readonly number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim: [0, 3, 6],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  '6': [0, 4, 7, 9],
  '9': [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
};

export interface Chord {
  /** Основной тон: класс высоты 0–11 */
  root: number;
  intervals: readonly number[];
  /** Бас: класс высоты (у «D/F#» — фа-диез) */
  bass: number;
}

function pitchClass(name: string): number {
  const m = /^([A-G])([#b]?)$/.exec(name);
  if (!m) throw new Error(`Тон не разобран: ${name}`);
  return (PITCH[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
}

/** «Bm7», «D/F#», «Asus4» → аккорд */
export function parseChord(name: string): Chord {
  const [main, bass] = name.split('/');
  const m = /^([A-G][#b]?)(.*)$/.exec(main ?? '');
  const intervals = m ? QUALITIES[m[2]!] : undefined;
  if (!m || !intervals) throw new Error(`Аккорд не разобран: ${name}`);
  const root = pitchClass(m[1]!);
  return { root, intervals, bass: bass ? pitchClass(bass) : root };
}

/** Звуки аккорда снизу вверх: основной тон — первый не ниже low */
export function voicing(chord: Chord, low: number): number[] {
  const root = low + ((((chord.root - low) % 12) + 12) % 12);
  return chord.intervals.map((i) => root + i);
}

/** Бас — в большой октаве: от ми до ре-диеза малой (E2…D#3) */
const BASS_LOW = 40;
const COMP_LOW = 55;
const ARP_LOW = 52;

const VELOCITY: Record<string, number> = { x: 0.75, o: 1, g: 0.4 };

/** Аккорды раздела по тактам: у каждого такта — список [доля такта, аккорд] */
function chordGrid(section: Section): [number, Chord][][] {
  const tokens = section.chords.trim().split(/\s+/);
  return Array.from({ length: section.bars }, (_, bar) => {
    const halves = tokens[bar % tokens.length]!.split('+');
    return halves.map((name, i): [number, Chord] => [i / halves.length, parseChord(name)]);
  });
}

function chordAt(grid: [number, Chord][][], bar: number, frac: number): Chord {
  let chord = grid[bar]![0]![1];
  for (const [start, c] of grid[bar]!) if (frac >= start - 1e-9) chord = c;
  return chord;
}

function bassNote(token: string, chord: Chord): number | null {
  const root = BASS_LOW + ((((chord.bass - BASS_LOW) % 12) + 12) % 12);
  const step = (i: number) => {
    const iv = chord.intervals[i] ?? chord.intervals[chord.intervals.length - 1]!;
    // Ступени считаются от основного тона аккорда, даже если в басу другой звук
    const base = BASS_LOW + ((((chord.root - BASS_LOW) % 12) + 12) % 12);
    let n = base + iv;
    while (n < root) n += 12;
    while (n - 12 >= root) n -= 12;
    return n;
  };
  switch (token) {
    case 'R':
      return root;
    case '3':
      return step(1);
    case '5':
      return step(2);
    case '7':
      return chord.intervals.length > 3 ? step(3) : root + 12;
    case '8':
      return root + 12;
    case 'L':
      return step(2) - 12;
    default:
      return null;
  }
}

/** Длительность композиции без хвоста отзвука, с */
export function trackLength(track: Track): number {
  const bar = ((track.beats ?? 4) * 60) / track.bpm;
  return track.sections.reduce((sum, s) => sum + s.bars * bar, 0);
}

/** Длительность мелодии в восьмых — для проверки, что она ровно заполняет раздел */
export function melodyLength(notes: string): number {
  return parseMelody(notes).reduce((sum, n) => sum + n.len, 0);
}

function parseMelody(notes: string): { midi: number | null; len: number; accent: boolean }[] {
  return notes
    .replace(/\|/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const accent = token.endsWith('!');
      const [name, len] = (accent ? token.slice(0, -1) : token).split(':');
      const length = Number(len);
      if (!name || !(length > 0)) throw new Error(`Нота мелодии не разобрана: ${token}`);
      return { midi: name === 'r' ? null : parseNote(name), len: length, accent };
    });
}

/** Разворачивает композицию в ноты по времени */
export function renderTrack(track: Track): MusicEvent[] {
  const beats = track.beats ?? 4;
  const beat = 60 / track.bpm;
  const barLen = beats * beat;
  const events: MusicEvent[] = [];
  let start = 0;
  for (const section of track.sections) {
    const grid = chordGrid(section);
    for (const part of section.parts) {
      const from = part.from ?? 0;
      const until = Math.min(part.until ?? section.bars, section.bars);
      const base = { inst: part.inst, pan: part.pan ?? 0 };
      const vol = part.vol ?? 1;
      if (part.kind === 'melody') {
        let t = start + from * barLen;
        const end = start + until * barLen;
        for (const n of parseMelody(part.notes)) {
          const dur = n.len * (beat / 2);
          if (n.midi !== null && t < end - 1e-9) {
            events.push({
              ...base,
              time: t,
              midi: n.midi + 12 * (part.octave ?? 0),
              dur,
              vel: vol * (n.accent ? 1 : 0.8),
            });
          }
          t += dur;
        }
        continue;
      }
      const bars = part.pattern.split('|').map((b) => b.trim().split(/\s+/));
      // Открытая нота: продлевается «-» (и через черту такта), у аккордов обрывается сменой аккорда
      let open: MusicEvent[] = [];
      let openChord: Chord | null = null;
      for (let bar = from; bar < until; bar++) {
        const isLast = bar === section.bars - 1;
        const tokens =
          isLast && part.fill ? part.fill.trim().split(/\s+/) : bars[(bar - from) % bars.length]!;
        const step = barLen / tokens.length;
        tokens.forEach((token, i) => {
          const frac = i / tokens.length;
          const time = start + bar * barLen + i * step;
          const chord = chordAt(grid, bar, frac);
          if (token === '-') {
            if (part.kind === 'comp' && openChord && chord !== openChord && open.length > 0) {
              // Аккорд сменился посреди долгой ноты: пэд перестраивается на новый аккорд
              const vel = open[0]!.vel;
              open = voicing(chord, part.low ?? COMP_LOW).map((midi) => {
                const e = { ...base, time, midi, dur: step, vel };
                events.push(e);
                return e;
              });
              openChord = chord;
            } else {
              for (const e of open) e.dur += step;
            }
            return;
          }
          open = [];
          openChord = null;
          if (token === '.') return;
          let notes: number[] = [];
          let vel = vol * 0.75;
          if (part.kind === 'comp') {
            notes = voicing(chord, part.low ?? COMP_LOW);
            vel = vol * (VELOCITY[token] ?? 0.75);
          } else if (part.kind === 'drum') {
            notes = [60];
            vel = vol * (VELOCITY[token] ?? 0.75);
          } else if (part.kind === 'arp') {
            const index = Number(token) - 1;
            if (!(index >= 0)) throw new Error(`Шаг арпеджио не разобран: ${token}`);
            const tones = voicing(chord, part.low ?? ARP_LOW);
            notes = [tones[index % tones.length]! + 12 * Math.floor(index / tones.length)];
          } else {
            const n = bassNote(token, chord);
            if (n === null) throw new Error(`Шаг баса не разобран: ${token}`);
            notes = [n];
          }
          openChord = chord;
          open = notes.map((midi) => {
            const e = { ...base, time, midi, dur: step, vel };
            events.push(e);
            return e;
          });
        });
      }
    }
    start += section.bars * barLen;
  }
  return events.sort((a, b) => a.time - b.time);
}
