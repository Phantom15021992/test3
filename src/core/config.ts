// Все игровые константы. Числа из правил в AGENTS.md держим только здесь.

export const BASE_POINTS_PER_TILE = 10;

export const MAX_CELL_LEVEL = 3;

// Множители очков для ячеек 2 и 3 уровня
export const LEVEL2_SCORE_MULTIPLIER = 5;
export const LEVEL3_SCORE_MULTIPLIER_BY_MATCH_SIZE: Readonly<Record<3 | 4 | 5, number>> = {
  3: 15,
  4: 20,
  5: 25,
};

/** Множитель для ячейки 3 уровня, уничтоженной спецфишкой (не в совпадении) */
export const LEVEL3_HIT_MULTIPLIER = 15;

// Размеры взрывов (сторона квадрата) и ширина полос
export const BOMB_SIZE = 3;
export const MEGA_BOMB_SIZE = 5;
export const BOMB_BOMB_SIZE = 5;
export const MEGA_BOMB_BOMB_SIZE = 7;
export const ROCKET_BOMB_WIDTH = 3;
export const MEGA_BOMB_ROCKET_WIDTH = 5;

// Временное поле, пока нет уровней
export const DEMO_BOARD_ROWS = 12;
export const DEMO_BOARD_COLS = 12;
export const DEMO_COLOR_COUNT = 3;

// Анимации, мс
export const SWAP_DURATION_MS = 150;
export const MATCH_PULSE_DURATION_MS = 120;
export const CLEAR_DURATION_MS = 150;
export const FALL_DURATION_PER_CELL_MS = 70;
export const PLACE_DURATION_MS = 200;

/** Доля размера клетки, на которую нужно провести пальцем, чтобы засчитать свайп */
export const SWIPE_THRESHOLD = 0.3;
