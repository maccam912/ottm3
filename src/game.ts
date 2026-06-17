// The game controller. Owns the logical board, the map of gem views, player
// input, and the swap -> match -> clear -> collapse -> cascade flow. It speaks
// to Babylon only through SceneManager / GemView / Effects, and to the player
// only through UI and AudioEngine.

import { PointerEventTypes } from '@babylonjs/core';
import { audio } from './audio';
import {
  collapseAndRefill,
  expandActivations,
  findHint,
  hasAvailableMove,
  hasMatch,
  makeCell,
  makeGrid,
  resolveBoard,
  swap,
} from './board';
import { CONFIG, RAINBOW_COLOR } from './config';
import { Effects } from './render/effects';
import { GemView } from './render/gemView';
import { MaterialCache } from './render/materials';
import { SceneManager } from './render/scene';
import { GemKind, Grid, MatchResult, Pos } from './types';
import { UI } from './ui';

const DRAG_THRESHOLD = 18; // px before a drag commits to a swap

export class Game {
  private grid: Grid = [];
  private views = new Map<number, GemView>();
  private busy = false;

  private firstSelect: Pos | null = null;
  private dragStart: { x: number; y: number } | null = null;

  private idleSince = performance.now();
  private hintShownFor = 0;

  constructor(
    private sm: SceneManager,
    private mats: MaterialCache,
    private fx: Effects,
    private ui: UI
  ) {}

  // --- Lifecycle ---------------------------------------------------------

  start(): void {
    this.grid = makeGrid();
    this.spawnInitialViews();
    this.attachInput();
    // Occasional ambient pad for atmosphere.
    setInterval(() => audio.ambientPad(), 11000);
  }

  update(dt: number): void {
    for (const v of this.views.values()) v.update(dt);
    this.ui.update();
    this.maybeHint();
  }

  private spawnInitialViews(): void {
    for (let r = 0; r < CONFIG.ROWS; r++)
      for (let c = 0; c < CONFIG.COLS; c++) {
        const cell = this.grid[r][c]!;
        // Stagger the opening cascade so the board pours in.
        const view = new GemView(this.sm, this.mats, cell.id, cell.color, cell.kind, r, c, -CONFIG.ROWS - c);
        this.views.set(cell.id, view);
      }
  }

  // --- Input -------------------------------------------------------------

  private attachInput(): void {
    const scene = this.sm.scene;
    scene.onPointerObservable.add((pi) => {
      switch (pi.type) {
        case PointerEventTypes.POINTERDOWN:
          this.onDown(scene.pointerX, scene.pointerY);
          break;
        case PointerEventTypes.POINTERMOVE:
          this.onMove(scene.pointerX, scene.pointerY);
          break;
        case PointerEventTypes.POINTERUP:
          this.dragStart = null;
          break;
      }
    });
  }

  private pickPos(x: number, y: number): Pos | null {
    const pick = this.sm.scene.pick(x, y, (m) => {
      for (const v of this.views.values()) if (v.mesh === m) return true;
      return false;
    });
    if (!pick?.hit || !pick.pickedMesh) return null;
    for (const v of this.views.values())
      if (v.mesh === pick.pickedMesh) return this.posOfId(v.id);
    return null;
  }

  private onDown(x: number, y: number): void {
    if (this.busy) return;
    audio.init();
    audio.resume();
    const pos = this.pickPos(x, y);
    if (!pos) return;
    this.idleSince = performance.now();

    if (!this.firstSelect) {
      this.select(pos);
      this.dragStart = { x, y };
    } else if (this.adjacent(this.firstSelect, pos)) {
      const a = this.firstSelect;
      this.clearSelection();
      void this.trySwap(a, pos);
    } else {
      this.clearSelection();
      this.select(pos);
      this.dragStart = { x, y };
    }
  }

  private onMove(x: number, y: number): void {
    if (this.busy || !this.firstSelect || !this.dragStart) return;
    const dx = x - this.dragStart.x;
    const dy = y - this.dragStart.y;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    // Screen-y grows downward; board row grows downward too.
    let target: Pos;
    if (Math.abs(dx) > Math.abs(dy)) target = { r: this.firstSelect.r, c: this.firstSelect.c + Math.sign(dx) };
    else target = { r: this.firstSelect.r + Math.sign(dy), c: this.firstSelect.c };
    const from = this.firstSelect;
    this.dragStart = null;
    this.clearSelection();
    if (this.inBounds(target)) void this.trySwap(from, target);
  }

  private select(pos: Pos): void {
    this.firstSelect = pos;
    this.viewAt(pos)?.setSelected(true);
    audio.select();
  }

  private clearSelection(): void {
    if (this.firstSelect) this.viewAt(this.firstSelect)?.setSelected(false);
    this.firstSelect = null;
  }

  // --- Swap flow ---------------------------------------------------------

