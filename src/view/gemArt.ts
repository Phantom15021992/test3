// Фишки-самоцветы тестового уровня (экран правил): картинки вместо нарисованных фигур.
// 1 уровень — треугольник, 2 — квадрат, 3 — круг. Цвета по индексу палитры Детского:
// синий, жёлтый (здесь зелёный самоцвет) и красный.

const GEM_COLORS = ['blue', 'green', 'red'] as const;

export const GEM_LEVELS = 3;

export const gemKey = (color: number, level: number): string =>
  `gem-${GEM_COLORS[color] ?? GEM_COLORS[0]}-${level}`;

export const GEM_IMAGE_FILES: readonly { key: string; path: string }[] = GEM_COLORS.flatMap(
  (name, color) =>
    Array.from({ length: GEM_LEVELS }, (_, i) => ({
      key: gemKey(color, i + 1),
      path: `assets/gems/${name}-${i + 1}.webp`,
    })),
);

/** Самоцвет почти во всю клетку: на картинках вокруг камня и так есть поля */
export const GEM_CELL_SHARE = 0.98;
