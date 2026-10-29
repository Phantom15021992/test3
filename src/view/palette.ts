// Основной цвет фрукта каждой фишки по ColorId (сами фишки — картинки из assets.ts);
// нужен там, где цвет показывается без картинки, — например, в секторах радуги
export const TILE_COLORS: readonly number[] = [
  0xef5e4e, // арбуз
  0x8ee27a, // лайм
  0x4677cf, // черника
  0xb83070, // вишня
  0xf2d35c, // банан
];

export const BOARD_CELL_DARK = 0x262b40;
export const BOARD_CELL_LIGHT = 0x2c3249;
export const SELECTION_COLOR = 0xffffff;
export const LEVEL2_MARKER_COLOR = 0xffffff;
export const LEVEL3_MARKER_COLOR = 0xffd54a;

// Спецфишки бесцветные — рисуем их нейтральными цветами, не похожими на цвета фишек
export const SPECIAL_BODY_COLOR = 0xdfe3f2;
export const SPECIAL_MARK_COLOR = 0x2b3150;
export const BOMB_CORE_COLOR = 0x1e1e28;
export const MEGA_BOMB_COLOR = 0x15151c;
export const MEGA_BOMB_RING_COLOR = 0xff3b3b;
export const MANIPULATOR_COLOR = 0xeef1ff;
export const MANIPULATOR_MARK_COLOR = 0x2b3150;
export const HIGHLIGHT_COLOR = 0xffd54a;

export const BONUS_BAR_BG_COLOR = 0x3a4160;
export const BONUS_BAR_FILL_COLOR = 0x8e5cf7;
export const BONUS_READY_COLOR = 0xffd54a;

export const UI_PANEL_COLOR = 0x2c3249;
export const UI_BUTTON_COLOR = 0x4a6cf7;
export const UI_BUTTON_ALT_COLOR = 0x8e5cf7;
export const UI_TEXT_COLOR = '#ffffff';
export const UI_MUTED_TEXT_COLOR = '#aab2d5';
