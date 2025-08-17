export const CONFIG = {
  COLS: 8,
  ROWS: 8,
  TILE: 72,
  TYPES: 6,
  GRAVITY_Y: 1.2,
  SHARDS_PER_TILE: 6,
  DAMPING_FACTOR: 1.0,  // 0.0 = no damping, 1.0 = full damping
  DAMPING_VARIATION: 0.8, // Random variation range around base damping factor
  TIME_SCALE: 1.0,      // Physics simulation speed multiplier
  EXPLOSION_FORCE: 0.3, // Base explosion force strength
  EXPLOSION_RADIUS: 120 // Explosion effect radius in pixels
};

export const COLORS = [0xdc143c, 0x1e90ff, 0x32cd32, 0xffd700, 0xff1493, 0xff8c00]; // Deep red, blue, green, gold, hot pink, orange

export const W = 900;
export const H = 700;

export const BOARD_W = CONFIG.COLS * CONFIG.TILE;
export const BOARD_H = CONFIG.ROWS * CONFIG.TILE;
export const BOARD_X = Math.floor((W - BOARD_W) / 2);
export const BOARD_Y = Math.floor((H - BOARD_H) / 2) + 20;
