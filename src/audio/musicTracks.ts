import type { Instrument, MelodyPart, Part, PatternPart, Section, Track } from './musicScore';

// Композиции игры. Общая тема — «пещера с самоцветами»: тёплые живые инструменты (фортепиано, арфа,
// гитара, флейта, виолончель, струнные), мелодии в средних октавах, хрустальный звон — лишь изредка.
// Все композиции связаны одним мотивом: «ля — ре — ми — фа-диез» (пятая ступень и подъём к третьей),
// он звучит в каждой в своей тональности и своём ритме.
// Меню — спокойно, 1–3 минуты; уровни — живее, с ударными, в той же манере.

const mel = (inst: Instrument, notes: string, opts: Partial<MelodyPart> = {}): MelodyPart => ({
  kind: 'melody',
  inst,
  notes,
  ...opts,
});
const pat = (
  kind: PatternPart['kind'],
  inst: Instrument,
  pattern: string,
  opts: Partial<PatternPart> = {},
): PatternPart => ({ kind, inst, pattern, ...opts });

const pad = (opts: Partial<PatternPart> = {}) => pat('comp', 'strings', 'x', { vol: 0.6, ...opts });
const bassWhole = (opts: Partial<PatternPart> = {}) =>
  pat('bass', 'bass', 'R - - - - - - -', { vol: 0.7, ...opts });

// --- Меню --------------------------------------------------------------------------------------

/** Тема игры: на ней построены все композиции */
const THEME_D = `A4:2 D5:2 E5:2 F#5:2 | E5:4 C#5:2 A4:2 | B4:3 C#5:1 D5:2 F#5:2 | E5:6 r:2 |
  A4:2 D5:2 E5:2 F#5:2 | G5:3 F#5:1 E5:2 D5:2 | B4:2 D5:2 E5:2 D5:2 | C#5:4 A4:4`;

const QUIET_CAVE: Track = {
  id: 'menu-cave',
  title: 'Тихая пещера',
  kind: 'menu',
  bpm: 72,
  sections: [
    {
      name: 'вступление',
      bars: 4,
      chords: 'Dmaj7 Gmaj7 Dmaj7 Gmaj7',
      parts: [
        pad({ vol: 0.8 }),
        pat('arp', 'harp', '1 2 3 4 5 4 3 2', { vol: 0.7, pan: -0.3 }),
        mel('bell', 'F#5:8 r:24', { vol: 0.5, pan: 0.3 }),
      ],
    },
    {
      name: 'тема',
      bars: 8,
      chords: 'D A/C# Bm7 Gmaj7 D/F# Em7 Gmaj7 A',
      parts: [
        mel('piano', THEME_D, { vol: 0.9 }),
        pat('arp', 'harp', '1 2 3 4 5 4 3 2', { vol: 0.45, pan: -0.3 }),
        pad(),
        pat('bass', 'bass', 'R - - - 5 - - -', { vol: 0.7 }),
      ],
    },
    {
      name: 'вторая тема',
      bars: 8,
      chords: 'Bm Gmaj7 D A Bm Gmaj7 Em7 Asus4+A',
      parts: [
        mel(
          'flute',
          `F#5:3 E5:1 D5:2 B4:2 | D5:2 E5:2 F#5:4 | F#5:2 E5:2 D5:2 A4:2 | C#5:6 r:2 |
           B4:2 D5:2 F#5:3 E5:1 | D5:2 B4:2 G4:2 B4:2 | E5:3 D5:1 B4:2 G4:2 | D5:4 C#5:4`,
          { vol: 0.9, pan: 0.15 },
        ),
        pat('comp', 'piano', 'g - - - g - - -', { vol: 0.7, pan: -0.2 }),
        pad(),
        pat('bass', 'bass', 'R - - - 5 - - -', { vol: 0.7 }),
      ],
    },
    {
      name: 'тема на флейте',
      bars: 8,
      chords: 'D A/C# Bm7 Gmaj7 D/F# Em7 Gmaj7 A',
      parts: [
        mel('flute', THEME_D, { vol: 0.85, pan: 0.15 }),
        mel('cello', 'D4:8 C#4:8 B3:8 G3:8 F#3:8 E3:8 G3:8 A3:8', { vol: 0.55, pan: -0.2 }),
        pat('arp', 'piano', '1 3 2 3 4 3 2 3', { vol: 0.4, pan: -0.3 }),
        pad({ vol: 0.5 }),
        bassWhole(),
      ],
    },
    {
      name: 'окончание',
      bars: 6,
      chords: 'Gmaj7 D/F# Em7 Asus4+A Dmaj7 Dmaj7',
      parts: [
        mel('piano', 'B4:4 A4:4 | F#4:8 | G4:4 E4:4 | D5:4 C#5:4 | D5:8 | r:8', { vol: 0.85 }),
        pat('arp', 'harp', '1 2 3 4 5 . . .', { vol: 0.5, pan: -0.3, until: 5 }),
        pad(),
        bassWhole({ until: 5 }),
        mel('bell', 'r:32 A5:8 r:8', { vol: 0.4, pan: 0.3 }),
      ],
    },
  ],
};

