export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;

export const COLS = 8;
export const ROWS = 8;
export const CELL = 82;

export const BOARD_X = (GAME_WIDTH - COLS * CELL) / 2;
export const BOARD_Y = 274;

/** Piece color index -> generated cosmic relic texture. */
export const GEM_TEXTURES = [
  "relic_star",
  "relic_diamond",
  "relic_bolt",
  "relic_void",
  "relic_atom",
  "relic_drop",
] as const;

/** Piece color index -> accent used by beams, shards and score bursts. */
export const ACCENTS = [
  0xff2bd6,
  0x36f1ff,
  0xffe53b,
  0xb56cff,
  0x55ff8a,
  0x3d7bff,
] as const;

export const ACCENT_CSS = [
  "#ff2bd6",
  "#36f1ff",
  "#ffe53b",
  "#b56cff",
  "#55ff8a",
  "#3d7bff",
] as const;

/** The vocabulary gets less reasonable as the cascade climbs. */
export const COMBO_WORDS = [
  "CHAIN REACTION!",
  "MULTIKILL!",
  "COSMIC PAYOUT!",
  "REALITY CRACKED!",
  "ABSURDITY BONUS!",
  "MAXIMUM OVERDRIVE!",
  "THE SCREEN IS LOSING!",
  "TOO MUCH IS NOT ENOUGH!",
  "TRANSCENDENT JACKPOT!",
  "INFINITE EVERYTHING!!!",
] as const;

export const FONT = '"Arial Black", "Arial Rounded MT Bold", Impact, sans-serif';
export const BODY_FONT = '"Trebuchet MS", Verdana, sans-serif';

export function cellX(c: number): number {
  return BOARD_X + c * CELL + CELL / 2;
}

export function cellY(r: number): number {
  return BOARD_Y + r * CELL + CELL / 2;
}
