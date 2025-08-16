export const CONFIG = {
  COLS: 8,
  ROWS: 8,
  TILE: 72,
  TYPES: 6,
  GRAVITY_Y: 1.2,
  SHARDS_PER_TILE: 6,
};

export const COLORS = [0xff4757, 0x70a1ff, 0x2ed573, 0xffd32a, 0xa29bfe, 0xff6b81];

export const W = 900;
export const H = 700;

export const BOARD_W = CONFIG.COLS * CONFIG.TILE;
export const BOARD_H = CONFIG.ROWS * CONFIG.TILE;
export const BOARD_X = Math.floor((W - BOARD_W) / 2);
export const BOARD_Y = Math.floor((H - BOARD_H) / 2) + 20;