const MOON_GUITAR = '1 2 3 4 3 2 3 4';
const MOON_CELLO = `F#4:3 E4:1 D4:2 B3:2 | D4:2 E4:2 F#4:2 G4:2 | A4:4 F#4:4 | E4:6 r:2 |
  F#4:3 E4:1 D4:2 B3:2 | D4:2 E4:2 G4:2 B4:2 | A4:3 G4:1 F#4:2 E4:2 | F#4:4 A#3:2 C#4:2`;
const MOON_A = 'Bm G D A Bm G Em F#7';

const MOONLIGHT: Track = {
  id: 'menu-moon',
  title: 'Лунный свет',
  kind: 'menu',
  bpm: 80,
  sections: [
    {
      name: 'вступление',
      bars: 4,
      chords: 'Bm Gmaj7 Bm Gmaj7',
      parts: [
        pat('arp', 'guitar', MOON_GUITAR, { vol: 0.75, pan: -0.2, low: 50 }),
        bassWhole({ from: 2 }),
      ],
    },
    {
      name: 'тема на виолончели',
      bars: 8,
      chords: MOON_A,
      parts: [
        mel('cello', MOON_CELLO, { vol: 0.9 }),
        pat('arp', 'guitar', MOON_GUITAR, { vol: 0.65, pan: -0.2, low: 50 }),
        pad({ vol: 0.45 }),
        pat('bass', 'bass', 'R - - - 5 - - -', { vol: 0.7 }),
      ],
    },
    {
      name: 'флейта',
      bars: 8,
      chords: 'Em G D A Em G Bm/F# F#7',
      parts: [
        mel(
          'flute',
          `B4:2 G4:2 E4:2 G4:2 | B4:2 D5:2 B4:2 A4:2 | F#4:3 A4:1 D5:4 | C#5:4 E5:2 C#5:2 |
           B4:2 G4:2 E4:2 G4:2 | D5:3 C#5:1 B4:2 G4:2 | F#4:2 B4:2 D5:2 C#5:2 | A#4:4 F#4:4`,
          { vol: 0.85, pan: 0.15 },
        ),
        pat('arp', 'guitar', MOON_GUITAR, { vol: 0.65, pan: -0.2, low: 50 }),
        pad({ vol: 0.45 }),
        pat('bass', 'bass', 'R - - - 5 - - -', { vol: 0.7 }),
        pat('drum', 'shaker', 'g . x . g . x .', { vol: 0.4, pan: 0.3 }),
      ],
    },
    {
      name: 'тема вдвоём',
      bars: 8,
      chords: MOON_A,
      parts: [
        mel('flute', MOON_CELLO, { vol: 0.7, octave: 1, pan: 0.15 }),
        mel('cello', MOON_CELLO, { vol: 0.55, pan: -0.15 }),
        pat('arp', 'guitar', MOON_GUITAR, { vol: 0.6, pan: -0.2, low: 50 }),
        pad({ vol: 0.45 }),
        pat('bass', 'bass', 'R - - - 5 - - -', { vol: 0.7 }),
        pat('drum', 'shaker', 'g . x . g . x .', { vol: 0.4, pan: 0.3 }),
      ],
    },
    {
      name: 'просвет',
      bars: 8,
      chords: 'D A/C# Bm Bm/A G D/F# Em F#7',
      parts: [
        mel(
          'piano',
          `A4:2 D5:2 E5:2 F#5:2 | E5:4 C#5:2 A4:2 | B4:3 C#5:1 D5:2 F#5:2 | F#5:2 E5:2 D5:4 |
           G4:2 B4:2 D5:2 B4:2 | A4:3 F#4:1 D4:4 | E4:2 G4:2 B4:2 D5:2 | C#5:4 A#4:4`,
          { vol: 0.9 },
        ),
        pat('arp', 'harp', '1 2 3 4 5 4 3 2', { vol: 0.4, pan: 0.3 }),
        pad({ vol: 0.55 }),
        bassWhole(),
      ],
    },
    {
      name: 'тема',
      bars: 8,
      chords: MOON_A,
      parts: [
        mel('cello', MOON_CELLO, { vol: 0.9 }),
        pat('arp', 'guitar', MOON_GUITAR, { vol: 0.65, pan: -0.2, low: 50 }),
        pad({ vol: 0.45 }),
        pat('bass', 'bass', 'R - - - 5 - - -', { vol: 0.7 }),
      ],
    },
    {
      name: 'окончание',
      bars: 4,
      chords: 'Bm G Em Bm',
      parts: [
        mel('cello', 'F#4:8 | D4:8 | G4:4 E4:4 | B3:8', { vol: 0.8 }),
        pat('arp', 'guitar', MOON_GUITAR, { vol: 0.55, pan: -0.2, low: 50, until: 3 }),
        pad({ vol: 0.5 }),
        bassWhole(),
        mel('bell', 'r:24 F#5:8', { vol: 0.35, pan: 0.3 }),
      ],
    },
  ],
};

