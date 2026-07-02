export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1080;

export const COLS = 8;
export const ROWS = 8;
export const CELL = 84;

export const BOARD_X = (GAME_WIDTH - COLS * CELL) / 2;
export const BOARD_Y = 236;

/** Piece color index → texture key. */
export const DONUT_TEXTURES = [
  "donut_pink",
  "donut_mint",
  "donut_yellow",
  "donut_choc",
  "donut_white",
  "donut_blue",
] as const;

/** Piece color index → accent color for particles/beams/popups. */
export const ACCENTS = [0xff9ecf, 0x6dd2a0, 0xfed013, 0xa8865f, 0xf5f0ea, 0x58a6ff] as const;

export const COMBO_WORDS = ["TASTY!", "SWEET!", "DELICIOUS!", "GLAZED!", "SUGAR RUSH!"] as const;

export const FONT = '"Arial Rounded MT Bold", "Trebuchet MS", Verdana, sans-serif';

export function cellX(c: number): number {
  return BOARD_X + c * CELL + CELL / 2;
}

export function cellY(r: number): number {
  return BOARD_Y + r * CELL + CELL / 2;
}
