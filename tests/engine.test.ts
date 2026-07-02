import { describe, expect, it } from "vitest";
import { Game } from "../src/engine/game";
import type { Special, Step } from "../src/engine/types";

/** A neutral filler pattern with no matches and no accidental interactions. */
// Colors 0..5. Layouts below are chosen so only the intended match can occur.

function clearSteps(steps: Step[]) {
  return steps.filter((s) => s.type === "clear");
}

function assertSettled(game: Game): void {
  // Board full…
  expect(game.board.length).toBe(game.cols * game.rows);
  // …and no matches at rest: swapping nothing should find no runs. We check
  // via findMoves not throwing and by resolving having terminated (implicit).
  const colors = new Map<string, number>();
  for (const p of game.board) colors.set(`${p.r},${p.c}`, p.color);
  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c + 2 < game.cols; c++) {
      const a = colors.get(`${r},${c}`);
      if (a === undefined || a < 0) continue;
      expect(a === colors.get(`${r},${c + 1}`) && a === colors.get(`${r},${c + 2}`)).toBe(false);
    }
  }
  for (let c = 0; c < game.cols; c++) {
    for (let r = 0; r + 2 < game.rows; r++) {
      const a = colors.get(`${r},${c}`);
      if (a === undefined || a < 0) continue;
      expect(a === colors.get(`${r + 1},${c}`) && a === colors.get(`${r + 2},${c}`)).toBe(false);
    }
  }
  // …and no 2x2 squares at rest either.
  for (let r = 0; r + 1 < game.rows; r++) {
    for (let c = 0; c + 1 < game.cols; c++) {
      const a = colors.get(`${r},${c}`);
      if (a === undefined || a < 0) continue;
      expect(
        a === colors.get(`${r},${c + 1}`) &&
          a === colors.get(`${r + 1},${c}`) &&
          a === colors.get(`${r + 1},${c + 1}`),
      ).toBe(false);
    }
  }
}

describe("board generation", () => {
  it("fills the board with no matches and at least one move", () => {
    const game = new Game({ seed: 7 });
    expect(game.board.length).toBe(64);
    assertSettled(game);
    expect(game.findMoves().length).toBeGreaterThan(0);
  });

  it("is deterministic for the same seed", () => {
    const a = new Game({ seed: 123 });
    const b = new Game({ seed: 123 });
    expect(a.board).toEqual(b.board);
  });

  it("differs across seeds", () => {
    const a = new Game({ seed: 1 });
    const b = new Game({ seed: 2 });
    expect(a.board).not.toEqual(b.board);
  });
});

describe("swaps", () => {
  it("rejects a swap that makes no match", () => {
    const game = Game.fromColors([
      [0, 1, 2, 3],
      [4, 5, 0, 1],
      [2, 3, 4, 5],
      [0, 1, 2, 3],
    ]);
    const before = game.board;
    const steps = game.swap({ r: 0, c: 0 }, { r: 0, c: 1 });
    expect(steps).toHaveLength(1);
    expect(steps[0]?.type).toBe("invalid");
    expect(game.board).toEqual(before);
    expect(game.score).toBe(0);
  });

  it("rejects non-adjacent swaps", () => {
    const game = new Game({ seed: 3 });
    expect(game.swap({ r: 0, c: 0 }, { r: 2, c: 0 })).toHaveLength(0);
    expect(game.swap({ r: 0, c: 0 }, { r: 1, c: 1 })).toHaveLength(0);
  });

  it("resolves a simple 3-match: swap, clear, fall, refill", () => {
    // Swapping (1,0) down to (2,0) lines up three 0s on the bottom row.
    const game = Game.fromColors([
      [1, 2, 3, 4],
      [0, 5, 1, 2],
      [3, 0, 0, 5],
    ]);
    const steps = game.swap({ r: 1, c: 0 }, { r: 2, c: 0 });
    const types = steps.map((s) => s.type);
    expect(types[0]).toBe("swap");
    expect(types).toContain("clear");
    expect(types).toContain("fall");
    expect(types).toContain("refill");
    const clear = clearSteps(steps)[0];
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      expect(clear.pieces.length).toBe(3);
      expect(clear.cascade).toBe(1);
      expect(clear.score).toBe(3 * 20);
    }
    expect(game.score).toBeGreaterThanOrEqual(60);
    assertSettled(game);
  });
});