const VALLEY_A = 'G D/F# Em C G/B Am7 D D7 G D/F# Em C Am7 D7 G G';
const VALLEY_THEME = `D5:4 B4:2 | A4:4 F#4:2 | G4:2 B4:2 E5:2 | E5:4 D5:2 | D5:2 B4:2 G4:2 | C5:4 A4:2 |
  F#4:2 A4:2 D5:2 | C5:6 |
  D5:4 B4:2 | A4:4 F#4:2 | G4:2 B4:2 E5:2 | G5:4 E5:2 | C5:2 E5:2 A4:2 | F#4:3 A4:1 C5:2 | B4:6 | r:6`;
const VALLEY_B = `B4:4 G4:2 | F#4:4 D4:2 | E4:2 G4:2 C5:2 | B4:4 G4:2 | A4:2 C5:2 E5:2 | D5:2 B4:2 G4:2 |
  C5:3 B4:1 A4:2 | A4:2 F#4:2 D#4:2 |
  B4:4 G4:2 | F#4:4 D4:2 | E4:2 G4:2 C5:2 | B4:4 G4:2 | A4:2 C5:2 E5:2 | D5:2 B4:2 G4:2 |
  C5:3 B4:1 A4:2 | F#4:2 A4:2 C5:2`;

/** Вальс: такт на три счёта, «умпа-па» — бас на первую долю, аккорд на вторую и третью */
const VALLEY_MORNING: Track = {
  id: 'menu-valley',
  title: 'Утро в долине',
  kind: 'menu',
  bpm: 96,
  beats: 3,
  sections: [
    {
      name: 'вступление',
      bars: 4,
      chords: 'G Cmaj7 G D',
      parts: [pat('arp', 'harp', '1 2 3 4 3 2', { vol: 0.6, pan: -0.3 }), pad({ vol: 0.6 })],
    },
    {
      name: 'вальс',
      bars: 16,
      chords: VALLEY_A,
      parts: [
        mel('piano', VALLEY_THEME, { vol: 0.9 }),
        pat('bass', 'bass', 'R . .', { vol: 0.7 }),
        pat('comp', 'guitar', '. g g', { vol: 0.8, pan: -0.25 }),
        pad({ vol: 0.35 }),
      ],
    },
    {
      name: 'в миноре',
      bars: 16,
      chords: 'Em Bm C G Am Em Am B7 Em Bm C G Am Em Am D7',
      parts: [
        mel('flute', VALLEY_B, { vol: 0.85, pan: 0.15 }),
        pat('arp', 'harp', '1 2 3 4 3 2', { vol: 0.5, pan: -0.3 }),
        pat('bass', 'bass', 'R . .', { vol: 0.7 }),
        pad({ vol: 0.45 }),
      ],
    },
    {
      name: 'просвет',
      bars: 8,
      chords: 'C G/B Am G C D Em D',
      parts: [
        mel(
          'piano',
          'E5:4 D5:2 | D5:4 B4:2 | C5:4 A4:2 | B4:6 | E5:4 D5:2 | D5:2 C5:2 A4:2 | E5:4 B4:2 | D5:2 C5:2 A4:2',
          { vol: 0.85 },
        ),
        mel('bell', 'E5:6 r:18 E5:6 r:18', { vol: 0.3, pan: 0.35 }),
        pat('arp', 'harp', '1 2 3 4 3 2', { vol: 0.5, pan: -0.3 }),
        pad({ vol: 0.55 }),
        pat('bass', 'bass', 'R - -', { vol: 0.65 }),
      ],
    },
    {
      name: 'вальс на флейте',
      bars: 16,
      chords: VALLEY_A,
      parts: [
        mel('flute', VALLEY_THEME, { vol: 0.85, pan: 0.15 }),
        pat('arp', 'piano', '1 2 3 2 3 2', { vol: 0.35, pan: -0.2 }),
        pat('bass', 'bass', 'R . .', { vol: 0.7 }),
        pat('comp', 'guitar', '. g g', { vol: 0.7, pan: -0.25 }),
        pad({ vol: 0.4 }),
      ],
    },
    {
      name: 'окончание',
      bars: 4,
      chords: 'C D G G',
      parts: [
        mel('piano', 'E5:4 D5:2 | F#4:4 A4:2 | G4:6 | r:6', { vol: 0.85 }),
        pat('arp', 'harp', '1 2 3 4 5 6', { vol: 0.5, pan: -0.3, until: 3 }),
        pad({ vol: 0.55 }),
        pat('bass', 'bass', 'R - -', { vol: 0.65 }),
      ],
    },
  ],
};

