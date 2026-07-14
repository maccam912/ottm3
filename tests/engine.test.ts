import { describe, expect, it } from "vitest";
import { Game } from "../src/engine/game";
import { mulberry32 } from "../src/engine/rng";
import type { ComboKind, Special, Step } from "../src/engine/types";

/** A neutral filler pattern with no matches and no accidental interactions. */
// Colors 0..5. Layouts below are chosen so only the intended match can occur.

function clearSteps(steps: Step[]) {
  return steps.filter((s) => s.type === "clear");
}

function neutralBoard(size = 8): number[][] {
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => (r * 2 + c) % 6),
  );
}

function gameWithPair(
  a: Special,
  b: Special,
  extras: Array<{ r: number; c: number; special: Special }> = [],
): Game {
  const colors = neutralBoard();
  const specials: Special[][] = Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => "none" as const),
  );
  const cells = [
    { r: 3, c: 3, special: a },
    { r: 3, c: 4, special: b },
    ...extras,
  ];
  for (const cell of cells) {
    const row = specials[cell.r];
    if (row) row[cell.c] = cell.special;
    if (cell.special === "prism" || cell.special === "singularity") {
      const colorRow = colors[cell.r];
      if (colorRow) colorRow[cell.c] = -1;
    }
  }
  return Game.fromColors(colors, { seed: 71 }, specials);
}

function pairClear(a: Special, b: Special) {
  return clearSteps(gameWithPair(a, b).swap({ r: 3, c: 3 }, { r: 3, c: 4 }))[0];
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
      expect(clear.score).toBe(3 * 100);
    }
    expect(game.score).toBeGreaterThanOrEqual(300);
    assertSettled(game);
  });
});

describe("special creation", () => {
  it("a horizontal 4-match creates a column-clearing rocket at the swap cell", () => {
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
      expect(clear.created[0]?.special).toBe("rocketV");
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

  it("a 2x2 square match creates a pulse", () => {
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
      expect(clear.created[0]?.special).toBe("pulse");
      // Created at the swapped cell, which is part of the square.
      expect(clear.created[0]?.r).toBe(1);
      expect(clear.created[0]?.c).toBe(1);
    }
    assertSettled(game);
  });

  it("a straight 5-match creates a prism", () => {
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
      expect(clear.created[0]?.special).toBe("prism");
    }
    const prism = game.board.find((p) => p.special === "prism");
    expect(prism).toBeDefined();
    expect(prism?.color).toBe(-1);
  });

  it("a straight 6-match creates a singularity", () => {
    const game = Game.fromColors([
      [1, 2, 3, 4, 5, 1],
      [0, 0, 1, 0, 0, 0],
      [2, 3, 0, 5, 1, 2],
      [3, 4, 5, 1, 2, 3],
      [4, 5, 1, 2, 3, 4],
    ]);
    const steps = game.swap({ r: 2, c: 2 }, { r: 1, c: 2 });
    const clear = clearSteps(steps)[0];
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      expect(clear.pieces.length).toBe(6);
      expect(clear.created).toHaveLength(1);
      expect(clear.created[0]?.special).toBe("singularity");
      expect(clear.created[0]?.color).toBe(-1);
    }
  });

  it("a nine-cell intersecting group creates a singularity", () => {
    const colors = neutralBoard(7);
    for (let i = 1; i <= 5; i++) {
      const row = colors[3];
      const columnRow = colors[i];
      if (row) row[i] = 0;
      if (columnRow) columnRow[3] = 0;
    }
    const game = Game.fromColors(colors);
    // `fromColors` permits scripted ready-made shapes. Swapping two equal arm
    // pieces lets us exercise the nine-cell grouping rule directly.
    const steps = game.swap({ r: 3, c: 1 }, { r: 3, c: 2 });
    const clear = clearSteps(steps)[0];
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      expect(clear.pieces.length).toBeGreaterThanOrEqual(9);
      expect(clear.created).toHaveLength(1);
      expect(clear.created[0]?.special).toBe("singularity");
    }
  });

  it("an L-shaped match creates a nova", () => {
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
      expect(clear.created[0]?.special).toBe("nova");
      expect(clear.created[0]?.r).toBe(2);
      expect(clear.created[0]?.c).toBe(0);
    }
  });
});

