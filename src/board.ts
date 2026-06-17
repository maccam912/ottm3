// Pure match-3 board logic. No rendering, no timers, no globals beyond a
// monotonic id counter. Everything here is deterministic given its inputs
// (an injectable RNG where randomness is needed) so it can be unit-tested.

import { CONFIG, RAINBOW_COLOR } from './config';
import { Cell, GemKind, Grid, MatchResult, MatchRun, Pos } from './types';

let _id = 1;
/** Stable identity for a freshly created gem. */
export function newId(): number {
  return _id++;
}
/** Test helper — reset the id sequence for reproducible snapshots. */
export function _resetIds(): void {
  _id = 1;
}

export type Rng = () => number;
const defaultRng: Rng = Math.random;

export function randColor(rng: Rng = defaultRng, colors = CONFIG.COLORS): number {
  return Math.floor(rng() * colors);
}

export function makeCell(color: number, kind: GemKind = GemKind.Normal): Cell {
  return { id: newId(), color, kind };
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function inBounds(r: number, c: number, rows: number = CONFIG.ROWS, cols: number = CONFIG.COLS): boolean {
  return r >= 0 && r < rows && c >= 0 && c < cols;
}

/** Build a starting grid guaranteed to contain no immediate matches and at
 *  least one available move. All gems are Normal. */
export function makeGrid(rng: Rng = defaultRng, rows = CONFIG.ROWS, cols = CONFIG.COLS): Grid {
  let grid: Grid;
  do {
    grid = [];
    for (let r = 0; r < rows; r++) {
      grid[r] = [];
      for (let c = 0; c < cols; c++) {
        let color: number;
        // Reject colours that would complete a horizontal or vertical triple.
        let guard = 0;
        do {
          color = randColor(rng, CONFIG.COLORS);
          guard++;
        } while (guard < 50 && createsTripleAt(grid, r, c, color));
        grid[r][c] = makeCell(color);
      }
    }
  } while (!hasAvailableMove(grid));
  return grid;
}

/** Would placing `color` at (r,c) complete a run of 3 using already-filled
 *  cells above/left? Used only during initial generation. */
function createsTripleAt(grid: Grid, r: number, c: number, color: number): boolean {
  const left1 = grid[r]?.[c - 1];
  const left2 = grid[r]?.[c - 2];
  if (left1?.color === color && left2?.color === color) return true;
  const up1 = grid[r - 1]?.[c];
  const up2 = grid[r - 2]?.[c];
  if (up1?.color === color && up2?.color === color) return true;
  return false;
}

// --- Match finding ------------------------------------------------------

/** All horizontal and vertical runs of length >= 3 of equal colour. */
export function findRuns(grid: Grid, rows = grid.length, cols = grid[0]?.length ?? 0): MatchRun[] {
  const runs: MatchRun[] = [];
  const sameColor = (a: Cell | null, b: Cell | null) =>
    !!a && !!b && a.color === b.color && a.color !== RAINBOW_COLOR;

  // Horizontal
  for (let r = 0; r < rows; r++) {
    let start = 0;
    for (let c = 1; c <= cols; c++) {
      if (c < cols && sameColor(grid[r][c], grid[r][start])) continue;
      const len = c - start;
      if (len >= 3) {
        runs.push({
          dir: 'h',
          len,
          color: grid[r][start]!.color,
          cells: Array.from({ length: len }, (_, i) => ({ r, c: start + i })),
        });
      }
      start = c;
    }
  }
  // Vertical
  for (let c = 0; c < cols; c++) {
    let start = 0;
    for (let r = 1; r <= rows; r++) {
      if (r < rows && sameColor(grid[r][c], grid[start][c])) continue;
      const len = r - start;
      if (len >= 3) {
        runs.push({
          dir: 'v',
          len,
          color: grid[start][c]!.color,
          cells: Array.from({ length: len }, (_, i) => ({ r: start + i, c })),
        });
      }
      start = r;
    }
  }
  return runs;
}

/** Every 2x2 block of one colour. The player specifically asked for square
 *  combos, which standard run-matching never produces. */
export function findSquares(grid: Grid, rows = grid.length, cols = grid[0]?.length ?? 0): Pos[][] {
  const squares: Pos[][] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = grid[r][c];
      if (!a || a.color === RAINBOW_COLOR) continue;
      const b = grid[r][c + 1];
      const d = grid[r + 1][c];
      const e = grid[r + 1][c + 1];
      if (b?.color === a.color && d?.color === a.color && e?.color === a.color) {
        squares.push([
          { r, c },
          { r, c: c + 1 },
          { r: r + 1, c },
          { r: r + 1, c: c + 1 },
        ]);
      }
    }
  }
  return squares;
}