// --- Уровни ------------------------------------------------------------------------------------

interface LevelSpec {
  id: string;
  title: string;
  bpm: number;
  /** Аккорды темы — 4 такта, повторяются */
  chordsA: string;
  /** Аккорды второй темы — 8 тактов */
  chordsB: string;
  /** Тоника для последнего такта */
  tonic: string;
  /** Последняя нота мелодии */
  final: string;
  melodyA: string;
  melodyB: string;
  leadA: Instrument;
  leadB: Instrument;
  comp: { inst: Instrument; pattern: string; low?: number };
  bass: string;
  ostinato: { inst: Instrument; pattern: string };
  drums: { kick: string; snare: string; hat: string; tom?: string; snareInst?: Instrument };
  /** Октава темы у виолончели в затишье (по умолчанию на октаву ниже) */
  breakOctave?: number;
  /** Октава второго голоса в теме во всю силу: фортепиано — ниже, флейта — в унисон */
  doubleOctave?: number;
}

const FILL = 'g . g . x . x . x x x x o o o o';

/**
 * Композиция уровня из общей схемы: вступление → тема → вторая тема → тема у другого инструмента →
 * затишье (без бочки, тема у виолончели) → вторая тема → тема во всю силу → окончание. 56 тактов
 */
function levelTrack(spec: LevelSpec): Track {
  const { drums } = spec;
  const beat = (opts: { fill?: boolean; until?: number } = {}): Part[] => {
    const parts: Part[] = [
      pat('drum', 'kick', drums.kick, { vol: 0.8, until: opts.until }),
      pat('drum', drums.snareInst ?? 'snare', drums.snare, {
        vol: 0.6,
        until: opts.until,
        fill: opts.fill ? FILL : undefined,
      }),
      pat('drum', 'hat', drums.hat, { vol: 0.45, pan: 0.2, until: opts.until }),
    ];
    if (drums.tom)
      parts.push(pat('drum', 'tom', drums.tom, { vol: 0.55, pan: -0.15, until: opts.until }));
    return parts;
  };
  const comp = (opts: Partial<PatternPart> = {}) =>
    pat('comp', spec.comp.inst, spec.comp.pattern, {
      vol: 0.5,
      pan: -0.25,
      low: spec.comp.low,
      ...opts,
    });
  const bass = (opts: Partial<PatternPart> = {}) =>
    pat('bass', 'bass', spec.bass, { vol: 0.8, ...opts });
  const ostinato = (opts: Partial<PatternPart> = {}) =>
    pat('arp', spec.ostinato.inst, spec.ostinato.pattern, { vol: 0.4, pan: 0.3, ...opts });
  const a = spec.chordsA.trim().split(/\s+/);
  const sections: Section[] = [
    {
      name: 'вступление',
      bars: 4,
      chords: spec.chordsA,
      parts: [
        ostinato({ vol: 0.55 }),
        pat('drum', 'kick', drums.kick, { vol: 0.7, from: 1 }),
        pat('drum', 'hat', drums.hat, { vol: 0.4, pan: 0.2 }),
        pat('drum', drums.snareInst ?? 'snare', '. . . . . . . .', { vol: 0.6, fill: FILL }),
        bass({ from: 2 }),
      ],
    },
    {
      name: 'тема',
      bars: 8,
      chords: spec.chordsA,
      parts: [
        mel(spec.leadA, spec.melodyA, { vol: 0.9 }),
        comp(),
        bass(),
        ostinato({ vol: 0.3 }),
        ...beat(),
      ],
    },
    {
      name: 'вторая тема',
      bars: 8,
      chords: spec.chordsB,
      parts: [
        mel(spec.leadB, spec.melodyB, { vol: 0.85, pan: 0.1 }),
        comp(),
        bass(),
        pad({ vol: 0.45 }),
        ...beat({ fill: true }),
      ],
    },
    {
      name: 'тема у другого инструмента',
      bars: 8,
      chords: spec.chordsA,
      parts: [
        mel(spec.leadB, spec.melodyA, { vol: 0.85, pan: 0.1 }),
        comp(),
        bass(),
        ostinato({ vol: 0.35 }),
        pad({ vol: 0.4 }),
        ...beat(),
      ],
    },
    {
      name: 'затишье',
      bars: 8,
      chords: spec.chordsB,
      parts: [
        mel('cello', spec.melodyA, { vol: 0.6, octave: spec.breakOctave ?? -1 }),
        ostinato({ vol: 0.55 }),
        pad({ vol: 0.55 }),
        bassWhole({ vol: 0.6 }),
        pat('drum', 'shaker', 'g . x . g . x .', { vol: 0.5, pan: 0.3 }),
        pat('drum', 'snare', '. . . . . . . .', { vol: 0.6, from: 7, fill: FILL }),
      ],
    },
    {
      name: 'вторая тема',
      bars: 8,
      chords: spec.chordsB,
      parts: [
        mel(spec.leadA, spec.melodyB, { vol: 0.9 }),
        comp(),
        bass(),
        ostinato({ vol: 0.3 }),
        pad({ vol: 0.4 }),
        ...beat(),
      ],
    },
    {
      name: 'тема во всю силу',
      bars: 8,
      chords: spec.chordsA,
      parts: [
        mel(spec.leadA, spec.melodyA, { vol: 0.85 }),
        mel(spec.leadB, spec.melodyA, {
          vol: 0.5,
          octave: spec.doubleOctave ?? (spec.leadB === 'piano' ? -1 : 0),
          pan: 0.15,
        }),
        comp(),
        bass(),
        ostinato({ vol: 0.35 }),
        pad({ vol: 0.45 }),
        ...beat({ fill: true }),
      ],
    },
    {
      name: 'окончание',
      bars: 4,
      chords: `${a[0]} ${a[1]} ${a[2]} ${spec.tonic}`,
      parts: [
        ostinato({ vol: 0.5, until: 3 }),
        comp({ until: 3 }),
        bass({ until: 3 }),
        pat('bass', 'bass', 'R - - - - - - -', { vol: 0.8, from: 3 }),
        pad({ vol: 0.5 }),
        ...beat({ until: 3 }),
        pat('drum', 'kick', 'o . . . . . . .', { vol: 0.8, from: 3 }),
        mel(spec.leadA, `r:24 ${spec.final}:8`, { vol: 0.85 }),
        mel('bell', `r:24 ${spec.final}:8`, { vol: 0.3, pan: 0.3 }),
      ],
    },
  ];
  return { id: spec.id, title: spec.title, kind: 'level', bpm: spec.bpm, sections };
}

