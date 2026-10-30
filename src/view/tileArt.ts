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

/** Камень: серая глыба, занимает клетку целиком, чтобы его не путали с фишками */
export function drawStone(g: Phaser.GameObjects.Graphics, cellSize: number): void {
  const half = cellSize * 0.44;
  g.fillStyle(0x6b7280);
  g.fillRoundedRect(-half, -half, half * 2, half * 2, cellSize * 0.14);
  g.lineStyle(3, 0x9ca3af, 0.9);
  g.strokeRoundedRect(-half, -half, half * 2, half * 2, cellSize * 0.14);
  g.lineStyle(2, 0x374151, 0.9);
  g.lineBetween(-half * 0.5, -half * 0.3, half * 0.1, half * 0.1);
  g.lineBetween(half * 0.1, half * 0.1, -half * 0.1, half * 0.6);
}

/** Предмет: белый кристалл — такой формы и цвета нет ни у фишек, ни у спецфишек */
export function drawItem(g: Phaser.GameObjects.Graphics, cellSize: number): void {
  const top = cellSize * 0.42;
  const side = cellSize * 0.3;
  const points = [
    new Phaser.Math.Vector2(0, -top),
    new Phaser.Math.Vector2(side, 0),
    new Phaser.Math.Vector2(0, top),
    new Phaser.Math.Vector2(-side, 0),
  ];
  g.fillStyle(0xf8fafc);
  g.fillPoints(points, true);
  g.lineStyle(3, 0x38bdf8, 1);
  g.strokePoints(points, true);
  g.lineBetween(-side, 0, side, 0);
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