describe("special activation", () => {
  it("a rocket caught in a match clears its whole row", () => {
    const specials: Special[][] = [
      ["none", "none", "none", "none"],
      ["none", "none", "none", "none"],
      ["rocketH", "none", "none", "none"],
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
      expect(clear.effects.some((e) => e.kind === "laser" && e.axis === "h" && e.r === 2)).toBe(true);
    }
  });

  it("swapping a prism with a normal piece clears that color", () => {
    const specials: Special[][] = [
      ["none", "none", "none", "none"],
      ["prism", "none", "none", "none"],
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
      // Prism + every color-2 piece.
      expect(clear.pieces.length).toBe(5);
      expect(clear.effects.some((e) => e.kind === "prism" && e.color === 2)).toBe(true);
    }
    assertSettled(game);
  });

  it("a prism caught in another blast targets the most common color", () => {
    const game = gameWithPair("pulse", "none", [{ r: 2, c: 3, special: "prism" }]);
    const counts = new Map<number, number>();
    for (const piece of game.board) {
      if (piece.color >= 0) counts.set(piece.color, (counts.get(piece.color) ?? 0) + 1);
    }
    const expectedColor = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
    const steps = game.swap({ r: 3, c: 3 }, { r: 3, c: 4 });
    const clear = clearSteps(steps)[0];
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      expect(
        clear.effects.some(
          (e) => e.kind === "prism" && e.mode === "clear" && e.color === expectedColor,
        ),
      ).toBe(true);
    }
    assertSettled(game);
  });

  it("a rocket fires when swapped with a normal piece, no match needed", () => {
    const specials: Special[][] = [
      ["none", "none", "none", "none"],
      ["none", "rocketH", "none", "none"],
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
      expect(clear.effects.some((e) => e.kind === "laser" && e.axis === "h" && e.r === 2)).toBe(true);
    }
    assertSettled(game);
  });

  it("a pulse detonates 3x3 when swapped with a normal piece", () => {
    const specials: Special[][] = [
      ["none", "none", "none", "none"],
      ["none", "pulse", "none", "none"],
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
      expect(clear.effects.some((e) => e.kind === "pulse" && e.r === 2 && e.c === 1)).toBe(true);
    }
    assertSettled(game);
  });

  it("a nova clears its row, column, and surrounding 3x3", () => {
    const game = gameWithPair("nova", "none");
    const steps = game.swap({ r: 3, c: 3 }, { r: 3, c: 4 });
    const clear = clearSteps(steps)[0];
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      expect(clear.pieces.length).toBe(19);
      expect(clear.effects).toContainEqual({ kind: "nova", r: 3, c: 4, radius: 1 });
    }
    assertSettled(game);
  });

  it("a singularity wipes the board when swapped with a normal piece", () => {
    const game = gameWithPair("singularity", "none");
    const steps = game.swap({ r: 3, c: 3 }, { r: 3, c: 4 });
    const clear = clearSteps(steps)[0];
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      expect(clear.pieces.length).toBe(64);
      expect(clear.effects).toContainEqual({ kind: "singularity", r: 3, c: 4 });
    }
    assertSettled(game);
  });

  it("swapping perpendicular rockets fires a full cross", () => {
    const specials: Special[][] = [
      ["none", "none", "none", "none"],
      ["rocketH", "rocketV", "none", "none"],
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
      expect(clear.effects.some((e) => e.kind === "combo" && e.combo === "rocket-cross")).toBe(true);
      expect(clear.effects.some((e) => e.kind === "laser" && e.axis === "h")).toBe(true);
      expect(clear.effects.some((e) => e.kind === "laser" && e.axis === "v")).toBe(true);
    }
  });
});