const SPARKS = levelTrack({
  id: 'level-sparks',
  title: 'Искры',
  bpm: 120,
  chordsA: 'D Bm G A',
  chordsB: 'G A F#m Bm G A Bm A',
  tonic: 'D',
  final: 'D5',
  melodyA: `A4:1 D5:1 E5:1 F#5:1 E5:2 D5:2 | F#5:2 E5:1 D5:1 B4:4 | B4:1 D5:1 E5:1 G5:1 F#5:2 E5:2 |
    C#5:4 A4:2 r:2 | A4:1 D5:1 E5:1 F#5:1 E5:2 F#5:2 | D5:2 B4:2 F#4:2 B4:2 |
    G4:1 B4:1 D5:1 E5:1 D5:2 B4:2 | C#5:2 E5:2 A4:4`,
  melodyB: `B4:3 A4:1 G4:2 B4:2 | C#5:3 B4:1 A4:2 C#5:2 | A4:2 C#5:2 F#5:2 E5:2 | D5:6 r:2 |
    B4:2 D5:2 G5:2 F#5:1 E5:1 | E5:3 D5:1 C#5:2 A4:2 | B4:2 D5:2 C#5:2 B4:2 | A4:6 r:2`,
  leadA: 'piano',
  leadB: 'flute',
  comp: { inst: 'guitar', pattern: 'x . x x . x x .', low: 52 },
  bass: 'R . R 5 . 8 R .',
  ostinato: { inst: 'harp', pattern: '1 3 5 3 2 4 3 5' },
  drums: {
    kick: 'x . . . x . . x | x . . . x . . .',
    snare: '. . x . . . x .',
    hat: 'x g x g x g x g',
  },
});