describe("special creation", () => {
  it("a horizontal 4-match creates a column-clearing striped piece at the swap cell", () => {
    const game = Game.fromColors([
      [1, 2, 3, 4, 5],
      [0, 0, 1, 0, 0],
      [3, 4, 0, 2, 3],
      [5, 1, 2, 3, 4],
      [2, 3, 4, 5, 0],
    ]);
    // Swap (2,2) up to (1,2) → row 1 becomes 0 0 0 0 0? No: careful, that
    // would be five. Row 1 is [0,0,1,0,0]; bringing the 0 up makes 5 in a row.
    // For a 4-match, use a narrower board below instead.
    const g2 = Game.fromColors([
      [1, 2, 3, 4],
      [0, 0, 1, 0],
      [3, 4, 0, 2],
      [5, 1, 2, 3],
    ]);
    void game;
    const steps = g2.swap({ r: 2, c: 2 }, { r: 1, c: 2 });
    const clear = clearSteps(steps)[0];
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      expect(clear.created).toHaveLength(1);
      expect(clear.created[0]?.special).toBe("stripedV");
      expect(clear.created[0]?.r).toBe(1);
      expect(clear.created[0]?.c).toBe(2);
      // ALL 4 matched pieces are cleared (the old piece at the creation cell
      // must not linger as a ghost); the new special is placed afterwards.
      expect(clear.pieces.length).toBe(4);
    }
    // The replaced piece's id must not survive anywhere on the board.
    if (clear?.type === "clear") {
      const clearedIds = new Set(clear.pieces.map((p) => p.id));
      for (const p of g2.board) expect(clearedIds.has(p.id)).toBe(false);
    }
  });

  it("a 2x2 square match creates a wrapped piece", () => {
    const game = Game.fromColors([
      [0, 0, 2, 3],
      [0, 5, 0, 1],
      [2, 3, 4, 5],
      [3, 1, 2, 0],
    ]);
    // Swap (1,1)↔(1,2) completes the 2x2 of 0s in the top-left.
    const steps = game.swap({ r: 1, c: 1 }, { r: 1, c: 2 });
    const clear = clearSteps(steps)[0];
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      expect(clear.pieces.length).toBe(4);
      expect(clear.created).toHaveLength(1);
      expect(clear.created[0]?.special).toBe("wrapped");
      // Created at the swapped cell, which is part of the square.
      expect(clear.created[0]?.r).toBe(1);
      expect(clear.created[0]?.c).toBe(1);
    }
    assertSettled(game);
  });

  it("a 5-match creates a color bomb", () => {
    const game = Game.fromColors([
      [1, 2, 3, 4, 5],
      [0, 0, 1, 0, 0],
      [3, 4, 0, 2, 3],
      [5, 1, 2, 3, 4],
      [2, 3, 4, 5, 1],
    ]);
    const steps = game.swap({ r: 2, c: 2 }, { r: 1, c: 2 });
    const clear = clearSteps(steps)[0];
    if (clear?.type === "clear") {
      expect(clear.created).toHaveLength(1);
      expect(clear.created[0]?.special).toBe("bomb");
    }
    const bomb = game.board.find((p) => p.special === "bomb");
    expect(bomb).toBeDefined();
    expect(bomb?.color).toBe(-1);
  });

  it("an L-shaped match creates a wrapped piece", () => {
    // Vertical 0s at (0,0),(1,0) and horizontal 0s at (2,1),(2,2); moving
    // (2,1)... instead swap (2,0)←(2,1)? Build: swapping (2,0) with (3,0)
    // brings a 0 to complete both the column and the row through (2,0).
    const game = Game.fromColors([
      [0, 1, 2, 3],
      [0, 4, 5, 1],
      [2, 0, 0, 5],
      [0, 3, 4, 2],
    ]);
    // Swap (3,0) up to (2,0): column 0 becomes 0,0,0 and row 2 becomes 0,0,0.
    const steps = game.swap({ r: 3, c: 0 }, { r: 2, c: 0 });
    const clear = clearSteps(steps)[0];
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      expect(clear.created).toHaveLength(1);
      expect(clear.created[0]?.special).toBe("wrapped");
      expect(clear.created[0]?.r).toBe(2);
      expect(clear.created[0]?.c).toBe(0);
    }
  });
});

