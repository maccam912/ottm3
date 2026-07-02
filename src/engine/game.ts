/**
 * Pure, deterministic match-3 engine. No renderer or framework imports.
 *
 * A move is resolved into an ordered list of `Step`s (swap, clear, fall,
 * refill, shuffle) that a client replays with animation. The entire game can
 * be played headlessly by calling `swap()` in a loop — see tests.
 */
import { mulberry32, randInt, type Rng } from "./rng";
import type { Cell, Effect, GameConfig, Piece, PlacedPiece, Special, Step } from "./types";
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

const BOMB_COLOR = -1;

/** Score constants — chunky, legible numbers. */
const PIECE_SCORE = 20;
const EFFECT_SCORE: Record<Effect["kind"], number> = {
  stripeH: 60,
  stripeV: 60,
  wrapped: 120,
  bomb: 300,
  bombAll: 1000,
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

    if (sa === "bomb" && sb === "bomb") {
      for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) seed.add(key(r, c));
      effects.push({ kind: "bombAll", r: posA.r, c: posA.c });
      // Everything is already exploding; no further chains needed.
      return { seed, effects, consumed: new Set(seed) };
    }
    if (sa === "bomb" || sb === "bomb") {
      const bombPos = sa === "bomb" ? posA : posB;
      const other = sa === "bomb" ? pb : pa;
      seed.add(key(bombPos.r, bombPos.c));
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.at(r, c)?.color === other.color) seed.add(key(r, c));
        }
      }
      effects.push({ kind: "bomb", r: bombPos.r, c: bombPos.c, color: other.color });
      // Only the bomb itself is spent; specials it catches still chain.
      return { seed, effects, consumed: new Set([key(bombPos.r, bombPos.c)]) };
    }
    if (sa !== "none" && sb === "none") {
      return this.singleSpecialSeed(sa, posA);
    }
    if (sb !== "none" && sa === "none") {
      return this.singleSpecialSeed(sb, posB);
    }
    if (sa !== "none" && sb !== "none") {
      // striped+striped → cross; wrapped+striped → 3 rows + 3 cols; wrapped+wrapped → 5×5.
      if (sa === "wrapped" && sb === "wrapped") {
        for (let r = posB.r - 2; r <= posB.r + 2; r++) {
          for (let c = posB.c - 2; c <= posB.c + 2; c++) {
            if (this.at(r, c)) seed.add(key(r, c));
          }
        }
        effects.push({ kind: "wrapped", r: posB.r, c: posB.c });
        effects.push({ kind: "wrapped", r: posA.r, c: posA.c });
      } else if (sa === "wrapped" || sb === "wrapped") {
        const center = sa === "wrapped" ? posA : posB;
        for (let d = -1; d <= 1; d++) {
          for (let c = 0; c < this.cols; c++) {
            if (this.at(center.r + d, c)) seed.add(key(center.r + d, c));
          }
          for (let r = 0; r < this.rows; r++) {
            if (this.at(r, center.c + d)) seed.add(key(r, center.c + d));
          }
          effects.push({ kind: "stripeH", r: center.r + d, c: center.c });
          effects.push({ kind: "stripeV", r: center.r, c: center.c + d });
        }
      } else {
        // striped + striped: force a full cross regardless of orientations.
        for (let c = 0; c < this.cols; c++) if (this.at(posA.r, c)) seed.add(key(posA.r, c));
        for (let r = 0; r < this.rows; r++) if (this.at(r, posB.c)) seed.add(key(r, posB.c));
        effects.push({ kind: "stripeH", r: posA.r, c: posA.c });
        effects.push({ kind: "stripeV", r: posB.r, c: posB.c });
      }
      // Both specials are consumed without re-firing their normal behavior.
      seed.add(key(posA.r, posA.c));
      seed.add(key(posB.r, posB.c));
      return {
        seed,
        effects,
        consumed: new Set([key(posA.r, posA.c), key(posB.r, posB.c)]),
      };
    }
    return null;
  }

  /** A lone striped/wrapped swapped with a normal piece fires from where it lands. */
  private singleSpecialSeed(
    special: Special,
    pos: Cell,
  ): { seed: Set<string>; effects: Effect[]; consumed: Set<string> } {
    const seed = new Set<string>([key(pos.r, pos.c)]);
    const effects: Effect[] = [];
    switch (special) {
      case "stripedH":
        for (let c = 0; c < this.cols; c++) if (this.at(pos.r, c)) seed.add(key(pos.r, c));
        effects.push({ kind: "stripeH", r: pos.r, c: pos.c });
        break;
      case "stripedV":
        for (let r = 0; r < this.rows; r++) if (this.at(r, pos.c)) seed.add(key(r, pos.c));
        effects.push({ kind: "stripeV", r: pos.r, c: pos.c });
        break;
      case "wrapped":
        for (let r = pos.r - 1; r <= pos.r + 1; r++) {
          for (let c = pos.c - 1; c <= pos.c + 1; c++) {
            if (this.at(r, c)) seed.add(key(r, c));
          }
        }
        effects.push({ kind: "wrapped", r: pos.r, c: pos.c });
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
      for (const e of effects) stepScore += EFFECT_SCORE[e.kind] * cascade;
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
          case "stripedH":
            for (let cc = 0; cc < this.cols; cc++) add(r, cc);
            effects.push({ kind: "stripeH", r, c });
            break;
          case "stripedV":
            for (let rr = 0; rr < this.rows; rr++) add(rr, c);
            effects.push({ kind: "stripeV", r, c });
            break;
          case "wrapped":
            for (let rr = r - 1; rr <= r + 1; rr++) {
              for (let cc = c - 1; cc <= c + 1; cc++) add(rr, cc);
            }
            effects.push({ kind: "wrapped", r, c });
            break;
          case "bomb": {
            // A bomb caught in an explosion detonates on the most common color.
            const color = this.mostCommonColor();
            if (color >= 0) {
              for (let rr = 0; rr < this.rows; rr++) {
                for (let cc = 0; cc < this.cols; cc++) {
                  if (this.at(rr, cc)?.color === color) add(rr, cc);
                }
              }
            }
            effects.push({ kind: "bomb", r, c, color });
            break;
          }
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
   * color. Bombs (color -1) never match.
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

    if (longest && longest.cells.length >= 5) {
      special = "bomb";
      color = BOMB_COLOR;
    } else if (lines.length >= 2) {
      // Intersecting L/T shape.
      special = "wrapped";
    } else if (g.shapes.some((s) => s.kind === "sq")) {
      // A 2x2 square bakes a little bomb.
      special = "wrapped";
    } else if (longest && longest.cells.length === 4) {
      // Perpendicular fire: a horizontal 4-match clears a column, and vice versa.
      special = longest.kind === "h" ? "stripedV" : "stripedH";
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