const UNDERGROUND_RIVER = levelTrack({
  id: 'level-river',
  title: 'Подземная река',
  bpm: 116,
  chordsA: 'Em C G D',
  chordsB: 'Am Em C D Am Em B7 B7',
  tonic: 'Em',
  final: 'E5',
  melodyA: `B4:2 E5:2 D5:1 B4:1 G4:2 | G4:1 A4:1 B4:2 C5:2 B4:2 | D5:2 B4:2 G4:2 A4:2 | F#4:4 r:2 A4:2 |
    B4:2 E5:2 F#5:1 E5:1 D5:2 | C5:2 E5:2 D5:1 C5:1 B4:2 | B4:2 G4:2 D5:2 B4:2 | A4:6 r:2`,
  melodyB: `C5:3 B4:1 A4:2 E4:2 | G4:2 B4:2 E5:4 | E5:2 D5:2 C5:2 G4:2 | A4:2 D5:2 F#4:4 |
    A4:1 C5:1 E5:2 D5:2 C5:2 | B4:2 G4:2 E4:4 | F#4:2 A4:2 B4:2 D#5:2 | D#5:4 B4:4`,
  leadA: 'flute',
  leadB: 'piano',
  comp: { inst: 'guitar', pattern: 'x . . x . . x .', low: 52 },
  bass: 'R . . R . . 5 .',
  ostinato: { inst: 'harp', pattern: '1 5 3 5 2 5 3 5' },
  drums: {
    kick: 'x . . x . . x .',
    snare: '. . x . . . x .',
    snareInst: 'rim',
    hat: 'x x x x x x x x',
  },
});