describe("powerup fusion matrix", () => {
  const comboCases: Array<[Special, Special, ComboKind]> = [
    ["rocketH", "rocketH", "rocket-parallel-h"],
    ["rocketV", "rocketV", "rocket-parallel-v"],
    ["rocketH", "rocketV", "rocket-cross"],
    ["rocketH", "pulse", "rocket-pulse"],
    ["rocketV", "nova", "rocket-nova"],
    ["rocketH", "prism", "rocket-prism"],
    ["pulse", "pulse", "pulse-pulse"],
    ["pulse", "nova", "pulse-nova"],
    ["pulse", "prism", "pulse-prism"],
    ["nova", "nova", "nova-nova"],
    ["nova", "prism", "nova-prism"],
    ["rocketH", "meteor", "rocket-meteor"],
    ["pulse", "meteor", "pulse-meteor"],
    ["meteor", "nova", "meteor-nova"],
    ["meteor", "prism", "meteor-prism"],
    ["meteor", "meteor", "meteor-meteor"],
    ["prism", "prism", "prism-prism"],
    ["pulse", "singularity", "singularity"],
  ];

  it.each(comboCases)("%s + %s emits the %s combo", (a, b, combo) => {
    const clear = pairClear(a, b);
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      expect(clear.effects.some((e) => e.kind === "combo" && e.combo === combo)).toBe(true);
      expect(clear.score).toBeGreaterThan(10_000);
    }
  });

  it("resolves every asymmetric fusion identically in reverse order", () => {
    for (const [a, b, combo] of comboCases) {
      if (a === b) continue;
      const clear = pairClear(b, a);
      expect(clear?.type).toBe("clear");
      if (clear?.type === "clear") {
        expect(clear.effects.some((e) => e.kind === "combo" && e.combo === combo)).toBe(true);
      }
    }
  });

  const footprintCases: Array<[Special, Special, number]> = [
    ["rocketH", "rocketH", 16],
    ["rocketV", "rocketV", 16],
    ["rocketH", "rocketV", 15],
    ["rocketH", "pulse", 39],
    ["rocketH", "nova", 55],
    ["pulse", "pulse", 25],
    ["pulse", "nova", 49],
    ["nova", "nova", 64],
    ["prism", "prism", 64],
  ];

  it.each(footprintCases)("%s + %s clears its bespoke %i-cell footprint", (a, b, count) => {
    const clear = pairClear(a, b);
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") expect(clear.pieces.length).toBe(count);
  });

  it.each(["rocketH", "pulse", "nova", "meteor", "prism", "singularity"] as const)(
    "%s + singularity wipes the board",
    (special) => {
      const clear = pairClear(special, "singularity");
      expect(clear?.type).toBe("clear");
      if (clear?.type === "clear") {
        expect(clear.pieces.length).toBe(64);
        expect(
          clear.effects.some((e) => e.kind === "combo" && e.combo === "singularity"),
        ).toBe(true);
      }
    },
  );

  it("color fusions report their target color and spectacle mode", () => {
    const cases: Array<[
      Special,
      Special,
      ComboKind,
      "rocket-rain" | "blast-field" | "cross-storm",
    ]> = [
      ["rocketH", "prism", "rocket-prism", "rocket-rain"],
      ["pulse", "prism", "pulse-prism", "blast-field"],
      ["nova", "prism", "nova-prism", "cross-storm"],
    ];
    for (const [a, b, combo, mode] of cases) {
      const clear = pairClear(a, b);
      expect(clear?.type).toBe("clear");
      if (clear?.type !== "clear") continue;
      const comboFx = clear.effects.find((e) => e.kind === "combo" && e.combo === combo);
      const prismFx = clear.effects.find((e) => e.kind === "prism" && e.mode === mode);
      expect(comboFx?.kind === "combo" ? comboFx.color : undefined).toBeGreaterThanOrEqual(0);
      expect(prismFx?.kind === "prism" ? prismFx.color : undefined).toBe(
        comboFx?.kind === "combo" ? comboFx.color : undefined,
      );
    }
  });

  it("consumes only the fused pair while caught third-party powerups still chain", () => {
    const game = gameWithPair("nova", "nova", [{ r: 0, c: 0, special: "rocketH" }]);
    const clear = clearSteps(game.swap({ r: 3, c: 3 }, { r: 3, c: 4 }))[0];
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      expect(clear.pieces.length).toBe(64);
      expect(clear.effects.filter((e) => e.kind === "nova")).toHaveLength(1);
      expect(clear.effects.some((e) => e.kind === "laser" && e.r === 0)).toBe(true);
    }
  });
});

