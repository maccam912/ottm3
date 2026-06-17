import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  _resetIds,
  makeCell,
  makeGrid,
  findRuns,
  findSquares,
  hasMatch,
  resolveBoard,
  expandActivations,
  collapseAndRefill,
  wouldSwapMatch,
  hasAvailableMove,
  findHint,
} from '../src/board';
import { GemKind, Grid } from '../src/types';

// Build a grid from a colour matrix; -2 means "empty hole" for collapse tests.
function grid(rows: number[][]): Grid {
  return rows.map((row) =>
    row.map((color) => (color < 0 && color === -2 ? null : makeCell(color)))
  );
}

// Deterministic RNG for reproducible board generation.
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

beforeEach(() => _resetIds());

describe('match finding', () => {
  it('finds a horizontal run of 3', () => {
    const g = grid([
      [0, 0, 0, 1, 2, 3, 4, 5],
      [1, 2, 3, 4, 5, 0, 1, 2],
      [2, 3, 4, 5, 0, 1, 2, 3],
    ]);
    const runs = findRuns(g, 3, 8);
    expect(runs.some((r) => r.dir === 'h' && r.len === 3)).toBe(true);
  });

  it('finds a vertical run of 4', () => {
    const g = grid([
      [0, 1, 2],
      [0, 3, 4],
      [0, 5, 1],
      [0, 2, 3],
    ]);
    const runs = findRuns(g, 4, 3);
    expect(runs.some((r) => r.dir === 'v' && r.len === 4)).toBe(true);
  });

  it('does not treat a 2x2 block as a run', () => {
    const g = grid([
      [0, 0, 1],
      [0, 0, 2],
      [3, 4, 5],
    ]);
    expect(findRuns(g, 3, 3)).toHaveLength(0);
  });

  it('detects a 2x2 square explicitly', () => {
    const g = grid([
      [0, 0, 1],
      [0, 0, 2],
      [3, 4, 5],
    ]);
    expect(findSquares(g, 3, 3)).toHaveLength(1);
    expect(hasMatch(g)).toBe(true);
  });
});

describe('special spawning', () => {
  it('spawns a horizontal line gem from a 4-in-a-row', () => {
    const g = grid([
      [0, 0, 0, 0, 1, 2, 3, 4],
      [1, 2, 3, 4, 5, 0, 1, 2],
      [2, 3, 4, 5, 0, 1, 2, 3],
    ]);
    const res = resolveBoard(g);
    expect(res.cleared.length).toBe(4);
    expect(res.spawns).toHaveLength(1);
    expect(res.spawns[0].kind).toBe(GemKind.LineH);
  });

  it('spawns a bomb from a 2x2 square', () => {
    const g = grid([
      [0, 0, 1],
      [0, 0, 2],
      [3, 4, 5],
    ]);
    const res = resolveBoard(g);
    expect(res.spawns.some((s) => s.kind === GemKind.Bomb)).toBe(true);
  });

  it('spawns a rainbow gem from a 5-in-a-row', () => {
    const g = grid([
      [0, 0, 0, 0, 0, 1, 2, 3],
      [1, 2, 3, 4, 5, 0, 1, 2],
      [2, 3, 4, 5, 0, 1, 2, 3],
    ]);
    const res = resolveBoard(g);
    expect(res.spawns.some((s) => s.kind === GemKind.Color)).toBe(true);
  });

  it('spawns a bomb from an L/T intersection of 5', () => {
    const g = grid([
      [0, 0, 0, 1],
      [0, 2, 3, 4],
      [0, 5, 1, 2],
    ]);
    const res = resolveBoard(g);
    expect(res.spawns.some((s) => s.kind === GemKind.Bomb)).toBe(true);
  });
});

describe('special activation', () => {
  it('a line gem clears its whole row', () => {
    const g = grid([
      [1, 2, 3, 4],
      [5, 0, 1, 2],
      [3, 4, 5, 0],
    ]);
    g[0][0] = makeCell(1, GemKind.LineH);
    const cleared = expandActivations(g, [{ r: 0, c: 0 }], 3, 4);
    expect(cleared).toHaveLength(4); // entire top row
  });

  it('a bomb clears a 3x3 area', () => {
    const g = grid([
      [1, 2, 3, 4],
      [5, 0, 1, 2],
      [3, 4, 5, 0],
    ]);
    g[1][1] = makeCell(0, GemKind.Bomb);
    const cleared = expandActivations(g, [{ r: 1, c: 1 }], 3, 4);
    expect(cleared.length).toBe(9);
  });

  it('chains when one special clears another', () => {
    const g = grid([
      [1, 2, 3, 4],
      [5, 0, 1, 2],
      [3, 4, 5, 0],
    ]);
    g[0][0] = makeCell(1, GemKind.LineH); // clears row 0
    g[0][3] = makeCell(2, GemKind.LineV); // sits in row 0 -> fires its column
    const cleared = expandActivations(g, [{ r: 0, c: 0 }], 3, 4);
    // Whole top row (4) plus the rest of column 3 (2 more cells).
    expect(cleared.length).toBe(6);
  });
});

describe('gravity and refill', () => {
  it('drops gems into holes and fills the top', () => {
    const g = grid([
      [0, 1, 2],
      [-2, 3, 4],
      [-2, 5, 0],
    ]);
    const { falls, spawned } = collapseAndRefill(g, seeded(7), 3, 3);
    // Column 0 had one gem and two holes -> one fall + two new gems.
    expect(g[2][0]).not.toBeNull();
    expect(falls.length + spawned.length).toBeGreaterThan(0);
    // Board is now completely full.
    expect(g.every((row) => row.every((c) => c !== null))).toBe(true);
  });
});

describe('move detection', () => {
  it('detects a swap that would create a match', () => {
    const g = grid([
      [0, 1, 0],
      [2, 0, 3],
      [4, 5, 1],
    ]);
    // Swapping (1,1)=0 with (0,1)=1 makes the top row 0,0,0.
    expect(wouldSwapMatch(g, { r: 1, c: 1 }, { r: 0, c: 1 })).toBe(true);
  });

  it('finds a hint when a move exists', () => {
    const g = grid([
      [0, 1, 0],
      [2, 0, 3],
      [4, 5, 1],
    ]);
    expect(findHint(g, 3, 3)).not.toBeNull();
  });
});

describe('board generation', () => {
  it('produces a full board with no initial matches and a legal move', () => {
    const g = makeGrid(seeded(123));
    expect(hasMatch(g)).toBe(false);
    expect(hasAvailableMove(g)).toBe(true);
  });
});
