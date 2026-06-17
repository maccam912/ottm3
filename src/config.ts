// Central tuning knobs. Everything that affects feel lives here so the game
// can be balanced in one place.

export const CONFIG = {
  COLS: 8,
  ROWS: 8,
  COLORS: 6,

  // --- Timing (seconds) ---
  SWAP_TIME: 0.18,
  FALL_GRAVITY: 26, // world units / s^2 for the gem drop spring assist
  CLEAR_STAGGER: 0.035, // delay between gems popping in a single match
  CASCADE_SETTLE: 0.12, // pause between cascade steps

  // --- Soft-body spring feel ---
  SPRING: {
    stiffness: 220, // higher = snappier return
    damping: 14, // higher = less wobble
    landSquash: 0.42, // how much a gem squashes on landing (0..1)
    selectPop: 0.18, // scale bump when a gem is selected
    matchPop: 0.6, // squash impulse when a gem is about to clear
  },

  // --- Scoring ---
  SCORE_PER_GEM: 30,
  COMBO_BONUS: 0.5, // each cascade level multiplies score by (1 + level*bonus)

  // --- Camera / scene ---
  CAMERA_DISTANCE: 13.5,
  CAMERA_TILT: 0.06, // gentle 2.5D tilt in radians
} as const;

/** Calm jewel palette — deliberately soft, slightly desaturated, with a hint
 *  of luminance so the glow layer reads well. Index === gem colour id. */
export const PALETTE: { base: [number, number, number]; glow: [number, number, number] }[] = [
  { base: [0.93, 0.32, 0.39], glow: [1.0, 0.42, 0.5] }, // rose
  { base: [0.36, 0.62, 0.96], glow: [0.5, 0.74, 1.0] }, // sky
  { base: [0.42, 0.82, 0.55], glow: [0.55, 0.95, 0.68] }, // jade
  { base: [0.98, 0.79, 0.36], glow: [1.0, 0.88, 0.5] }, // amber
  { base: [0.74, 0.52, 0.96], glow: [0.85, 0.66, 1.0] }, // amethyst
  { base: [0.40, 0.86, 0.90], glow: [0.55, 0.96, 1.0] }, // aqua
];

/** Rainbow / colourless gem accent. */
export const RAINBOW_COLOR = -1;