const SHINING_PATH = levelTrack({
  id: 'level-path',
  title: 'Сверкающий путь',
  bpm: 124,
  chordsA: 'G D/F# Em7 Cmaj7',
  chordsB: 'Am7 D Bm7 Em7 Am7 D Cmaj7 D',
  tonic: 'G',
  final: 'G4',
  melodyA: `D5:1 B4:1 G4:1 B4:1 D5:2 E5:2 | D5:3 A4:1 F#4:2 A4:2 | G4:1 B4:1 D5:1 E5:1 D5:2 B4:2 |
    C5:2 B4:2 G4:4 | D5:1 B4:1 G4:1 B4:1 D5:2 E5:2 | F#5:2 E5:1 D5:1 A4:4 |
    E5:2 D5:2 B4:2 D5:2 | E5:4 D5:2 r:2`,
  melodyB: `A4:2 C5:2 E5:2 C5:2 | D5:2 F#4:2 A4:2 D5:2 | D5:2 B4:2 F#4:2 A4:2 | G4:6 r:2 |
    E5:2 D5:2 C5:2 A4:2 | F#4:2 A4:2 D5:2 F#5:2 | E5:4 B4:4 | A4:4 F#4:4`,
  leadA: 'flute',
  leadB: 'piano',
  comp: { inst: 'piano', pattern: 'x . . x . . x .' },
  bass: 'R . . R . R 5 .',
  ostinato: { inst: 'harp', pattern: '1 2 3 4 5 4 3 2' },
  drums: {
    kick: 'x . . . x . . .',
    snare: '. . x . . . x .',
    hat: 'g x g x g x g x',
  },
});

const STONE_RHYTHM = levelTrack({
  id: 'level-stone',
  title: 'Каменный ритм',
  bpm: 112,
  chordsA: 'Am F C G',
  chordsB: 'Dm Am F E Dm Am F E7',
  tonic: 'Am',
  final: 'A3',
  melodyA: `A3:2 C4:2 E4:2 A4:2 | A4:3 G4:1 F4:2 C4:2 | G4:3 E4:1 C4:4 | B3:2 D4:2 G4:4 |
    A4:3 B4:1 C5:2 A4:2 | F4:2 A4:2 C5:4 | G4:2 E4:2 C4:2 E4:2 | D4:6 r:2`,
  melodyB: `D5:2 F5:2 A4:2 D5:2 | C5:2 E5:2 A4:4 | A4:2 C5:2 F5:2 E5:2 | G#4:4 B4:4 |
    D5:2 F5:2 E5:2 D5:2 | C5:2 B4:2 A4:4 | A4:2 C5:2 D5:2 E5:2 | B4:2 G#4:2 E4:4`,
  leadA: 'cello',
  leadB: 'flute',
  comp: { inst: 'guitar', pattern: 'x . x . x . x .', low: 52 },
  bass: 'R . . R . . R .',
  ostinato: { inst: 'marimba', pattern: '1 2 3 2 1 2 3 4' },
  drums: {
    kick: 'x . . . . . . .',
    snare: '. . . . x . . .',
    hat: 'g x g x g x g x',
    tom: 'x . . x . . x .',
  },
  breakOctave: 0,
  doubleOctave: 1,
});