export function hasMatch(grid: Grid): boolean {
  return findRuns(grid).length > 0 || findSquares(grid).length > 0;
}

const key = (p: Pos) => p.r * 1000 + p.c;

/** Resolve every base match on the board into the set of cells to clear and
 *  the special gems to spawn. Connected components of matched cells are
 *  classified by shape:
 *    - length >= 5 straight     -> Color (rainbow)
 *    - L / T intersection (>=5) -> Bomb
 *    - 2x2 square               -> Bomb
 *    - straight 4               -> LineH / LineV
 *  `origin` (the player's swap target) is preferred as the spawn cell. */
export function resolveBoard(grid: Grid, origin?: Pos): MatchResult {
  const runs = findRuns(grid);
  const squares = findSquares(grid);

  const matched = new Map<number, Pos>();
  for (const run of runs) for (const p of run.cells) matched.set(key(p), p);
  for (const sq of squares) for (const p of sq) matched.set(key(p), p);

  const squareKeys = new Set<number>();
  for (const sq of squares) for (const p of sq) squareKeys.add(key(p));

  // Connected components over matched cells (4-adjacency, same colour).
  const visited = new Set<number>();
  const spawns: MatchResult['spawns'] = [];

  for (const [k, start] of matched) {
    if (visited.has(k)) continue;
    const comp: Pos[] = [];
    const stack = [start];
    const color = grid[start.r][start.c]!.color;
    visited.add(k);
    while (stack.length) {
      const p = stack.pop()!;
      comp.push(p);
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const np = { r: p.r + dr, c: p.c + dc };
        const nk = key(np);
        if (matched.has(nk) && !visited.has(nk) && grid[np.r][np.c]?.color === color) {
          visited.add(nk);
          stack.push(np);
        }
      }
    }
    const spawn = classifyComponent(comp, squareKeys, color, origin);
    if (spawn) spawns.push(spawn);
  }

  return { cleared: [...matched.values()], spawns, runs };
}

function classifyComponent(
  comp: Pos[],
  squareKeys: Set<number>,
  color: number,
  origin?: Pos
): MatchResult['spawns'][number] | null {
  let maxH = 0;
  let maxV = 0;
  const set = new Set(comp.map(key));
  for (const p of comp) {
    // horizontal run length through p
    let h = 1;
    for (let c = p.c - 1; set.has(key({ r: p.r, c })); c--) h++;
    for (let c = p.c + 1; set.has(key({ r: p.r, c })); c++) h++;
    maxH = Math.max(maxH, h);
    let v = 1;
    for (let r = p.r - 1; set.has(key({ r, c: p.c })); r--) v++;
    for (let r = p.r + 1; set.has(key({ r, c: p.c })); r++) v++;
    maxV = Math.max(maxV, v);
  }

  const isSquare = comp.some((p) => squareKeys.has(key(p)));
  const at = pickSpawnPos(comp, origin);

  if (maxH >= 5 || maxV >= 5) return { pos: at, color: RAINBOW_COLOR, kind: GemKind.Color };
  if (maxH >= 3 && maxV >= 3) return { pos: at, color, kind: GemKind.Bomb };
  if (comp.length >= 4 && maxH === 4) return { pos: at, color, kind: GemKind.LineH };
  if (comp.length >= 4 && maxV === 4) return { pos: at, color, kind: GemKind.LineV };
  if (isSquare && comp.length >= 4) return { pos: at, color, kind: GemKind.Bomb };
  return null;
}

function pickSpawnPos(comp: Pos[], origin?: Pos): Pos {
  if (origin && comp.some((p) => p.r === origin.r && p.c === origin.c)) return origin;
  // Deterministic middle cell.
  const sorted = [...comp].sort((a, b) => a.r - b.r || a.c - b.c);
  return sorted[Math.floor(sorted.length / 2)];
}

// --- Special-gem activation --------------------------------------------

/** Expand an initial set of cleared cells by activating any special gems
 *  contained within it, chaining until the set is stable. Returns the full
 *  set of positions to clear (including the seeds). Pure read of `grid`. */
