// Shared types for the match-3 core. Kept free of any rendering or DOM
// dependencies so the board logic can be unit-tested in plain Node/jsdom.

/** The special behaviour baked into a gem. */
export enum GemKind {
  Normal = 'normal',
  LineH = 'lineH', // clears its entire row
  LineV = 'lineV', // clears its entire column
  Bomb = 'bomb', // clears a 3x3 (or larger) area
  Color = 'color', // rainbow: clears every gem of one colour
}

/** A single occupied cell on the board. `color` is -1 for the colourless
 *  rainbow gem. `id` is a stable identity used to map logic cells to views. */
export interface Cell {
  id: number;
  color: number;
  kind: GemKind;
}

/** The board is a row-major grid. `null` means an empty cell. */
export type Grid = (Cell | null)[][];

export interface Pos {
  r: number;
  c: number;
}

/** A contiguous run of same-coloured gems found by the matcher. */
export interface MatchRun {
  cells: Pos[];
  color: number;
  dir: 'h' | 'v';
  len: number;
}

/** The full result of resolving all matches in one board state. */
export interface MatchResult {
  /** Every cell that should be cleared this step. */
  cleared: Pos[];
  /** Special gems that should be spawned after clearing. */
  spawns: { pos: Pos; color: number; kind: GemKind }[];
  /** The raw runs, useful for scoring and audio. */
  runs: MatchRun[];
}
