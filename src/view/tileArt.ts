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
