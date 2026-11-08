import { SOUND_CATALOG, type SoundEntry } from './soundCatalog';
import type { SoundCue, SoundKey } from './stepSounds';
import { Synth } from './synth';

// Звуки игры: каждому событию — вариант, выбранный владельцем в лаборатории (поле chosen в каталоге).
// Звук создаётся при первом звуке после нажатия игрока: браузер не даёт играть до действия человека.
// Выключатель звука хранится в localStorage; доступ к нему обёрнут в try/catch, как и весь прогресс.

/** Событие → строка каталога: номер действия (или код комбо 16.x) */
const CATALOG_IDS: Record<Exclude<SoundKey, `pair:${string}`>, number> = {
  select: 1,
  swap: 2,
  invalid: 3,
  land: 4,
  match2: 5,
  match3: 6,
  combo: 7,
  shuffle: 8,
  hint: 9,
  special: 10,
  rocket: 11,
  bomb: 12,
  megaBomb: 13,
  rainbow: 14,
  manipulator: 15,
  buy: 17,
  iceHit: 18,
  iceBroken: 19,
  chainLink: 20,
  chest: 21,
  gold: 22,
  crown: 23,
  coalLayer: 24,
  coalBroken: 25,
  stone: 26,
  goalDone: 27,
  star: 28,
  lose: 29,
  gameOver: 30,
  button: 31,
  lastMoves: 32,
};

/** Один и тот же звук чаще не повторяется: в каскадах события идут пачками */
const SAME_SOUND_GAP_MS = 60;
const MUTE_KEY = 'match3.soundOff';

function entryFor(key: SoundKey): SoundEntry | undefined {
  if (key.startsWith('pair:')) {
    const code = key.slice('pair:'.length);
    return SOUND_CATALOG.find((entry) => entry.code === code);
  }
  const id = CATALOG_IDS[key as keyof typeof CATALOG_IDS];
  return SOUND_CATALOG.find((entry) => entry.id === id && entry.code === undefined);
}

let synth: Synth | null = null;
const lastPlayed = new Map<SoundKey, number>();
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isSoundOn(): boolean {
  return !muted;
}

export function setSoundOn(on: boolean): void {
  muted = !on;
  try {
    localStorage.setItem(MUTE_KEY, on ? '0' : '1');
  } catch {
    // Без хранилища выключатель работает до перезагрузки
  }
}

function getSynth(): Synth | null {
  if (typeof AudioContext === 'undefined') return null;
  synth ??= new Synth();
  if (synth.ctx.state === 'suspended') void synth.ctx.resume();
  return synth;
}

export function playSound(key: SoundKey, step = 1): void {
  if (muted) return;
  const entry = entryFor(key);
  if (!entry || entry.chosen === undefined) return;
  const now = performance.now();
  if (now - (lastPlayed.get(key) ?? -Infinity) < SAME_SOUND_GAP_MS) return;
  lastPlayed.set(key, now);
  const s = getSynth();
  if (!s) return;
  entry.variants[entry.chosen]?.(s, step);
}

export function playCues(cues: readonly SoundCue[]): void {
  for (const cue of cues) playSound(cue.key, cue.step);
}

/** Звёзды за уровень — по одной, с паузой, тон растёт от звезды к звезде */
export function playStars(
  count: number,
  schedule: (delayMs: number, fn: () => void) => void,
): void {
  for (let i = 1; i <= count; i++) schedule(STAR_GAP_MS * i, () => playSound('star', i));
}

const STAR_GAP_MS = 380;
