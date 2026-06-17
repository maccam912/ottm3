// Central tuning knobs. Everything that affects feel lives here so the game
// can be balanced in one place.
//
// THEME — "Gravity Wells": every gem is a little celestial body adrift in deep
// space. They spin, they get flung by blast waves, they're sucked into
// collapsing stars. Detonations are supernovae. The whole thing should feel
// physical and a little dangerous, never tidy.

export const CONFIG = {
  COLS: 8,
  ROWS: 8,
  COLORS: 6,

  // --- Timing (seconds) ---
  SWAP_TIME: 0.16,
  FALL_GRAVITY: 26, // world units / s^2 for the gem drop spring assist
  CLEAR_STAGGER: 0.03, // delay between gems popping in a single match
  CASCADE_SETTLE: 0.1, // pause between cascade steps

  // --- Soft-body spring feel ---
  // Lower damping than a "calm" game on purpose: bodies should wobble, ring
  // and overshoot. Energy bleeds off, but slowly enough that you feel it.
  SPRING: {
    stiffness: 240, // higher = snappier return
    damping: 9, // LOWER = more wobble / ringing (was 14)
    landSquash: 0.55, // how much a gem squashes on landing (0..1)
    selectPop: 0.26, // scale bump when a gem is selected
    matchPop: 0.8, // squash impulse when a gem is about to clear
  },

  // --- Rigid-body motion (real forces / impulses / torque) ---
  // Gems are spring-anchored to their grid cell but free to be knocked off it
  // and to spin. These knobs shape how violent that gets.
  PHYSICS: {
    posStiffness: 200, // how hard a gem is pulled back to its grid anchor
    posDamping: 11, // damping on positional knock-back (lower = more swing)
    angDamping: 1.6, // angular drag — how fast spin bleeds off
    maxSpin: 26, // clamp on angular velocity (rad/s) so it never blurs out
    blastImpulse: 9.0, // base radial knock-back imparted by a detonation
    blastTorque: 14, // base spin imparted by a detonation
    blastRadius: 3.4, // how far a blast's shove reaches (world units)
    idleSpin: 0.25, // gentle ever-present rotation so nothing is ever static
    gravityWell: 120, // pull strength of a collapsing-star (bomb) implosion
  },

  // --- Screen shake (trauma model) ---
  SHAKE: {
    swap: 0.12,
    match: 0.22,
    detonate: 0.55,
    big: 0.95, // board-clearing combos
  },

  // --- Scoring ---
  SCORE_PER_GEM: 30,
  COMBO_BONUS: 0.5, // each cascade level multiplies score by (1 + level*bonus)

  // --- Camera / scene ---
  CAMERA_DISTANCE: 13.5,
  CAMERA_TILT: 0.05, // gentle 2.5D tilt in radians
} as const;

/** Celestial palette — six bodies, each a clearly distinct point on the colour
 *  wheel (no two hues sit closer than ~55°) so they never read as "two shades
 *  of the same thing". `core` is the hot inner glow, `base` the surface, `glow`
 *  the atmospheric halo / particle tint. Index === gem colour id. */
export const PALETTE: {
  name: string;
  base: [number, number, number];
  glow: [number, number, number];
  core: [number, number, number];
}[] = [
  // 0 — Ember (red dwarf): hot red-orange
  { name: 'ember', base: [0.98, 0.26, 0.24], glow: [1.0, 0.45, 0.32], core: [1.0, 0.8, 0.4] },
  // 1 — Solar (gold star): saturated amber-gold
  { name: 'solar', base: [1.0, 0.74, 0.12], glow: [1.0, 0.85, 0.35], core: [1.0, 0.97, 0.7] },
  // 2 — Verdant (life-world): vivid emerald (kept well away from cyan)
  { name: 'verdant', base: [0.16, 0.82, 0.36], glow: [0.4, 0.98, 0.5], core: [0.8, 1.0, 0.7] },
  // 3 — Plasma (ice giant): bright cyan
  { name: 'plasma', base: [0.1, 0.78, 0.95], glow: [0.4, 0.92, 1.0], core: [0.8, 1.0, 1.0] },
  // 4 — Violet (gas giant): deep ultraviolet-blue, distinctly NOT cyan
  { name: 'violet', base: [0.44, 0.34, 0.98], glow: [0.62, 0.5, 1.0], core: [0.85, 0.8, 1.0] },
  // 5 — Nebula (magenta cloud): hot pink-magenta
  { name: 'nebula', base: [0.98, 0.24, 0.74], glow: [1.0, 0.45, 0.85], core: [1.0, 0.8, 0.95] },
];

/** Rainbow / colourless gem accent. */
export const RAINBOW_COLOR = -1;
