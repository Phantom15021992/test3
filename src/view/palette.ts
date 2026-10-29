// Цвета фишек по ColorId
export const TILE_COLORS: readonly number[] = [
  // Сначала самые непохожие цвета: сложность берёт первые N, и на лёгких уровнях
  // близкие пары (синий/голубой, розовый/оранжевый) не встречаются
  0x004dff, // синий
  0xfed800, // жёлтый
  0xff9ea8, // розовый
  0x00a443, // зелёный
  0xaa64de, // фиолетовый
  0xfe6004, // оранжевый
  0x3beaff, // голубой
];

export const BOARD_CELL_DARK = 0x262b40;
export const BOARD_CELL_LIGHT = 0x2c3249;
export const SELECTION_COLOR = 0xffffff;

export const HIGHLIGHT_COLOR = 0xffd54a;

export const BONUS_READY_COLOR = 0xffd54a;

export const UI_PANEL_COLOR = 0x2c3249;
export const UI_BUTTON_COLOR = 0x4a6cf7;
export const UI_BUTTON_ALT_COLOR = 0x8e5cf7;
export const UI_TEXT_COLOR = '#ffffff';
export const UI_MUTED_TEXT_COLOR = '#aab2d5';
