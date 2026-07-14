/**
 * Pure, deterministic match-3 engine. No renderer or framework imports.
 *
 * A move is resolved into an ordered list of `Step`s (swap, clear, fall,
 * refill, shuffle) that a client replays with animation. The entire game can
 * be played headlessly by calling `swap()` in a loop — see tests.
 */
import { mulberry32, randInt, type Rng } from "./rng";
import type {
  Cell,
  ComboKind,
  Effect,
  GameConfig,
  Piece,
  PlacedPiece,
  Special,
  Step,
} from "./types";
import { DEFAULT_CONFIG } from "./types";

type Grid = (Piece | null)[][];

/** A matched shape: a horizontal/vertical run of 3+, or a 2x2 square. */
interface Shape {
  cells: Cell[];
  kind: "h" | "v" | "sq";
  color: number;
}

interface Group {
  cells: Cell[];
  shapes: Shape[];
  color: number;
}

const WILD_COLOR = -1;

/** A fully-simulated candidate move, ranked by `bestMove()`. */
export interface MoveEval {
  a: Cell;
  b: Cell;
  /** Exact points this move will earn, cascades and chain reactions included. */
  score: number;
  /** How many powerups the move creates. */
  specials: number;
}

/** Value of baking a special, for ranking moves ("points AND powerups"). */
const SPECIAL_VALUE = 2_500;

/** A two-move plan: the move to play now, and the follow-up it sets up. */
export interface SetupMoveEval extends MoveEval {
  /** The exact best follow-up move on the board this move leaves behind. */
  next: MoveEval;
  /** Combined points across both moves. */
  totalScore: number;
}

/** Score constants — intentionally absurd, then multiplied by cascade depth. */
const PIECE_SCORE = 100;
const EFFECT_SCORE: Record<Effect["kind"], number> = {
  laser: 500,
  pulse: 1_200,
  nova: 3_500,
  meteor: 3_000,
  prism: 6_000,
  singularity: 25_000,
  combo: 0,
};
const COMBO_SCORE: Record<ComboKind, number> = {
  "rocket-parallel-h": 12_000,
  "rocket-parallel-v": 12_000,
  "rocket-cross": 15_000,
  "rocket-pulse": 12_000,
  "rocket-nova": 20_000,
  "rocket-prism": 32_000,
  "rocket-meteor": 16_000,
  "pulse-pulse": 16_000,
  "pulse-nova": 25_000,
  "pulse-prism": 38_000,
  "pulse-meteor": 18_000,
  "nova-nova": 65_000,
  "nova-prism": 52_000,
  "meteor-nova": 28_000,
  "meteor-prism": 45_000,
  "meteor-meteor": 22_000,
  "prism-prism": 80_000,
  singularity: 100_000,
};

function key(r: number, c: number): string {
  return `${r},${c}`;
}

export class Game {
  readonly cols: number;
  readonly rows: number;
  readonly colors: number;

  private grid: Grid;
  private rng: Rng;
  private nextId = 1;

  score = 0;
  movesMade = 0;

  constructor(config: Partial<GameConfig> = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    this.cols = cfg.cols;
    this.rows = cfg.rows;
    this.colors = cfg.colors;
    this.rng = mulberry32(cfg.seed);
    this.grid = this.generateBoard();
  }

  /** Build a game from an explicit color layout (tests, scripted boards). */
  static fromColors(
    colorGrid: number[][],
    config: Partial<GameConfig> = {},
    specialGrid?: Special[][],
  ): Game {
    const rows = colorGrid.length;
    const cols = colorGrid[0]?.length ?? 0;
    const g = new Game({ ...DEFAULT_CONFIG, ...config, rows, cols });
    g.grid = colorGrid.map((row, r) =>
      row.map((color, c) => ({
        id: g.nextId++,
        color,
        special: specialGrid?.[r]?.[c] ?? "none",
      })),
    );
    g.score = 0;
    g.movesMade = 0;
    return g;
  }

  /** Reshuffle if no move exists. Returns the shuffle step to replay, if any. */
  ensureMoveAvailable(): Step | null {
    if (this.findMoves().length > 0) return null;
    this.reshuffle();
    return { type: "shuffle", layout: this.board };
  }

