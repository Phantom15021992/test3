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

export const BOMB_SIZE = 3;
export const MEGA_BOMB_SIZE = 5;

// Временное поле, пока нет уровней
export const DEMO_BOARD_ROWS = 8;
export const DEMO_BOARD_COLS = 8;
export const DEMO_COLOR_COUNT = 6;

// Анимации, мс
export const SWAP_DURATION_MS = 150;
export const MATCH_PULSE_DURATION_MS = 180;

/** Доля размера клетки, на которую нужно провести пальцем, чтобы засчитать свайп */
export const SWIPE_THRESHOLD = 0.3;
