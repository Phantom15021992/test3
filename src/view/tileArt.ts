import Phaser from 'phaser';
import type { CellLevel } from '../core/board';

const TILE_OUTLINE_ALPHA = 0.35;

/**
 * Вершины правильного многоугольника или звезды вокруг (0, 0), первая вершина — вверху.
 * Для звезды inner < outer: вершины чередуются между внешним и внутренним радиусом.
 * offsetY сдвигает фигуру вниз, чтобы треугольник выглядел отцентрованным в клетке.
 */
function regularPolygon(
  corners: number,
  outer: number,
  inner: number,
  offsetY: number,
): Phaser.Math.Vector2[] {
  const isStar = inner < outer;
  const count = isStar ? corners * 2 : corners;
  return Array.from({ length: count }, (_, i) => {
    const radius = isStar && i % 2 === 1 ? inner : outer;
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / count;
    return new Phaser.Math.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius + offsetY);
  });
}

/** Рисует фишку с центром в (0, 0). Уровень виден по форме: круг, треугольник, звезда */
export function drawTileShape(
  g: Phaser.GameObjects.Graphics,
  level: CellLevel,
  color: number,
  cellSize: number,
  outlineWidth: number,
): void {
  g.fillStyle(color);
  g.lineStyle(outlineWidth, 0xffffff, TILE_OUTLINE_ALPHA);

  if (level === 1) {
    const radius = cellSize * 0.38;
    g.fillCircle(0, 0, radius);
    g.strokeCircle(0, 0, radius);
    // Блик сверху, чтобы фишка выглядела объёмной
    g.fillStyle(0xffffff, 0.25);
    g.fillCircle(-radius * 0.3, -radius * 0.35, radius * 0.35);
    return;
  }

  const points =
    level === 2
      ? regularPolygon(3, cellSize * 0.47, cellSize * 0.47, cellSize * 0.08)
      : regularPolygon(5, cellSize * 0.46, cellSize * 0.2, cellSize * 0.03);
  g.fillPoints(points, true);
  g.strokePoints(points, true);
  // Блик у верхней вершины
  g.fillStyle(0xffffff, 0.3);
  g.fillCircle(0, -cellSize * (level === 2 ? 0.14 : 0.2), cellSize * 0.06);
}

/**
 * Алмаз по картинке владельца (контур, пояс и грани; рисунок 970×970, алмаз — x 288–692, y 297–682):
 * точки в долях ширины алмаза от его центра. Рисуется вектором — чёткий при любом размере и красится
 * в цвет палитры, как круг и треугольник
 */
const DIAMOND_WIDTH = 404;
const DIAMOND_CX = 490;
const DIAMOND_CY = 489.5;
const d = (x: number, y: number) => ({
  x: (x - DIAMOND_CX) / DIAMOND_WIDTH,
  y: (y - DIAMOND_CY) / DIAMOND_WIDTH,
});
/** Контур: верхняя площадка, плечи пояса и нижний острый конец */
const DIAMOND_OUTLINE = [d(384, 297), d(597, 297), d(692, 400), d(490, 682), d(288, 400)];
/** Корона — часть над поясом: она чуть светлее, как будто на неё падает свет */
const DIAMOND_CROWN = [d(384, 297), d(597, 297), d(692, 400), d(288, 400)];
/** Грани: пояс, две грани короны и две грани павильона к нижнему концу */
const DIAMOND_FACETS: readonly (readonly [{ x: number; y: number }, { x: number; y: number }])[] = [
  [d(288, 400), d(692, 400)],
  [d(430, 297), d(397, 400)],
  [d(562, 297), d(586, 400)],
  [d(397, 400), d(490, 682)],
  [d(586, 400), d(490, 682)],
];
/** Какую часть клетки занимает алмаз по ширине: как звезда, чуть меньше клетки */
const DIAMOND_CELL_SHARE = 0.86;

/** Алмаз с центром в (0, 0): заливка цветом фишки, белые обводка, грани и блик — как у круга и треугольника */
export function drawDiamondShape(
  g: Phaser.GameObjects.Graphics,
  color: number,
  cellSize: number,
  outlineWidth: number,
): void {
  const size = cellSize * DIAMOND_CELL_SHARE;
  const pts = (list: readonly { x: number; y: number }[]) =>
    list.map((p) => new Phaser.Math.Vector2(p.x * size, p.y * size));
  g.fillStyle(color);
  g.fillPoints(pts(DIAMOND_OUTLINE), true);
  g.fillStyle(0xffffff, 0.14);
  g.fillPoints(pts(DIAMOND_CROWN), true);
  g.lineStyle(Math.max(1, outlineWidth * 0.6), 0xffffff, TILE_OUTLINE_ALPHA);
  for (const [a, b] of DIAMOND_FACETS)
    g.lineBetween(a.x * size, a.y * size, b.x * size, b.y * size);
  g.lineStyle(outlineWidth, 0xffffff, TILE_OUTLINE_ALPHA);
  g.strokePoints(pts(DIAMOND_OUTLINE), true);
  // Блик на короне, как у круга и треугольника
  g.fillStyle(0xffffff, 0.3);
  g.fillCircle(-size * 0.17, -size * 0.22, cellSize * 0.05);
}
