/** Shared engine types. Pure data — no engine or renderer imports. */

export type Special =
  | "none"
  | "rocketH"
  | "rocketV"
  | "pulse"
  | "nova"
  | "prism"
  | "singularity";

/** Every bespoke two-powerup payoff understood by the engine and FX layer. */
export type ComboKind =
  | "rocket-parallel-h"
  | "rocket-parallel-v"
  | "rocket-cross"
  | "rocket-pulse"
  | "rocket-nova"
  | "rocket-prism"
  | "pulse-pulse"
  | "pulse-nova"
  | "pulse-prism"
  | "nova-nova"
  | "nova-prism"
  | "prism-prism"
  | "singularity";

export interface Piece {
  readonly id: number;
  readonly color: number;
  readonly special: Special;
}

export interface Cell {
  readonly r: number;
  readonly c: number;
}

export interface PlacedPiece extends Cell {
  readonly id: number;
  readonly color: number;
  readonly special: Special;
}

/** Visual effect metadata attached to a clear step. */
export type Effect =
  | { kind: "laser"; r: number; c: number; axis: "h" | "v" }
  | { kind: "pulse"; r: number; c: number; radius: number }
  | { kind: "nova"; r: number; c: number; radius: number }
  | {
      kind: "prism";
      r: number;
      c: number;
      color: number;
      mode: "clear" | "rocket-rain" | "blast-field" | "cross-storm";
    }
  | { kind: "singularity"; r: number; c: number }
  | { kind: "combo"; r: number; c: number; combo: ComboKind; color?: number };

/** One visual phase of resolving a move. The client replays these in order. */
export type Step =
  | { type: "swap"; a: PlacedPiece; b: PlacedPiece }
  | { type: "invalid"; a: PlacedPiece; b: PlacedPiece }
  | {
      type: "clear";
      cascade: number;
      score: number;
      totalScore: number;
      pieces: PlacedPiece[];
      created: PlacedPiece[];
      effects: Effect[];
    }
  | { type: "fall"; moves: Array<{ id: number; fromR: number; toR: number; c: number }> }
  | { type: "refill"; spawns: PlacedPiece[] }
  | { type: "shuffle"; layout: PlacedPiece[] };

export interface GameConfig {
  cols: number;
  rows: number;
  colors: number;
  seed: number;
}

export const DEFAULT_CONFIG: GameConfig = { cols: 8, rows: 8, colors: 6, seed: 1 };
