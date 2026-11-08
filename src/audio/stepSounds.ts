import {
  cloneBoard,
  getCell,
  isPiece,
  isTile,
  setCell,
  type Board,
  type PieceType,
} from '../core/board';
import type { Move, ResolveStep } from '../core/resolve';

// Какие звуки играть по шагам разбора хода. Шаги не говорят, какая спецфишка сработала, — только какие
// клетки очищены, — поэтому здесь своя копия поля: она меняется вместе с анимацией, и по ней видно,
// что было в очищенных клетках. Без Phaser и Web Audio: решение «какой звук» проверяется тестами,
// а играет звуки gameSounds.ts.

/** Звуки игры — каждому соответствует выбранный в лаборатории вариант (gameSounds.ts) */
export type SoundKey =
  | 'select'
  | 'swap'
  | 'invalid'
  | 'land'
  | 'match2'
  | 'match3'
  | 'combo'
  | 'shuffle'
  | 'hint'
  | 'special'
  | 'rocket'
  | 'bomb'
  | 'megaBomb'
  | 'rainbow'
  | 'manipulator'
  | 'buy'
  | 'iceHit'
  | 'iceBroken'
  | 'chainLink'
  | 'chest'
  | 'gold'
  | 'crown'
  | 'coalLayer'
  | 'coalBroken'
  | 'stone'
  | 'goalDone'
  | 'star'
  | 'lose'
  | 'gameOver'
  | 'button'
  | 'lastMoves'
  | `pair:${string}`;

export interface SoundCue {
  key: SoundKey;
  /** Шаг для звуков, которые растут: номер комбо в каскаде, номер звезды */
  step?: number;
}

/** Прогресс уровня между шагами: по разнице видно, что разбили и что выполнили */
export interface ProgressView {
  /** Сколько ударов ещё выдержит весь лёд на поле */
  iceLeft: number;
  /** Сколько льдин сломано */
  iceBroken: number;
  gold: number;
  /** Сколько целей и задач на звёзды выполнено */
  done: number;
}

/** Комбо двух спецфишек — номер звука в лаборатории (16.x) */
const PAIRS: Record<string, string> = {
  'rocket+rocket': '16.1',
  'bomb+rocket': '16.2',
  'bomb+bomb': '16.3',
  'rainbow+rocket': '16.4',
  'bomb+rainbow': '16.5',
  'rainbow+rainbow': '16.6',
  'megaBomb+rocket': '16.7',
  'bomb+megaBomb': '16.8',
  'megaBomb+megaBomb': '16.9',
  'megaBomb+rainbow': '16.10',
};

export function pairCode(a: PieceType, b: PieceType): string | undefined {
  return PAIRS[[a, b].sort().join('+')];
}

const EXPLOSIVE: Partial<Record<PieceType, SoundKey>> = {
  rocket: 'rocket',
  bomb: 'bomb',
  megaBomb: 'megaBomb',
  rainbow: 'rainbow',
};

export class StepSoundTracker {
  private board: Board;
  /** Комбо двух спецфишек звучит своим звуком: взрывы самих спецфишек в первом ударе не озвучиваются */
  private pairPlayed = false;
  private last: ProgressView | null;

  constructor(board: Board, progress: ProgressView | null = null) {
    this.board = cloneBoard(board);
    this.last = progress;
  }

  /** Звуки, которые зависят от самого хода, а не от шагов: комбо двух спецфишек, радуга, манипулятор */
  begin(move: Move | null): SoundCue[] {
    if (!move) return [];
    switch (move.type) {
      case 'swap': {
        const a = getCell(this.board, move.from);
        const b = getCell(this.board, move.to);
        if (isPiece(a) && isPiece(b)) {
          const code = pairCode(a.type, b.type);
          if (code) {
            this.pairPlayed = true;
            return [{ key: `pair:${code}` }];
          }
        }
        return [];
      }
      case 'rainbow':
      case 'boughtRainbow':
        return [{ key: 'rainbow' }];
      case 'manipulator':
      case 'boughtManipulator':
        return [{ key: 'manipulator' }];
      default:
        return [];
    }
  }

  step(step: ResolveStep, progress: ProgressView | null = null): SoundCue[] {
    const cues: SoundCue[] = [];
    switch (step.kind) {
      case 'swap': {
        const a = getCell(this.board, step.a) ?? null;
        const b = getCell(this.board, step.b) ?? null;
        setCell(this.board, step.a, b);
        setCell(this.board, step.b, a);
        if (!this.pairPlayed) cues.push({ key: 'swap' });
        break;
      }
      case 'clear': {
        const fired = new Set<SoundKey>();
        for (const pos of step.cells) {
          const cell = getCell(this.board, pos);
          const sound = isPiece(cell) ? EXPLOSIVE[cell.type] : undefined;
          if (sound) fired.add(sound);
        }
        if (this.pairPlayed) {
          // Взрывы спецфишек комбо уже звучат в звуке пары
          fired.clear();
          this.pairPlayed = false;
        }
        cues.push(...[...fired].map((key) => ({ key })));
        const combo = Math.max(0, ...(step.combos ?? []).map((hit) => hit.step));
        if (combo > 0) cues.push({ key: 'combo', step: combo });
        if (step.stones) cues.push({ key: 'stone' });
        if (step.items) cues.push({ key: 'crown' });
        if (step.boxes) cues.push({ key: 'chest' });
        if (step.treasures) cues.push({ key: 'gold' });
        for (const hit of step.chests ?? []) {
          const before = getCell(this.board, hit.pos);
          const links = before?.kind === 'box' ? (before.links ?? 0) : 0;
          if (links > (hit.cell.links ?? 0)) cues.push({ key: 'chainLink' });
          else if (hit.cell.open) cues.push({ key: 'chest' });
          setCell(this.board, hit.pos, hit.cell);
        }
        for (const hit of step.coal ?? []) {
          cues.push({ key: hit.layers === 0 ? 'coalBroken' : 'coalLayer' });
        }
        for (const pos of step.cells) setCell(this.board, pos, null);
        break;
      }
      case 'transform': {
        let level = 0;
        let special = false;
        for (const { pos, cell } of step.placements) {
          if (isTile(cell) && cell.level > 1) level = Math.max(level, cell.level);
          if (isPiece(cell)) special = true;
          setCell(this.board, pos, cell);
        }
        if (level === 3) cues.push({ key: 'match3' });
        else if (level === 2) cues.push({ key: 'match2' });
        if (special) cues.push({ key: 'special' });
        break;
      }
      case 'drop': {
        const moved = step.falls.map(({ from, to }) => ({
          to,
          cell: getCell(this.board, from) ?? null,
        }));
        for (const { from } of step.falls) setCell(this.board, from, null);
        for (const { to, cell } of moved) setCell(this.board, to, cell);
        for (const { to, tile } of step.spawns) setCell(this.board, to, tile);
        cues.push({ key: 'land' });
        break;
      }
      case 'choice':
        break;
    }
    if (progress && this.last) {
      if (progress.iceBroken > this.last.iceBroken) cues.push({ key: 'iceBroken' });
      else if (progress.iceLeft < this.last.iceLeft) cues.push({ key: 'iceHit' });
      if (progress.gold > this.last.gold && !cues.some((cue) => cue.key === 'gold')) {
        cues.push({ key: 'gold' });
      }
      if (progress.done > this.last.done) cues.push({ key: 'goalDone' });
    }
    if (progress) this.last = progress;
    return cues;
  }
}