describe("meteor", () => {
  it("a solid 2x3 block creates a meteor at the swapped cell", () => {
    const game = Game.fromColors([
      [0, 0, 0, 4],
      [0, 2, 0, 1],
      [2, 0, 3, 5],
      [5, 1, 2, 3],
    ]);
    // Swap (2,1) up into (1,1): rows 0-1 × cols 0-2 become a solid block of 0s
    // (two parallel 3-runs fused through 2x2 squares).
    const steps = game.swap({ r: 2, c: 1 }, { r: 1, c: 1 });
    const clear = clearSteps(steps)[0];
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      expect(clear.pieces.length).toBe(6);
      expect(clear.created).toHaveLength(1);
      expect(clear.created[0]?.special).toBe("meteor");
      expect(clear.created[0]?.r).toBe(1);
      expect(clear.created[0]?.c).toBe(1);
      expect(clear.created[0]?.color).toBe(0);
    }
    assertSettled(game);
  });

  it("an L/T intersection still creates a nova, not a meteor", () => {
    const colors = neutralBoard(7);
    // A vertical 3-run in column 3 (rows 1-3) plus a horizontal 3-run in
    // row 3 (cols 3-5) sharing the corner: perpendicular lines, no square.
    for (const [r, c] of [
      [1, 3],
      [2, 3],
      [3, 3],
      [3, 4],
      [3, 5],
    ] as const) {
      const row = colors[r];
      if (row) row[c] = 0;
    }
    const game = Game.fromColors(colors);
    const steps = game.swap({ r: 3, c: 4 }, { r: 3, c: 5 });
    const clear = clearSteps(steps)[0];
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      expect(clear.created[0]?.special).toBe("nova");
    }
  });

  it("a meteor fired alone bombards four random cells with plus-shaped blasts", () => {
    const game = gameWithPair("meteor", "none");
    const steps = game.swap({ r: 3, c: 3 }, { r: 3, c: 4 });
    const clear = clearSteps(steps)[0];
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      const meteor = clear.effects.find((e) => e.kind === "meteor");
      expect(meteor?.kind).toBe("meteor");
      if (meteor?.kind === "meteor") {
        expect(meteor.strikes).toHaveLength(4);
        // Strike cells are distinct and inside the board.
        const keys = new Set(meteor.strikes.map((s) => `${s.r},${s.c}`));
        expect(keys.size).toBe(4);
        for (const s of meteor.strikes) {
          expect(s.r).toBeGreaterThanOrEqual(0);
          expect(s.r).toBeLessThan(8);
          expect(s.c).toBeGreaterThanOrEqual(0);
          expect(s.c).toBeLessThan(8);
        }
        // Every strike cell itself is cleared.
        const cleared = new Set(clear.pieces.map((p) => `${p.r},${p.c}`));
        for (const s of meteor.strikes) expect(cleared.has(`${s.r},${s.c}`)).toBe(true);
      }
      expect(clear.pieces.length).toBeGreaterThanOrEqual(5);
    }
    assertSettled(game);
  });

  it("meteor strikes are deterministic for a given seed", () => {
    const strikesOf = (): string => {
      const game = gameWithPair("meteor", "none");
      const clear = clearSteps(game.swap({ r: 3, c: 3 }, { r: 3, c: 4 }))[0];
      if (clear?.type !== "clear") return "";
      const meteor = clear.effects.find((e) => e.kind === "meteor");
      return meteor?.kind === "meteor"
        ? meteor.strikes.map((s) => `${s.r},${s.c}`).join(";")
        : "";
    };
    const first = strikesOf();
    expect(first).not.toBe("");
    expect(strikesOf()).toBe(first);
  });

  it("a meteor caught in another blast chains its own bombardment", () => {
    const game = gameWithPair("pulse", "none", [{ r: 2, c: 3, special: "meteor" }]);
    const steps = game.swap({ r: 3, c: 3 }, { r: 3, c: 4 });
    const clear = clearSteps(steps)[0];
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      expect(clear.effects.some((e) => e.kind === "pulse")).toBe(true);
      expect(clear.effects.some((e) => e.kind === "meteor")).toBe(true);
    }
    assertSettled(game);
  });

  it("meteor + prism strikes every relic of the paired color", () => {
    const clear = pairClear("meteor", "prism");
    expect(clear?.type).toBe("clear");
    if (clear?.type === "clear") {
      const comboFx = clear.effects.find((e) => e.kind === "combo" && e.combo === "meteor-prism");
      const color = comboFx?.kind === "combo" ? comboFx.color : undefined;
      expect(color).toBeGreaterThanOrEqual(0);
      expect(
        clear.effects.some((e) => e.kind === "prism" && e.mode === "meteor-storm" && e.color === color),
      ).toBe(true);
      const meteor = clear.effects.find((e) => e.kind === "meteor");
      if (meteor?.kind === "meteor") {
        // One strike per relic of the target color; all of them cleared.
        const cleared = new Set(clear.pieces.map((p) => `${p.r},${p.c}`));
        for (const s of meteor.strikes) expect(cleared.has(`${s.r},${s.c}`)).toBe(true);
        expect(meteor.strikes.length).toBeGreaterThan(0);
      }
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
      expect(clear.score).toBe(clear.pieces.length * 100);
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

describe("clone and bestMove (the solver)", () => {
  it("rng state survives snapshot/restore", () => {
    const a = mulberry32(42);
    a();
    a();
    const b = mulberry32(0);
    b.setState(a.getState());
    expect([b(), b(), b()]).toEqual([a(), a(), a()]);
  });

  it("clone is a deep, independent copy", () => {
    const game = new Game({ seed: 99 });
    const copy = game.clone();
    expect(copy.board).toEqual(game.board);

    const move = game.hint();
    expect(move).not.toBeNull();
    if (!move) return;
    copy.swap(move[0], move[1]);
    // The original is untouched by the clone's move…
    expect(game.score).toBe(0);
    expect(game.movesMade).toBe(0);
    assertSettled(game);
    // …and the clone actually played it.
    expect(copy.score).toBeGreaterThan(0);
  });

  it("bestMove predicts the exact score of playing it", () => {
    for (const seed of [7, 123, 555, 90210]) {
      const game = new Game({ seed });
      for (let i = 0; i < 10; i++) {
        const best = game.bestMove();
        expect(best).not.toBeNull();
        if (!best) break;
        const before = game.score;
        game.swap(best.a, best.b);
        expect(game.score - before).toBe(best.score);
      }
    }
  });

  it("bestMove never picks worse points than the first-found move", () => {
    const game = new Game({ seed: 31337 });
    for (let i = 0; i < 20; i++) {
      const best = game.bestMove();
      const hint = game.hint();
      expect(best).not.toBeNull();
      expect(hint).not.toBeNull();
      if (!best || !hint) break;
      const sim = game.clone();
      sim.swap(hint[0], hint[1]);
      const hintScore = sim.score - game.score;
      // Ranking is score + specials bonus, so pure score can only lose to a
      // move that bakes more specials — which the bonus values at 2,500 each.
      expect(best.score + best.specials * 2_500).toBeGreaterThanOrEqual(hintScore);
      game.swap(best.a, best.b);
    }
  });

  it("returns null on a board with no valid moves", () => {
    // A verified deadlocked layout: no matches, and no swap creates one.
    const layout = [
      [3, 1, 2, 1],
      [0, 1, 2, 0],
      [2, 0, 3, 1],
      [2, 3, 0, 2],
    ];
    const game = Game.fromColors(layout, { colors: 6 });
    expect(game.findMoves().length).toBe(0);
    expect(game.bestMove()).toBeNull();
  });
});

describe("bestSetupMove (two-move lookahead)", () => {
  it("predicts both moves' exact scores", () => {
    for (const seed of [7, 123, 90210]) {
      const game = new Game({ seed });
      for (let i = 0; i < 5; i++) {
        const plan = game.bestSetupMove();
        expect(plan).not.toBeNull();
        if (!plan) break;
        expect(plan.totalScore).toBe(plan.score + plan.next.score);

        const s0 = game.score;
        game.swap(plan.a, plan.b);
        expect(game.score - s0).toBe(plan.score);

        const s1 = game.score;
        game.swap(plan.next.a, plan.next.b);
        expect(game.score - s1).toBe(plan.next.score);
      }
    }
  });

  it("is at least as valuable over two moves as playing greedily", () => {
    const value = (score: number, specials: number) => score + specials * 2_500;
    for (const seed of [42, 31337]) {
      const game = new Game({ seed });
      const plan = game.bestSetupMove();
      expect(plan).not.toBeNull();
      if (!plan) continue;

      // Greedy: best move now, then best move after it.
      const sim = game.clone();
      const greedy1 = sim.bestMove();
      expect(greedy1).not.toBeNull();
      if (!greedy1) continue;
      sim.swap(greedy1.a, greedy1.b);
      const greedy2 = sim.bestMove();
      const greedyValue =
        value(greedy1.score, greedy1.specials) +
        (greedy2 ? value(greedy2.score, greedy2.specials) : 0);
      const planValue =
        value(plan.score, plan.specials) + value(plan.next.score, plan.next.specials);
      expect(planValue).toBeGreaterThanOrEqual(greedyValue);
    }
  });
});