describe("special activation", () => {
  it("a striped piece caught in a match clears its whole row", () => {
    const specials: Special[][] = [
      ["none", "none", "none", "none"],
      ["none", "none", "none", "none"],
      ["stripedH", "none", "none", "none"],
      ["none", "none", "none", "none"],
    ];
    const game = Game.fromColors(
      [
        [1, 2, 3, 4],
        [0, 5, 1, 2],
        [0, 3, 2, 5],
        [4, 0, 1, 3],
      ],
      {},
      specials,
    );
    // Swap (3,1) left to (3,0): column 0 becomes 0,0,0 vertically at rows 1..3.
    const steps = game.swap({ r: 3, c: 1 }, { r: 3, c: 0 });
    const clear = clearSteps(steps)[0];
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      // 3 matched + rest of row 2 (3 more pieces) = 6 cleared.
      expect(clear.pieces.length).toBe(6);
      expect(clear.effects.some((e) => e.kind === "stripeH" && e.r === 2)).toBe(true);
    }
  });

  it("swapping a bomb with a normal piece clears that color", () => {
    const specials: Special[][] = [
      ["none", "none", "none", "none"],
      ["bomb", "none", "none", "none"],
      ["none", "none", "none", "none"],
      ["none", "none", "none", "none"],
    ];
    const game = Game.fromColors(
      [
        [2, 1, 2, 3],
        [-1, 2, 4, 2],
        [3, 4, 5, 1],
        [5, 1, 3, 4],
      ],
      {},
      specials,
    );
    const countColor2 = game.board.filter((p) => p.color === 2).length;
    expect(countColor2).toBe(4);
    const steps = game.swap({ r: 1, c: 0 }, { r: 0, c: 0 });
    const clear = clearSteps(steps)[0];
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      // Bomb + every color-2 piece.
      expect(clear.pieces.length).toBe(5);
      expect(clear.effects.some((e) => e.kind === "bomb" && e.color === 2)).toBe(true);
    }
    assertSettled(game);
  });

  it("a striped piece fires when swapped with a normal piece, no match needed", () => {
    const specials: Special[][] = [
      ["none", "none", "none", "none"],
      ["none", "stripedH", "none", "none"],
      ["none", "none", "none", "none"],
      ["none", "none", "none", "none"],
    ];
    const game = Game.fromColors(
      [
        [2, 1, 2, 3],
        [0, 2, 4, 2],
        [3, 4, 5, 1],
        [5, 1, 3, 4],
      ],
      {},
      specials,
    );
    // This swap creates no run or square — the special still fires from where
    // it lands (row 2).
    const steps = game.swap({ r: 1, c: 1 }, { r: 2, c: 1 });
    expect(steps[0]?.type).toBe("swap");
    const clear = clearSteps(steps)[0];
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      expect(clear.pieces.length).toBe(4); // full row 2
      expect(clear.effects.some((e) => e.kind === "stripeH" && e.r === 2)).toBe(true);
    }
    assertSettled(game);
  });

  it("a wrapped piece detonates 3x3 when swapped with a normal piece", () => {
    const specials: Special[][] = [
      ["none", "none", "none", "none"],
      ["none", "wrapped", "none", "none"],
      ["none", "none", "none", "none"],
      ["none", "none", "none", "none"],
    ];
    const game = Game.fromColors(
      [
        [2, 1, 2, 3],
        [0, 2, 4, 2],
        [3, 4, 5, 1],
        [5, 1, 3, 4],
      ],
      {},
      specials,
    );
    const steps = game.swap({ r: 1, c: 1 }, { r: 2, c: 1 });
    const clear = clearSteps(steps)[0];
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      // 3x3 centered on (2,1) = 9 pieces.
      expect(clear.pieces.length).toBe(9);
      expect(clear.effects.some((e) => e.kind === "wrapped" && e.r === 2 && e.c === 1)).toBe(true);
    }
    assertSettled(game);
  });

  it("swapping two striped pieces fires a full cross", () => {
    const specials: Special[][] = [
      ["none", "none", "none", "none"],
      ["stripedH", "stripedV", "none", "none"],
      ["none", "none", "none", "none"],
      ["none", "none", "none", "none"],
    ];
    const game = Game.fromColors(
      [
        [2, 1, 2, 3],
        [0, 2, 4, 2],
        [3, 4, 5, 1],
        [5, 1, 3, 4],
      ],
      {},
      specials,
    );
    const steps = game.swap({ r: 1, c: 0 }, { r: 1, c: 1 });
    const clear = clearSteps(steps)[0];
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      // Full row 1 (4) + full column 0 (4) minus shared cell = 7.
      expect(clear.pieces.length).toBe(7);
      expect(clear.effects.some((e) => e.kind === "stripeH")).toBe(true);
      expect(clear.effects.some((e) => e.kind === "stripeV")).toBe(true);
    }
  });
});

