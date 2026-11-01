import Phaser from 'phaser';
import { COMBO_MAX_STEPS } from '../core/config';
import { comboMultiplier } from '../core/resolve';
import { COMBO_COLORS, COMBO_OUTLINE_COLOR } from './palette';

// Надпись «Комбо - x1.1» пиксельным шрифтом VT323 (public/assets/fonts).
// В шрифте нет кириллицы: К и о совпадают с латинскими, а м и б нарисованы по его сетке.
// Надписи собираются один раз в текстуры: так не приходится рисовать текст посреди хода.

const FONT_NAME = 'VT323';
const FONT_URL = 'assets/fonts/VT323-Regular.ttf';
/** Без шрифта игра не должна зависнуть на загрузке: надпись выйдет запасным моноширинным */
const FONT_TIMEOUT_MS = 3000;

/** Клетка шрифта: знак шириной 8 точек, размер шрифта — 20 точек */
const FONT_DOTS = 20;
const GLYPH_DOTS = 8;
const DOT = 3;
const FONT_SIZE = FONT_DOTS * DOT;
const OUTLINE = DOT;
/** Базовая линия шрифта от верха текстуры, в точках */
const BASELINE_DOTS = 14;

const LATIN_TWINS: Readonly<Record<string, string>> = { К: 'K', о: 'o' };

/** Нарисованные буквы: строки сверху вниз, нижняя стоит на базовой линии шрифта */
const DRAWN_GLYPHS: Readonly<Record<string, readonly string[]>> = {
  м: [
    '.##..##.',
    '.##.###.',
    '.#.####.',
    '.#.####.',
    '.#.####.',
    '.#...##.',
    '.#...##.',
    '.#...##.',
  ],
  б: [
    '....###.',
    '..###...',
    '.##.....',
    '.##.....',
    '.#####..',
    '.#####..',
    '.##..##.',
    '.##..##.',
    '.#...##.',
    '..####..',
    '..####..',
  ],
};

export const comboTextureKey = (step: number) => `combo-${step}`;

export const comboText = (step: number) => `Комбо - x${comboMultiplier(step)}`;

export async function loadComboFont(): Promise<void> {
  try {
    const font = new FontFace(FONT_NAME, `url(${FONT_URL})`);
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('шрифт не загрузился')), FONT_TIMEOUT_MS);
    });
    document.fonts.add(await Promise.race([font.load(), timeout]));
  } catch {
    // Надпись останется читаемой и запасным шрифтом
  }
}

function drawLabel(canvas: HTMLCanvasElement, text: string, color: string): void {
  const context = canvas.getContext('2d')!;
  context.fillStyle = color;
  context.font = `${FONT_SIZE}px ${FONT_NAME}, monospace`;
  context.textBaseline = 'alphabetic';
  const baseline = BASELINE_DOTS * DOT;
  [...text].forEach((symbol, i) => {
    const x = i * GLYPH_DOTS * DOT;
    const glyph = DRAWN_GLYPHS[symbol];
    if (!glyph) {
      context.fillText(LATIN_TWINS[symbol] ?? symbol, x, baseline);
      return;
    }
    glyph.forEach((line, row) => {
      [...line].forEach((dot, col) => {
        if (dot !== '#') return;
        const y = baseline + (row - glyph.length) * DOT;
        context.fillRect(x + col * DOT, y, DOT, DOT);
      });
    });
  });
}

function labelCanvas(text: string, color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = [...text].length * GLYPH_DOTS * DOT + 2 * OUTLINE;
  canvas.height = (BASELINE_DOTS + 3) * DOT + 2 * OUTLINE;
  const inner = document.createElement('canvas');
  inner.width = canvas.width;
  inner.height = canvas.height;
  drawLabel(inner, text, color);
  const shade = document.createElement('canvas');
  shade.width = canvas.width;
  shade.height = canvas.height;
  drawLabel(shade, text, COMBO_OUTLINE_COLOR);

  // Обводка — та же надпись тёмным со сдвигом: она одинакова у букв шрифта и у нарисованных
  const context = canvas.getContext('2d')!;
  for (const dx of [0, OUTLINE, 2 * OUTLINE]) {
    for (const dy of [0, OUTLINE, 2 * OUTLINE]) context.drawImage(shade, dx, dy);
  }
  context.drawImage(inner, OUTLINE, OUTLINE);
  return canvas;
}

export function createComboTextures(scene: Phaser.Scene): void {
  for (let step = 1; step <= COMBO_MAX_STEPS; step++) {
    const key = comboTextureKey(step);
    if (scene.textures.exists(key)) continue;
    scene.textures.addCanvas(key, labelCanvas(comboText(step), COMBO_COLORS[step - 1]!));
  }
}
