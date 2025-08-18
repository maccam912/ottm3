export const W = 900;
export const H = 700;

// Calculate dynamic tile size to fit viewport
function calculateTileSize(cols: number, rows: number, viewportW: number, viewportH: number): number {
  // Reserve space for UI elements (title, score, margins)
  const reservedHeight = 150; // Title, score, and margins
  const reservedWidth = 40;   // Side margins
  
  const availableWidth = viewportW - reservedWidth;
  const availableHeight = viewportH - reservedHeight;
  
  // Calculate max tile size that fits both dimensions
  const maxTileWidth = Math.floor(availableWidth / cols);
  const maxTileHeight = Math.floor(availableHeight / rows);
  
  return Math.min(maxTileWidth, maxTileHeight);
}

export const CONFIG = {
  COLS: 10,
  ROWS: 10,
  get TILE() { return calculateTileSize(this.COLS, this.ROWS, W, H); },
  TYPES: 6,
  GRAVITY_Y: 1.2,
  SHARDS_PER_TILE: 50,
  DAMPING_FACTOR: 0.4,  // 0.0 = no damping, 1.0 = full damping
  DAMPING_VARIATION: 0.1, // Random variation range around base damping factor
  TIME_SCALE: 1.0,      // Physics simulation speed multiplier
  EXPLOSION_FORCE: 0.1, // Base explosion force strength
  EXPLOSION_RADIUS: 900, // Explosion effect radius in pixels
  SLOW_MOTION_SCALE: 0.10, // Time scale during slow motion (1/3rd speed)
  SLOW_MOTION_DURATION: 800, // Duration of slow motion effect in milliseconds
  SPARK_LIFETIME_MULTIPLIER: 5.0, // Multiplier for how long sparks stay on screen (1.0 = normal, 2.0 = twice as long)
  // Chain reaction explosion delays (in milliseconds)
  CHAIN_DELAYS: [0, 0, 0, 0] // Delays for 1st, 2nd, 3rd, 4th+ explosions in chain reactions
};

export const COLORS = [0xdc143c, 0x1e90ff, 0x32cd32, 0xffd700, 0xff1493, 0xff8c00]; // Deep red, blue, green, gold, hot pink, orange
export const WILD_COLOR = 0xffffff; // White for wild gems
export const WILD_TYPE = -1; // Special type for wild gems

// Collision categories for Matter.js physics
export const COLLISION = {
  GEM: 0x0001,    // Gems
  SHARD: 0x0002,  // Particle shards
  WORLD: 0x0004   // World boundaries
};

// Board calculations using dynamic tile size
export const BOARD_W = CONFIG.COLS * CONFIG.TILE;
export const BOARD_H = CONFIG.ROWS * CONFIG.TILE;
export const BOARD_X = Math.floor((W - BOARD_W) / 2);
export const BOARD_Y = Math.floor((H - BOARD_H) / 2) + 20;