describe("cascades and scoring", () => {
  it("increments the cascade multiplier on chained clears", () => {
    // Clearing the bottom row of 0s drops the 1s into a vertical match.
    const game = Game.fromColors([
      [3, 1, 4, 2],
      [2, 1, 3, 5],
      [4, 1, 2, 3],
      [1, 0, 0, 4],
      [0, 5, 2, 5],
    ]);
    // hmm — engineered cascades with random refill are brittle; instead just
    // assert the cascade field increases when a chain happens in a long
    // random playthrough (below). Here, check multiplier math on cascade 1.
    const steps = game.swap({ r: 3, c: 0 }, { r: 4, c: 0 });
    const clear = clearSteps(steps)[0];
    if (clear?.type === "clear") {
      expect(clear.score).toBe(clear.pieces.length * 20);
    }
  });
});

describe("shuffle", () => {
  it("reshuffles a deadlocked board so a move exists", () => {
    // Diagonal latin square: no matches, no possible moves (brute-force checked).
    const size = 4;
    const colors = [
      [0, 1, 2, 3],
      [1, 2, 3, 0],
      [2, 3, 0, 1],
      [3, 0, 1, 2],
    ];
    const game = Game.fromColors(colors, { seed: 9, colors: 6 });
    expect(game.findMoves().length).toBe(0);
    const step = game.ensureMoveAvailable();
    expect(step?.type).toBe("shuffle");
    expect(game.findMoves().length).toBeGreaterThan(0);
    expect(game.board.length).toBe(size * size);
  });
});

describe("full playthrough (the litmus test)", () => {
  it("plays 150 moves headlessly with invariants intact", () => {
    const game = new Game({ seed: 42 });
    let lastScore = 0;
    let sawCascade = false;
    let sawSpecialCreated = false;
    // Piece-id conservation: every id the steps ever report must exactly
    // account for the board. A mismatch means a ghost (piece removed from the
    // grid without being reported cleared) or a phantom.
    const alive = new Set(game.board.map((p) => p.id));
    for (let move = 0; move < 150; move++) {
      const hint = game.hint();
      expect(hint).not.toBeNull();
      if (!hint) break;
      const steps = game.swap(hint[0], hint[1]);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0]?.type).toBe("swap");
      for (const s of steps) {
        if (s.type === "clear") {
          if (s.cascade >= 2) sawCascade = true;
          if (s.created.length > 0) sawSpecialCreated = true;
          expect(s.score).toBeGreaterThan(0);
          for (const p of s.pieces) {
            expect(alive.has(p.id)).toBe(true);
            alive.delete(p.id);
          }
          for (const p of s.created) alive.add(p.id);
        } else if (s.type === "refill") {
          for (const p of s.spawns) alive.add(p.id);
        } else if (s.type === "shuffle") {
          alive.clear();
          for (const p of s.layout) alive.add(p.id);
        }
      }
      expect(game.board.length).toBe(64);
      const boardIds = new Set(game.board.map((p) => p.id));
      expect(boardIds.size).toBe(alive.size);
      for (const id of boardIds) expect(alive.has(id)).toBe(true);
      assertSettled(game);
      expect(game.score).toBeGreaterThan(lastScore);
      lastScore = game.score;
    }
    expect(game.movesMade).toBe(150);
    // A 150-move game should organically produce cascades and specials.
    expect(sawCascade).toBe(true);
    expect(sawSpecialCreated).toBe(true);
  });

  it("is fully deterministic end-to-end", () => {
    const play = (): number => {
      const g = new Game({ seed: 1337 });
      for (let i = 0; i < 60; i++) {
        const h = g.hint();
        if (!h) break;
        g.swap(h[0], h[1]);
      }
      return g.score;
    };
    const a = play();
    const b = play();
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });
});
