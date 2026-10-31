import { floorOf, parseLevel, type Level } from '../core/level';

// Уровни лежат в JSON по папкам этажей: floor01/01.json, floor01/02.json… Номер этажа и уровня
// на нём берутся из id: 1–10 — первый этаж, 11–20 — второй.
const files = import.meta.glob<{ default: unknown }>('./floor*/*.json', { eager: true });

export const LEVELS: readonly Level[] = Object.keys(files)
  .sort()
  .map((path) => parseLevel(files[path]!.default));

/** Уровни по этажам: FLOORS[0] — первый этаж */
export const FLOORS: readonly (readonly Level[])[] = LEVELS.reduce<Level[][]>((floors, level) => {
  (floors[floorOf(level.id) - 1] ??= []).push(level);
  return floors;
}, []);

export function levelAfter(id: number): Level | undefined {
  return LEVELS[LEVELS.findIndex((level) => level.id === id) + 1];
}