  private async trySwap(a: Pos, b: Pos): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.idleSince = performance.now();
    this.clearHint();
    try {
      await this.performSwap(a, b);
    } finally {
      this.busy = false;
      this.idleSince = performance.now();
    }
  }

  private async performSwap(a: Pos, b: Pos): Promise<void> {
    const ca = this.cellAt(a)!;
    const cb = this.cellAt(b)!;
    const va = this.views.get(ca.id)!;
    const vb = this.views.get(cb.id)!;

    audio.swap(this.pan(b.c));
    swap(this.grid, a, b);
    va.moveTo(b.r, b.c);
    vb.moveTo(a.r, a.c);
    await this.wait(CONFIG.SWAP_TIME * 1000 + 60);

    if (await this.resolveSpecialSwap(a, b)) return;

    if (hasMatch(this.grid)) {
      await this.resolveLoop(null, this.matchOrigin(a, b));
    } else {
      audio.swapBack(this.pan(b.c));
      swap(this.grid, a, b);
      va.moveTo(a.r, a.c);
      vb.moveTo(b.r, b.c);
      await this.wait(CONFIG.SWAP_TIME * 1000 + 40);
    }
  }

  /** Handle swaps that should directly fire one or two special gems. Returns
   *  true if it consumed the swap (no normal matching needed). */
  private async resolveSpecialSwap(a: Pos, b: Pos): Promise<boolean> {
    const ca = this.cellAt(a)!;
    const cb = this.cellAt(b)!;
    const aColor = ca.kind === GemKind.Color;
    const bColor = cb.kind === GemKind.Color;

    if (aColor || bColor) {
      let seed: Pos[];
      if (aColor && bColor) {
        seed = this.allPositions(); // double rainbow -> clear the board
        this.fx.flash(0.7);
      } else {
        const colorPos = aColor ? a : b;
        const partner = aColor ? cb : ca;
        seed = this.positionsOfColor(partner.color);
        seed.push(colorPos);
      }
      audio.detonate();
      this.sm.shake(0.25);
      await this.resolveLoop(seed, null);
      return true;
    }

    const aSpecial = this.isLineOrBomb(ca.kind);
    const bSpecial = this.isLineOrBomb(cb.kind);

    if (aSpecial && bSpecial) {
      await this.resolveLoop(this.comboCells(b, ca.kind, cb.kind), null);
      return true;
    }

    if (aSpecial || bSpecial) {
      if (hasMatch(this.grid)) return false; // a normal match will detonate it
      const spPos = aSpecial ? a : b;
      await this.resolveLoop([spPos], null);
      return true;
    }

    return false;
  }

  // --- Cascade resolution ------------------------------------------------

  private async resolveLoop(firstClear: Pos[] | null, origin: Pos | null): Promise<void> {
    let level = 0;
    while (true) {
      let cleared: Pos[];
      let spawns: MatchResult['spawns'];
      if (level === 0 && firstClear) {
        cleared = expandActivations(this.grid, firstClear);
        spawns = [];
      } else {
        const res = resolveBoard(this.grid, origin ?? undefined);
        origin = null;
        if (res.cleared.length === 0) break;
        cleared = expandActivations(this.grid, res.cleared);
        spawns = res.spawns;
      }
      level++;
      await this.applyClear(cleared, spawns, level);
    }
    if (level >= 2) this.ui.showCombo(level);
    this.ensureMoves();
  }

  private async applyClear(cleared: Pos[], spawns: MatchResult['spawns'], level: number): Promise<void> {
    let detonations = 0;

    // Pop every cleared gem.
    const clearPromises: Promise<void>[] = [];
    for (const p of cleared) {
      const cell = this.cellAt(p);
      if (!cell) continue;
      const view = this.views.get(cell.id);
      if (!view) continue;
      const isSpecial = cell.kind !== GemKind.Normal;
      if (isSpecial) {
        detonations++;
        this.fx.shockwave(view.worldPos(), cell.color, cell.kind === GemKind.Bomb ? 2.0 : 3.2);
      }
      this.fx.burst(view.worldPos(), cell.color, isSpecial ? 1.6 : 1);
      this.views.delete(cell.id);
      this.grid[p.r][p.c] = null;
      clearPromises.push(view.clear());
    }

    // Scoring rewards both size and cascade depth.
    const points = Math.round(
      cleared.length * CONFIG.SCORE_PER_GEM * (1 + (level - 1) * CONFIG.COMBO_BONUS)
    );
    this.ui.addScore(points);
    audio.match(level, cleared.length, this.pan(cleared[0]?.c ?? CONFIG.COLS / 2));
    if (detonations > 0) {
      audio.detonate();
      this.sm.shake(Math.min(0.4, 0.12 + detonations * 0.05));
    }

    // Spawn the freshly created special gems where the matches were made.
    for (const s of spawns) {
      const cell = makeCell(s.color, s.kind);
      this.grid[s.pos.r][s.pos.c] = cell;
      const view = new GemView(this.sm, this.mats, cell.id, cell.color, cell.kind, s.pos.r, s.pos.c);
      view.setSelected(true); // a celebratory pop
      view.setSelected(false);
      this.views.set(cell.id, view);
      audio.special(this.pan(s.pos.c));
      this.fx.burst(view.worldPos(), s.color === RAINBOW_COLOR ? RAINBOW_COLOR : s.color, 1.2);
    }

    await Promise.all(clearPromises);

    // Gravity + refill, animating falls and new gems pouring from the top.
    const { falls, spawned } = collapseAndRefill(this.grid);
    for (const f of falls) this.views.get(f.id)?.moveTo(f.to.r, f.to.c);
    for (const sp of spawned) {
      const view = new GemView(
        this.sm,
        this.mats,
        sp.cell.id,
        sp.cell.color,
        sp.cell.kind,
        sp.to.r,
        sp.to.c,
        sp.fromRow
      );
      this.views.set(sp.cell.id, view);
    }

    await this.wait(CONFIG.CASCADE_SETTLE * 1000 + 170);
  }

  // --- Stuck detection / reshuffle --------------------------------------

  private ensureMoves(): void {
    if (hasAvailableMove(this.grid)) return;
    this.ui.toast('No moves — reshuffling');
    audio.invalid();
    // Tear down and pour a fresh, solvable board back in.
    for (const v of this.views.values()) v.dispose();
    this.views.clear();
    this.grid = makeGrid();
    this.spawnInitialViews();
  }

  // --- Hints -------------------------------------------------------------

  private maybeHint(): void {
    if (this.busy || this.firstSelect) return;
    if (performance.now() - this.idleSince < 4500) return;
    const hint = findHint(this.grid);
    if (!hint) return;
    const id = this.cellAt(hint[0])?.id ?? 0;
    if (id === this.hintShownFor) {
      // Re-pulse periodically.
      if (performance.now() - this.idleSince > 6500) this.idleSince = performance.now() - 4500;
    }
    this.hintShownFor = id;
    this.viewAt(hint[0])?.soft.pop(0.22);
    this.viewAt(hint[1])?.soft.pop(0.22);
    this.idleSince = performance.now() - 3000; // throttle to ~1.5s cadence
  }

  private clearHint(): void {
    this.hintShownFor = 0;
  }

  // --- Special combo geometry -------------------------------------------

  private comboCells(center: Pos, k1: GemKind, k2: GemKind): Pos[] {
    const bombs = [k1, k2].filter((k) => k === GemKind.Bomb).length;
    const out: Pos[] = [];
    const add = (r: number, c: number) => {
      if (r >= 0 && r < CONFIG.ROWS && c >= 0 && c < CONFIG.COLS) out.push({ r, c });
    };
    if (bombs === 2) {
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) add(center.r + dr, center.c + dc);
    } else if (bombs === 1) {
      for (let r = 0; r < CONFIG.ROWS; r++) for (let dc = -1; dc <= 1; dc++) add(r, center.c + dc);
      for (let c = 0; c < CONFIG.COLS; c++) for (let dr = -1; dr <= 1; dr++) add(center.r + dr, c);
    } else {
      for (let r = 0; r < CONFIG.ROWS; r++) add(r, center.c);
      for (let c = 0; c < CONFIG.COLS; c++) add(center.r, c);
    }
    return out;
  }

  // --- Small helpers -----------------------------------------------------

  private cellAt(p: Pos) {
    return this.grid[p.r]?.[p.c] ?? null;
  }

  private viewAt(p: Pos): GemView | undefined {
    const cell = this.cellAt(p);
    return cell ? this.views.get(cell.id) : undefined;
  }

  private posOfId(id: number): Pos | null {
    for (let r = 0; r < CONFIG.ROWS; r++)
      for (let c = 0; c < CONFIG.COLS; c++) if (this.grid[r][c]?.id === id) return { r, c };
    return null;
  }

  private allPositions(): Pos[] {
    const out: Pos[] = [];
    for (let r = 0; r < CONFIG.ROWS; r++) for (let c = 0; c < CONFIG.COLS; c++) out.push({ r, c });
    return out;
  }

  private positionsOfColor(color: number): Pos[] {
    const out: Pos[] = [];
    for (let r = 0; r < CONFIG.ROWS; r++)
      for (let c = 0; c < CONFIG.COLS; c++) if (this.grid[r][c]?.color === color) out.push({ r, c });
    return out;
  }

  private isLineOrBomb(k: GemKind): boolean {
    return k === GemKind.LineH || k === GemKind.LineV || k === GemKind.Bomb;
  }

  /** Prefer spawning newly-created special gems under the cell the player
   *  swapped into, which feels the most responsive. */
  private matchOrigin(_a: Pos, b: Pos): Pos {
    return b;
  }

  private adjacent(a: Pos, b: Pos): boolean {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  private inBounds(p: Pos): boolean {
    return p.r >= 0 && p.r < CONFIG.ROWS && p.c >= 0 && p.c < CONFIG.COLS;
  }

  private pan(c: number): number {
    return (c / (CONFIG.COLS - 1) - 0.5) * 1.2;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }
}