export function expandActivations(
  grid: Grid,
  seed: Pos[],
  rows = grid.length,
  cols = grid[0]?.length ?? 0
): Pos[] {
  const cleared = new Map<number, Pos>();
  const queue: Pos[] = [];
  for (const p of seed) {
    if (!cleared.has(key(p))) {
      cleared.set(key(p), p);
      queue.push(p);
    }
  }

  const add = (r: number, c: number) => {
    if (!inBounds(r, c, rows, cols)) return;
    const k = key({ r, c });
    if (!cleared.has(k)) {
      const p = { r, c };
      cleared.set(k, p);
      queue.push(p);
    }
  };

  while (queue.length) {
    const p = queue.shift()!;
    const cell = grid[p.r][p.c];
    if (!cell) continue;
    switch (cell.kind) {
      case GemKind.LineH:
        for (let c = 0; c < cols; c++) add(p.r, c);
        break;
      case GemKind.LineV:
        for (let r = 0; r < rows; r++) add(r, p.c);
        break;
      case GemKind.Bomb:
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) add(p.r + dr, p.c + dc);
        break;
      case GemKind.Color: {
        // Rainbow: clears the most common colour currently on the board.
        const target = dominantColor(grid, rows, cols);
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++)
            if (grid[r][c]?.color === target) add(r, c);
        break;
      }
      default:
        break;
    }
  }
  return [...cleared.values()];
}

function dominantColor(grid: Grid, rows: number, cols: number): number {
  const counts = new Map<number, number>();
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const col = grid[r][c]?.color;
      if (col != null && col !== RAINBOW_COLOR)
        counts.set(col, (counts.get(col) ?? 0) + 1);
    }
  let best = 0;
  let bestN = -1;
  for (const [col, n] of counts)
    if (n > bestN) {
      bestN = n;
      best = col;
    }
  return best;
}

// --- Mutation helpers (used by the controller) -------------------------

export function swap(grid: Grid, a: Pos, b: Pos): void {
  const tmp = grid[a.r][a.c];
  grid[a.r][a.c] = grid[b.r][b.c];
  grid[b.r][b.c] = tmp;
}

export function areAdjacent(a: Pos, b: Pos): boolean {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

/** Would swapping a and b produce at least one match? */
export function wouldSwapMatch(grid: Grid, a: Pos, b: Pos): boolean {
  const ca = grid[a.r][a.c];
  const cb = grid[b.r][b.c];
  // Swapping with a rainbow gem always "works" (it detonates on colour).
  if (ca?.kind === GemKind.Color || cb?.kind === GemKind.Color) return true;
  const clone = cloneGrid(grid);
  swap(clone, a, b);
  return hasMatch(clone);
}

/** Does any legal move exist on the board? */
export function hasAvailableMove(grid: Grid, rows = grid.length, cols = grid[0]?.length ?? 0): boolean {
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols && wouldSwapMatch(grid, { r, c }, { r, c: c + 1 })) return true;
      if (r + 1 < rows && wouldSwapMatch(grid, { r, c }, { r: r + 1, c })) return true;
    }
  return false;
}

/** Find one legal move, or null. Used for hints. */
export function findHint(grid: Grid, rows = grid.length, cols = grid[0]?.length ?? 0): [Pos, Pos] | null {
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols && wouldSwapMatch(grid, { r, c }, { r, c: c + 1 }))
        return [{ r, c }, { r, c: c + 1 }];
      if (r + 1 < rows && wouldSwapMatch(grid, { r, c }, { r: r + 1, c }))
        return [{ r, c }, { r: r + 1, c }];
    }
  return null;
}

/**
 * Collapse gems downward under gravity and refill empty cells from the top.
 * Returns the list of moves (cell id, from-row, to-row) and the freshly
 * spawned cells so the renderer can animate them in.
 */
export interface CollapseResult {
  falls: { id: number; from: Pos; to: Pos }[];
  spawned: { cell: Cell; to: Pos; fromRow: number }[];
}

export function collapseAndRefill(
  grid: Grid,
  rng: Rng = defaultRng,
  rows = grid.length,
  cols = grid[0]?.length ?? 0
): CollapseResult {
  const falls: CollapseResult['falls'] = [];
  const spawned: CollapseResult['spawned'] = [];

  for (let c = 0; c < cols; c++) {
    let write = rows - 1;
    for (let r = rows - 1; r >= 0; r--) {
      const cell = grid[r][c];
      if (cell) {
        if (write !== r) {
          grid[write][c] = cell;
          grid[r][c] = null;
          falls.push({ id: cell.id, from: { r, c }, to: { r: write, c } });
        }
        write--;
      }
    }
    // Fill the remaining cells at the top with new gems.
    let spawnIndex = 0;
    for (let r = write; r >= 0; r--) {
      const cell = makeCell(randColor(rng, CONFIG.COLORS));
      grid[r][c] = cell;
      spawnIndex++;
      spawned.push({ cell, to: { r, c }, fromRow: -spawnIndex });
    }
  }
  return { falls, spawned };
}
