import { parseLevel, type Level } from '../core/level';

// Уровни лежат в JSON рядом с этим файлом: 01.json, 02.json… Порядок — по номеру в имени.
const files = import.meta.glob<{ default: unknown }>('./*.json', { eager: true });

export const CHAPTER_ONE: readonly Level[] = Object.keys(files)
  .sort()
  .map((path) => parseLevel(files[path]!.default));

export function levelAfter(id: number): Level | undefined {
  return CHAPTER_ONE[CHAPTER_ONE.findIndex((level) => level.id === id) + 1];
}