const CRYSTAL_WIND = levelTrack({
  id: 'level-wind',
  title: 'Хрустальный ветер',
  bpm: 126,
  chordsA: 'Bm G D A',
  chordsB: 'G D/F# Em Bm G D Em F#',
  tonic: 'Bm',
  final: 'B4',
  melodyA: `B4:1 C#5:1 D5:1 F#5:1 E5:2 D5:2 | B4:2 D5:1 E5:1 D5:2 B4:2 | A4:1 B4:1 D5:1 E5:1 F#5:2 E5:2 |
    C#5:4 r:2 A4:2 | B4:1 C#5:1 D5:1 F#5:1 E5:2 D5:2 | G5:2 F#5:2 E5:2 D5:2 |
    F#5:2 E5:1 D5:1 E5:2 A4:2 | C#5:6 r:2`,
  melodyB: `D5:3 B4:1 G4:2 B4:2 | A4:3 F#4:1 D4:2 F#4:2 | G4:2 B4:2 E5:2 D5:2 | B4:6 r:2 |
    D5:2 E5:2 F#5:2 G5:2 | F#5:3 E5:1 D5:4 | E5:2 D5:2 B4:2 G4:2 | A#4:4 C#5:4`,
  leadA: 'flute',
  leadB: 'piano',
  comp: { inst: 'guitar', pattern: 'x . x x . x . x x . x . x x . x', low: 52 },
  bass: 'R . 8 . R . 8 5',
  ostinato: { inst: 'harp', pattern: '1 3 5 3 1 3 5 3' },
  drums: {
    kick: 'x . . x . . x . | x . . x . . . .',
    snare: '. . x . . . x .',
    hat: 'x g x g x g x g x g x g x g x g',
  },
});

const FINAL_GLEAM = levelTrack({
  id: 'level-gleam',
  title: 'Последний блеск',
  bpm: 118,
  chordsA: 'A E/G# F#m D',
  chordsB: 'D E C#m F#m D E Bm7 E',
  tonic: 'A',
  final: 'A4',
  melodyA: `E4:1 A4:1 B4:1 C#5:1 B4:2 A4:2 | B4:4 G#4:2 E4:2 | F#4:1 A4:1 C#5:1 E5:1 D5:2 C#5:2 |
    A4:6 r:2 | E4:1 A4:1 B4:1 C#5:1 E5:2 C#5:2 | D5:2 B4:2 G#4:2 B4:2 | A4:2 C#5:2 F#5:2 E5:2 |
    D5:4 A4:4`,
  melodyB: `F#4:2 A4:2 D5:2 C#5:2 | B4:2 G#4:2 E4:4 | E4:2 G#4:2 C#5:2 E5:2 | C#5:6 r:2 |
    D5:2 E5:2 F#5:2 D5:2 | E5:3 D5:1 B4:4 | D5:2 C#5:2 B4:2 A4:2 | G#4:6 r:2`,
  leadA: 'piano',
  leadB: 'flute',
  comp: { inst: 'guitar', pattern: 'x . x . x . x .', low: 52 },
  bass: 'R . R . 5 . R 8',
  ostinato: { inst: 'harp', pattern: '1 2 3 4 3 2 3 4' },
  drums: {
    kick: 'x . . . x . . .',
    snare: '. . x . . . x .',
    hat: 'x g x g x g x g',
  },
});

export const MENU_TRACKS: readonly Track[] = [QUIET_CAVE, MOONLIGHT, VALLEY_MORNING];
export const LEVEL_TRACKS: readonly Track[] = [
  SPARKS,
  UNDERGROUND_RIVER,
  SHINING_PATH,
  STONE_RHYTHM,
  CRYSTAL_WIND,
  FINAL_GLEAM,
];