  /** Current board as a flat list of placed pieces (for rendering/tests). */
  get board(): PlacedPiece[] {
    const out: PlacedPiece[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.at(r, c);
        if (p) out.push({ id: p.id, color: p.color, special: p.special, r, c });
      }
    }
    return out;
  }

  at(r: number, c: number): Piece | null {
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return null;
    return this.grid[r]?.[c] ?? null;
  }

  /** All currently-valid moves. Deterministic order (top-left → bottom-right). */
  findMoves(): Array<[Cell, Cell]> {
    const moves: Array<[Cell, Cell]> = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        for (const [dr, dc] of [
          [0, 1],
          [1, 0],
        ] as const) {
          const a: Cell = { r, c };
          const b: Cell = { r: r + dr, c: c + dc };
          if (this.isValidSwap(a, b)) moves.push([a, b]);
        }
      }
    }
    return moves;
  }

  hint(): [Cell, Cell] | null {
    const moves = this.findMoves();
    return moves.length > 0 ? (moves[0] ?? null) : null;
  }

  /**
   * Deep copy of the full game state, including RNG state — so a simulated
   * move on the clone plays out exactly like the same move on the original.
   */
  clone(): Game {
    const g = Object.create(Game.prototype) as Game;
    const rng = mulberry32(0);
    rng.setState(this.rng.getState());
    Object.assign(g, {
      cols: this.cols,
      rows: this.rows,
      colors: this.colors,
      // Pieces are immutable (replaced, never mutated), so rows shallow-copy.
      grid: this.grid.map((row) => [...row]),
      rng,
      nextId: this.nextId,
      score: this.score,
      movesMade: this.movesMade,
    });
    return g;
  }

  /**
   * Simulate every valid move and return the one with the biggest payoff:
   * exact resolved score (cascades included) plus a bonus per special created.
   * Because the clone shares RNG state, the returned `score` is exactly what
   * playing the move will earn.
   */
  bestMove(): MoveEval | null {
    let best: MoveEval | null = null;
    let bestValue = -Infinity;
    for (const [a, b] of this.findMoves()) {
      const sim = this.clone();
      const steps = sim.swap(a, b);
      let specials = 0;
      for (const s of steps) {
        if (s.type === "clear") specials += s.created.length;
      }
      const score = sim.score - this.score;
      const value = score + specials * SPECIAL_VALUE;
      if (value > bestValue) {
        bestValue = value;
        best = { a, b, score, specials };
      }
    }
    return best;
  }

  /**
   * Two-move lookahead: simulate every valid move, then the best follow-up on
   * each resulting board, and return the plan with the biggest combined
   * payoff — the move that *sets up* the big combo. Exact for the same reason
   * `bestMove()` is: clones carry the RNG state, so refills are predicted too.
   */
  bestSetupMove(): SetupMoveEval | null {
    let best: SetupMoveEval | null = null;
    let bestValue = -Infinity;
    for (const [a, b] of this.findMoves()) {
      const sim = this.clone();
      const steps = sim.swap(a, b);
      let specials = 0;
      for (const s of steps) {
        if (s.type === "clear") specials += s.created.length;
      }
      const score = sim.score - this.score;
      // A resolved board always has a follow-up: deadlocks reshuffle, and the
      // reshuffle draws from the cloned RNG, so even that is predicted.
      const next = sim.bestMove();
      if (!next) continue;
      const value =
        score + specials * SPECIAL_VALUE + next.score + next.specials * SPECIAL_VALUE;
      if (value > bestValue) {
        bestValue = value;
        best = { a, b, score, specials, next, totalScore: score + next.score };
      }
    }
    return best;
  }

  /**
   * Attempt to swap two adjacent cells. Returns the ordered steps to replay.
   * An invalid swap returns a single `invalid` step.
   */
  swap(a: Cell, b: Cell): Step[] {
    const pa = this.at(a.r, a.c);
    const pb = this.at(b.r, b.c);
    if (!pa || !pb || !this.adjacent(a, b)) {
      return [];
    }

    if (!this.isValidSwap(a, b)) {
      return [
        {
          type: "invalid",
          a: { ...pa, r: a.r, c: a.c },
          b: { ...pb, r: b.r, c: b.c },
        },
      ];
    }

    // Perform the swap. After this, pa sits at b and pb sits at a.
    this.set(a.r, a.c, pb);
    this.set(b.r, b.c, pa);
    this.movesMade++;

    const steps: Step[] = [
      {
        type: "swap",
        a: { ...pa, r: b.r, c: b.c },
        b: { ...pb, r: a.r, c: a.c },
      },
    ];

    // Seed clears/effects for special swaps; null means "use match detection".
    const combo = this.specialSwapSeed(pa, { ...b }, pb, { ...a });
    this.resolve(
      steps,
      [b, a],
      combo?.seed ?? null,
      combo?.effects ?? [],
      combo?.consumed ?? null,
    );
    return steps;
  }

  // ------------------------------------------------------------------
  // internals
  // ------------------------------------------------------------------

  private set(r: number, c: number, p: Piece | null): void {
    const row = this.grid[r];
    if (row) row[c] = p;
  }

  private adjacent(a: Cell, b: Cell): boolean {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  private makePiece(color: number, special: Special = "none"): Piece {
    return { id: this.nextId++, color, special };
  }

  private isValidSwap(a: Cell, b: Cell): boolean {
    if (!this.adjacent(a, b)) return false;
    const pa = this.at(a.r, a.c);
    const pb = this.at(b.r, b.c);
    if (!pa || !pb) return false;
    // Any swap involving a special fires it — no match required.
    if (pa.special !== "none" || pb.special !== "none") return true;
    // Otherwise the swap must produce a match (run or 2x2 square).
    this.set(a.r, a.c, pb);
    this.set(b.r, b.c, pa);
    const has = this.findShapes().length > 0;
    this.set(a.r, a.c, pa);
    this.set(b.r, b.c, pb);
    return has;
  }

  /**
   * For swaps involving specials, returns the seeded clear set + effects.
   * `pa`/`pb` have already been swapped: pa now sits at `posA`, pb at `posB`.
   */
  private specialSwapSeed(
    pa: Piece,
    posA: Cell,
    pb: Piece,
    posB: Cell,
  ): { seed: Set<string>; effects: Effect[]; consumed: Set<string> } | null {
    const seed = new Set<string>();
    const effects: Effect[] = [];
    const sa = pa.special;
    const sb = pb.special;

    if (sa !== "none" && sb === "none") {
      return this.singleSpecialSeed(sa, posA, pb.color);
    }
    if (sb !== "none" && sa === "none") {
      return this.singleSpecialSeed(sb, posB, pa.color);
    }
    if (sa === "none" || sb === "none") return null;

    // Both base powerups are spent by the fusion. They are the only consumed
    // cells: any third-party powerup caught by the footprint still chains.
    const consumed = new Set([key(posA.r, posA.c), key(posB.r, posB.c)]);
    const add = (r: number, c: number): void => {
      if (this.at(r, c)) seed.add(key(r, c));
    };
    const row = (r: number, effect = true): void => {
      if (r < 0 || r >= this.rows) return;
      for (let c = 0; c < this.cols; c++) add(r, c);
      if (effect) effects.push({ kind: "laser", r, c: posA.c, axis: "h" });
    };
    const col = (c: number, effect = true): void => {
      if (c < 0 || c >= this.cols) return;
      for (let r = 0; r < this.rows; r++) add(r, c);
      if (effect) effects.push({ kind: "laser", r: posA.r, c, axis: "v" });
    };
    const square = (center: Cell, radius: number): void => {
      for (let r = center.r - radius; r <= center.r + radius; r++) {
        for (let c = center.c - radius; c <= center.c + radius; c++) add(r, c);
      }
    };
    const crossLanes = (center: Cell, radius: number): void => {
      for (let d = -radius; d <= radius; d++) {
        row(center.r + d);
        col(center.c + d);
      }
    };
    const boardWipe = (): void => {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) add(r, c);
      }
    };
    const combo = (kind: ComboKind, at: Cell, color?: number): void => {
      effects.push({ kind: "combo", combo: kind, r: at.r, c: at.c, ...(color === undefined ? {} : { color }) });
    };
    const isRocket = (special: Special): special is "rocketH" | "rocketV" =>
      special === "rocketH" || special === "rocketV";
    const resolvedColor = (piece: Piece): number =>
      piece.color >= 0 ? piece.color : this.mostCommonColor();
    const colorCells = (color: number): Cell[] => {
      const cells: Cell[] = [];
      if (color < 0) return cells;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.at(r, c)?.color === color) cells.push({ r, c });
        }
      }
      return cells;
    };

    seed.add(key(posA.r, posA.c));
    seed.add(key(posB.r, posB.c));

    // A singularity wins every pairing, including another singularity.
    if (sa === "singularity" || sb === "singularity") {
      const center = sa === "singularity" ? posA : posB;
      boardWipe();
      combo("singularity", center);
      effects.push({ kind: "singularity", r: center.r, c: center.c });
      return { seed, effects, consumed };
    }

    if (sa === "prism" && sb === "prism") {
      boardWipe();
      combo("prism-prism", posA);
      effects.push({ kind: "singularity", r: posA.r, c: posA.c });
      return { seed, effects, consumed };
    }

    if (sa === "meteor" || sb === "meteor") {
      const other = sa === "meteor" ? sb : sa;
      const otherPiece = sa === "meteor" ? pb : pa;
      const meteorPos = sa === "meteor" ? posA : posB;
      const otherPos = sa === "meteor" ? posB : posA;
      const plus = (cell: Cell): void => {
        add(cell.r, cell.c);
        add(cell.r - 1, cell.c);
        add(cell.r + 1, cell.c);
        add(cell.r, cell.c - 1);
        add(cell.r, cell.c + 1);
      };
      if (other === "meteor") {
        const strikes = this.meteorTargets(8);
        for (const cell of strikes) square(cell, 1);
        combo("meteor-meteor", meteorPos);
        effects.push({ kind: "meteor", r: meteorPos.r, c: meteorPos.c, strikes });
      } else if (isRocket(other)) {
        // Ballistic mail: each impact site fires a full lane, alternating axis.
        const strikes = this.meteorTargets(5);
        strikes.forEach((cell, index) => {
          const horizontal = index % 2 === 0 ? other === "rocketH" : other !== "rocketH";
          if (horizontal) row(cell.r);
          else col(cell.c);
        });
        combo("rocket-meteor", meteorPos);
        effects.push({ kind: "meteor", r: meteorPos.r, c: meteorPos.c, strikes });
      } else if (other === "pulse") {
        const strikes = this.meteorTargets(6);
        for (const cell of strikes) {
          square(cell, 1);
          effects.push({ kind: "pulse", r: cell.r, c: cell.c, radius: 1 });
        }
        combo("pulse-meteor", meteorPos);
        effects.push({ kind: "meteor", r: meteorPos.r, c: meteorPos.c, strikes });
      } else if (other === "nova") {
        row(otherPos.r);
        col(otherPos.c);
        const strikes = this.meteorTargets(7);
        for (const cell of strikes) square(cell, 1);
        combo("meteor-nova", meteorPos);
        effects.push({ kind: "nova", r: otherPos.r, c: otherPos.c, radius: 1 });
        effects.push({ kind: "meteor", r: meteorPos.r, c: meteorPos.c, strikes });
      } else {
        // Meteor + prism: a strike falls on every relic of the paired color.
        const color = resolvedColor(otherPiece);
        const strikes = colorCells(color);
        for (const cell of strikes) plus(cell);
        combo("meteor-prism", otherPos, color);
        effects.push({ kind: "prism", r: otherPos.r, c: otherPos.c, color, mode: "meteor-storm" });
        effects.push({ kind: "meteor", r: meteorPos.r, c: meteorPos.c, strikes });
      }
      return { seed, effects, consumed };
    }

    if (isRocket(sa) && isRocket(sb)) {
      if (sa === sb) {
        const horizontal = sa === "rocketH";
        const indices = new Set(horizontal ? [posA.r, posB.r] : [posA.c, posB.c]);
        if (indices.size === 1) {
          const only = [...indices][0] ?? 0;
          const limit = horizontal ? this.rows : this.cols;
          indices.add(only + 1 < limit ? only + 1 : only - 1);
        }
        for (const index of indices) horizontal ? row(index) : col(index);
        combo(horizontal ? "rocket-parallel-h" : "rocket-parallel-v", posA);
      } else {
        const hPos = sa === "rocketH" ? posA : posB;
        const vPos = sa === "rocketV" ? posA : posB;
        row(hPos.r);
        col(vPos.c);
        combo("rocket-cross", posA);
      }
      return { seed, effects, consumed };
    }

    if ((isRocket(sa) && sb === "pulse") || (isRocket(sb) && sa === "pulse")) {
      const center = sa === "pulse" ? posA : posB;
      crossLanes(center, 1);
      combo("rocket-pulse", center);
      effects.push({ kind: "pulse", r: center.r, c: center.c, radius: 1 });
      return { seed, effects, consumed };
    }

    if ((isRocket(sa) && sb === "nova") || (isRocket(sb) && sa === "nova")) {
      const center = sa === "nova" ? posA : posB;
      crossLanes(center, 2);
      combo("rocket-nova", center);
      effects.push({ kind: "nova", r: center.r, c: center.c, radius: 2 });
      return { seed, effects, consumed };
    }

    if ((isRocket(sa) && sb === "prism") || (isRocket(sb) && sa === "prism")) {
      const rocket = isRocket(sa) ? pa : pb;
      const prismPos = sa === "prism" ? posA : posB;
      const color = resolvedColor(rocket);
      const targets = colorCells(color);
      const startsHorizontal = rocket.special === "rocketH";
      targets.forEach((cell, index) => {
        const horizontal = index % 2 === 0 ? startsHorizontal : !startsHorizontal;
        if (horizontal) {
          for (let c = 0; c < this.cols; c++) add(cell.r, c);
          effects.push({ kind: "laser", r: cell.r, c: cell.c, axis: "h" });
        } else {
          for (let r = 0; r < this.rows; r++) add(r, cell.c);
          effects.push({ kind: "laser", r: cell.r, c: cell.c, axis: "v" });
        }
      });
      combo("rocket-prism", prismPos, color);
      effects.push({ kind: "prism", r: prismPos.r, c: prismPos.c, color, mode: "rocket-rain" });
      return { seed, effects, consumed };
    }

    if (sa === "pulse" && sb === "pulse") {
      square(posA, 2);
      combo("pulse-pulse", posA);
      effects.push({ kind: "pulse", r: posA.r, c: posA.c, radius: 2 });
      return { seed, effects, consumed };
    }

    if ((sa === "pulse" && sb === "nova") || (sa === "nova" && sb === "pulse")) {
      const center = sa === "nova" ? posA : posB;
      square(center, 3);
      combo("pulse-nova", center);
      effects.push({ kind: "nova", r: center.r, c: center.c, radius: 3 });
      return { seed, effects, consumed };
    }

    if ((sa === "pulse" && sb === "prism") || (sa === "prism" && sb === "pulse")) {
      const pulse = sa === "pulse" ? pa : pb;
      const prismPos = sa === "prism" ? posA : posB;
      const color = resolvedColor(pulse);
      for (const cell of colorCells(color)) {
        square(cell, 1);
        effects.push({ kind: "pulse", r: cell.r, c: cell.c, radius: 1 });
      }
      combo("pulse-prism", prismPos, color);
      effects.push({ kind: "prism", r: prismPos.r, c: prismPos.c, color, mode: "blast-field" });
      return { seed, effects, consumed };
    }

    if (sa === "nova" && sb === "nova") {
      boardWipe();
      combo("nova-nova", posA);
      effects.push({ kind: "nova", r: posA.r, c: posA.c, radius: Math.max(this.rows, this.cols) });
      return { seed, effects, consumed };
    }

    if ((sa === "nova" && sb === "prism") || (sa === "prism" && sb === "nova")) {
      const nova = sa === "nova" ? pa : pb;
      const prismPos = sa === "prism" ? posA : posB;
      const color = resolvedColor(nova);
      for (const cell of colorCells(color)) {
        for (let c = 0; c < this.cols; c++) add(cell.r, c);
        for (let r = 0; r < this.rows; r++) add(r, cell.c);
        effects.push({ kind: "nova", r: cell.r, c: cell.c, radius: 1 });
      }
      combo("nova-prism", prismPos, color);
      effects.push({ kind: "prism", r: prismPos.r, c: prismPos.c, color, mode: "cross-storm" });
      return { seed, effects, consumed };
    }

    // The exhaustive matrix above handles every non-none pair.
    return { seed, effects, consumed };
  }

  /** Pick `count` distinct random cells for a meteor bombardment (seeded RNG). */
  private meteorTargets(count: number): Cell[] {
    const cells: Cell[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) cells.push({ r, c });
    }
    const n = Math.min(count, cells.length);
    // Partial Fisher-Yates: only the first n slots need shuffling.
    for (let i = 0; i < n; i++) {
      const j = i + randInt(this.rng, cells.length - i);
      const a = cells[i];
      const b = cells[j];
      if (a && b) {
        cells[i] = b;
        cells[j] = a;
      }
    }
    return cells.slice(0, n);
  }

  /** A lone powerup swapped with a normal piece fires from where it lands. */
  private singleSpecialSeed(
    special: Special,
    pos: Cell,
    targetColor?: number,
  ): { seed: Set<string>; effects: Effect[]; consumed: Set<string> } {
    const seed = new Set<string>([key(pos.r, pos.c)]);
    const effects: Effect[] = [];
    const add = (r: number, c: number): void => {
      if (this.at(r, c)) seed.add(key(r, c));
    };
    switch (special) {
      case "rocketH":
        for (let c = 0; c < this.cols; c++) add(pos.r, c);
        effects.push({ kind: "laser", r: pos.r, c: pos.c, axis: "h" });
        break;
      case "rocketV":
        for (let r = 0; r < this.rows; r++) add(r, pos.c);
        effects.push({ kind: "laser", r: pos.r, c: pos.c, axis: "v" });
        break;
      case "pulse":
        for (let r = pos.r - 1; r <= pos.r + 1; r++) {
          for (let c = pos.c - 1; c <= pos.c + 1; c++) {
            add(r, c);
          }
        }
        effects.push({ kind: "pulse", r: pos.r, c: pos.c, radius: 1 });
        break;
      case "nova":
        for (let c = 0; c < this.cols; c++) add(pos.r, c);
        for (let r = 0; r < this.rows; r++) add(r, pos.c);
        for (let r = pos.r - 1; r <= pos.r + 1; r++) {
          for (let c = pos.c - 1; c <= pos.c + 1; c++) add(r, c);
        }
        effects.push({ kind: "nova", r: pos.r, c: pos.c, radius: 1 });
        break;
      case "meteor": {
        const strikes = this.meteorTargets(4);
        for (const cell of strikes) {
          add(cell.r, cell.c);
          add(cell.r - 1, cell.c);
          add(cell.r + 1, cell.c);
          add(cell.r, cell.c - 1);
          add(cell.r, cell.c + 1);
        }
        effects.push({ kind: "meteor", r: pos.r, c: pos.c, strikes });
        break;
      }
      case "prism": {
        const color = targetColor !== undefined && targetColor >= 0 ? targetColor : this.mostCommonColor();
        if (color >= 0) {
          for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
              if (this.at(r, c)?.color === color) add(r, c);
            }
          }
        }
        effects.push({ kind: "prism", r: pos.r, c: pos.c, color, mode: "clear" });
        break;
      }
      case "singularity":
        for (let r = 0; r < this.rows; r++) {
          for (let c = 0; c < this.cols; c++) add(r, c);
        }
        effects.push({ kind: "singularity", r: pos.r, c: pos.c });
        break;
      default:
        break;
    }
    return { seed, effects, consumed: new Set([key(pos.r, pos.c)]) };
  }

  /** Resolve cascades until the board settles, appending steps. */
  private resolve(
    steps: Step[],
    swapCells: Cell[] | null,
    seededClears: Set<string> | null,
    seededEffects: Effect[],
    seededConsumed: Set<string> | null,
  ): void {
    let cascade = 1;
    let seed = seededClears;
    let seedEffects = seededEffects;
    let consumed = seededConsumed;
    let preferCells = swapCells;

    for (;;) {
      const shapes = this.findShapes();
      if ((!seed || seed.size === 0) && shapes.length === 0) break;

      const groups = this.groupShapes(shapes);
      const created: PlacedPiece[] = [];

      // Decide special creation per group. The old piece at the creation cell
      // is cleared like any other; the new special is placed after removal,
      // so it always survives the blast (and the client sees the old piece
      // pop before the special appears — no ghosts).
      for (const g of groups) {
        const spec = this.specialForGroup(g, preferCells);
        if (spec) {
          const piece = this.makePiece(spec.color, spec.special);
          created.push({ ...piece, r: spec.r, c: spec.c });
        }
      }

      // Collect the base clear set: matched cells + any seeded cells.
      const clearSet = new Set<string>();
      for (const g of groups) for (const cell of g.cells) clearSet.add(key(cell.r, cell.c));
      if (seed) for (const k of seed) clearSet.add(k);

      // Chain-react specials caught in the clear.
      const effects: Effect[] = [...seedEffects];
      this.expandSpecialChains(clearSet, effects, consumed);

      // Score this step.
      let stepScore = clearSet.size * PIECE_SCORE * cascade;
      for (const e of effects) {
        const effectScore = e.kind === "combo" ? COMBO_SCORE[e.combo] : EFFECT_SCORE[e.kind];
        stepScore += effectScore * cascade;
      }
      this.score += stepScore;

      // Emit the clear step.
      const clearedPieces: PlacedPiece[] = [];
      for (const k of clearSet) {
        const [r, c] = k.split(",").map(Number) as [number, number];
        const p = this.at(r, c);
        if (p) clearedPieces.push({ ...p, r, c });
      }
      steps.push({
        type: "clear",
        cascade,
        score: stepScore,
        totalScore: this.score,
        pieces: clearedPieces,
        created,
        effects,
      });

      // Apply: remove cleared, place created specials.
      for (const p of clearedPieces) this.set(p.r, p.c, null);
      for (const p of created) this.set(p.r, p.c, { id: p.id, color: p.color, special: p.special });

      // Gravity.
      const moves: Array<{ id: number; fromR: number; toR: number; c: number }> = [];
      for (let c = 0; c < this.cols; c++) {
        let writeR = this.rows - 1;
        for (let r = this.rows - 1; r >= 0; r--) {
          const p = this.at(r, c);
          if (p) {
            if (writeR !== r) {
              this.set(writeR, c, p);
              this.set(r, c, null);
              moves.push({ id: p.id, fromR: r, toR: writeR, c });
            }
            writeR--;
          }
        }
      }
      if (moves.length > 0) steps.push({ type: "fall", moves });

      // Refill from the top.
      const spawns: PlacedPiece[] = [];
      for (let c = 0; c < this.cols; c++) {
        for (let r = 0; r < this.rows; r++) {
          if (!this.at(r, c)) {
            const piece = this.makePiece(randInt(this.rng, this.colors));
            this.set(r, c, piece);
            spawns.push({ ...piece, r, c });
          }
        }
      }
      if (spawns.length > 0) steps.push({ type: "refill", spawns });

      cascade++;
      seed = null;
      seedEffects = [];
      consumed = null;
      preferCells = null;
    }

    // Deadlock? Reshuffle so there is always a move waiting.
    if (this.findMoves().length === 0) {
      this.reshuffle();
      steps.push({ type: "shuffle", layout: this.board });
    }
  }

  /**
   * BFS specials caught in `clearSet`, expanding it and recording effects.
   * `consumed` holds cells whose specials already spent themselves producing
   * the seed (e.g. the two halves of a special+special swap).
   */
  private expandSpecialChains(
    clearSet: Set<string>,
    effects: Effect[],
    consumed: Set<string> | null,
  ): void {
    const processed = new Set<string>(consumed ?? []);

    for (;;) {
      let grew = false;
      for (const k of [...clearSet]) {
        if (processed.has(k)) continue;
        processed.add(k);
        const [r, c] = k.split(",").map(Number) as [number, number];
        const p = this.at(r, c);
        if (!p || p.special === "none") continue;

        const add = (rr: number, cc: number): void => {
          if (this.at(rr, cc) && !clearSet.has(key(rr, cc))) {
            clearSet.add(key(rr, cc));
            grew = true;
          }
        };

        switch (p.special) {
          case "rocketH":
            for (let cc = 0; cc < this.cols; cc++) add(r, cc);
            effects.push({ kind: "laser", r, c, axis: "h" });
            break;
          case "rocketV":
            for (let rr = 0; rr < this.rows; rr++) add(rr, c);
            effects.push({ kind: "laser", r, c, axis: "v" });
            break;
          case "pulse":
            for (let rr = r - 1; rr <= r + 1; rr++) {
              for (let cc = c - 1; cc <= c + 1; cc++) add(rr, cc);
            }
            effects.push({ kind: "pulse", r, c, radius: 1 });
            break;
          case "nova":
            for (let cc = 0; cc < this.cols; cc++) add(r, cc);
            for (let rr = 0; rr < this.rows; rr++) add(rr, c);
            for (let rr = r - 1; rr <= r + 1; rr++) {
              for (let cc = c - 1; cc <= c + 1; cc++) add(rr, cc);
            }
            effects.push({ kind: "nova", r, c, radius: 1 });
            break;
          case "meteor": {
            const strikes = this.meteorTargets(4);
            for (const cell of strikes) {
              add(cell.r, cell.c);
              add(cell.r - 1, cell.c);
              add(cell.r + 1, cell.c);
              add(cell.r, cell.c - 1);
              add(cell.r, cell.c + 1);
            }
            effects.push({ kind: "meteor", r, c, strikes });
            break;
          }
          case "prism": {
            // A prism caught in a blast targets the board's most common color.
            const color = this.mostCommonColor();
            if (color >= 0) {
              for (let rr = 0; rr < this.rows; rr++) {
                for (let cc = 0; cc < this.cols; cc++) {
                  if (this.at(rr, cc)?.color === color) add(rr, cc);
                }
              }
            }
            effects.push({ kind: "prism", r, c, color, mode: "clear" });
            break;
          }
          case "singularity":
            for (let rr = 0; rr < this.rows; rr++) {
              for (let cc = 0; cc < this.cols; cc++) add(rr, cc);
            }
            effects.push({ kind: "singularity", r, c });
            break;
        }
      }
      if (!grew) {
        // Ensure any newly-added special cells get processed too.
        const unprocessed = [...clearSet].some((k) => {
          if (processed.has(k)) return false;
          const [r, c] = k.split(",").map(Number) as [number, number];
          const p = this.at(r, c);
          return !!p && p.special !== "none";
        });
        if (!unprocessed) break;
      }
    }
  }

  private mostCommonColor(): number {
    const counts = new Map<number, number>();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.at(r, c);
        if (p && p.color >= 0) counts.set(p.color, (counts.get(p.color) ?? 0) + 1);
      }
    }
    let best = -1;
    let bestN = 0;
    for (const [color, n] of counts) {
      if (n > bestN || (n === bestN && color < best)) {
        best = color;
        bestN = n;
      }
    }
    return best;
  }

  /**
   * Find all matched shapes: straight runs of 3+ and 2x2 squares of the same
   * color. Wild powerups (color -1) never match.
   */
  private findShapes(): Shape[] {
    const shapes: Shape[] = [];
    // Horizontal runs.
    for (let r = 0; r < this.rows; r++) {
      let start = 0;
      for (let c = 1; c <= this.cols; c++) {
        const prev = this.at(r, c - 1);
        const cur = c < this.cols ? this.at(r, c) : null;
        const same = !!prev && !!cur && prev.color >= 0 && prev.color === cur.color;
        if (!same) {
          if (prev && prev.color >= 0 && c - start >= 3) {
            shapes.push({
              kind: "h",
              color: prev.color,
              cells: Array.from({ length: c - start }, (_, i) => ({ r, c: start + i })),
            });
          }
          start = c;
        }
      }
    }
    // Vertical runs.
    for (let c = 0; c < this.cols; c++) {
      let start = 0;
      for (let r = 1; r <= this.rows; r++) {
        const prev = this.at(r - 1, c);
        const cur = r < this.rows ? this.at(r, c) : null;
        const same = !!prev && !!cur && prev.color >= 0 && prev.color === cur.color;
        if (!same) {
          if (prev && prev.color >= 0 && r - start >= 3) {
            shapes.push({
              kind: "v",
              color: prev.color,
              cells: Array.from({ length: r - start }, (_, i) => ({ r: start + i, c })),
            });
          }
          start = r;
        }
      }
    }
    // 2x2 squares.
    for (let r = 0; r + 1 < this.rows; r++) {
      for (let c = 0; c + 1 < this.cols; c++) {
        const p = this.at(r, c);
        if (!p || p.color < 0) continue;
        if (
          this.at(r, c + 1)?.color === p.color &&
          this.at(r + 1, c)?.color === p.color &&
          this.at(r + 1, c + 1)?.color === p.color
        ) {
          shapes.push({
            kind: "sq",
            color: p.color,
            cells: [
              { r, c },
              { r, c: c + 1 },
              { r: r + 1, c },
              { r: r + 1, c: c + 1 },
            ],
          });
        }
      }
    }
    return shapes;
  }

  /** Merge shapes that share cells (L/T shapes, runs touching squares) into groups. */
  private groupShapes(shapes: Shape[]): Group[] {
    const groups: Group[] = [];
    const used = new Array(shapes.length).fill(false);
    for (let i = 0; i < shapes.length; i++) {
      if (used[i]) continue;
      const shape = shapes[i];
      if (!shape) continue;
      used[i] = true;
      const members = [shape];
      const cellKeys = new Set(shape.cells.map((c) => key(c.r, c.c)));
      let grew = true;
      while (grew) {
        grew = false;
        for (let j = 0; j < shapes.length; j++) {
          if (used[j]) continue;
          const other = shapes[j];
          if (!other || other.color !== shape.color) continue;
          if (other.cells.some((c) => cellKeys.has(key(c.r, c.c)))) {
            used[j] = true;
            members.push(other);
            for (const c of other.cells) cellKeys.add(key(c.r, c.c));
            grew = true;
          }
        }
      }
      const cells = [...cellKeys].map((k) => {
        const [r, c] = k.split(",").map(Number) as [number, number];
        return { r, c };
      });
      groups.push({ cells, shapes: members, color: shape.color });
    }
    return groups;
  }

  /** Which special (if any) does this matched group create, and where? */
  private specialForGroup(
    g: Group,
    preferCells: Cell[] | null,
  ): { special: Special; color: number; r: number; c: number } | null {
    const lines = g.shapes.filter((s) => s.kind !== "sq");
    const longest =
      lines.length > 0
        ? lines.reduce((a, b) => (b.cells.length > a.cells.length ? b : a))
        : null;
    let special: Special | null = null;
    let color = g.color;

    if ((longest && longest.cells.length >= 6) || g.cells.length >= 9) {
      special = "singularity";
      color = WILD_COLOR;
    } else if (longest && longest.cells.length === 5) {
      special = "prism";
      color = WILD_COLOR;
    } else if (
      lines.length >= 2 &&
      lines.every((s) => s.kind === lines[0]?.kind) &&
      g.shapes.some((s) => s.kind === "sq")
    ) {
      // Parallel runs fused through 2x2 squares: a solid 2x3+ block. That is
      // an asteroid-shaped match, so it manufactures an orbital bombardment.
      special = "meteor";
    } else if (lines.length >= 2) {
      // Intersecting L/T shape.
      special = "nova";
    } else if (g.shapes.some((s) => s.kind === "sq")) {
      special = "pulse";
    } else if (longest && longest.cells.length === 4) {
      // Perpendicular fire: a horizontal 4-match makes a vertical rocket.
      special = longest.kind === "h" ? "rocketV" : "rocketH";
    }
    if (!special) return null;

    // Prefer the swapped cell if it's part of the group; else the intersection
    // cell for L/T shapes; else the middle of the primary shape.
    let pos: Cell | null = null;
    if (preferCells) {
      pos = preferCells.find((p) => g.cells.some((c) => c.r === p.r && c.c === p.c)) ?? null;
    }
    if (!pos && g.shapes.length >= 2) {
      const first = g.shapes[0];
      const second = g.shapes[1];
      if (first && second) {
        pos =
          first.cells.find((c) => second.cells.some((d) => d.r === c.r && d.c === c.c)) ?? null;
      }
    }
    if (!pos) {
      const primary = longest ?? g.shapes[0];
      pos = primary?.cells[Math.floor((primary.cells.length - 1) / 2)] ?? null;
    }
    if (!pos) return null;
    return { special, color, r: pos.r, c: pos.c };
  }

  private generateBoard(): Grid {
    for (let attempt = 0; attempt < 100; attempt++) {
      const grid: Grid = Array.from({ length: this.rows }, () =>
        Array.from({ length: this.cols }, () => null),
      );
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          let color: number;
          do {
            color = randInt(this.rng, this.colors);
          } while (
            (c >= 2 &&
              grid[r]?.[c - 1]?.color === color &&
              grid[r]?.[c - 2]?.color === color) ||
            (r >= 2 &&
              grid[r - 1]?.[c]?.color === color &&
              grid[r - 2]?.[c]?.color === color) ||
            // No ready-made 2x2 squares either.
            (r >= 1 &&
              c >= 1 &&
              grid[r - 1]?.[c]?.color === color &&
              grid[r - 1]?.[c - 1]?.color === color &&
              grid[r]?.[c - 1]?.color === color)
          );
          const row = grid[r];
          if (row) row[c] = this.makePiece(color);
        }
      }
      this.grid = grid;
      if (this.findMoves().length > 0) return grid;
    }
    throw new Error("could not generate a board with a valid move");
  }

  /** Re-deal the current pieces so no matches exist and a move is available. */
  private reshuffle(): void {
    const pieces: Piece[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.at(r, c);
        if (p) pieces.push(p);
      }
    }
    for (let attempt = 0; attempt < 200; attempt++) {
      // Fisher-Yates with the seeded RNG.
      for (let i = pieces.length - 1; i > 0; i--) {
        const j = randInt(this.rng, i + 1);
        const a = pieces[i];
        const b = pieces[j];
        if (a && b) {
          pieces[i] = b;
          pieces[j] = a;
        }
      }
      let idx = 0;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          this.set(r, c, pieces[idx++] ?? null);
        }
      }
      if (this.findShapes().length === 0 && this.findMoves().length > 0) return;
    }
    // Give up on preserving pieces; deal a fresh board.
    this.grid = this.generateBoard();
  }
}
