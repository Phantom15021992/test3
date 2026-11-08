import { describe, expect, it } from 'vitest';
import { pairCode, StepSoundTracker, type ProgressView } from '../../src/audio/stepSounds';
import type { ResolveStep } from '../../src/core/resolve';
import { parseBoard } from '../helpers/parseBoard';

const keys = (cues: { key: string }[]) => cues.map((cue) => cue.key);
const progress = (over: Partial<ProgressView> = {}): ProgressView => ({
  iceLeft: 10,
  iceBroken: 0,
  gold: 0,
  done: 0,
  ...over,
});

describe('звуки по шагам хода', () => {
  it('комбо двух спецфишек звучит своим звуком, а их взрывы в первом ударе — нет', () => {
    const board = parseBoard(`
      - * R1
      G1 B1 R1
    `);
    const tracker = new StepSoundTracker(board);
    const move = { type: 'swap', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } } as const;
    expect(keys(tracker.begin(move))).toEqual(['pair:16.2']);
    expect(keys(tracker.step({ kind: 'swap', a: move.from, b: move.to }))).toEqual([]);
    const first = tracker.step({
      kind: 'clear',
      cells: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
      points: 0,
      pieces: 2,
    });
    expect(keys(first)).toEqual([]);
  });

  it('взрыв спецфишки, задетой в каскаде, звучит её звуком', () => {
    const tracker = new StepSoundTracker(
      parseBoard(`
        X R1
        G1 B1
      `),
    );
    const cues = tracker.step({ kind: 'clear', cells: [{ row: 0, col: 0 }], points: 0, pieces: 1 });
    expect(keys(cues)).toEqual(['megaBomb']);
  });

  it('объединение в ячейку 3 уровня и новая спецфишка', () => {
    const tracker = new StepSoundTracker(parseBoard('R1 R1 R1'));
    const cues = tracker.step({
      kind: 'transform',
      placements: [
        { pos: { row: 0, col: 0 }, cell: { kind: 'tile', color: 0, level: 3 } },
        { pos: { row: 0, col: 1 }, cell: { kind: 'piece', type: 'bomb' } },
      ],
    });
    expect(keys(cues)).toEqual(['match3', 'special']);
  });

  it('снятое звено цепи, открытый сундук и уголь', () => {
    const board = parseBoard('R1 R1');
    board[0]![0] = { kind: 'box', links: 2 };
    board[0]![1] = { kind: 'box' };
    const tracker = new StepSoundTracker(board);
    const cues = tracker.step({
      kind: 'clear',
      cells: [],
      points: 0,
      pieces: 0,
      chests: [
        { pos: { row: 0, col: 0 }, cell: { kind: 'box', links: 1 } },
        { pos: { row: 0, col: 1 }, cell: { kind: 'box', open: true } },
      ],
      coal: [{ top: 1, left: 1, layers: 0 }],
    });
    expect(keys(cues)).toEqual(['chainLink', 'chest', 'coalBroken']);
  });

  it('лёд: удар, а если льдина сломана — звук сломанной; выполненная цель', () => {
    const tracker = new StepSoundTracker(parseBoard('R1'), progress());
    const clear: ResolveStep = { kind: 'clear', cells: [], points: 0, pieces: 0 };
    expect(keys(tracker.step(clear, progress({ iceLeft: 9 })))).toEqual(['iceHit']);
    expect(keys(tracker.step(clear, progress({ iceLeft: 8, iceBroken: 1, done: 1 })))).toEqual([
      'iceBroken',
      'goalDone',
    ]);
  });

  it('у каждой пары спецфишек свой звук, порядок не важен', () => {
    expect(pairCode('rocket', 'megaBomb')).toBe('16.7');
    expect(pairCode('megaBomb', 'rocket')).toBe('16.7');
    expect(pairCode('manipulator', 'bomb')).toBeUndefined();
  });
});
