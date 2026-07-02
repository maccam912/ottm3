/** Shared engine types. Pure data — no engine or renderer imports. */

export type Special = "none" | "stripedH" | "stripedV" | "wrapped" | "bomb";

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
  | { kind: "stripeH"; r: number; c: number }
  | { kind: "stripeV"; r: number; c: number }
  | { kind: "wrapped"; r: number; c: number }
  | { kind: "bomb"; r: number; c: number; color: number }
  | { kind: "bombAll"; r: number; c: number };

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
