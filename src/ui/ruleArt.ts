import Phaser from 'phaser';
import type { Piece } from '../core/board';
import { BOARD_CELL_DARK, TILE_COLORS } from '../view/palette';
import { drawPiece } from '../view/pieceArt';
import { drawTileShape } from '../view/tileArt';
import { figureCells, type RewardIcon } from './matchFigures';

// Рисунки для экранов правил и «Комбинации».

/** Жёлтый: на тёмной панели значки читаются лучше, чем синим, первым цветом палитры */
const ICON_COLOR = TILE_COLORS[1]!;
/** Спецфишка рядом с фишкой того же размера выглядит крупнее: радиус чуть меньше половины */
const PIECE_RADIUS_SHARE = 17 / 36;

/** Значок фишки или спецфишки; size — ширина значка фишки */
export function drawRuleIcon(
  scene: Phaser.Scene,
  x: number,
  y: number,
  kind: RewardIcon,
  size = 36,
): void {
  if (typeof kind === 'number') {
    const g = scene.add.graphics({ x, y });
    drawTileShape(g, kind, ICON_COLOR, size, 2);
    return;
  }
  // Ракета в правилах стоит вертикально: направление здесь не важно
  const piece = { kind: 'piece', type: kind, direction: 'col' } as Piece;
  drawPiece(scene, piece, size * PIECE_RADIUS_SHARE).setPosition(x, y);
}

/** Рисунок фигуры с центром в (x, y): cell — размер клетки */
export function drawFigure(
  scene: Phaser.Scene,
  rows: readonly string[],
  x: number,
  y: number,
  cell: number,
): void {
  const width = rows[0]!.length * cell;
  const height = rows.length * cell;
  const originX = x - width / 2;
  const originY = y - height / 2;
  const background = scene.add.graphics();
  background.fillStyle(BOARD_CELL_DARK);
  background.fillRect(originX, originY, width, height);
  for (const { row, col } of figureCells(rows)) {
    const tile = scene.add.graphics({
      x: originX + (col + 0.5) * cell,
      y: originY + (row + 0.5) * cell,
    });
    drawTileShape(tile, 1, ICON_COLOR, cell - 3, 1);
  }
}
