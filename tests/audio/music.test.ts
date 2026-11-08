import { describe, expect, it } from 'vitest';
import {
  melodyLength,
  parseChord,
  parseNote,
  renderTrack,
  trackLength,
  voicing,
  type Track,
} from '../../src/audio/musicScore';
import { LEVEL_TRACKS, MENU_TRACKS } from '../../src/audio/musicTracks';

const ALL: readonly Track[] = [...MENU_TRACKS, ...LEVEL_TRACKS];

describe('нотная запись', () => {
  it('ноты: до первой октавы — 60, диезы и бемоли', () => {
    expect(parseNote('C4')).toBe(60);
    expect(parseNote('A4')).toBe(69);
    expect(parseNote('F#4')).toBe(66);
    expect(parseNote('Bb3')).toBe(58);
  });

  it('аккорды: ступени, бас после косой черты', () => {
    expect(parseChord('Bm7')).toEqual({ root: 11, intervals: [0, 3, 7, 10], bass: 11 });
    expect(parseChord('D/F#').bass).toBe(6);
    expect(voicing(parseChord('G'), 55)).toEqual([55, 59, 62]);
    expect(() => parseChord('Hm')).toThrow();
  });

  it('ритм: «-» продлевает ноту, бас берёт бас аккорда', () => {
    const track: Track = {
      id: 't',
      title: 't',
      kind: 'menu',
      bpm: 120,
      sections: [
        {
          name: 's',
          bars: 1,
          chords: 'D/F#',
          parts: [{ kind: 'bass', inst: 'bass', pattern: 'R - . 5' }],
        },
      ],
    };
    const events = renderTrack(track);
    expect(events.map((e) => [e.midi, e.time, e.dur])).toEqual([
      [42, 0, 1],
      [45, 1.5, 0.5],
    ]);
  });

  it('пэд перестраивается, когда аккорд сменился посреди долгой ноты', () => {
    const track: Track = {
      id: 't',
      title: 't',
      kind: 'menu',
      bpm: 120,
      sections: [
        {
          name: 's',
          bars: 1,
          chords: 'Asus4+A',
          parts: [{ kind: 'comp', inst: 'strings', pattern: 'x - - -' }],
        },
      ],
    };
    const times = [...new Set(renderTrack(track).map((e) => e.time))];
    expect(times).toEqual([0, 1]);
  });
});

describe('композиции', () => {
  it('в меню три композиции, на уровнях — от 5 до 10', () => {
    expect(MENU_TRACKS).toHaveLength(3);
    expect(LEVEL_TRACKS.length).toBeGreaterThanOrEqual(5);
    expect(LEVEL_TRACKS.length).toBeLessThanOrEqual(10);
    expect(new Set(ALL.map((t) => t.id)).size).toBe(ALL.length);
  });

  it.each(ALL.map((t) => [t.title, t] as const))('«%s» длится от 1 до 3 минут', (_, track) => {
    const length = trackLength(track);
    expect(length).toBeGreaterThanOrEqual(60);
    expect(length).toBeLessThanOrEqual(180);
  });

  it.each(ALL.map((t) => [t.title, t] as const))(
    '«%s»: мелодии ровно заполняют свои разделы',
    (_, track) => {
      const beats = track.beats ?? 4;
      for (const section of track.sections) {
        for (const part of section.parts) {
          if (part.kind !== 'melody') continue;
          const bars = (part.until ?? section.bars) - (part.from ?? 0);
          expect(melodyLength(part.notes), `${section.name}, ${part.inst}`).toBe(bars * beats * 2);
        }
      }
    },
  );

  it.each(ALL.map((t) => [t.title, t] as const))(
    '«%s» разворачивается в ноты внутри композиции',
    (_, track) => {
      const events = renderTrack(track);
      const length = trackLength(track);
      expect(events.length).toBeGreaterThan(100);
      for (const e of events) {
        expect(e.time).toBeGreaterThanOrEqual(0);
        expect(e.time).toBeLessThan(length);
        expect(e.dur).toBeGreaterThan(0);
        expect(e.vel).toBeGreaterThan(0);
        expect(e.vel).toBeLessThanOrEqual(1);
        // Без высоких: ничего выше до третьей октавы
        expect(e.midi).toBeLessThanOrEqual(84);
        expect(e.midi).toBeGreaterThanOrEqual(28);
      }
    },
  );

  it('хрустальный звон — только редкие украшения', () => {
    for (const track of ALL) {
      const events = renderTrack(track);
      const bells = events.filter((e) => e.inst === 'bell').length;
      expect(bells, track.title).toBeLessThanOrEqual(4);
    }
  });
});
