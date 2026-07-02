import Phaser from "phaser";
import { Game } from "../../engine/game";
import type { Cell, Effect, PlacedPiece, Step } from "../../engine/types";
import {
  ACCENTS,
  BOARD_X,
  BOARD_Y,
  CELL,
  COLS,
  COMBO_WORDS,
  FONT,
  GAME_HEIGHT,
  GAME_WIDTH,
  ROWS,
  cellX,
  cellY,
} from "../constants";
import { PieceView } from "../PieceView";
import { Sfx } from "../Sfx";

interface DragStart {
  cell: Cell;
  x: number;
  y: number;
}

declare global {
  interface Window {
    __glaze?: {
      score: () => number;
      best: () => number;
      isLocked: () => boolean;
      hint: () => [Cell, Cell] | null;
      swap: (a: Cell, b: Cell) => void;
      board: () => PlacedPiece[];
      viewCount: () => number;
    };
  }
}

export class GameScene extends Phaser.Scene {
  private engine!: Game;
  private sfx!: Sfx;
  private views = new Map<number, PieceView>();
  private piecesLayer!: Phaser.GameObjects.Container;
  private fxLayer!: Phaser.GameObjects.Container;

  private locked = true;
  private selected: Cell | null = null;
  private dragStart: DragStart | null = null;
  private lastAction = 0;

  private shownScore = 0;
  private best = 0;
  private lastMilestone = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;

  constructor() {
    super("game");
  }

  create(data: { seed?: number }): void {
    const url = new URL(window.location.href);
    const urlSeed = url.searchParams.get("seed");
    const seed = data.seed ?? (urlSeed ? Number(urlSeed) : (Math.random() * 2 ** 31) | 0);

    this.engine = new Game({ cols: COLS, rows: ROWS, colors: 6, seed });
    this.sfx = new Sfx(this);
    this.views.clear();
    this.selected = null;
    this.dragStart = null;
    this.shownScore = 0;
    this.lastMilestone = 0;
    this.best = Number(localStorage.getItem("glaze.best") ?? 0);

    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, "bg");
    this.drawBoardChrome();
    this.drawHud();

    this.piecesLayer = this.add.container(0, 0);
    this.fxLayer = this.add.container(0, 0);
    const maskShape = this.make
      .graphics()
      .fillRect(BOARD_X - 12, BOARD_Y - 3, COLS * CELL + 24, ROWS * CELL + 16);
    this.piecesLayer.setMask(maskShape.createGeometryMask());

    this.bindInput();
    this.exposeTestHook();
    this.sfx.startMusic();

    void this.entrance();
  }

  override update(_time: number, dt: number): void {
    // Rolling score counter.
    const target = this.engine.score;
    if (this.shownScore !== target) {
      const step = Math.max(1, Math.abs(target - this.shownScore) * Math.min(1, dt / 120));
      this.shownScore =
        this.shownScore < target
          ? Math.min(target, this.shownScore + step)
          : Math.max(target, this.shownScore - step);
      this.scoreText.setText(Math.round(this.shownScore).toLocaleString());
    }

    // Gentle idle hint: wobble a valid move every so often. Never blocks.
    if (!this.locked && this.time.now - this.lastAction > 7000) {
      this.lastAction = this.time.now;
      const hint = this.engine.hint();
      if (hint) {
        this.viewAt(hint[0])?.wobble();
        this.viewAt(hint[1])?.wobble();
      }
    }
  }

  // ------------------------------------------------------------------
  // setup
  // ------------------------------------------------------------------

  private drawBoardChrome(): void {
    const pad = 14;
    const panel = this.add.graphics();
    panel.fillStyle(0x1c0e14, 0.55);
    panel.fillRoundedRect(
      BOARD_X - pad,
      BOARD_Y - pad,
      COLS * CELL + pad * 2,
      ROWS * CELL + pad * 2,
      26,
    );
    panel.lineStyle(3, 0xffffff, 0.07);
    panel.strokeRoundedRect(
      BOARD_X - pad,
      BOARD_Y - pad,
      COLS * CELL + pad * 2,
      ROWS * CELL + pad * 2,
      26,
    );
    const cells = this.add.graphics();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        cells.fillStyle(0xffffff, (r + c) % 2 === 0 ? 0.045 : 0.085);
        cells.fillRoundedRect(BOARD_X + c * CELL + 3, BOARD_Y + r * CELL + 3, CELL - 6, CELL - 6, 16);
      }
    }
  }

  private drawHud(): void {
    this.add
      .text(GAME_WIDTH / 2, 46, "G L A Z E", {
        fontFamily: FONT,
        fontSize: "40px",
        color: "#ff9ecf",
        stroke: "#1c0e14",
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setShadow(0, 4, "#1c0e14", 8);

    this.scoreText = this.add
      .text(GAME_WIDTH / 2, 122, "0", {
        fontFamily: FONT,
        fontSize: "64px",
        color: "#fff6ec",
        stroke: "#1c0e14",
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setShadow(0, 5, "#1c0e14", 10);

    this.bestText = this.add
      .text(GAME_WIDTH / 2, 178, this.best > 0 ? `BEST ${this.best.toLocaleString()}` : " ", {
        fontFamily: FONT,
        fontSize: "24px",
        color: "#c9a68f",
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, BOARD_Y + ROWS * CELL + 42, "drag to swap · match 4+ for specials", {
        fontFamily: FONT,
        fontSize: "20px",
        color: "#96707f",
      })
      .setOrigin(0.5);

    const mute = this.add
      .text(GAME_WIDTH - 44, 44, this.sfx.muted ? "🔇" : "🔊", { fontSize: "34px" })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    mute.on("pointerdown", (_p: unknown, _x: unknown, _y: unknown, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      mute.setText(this.sfx.toggleMute() ? "🔇" : "🔊");
    });

    const restart = this.add
      .text(44, 44, "↻", {
        fontFamily: FONT,
        fontSize: "40px",
        color: "#c9a68f",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    restart.on(
      "pointerdown",
      (_p: unknown, _x: unknown, _y: unknown, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        this.scene.restart({ seed: (Math.random() * 2 ** 31) | 0 });
      },
    );
  }

  private bindInput(): void {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.lastAction = this.time.now;
      if (this.locked) return;
      const cell = this.cellAt(pointer.x, pointer.y);
      if (!cell) {
        this.select(null);
        return;
      }
      if (this.selected && this.isAdjacent(this.selected, cell)) {
        const from = this.selected;
        this.select(null);
        void this.doSwap(from, cell);
        return;
      }
      this.select(cell);
      this.dragStart = { cell, x: pointer.x, y: pointer.y };
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragStart || this.locked || !pointer.isDown) return;
      const dx = pointer.x - this.dragStart.x;
      const dy = pointer.y - this.dragStart.y;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
      const from = this.dragStart.cell;
      const to: Cell =
        Math.abs(dx) > Math.abs(dy)
          ? { r: from.r, c: from.c + Math.sign(dx) }
          : { r: from.r + Math.sign(dy), c: from.c };
      this.dragStart = null;
      this.select(null);
      if (to.r >= 0 && to.r < ROWS && to.c >= 0 && to.c < COLS) {
        void this.doSwap(from, to);
      }
    });

    this.input.on("pointerup", () => {
      this.dragStart = null;
    });
  }

  private exposeTestHook(): void {
    window.__glaze = {
      score: () => this.engine.score,
      best: () => this.best,
      isLocked: () => this.locked,
      hint: () => this.engine.hint(),
      swap: (a, b) => void this.doSwap(a, b),
      board: () => this.engine.board,
      viewCount: () => this.views.size,
    };
  }

  // ------------------------------------------------------------------
  // input helpers
  // ------------------------------------------------------------------

  private cellAt(x: number, y: number): Cell | null {
    const c = Math.floor((x - BOARD_X) / CELL);
    const r = Math.floor((y - BOARD_Y) / CELL);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    return { r, c };
  }

  private isAdjacent(a: Cell, b: Cell): boolean {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  private viewAt(cell: Cell): PieceView | null {
    for (const v of this.views.values()) {
      if (v.gridR === cell.r && v.gridC === cell.c) return v;
    }
    return null;
  }

  private select(cell: Cell | null): void {
    if (this.selected) this.viewAt(this.selected)?.setSelected(false);
    this.selected = cell;
    if (cell) {
      this.viewAt(cell)?.setSelected(true);
      this.sfx.select();
    }
  }

  // ------------------------------------------------------------------
  // move resolution / replay
  // ------------------------------------------------------------------

  private async doSwap(a: Cell, b: Cell): Promise<void> {
    if (this.locked) return;
    const steps = this.engine.swap(a, b);
    if (steps.length === 0) return;
    await this.replay(steps);
    this.afterMove();
  }

  private afterMove(): void {
    this.lastAction = this.time.now;
    if (this.engine.score > this.best) {
      this.best = this.engine.score;
      localStorage.setItem("glaze.best", String(this.best));
      this.bestText.setText(`BEST ${this.best.toLocaleString()}`);
    }
    const milestone = Math.floor(this.engine.score / 10000);
    if (milestone > this.lastMilestone) {
      this.lastMilestone = milestone;
      this.sfx.milestone();
      this.banner(`${(milestone * 10000).toLocaleString()}!`, 0xfed013, 54);
      this.confetti(GAME_WIDTH / 2, BOARD_Y - 40, 60);
    }
  }

  private async replay(steps: Step[]): Promise<void> {
    this.locked = true;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step) continue;
      switch (step.type) {
        case "swap":
          await this.animSwap(step.a, step.b);
          break;
        case "invalid":
          await this.animInvalid(step.a, step.b);
          break;
        case "clear":
          await this.animClear(step);
          break;
        case "fall": {
          const next = steps[i + 1];
          if (next?.type === "refill") {
            i++;
            await this.animFallAndRefill(step.moves, next.spawns);
          } else {
            await this.animFallAndRefill(step.moves, []);
          }
          break;
        }
        case "refill":
          await this.animFallAndRefill([], step.spawns);
          break;
        case "shuffle":
          await this.animShuffle(step.layout);
          break;
      }
    }
    this.locked = false;
  }

  private tween(cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.add({ ...cfg, onComplete: (...args) => {
        if (cfg.onComplete) (cfg.onComplete as (...a: unknown[]) => void)(...args);
        resolve();
      } });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }

  private async animSwap(a: PlacedPiece, b: PlacedPiece): Promise<void> {
    this.sfx.swap();
    const va = this.views.get(a.id);
    const vb = this.views.get(b.id);
    const jobs: Promise<void>[] = [];
    if (va) {
      va.gridR = a.r;
      va.gridC = a.c;
      this.piecesLayer.bringToTop(va);
      jobs.push(
        this.tween({ targets: va, x: cellX(a.c), y: cellY(a.r), duration: 150, ease: "Back.easeOut" }),
      );
    }
    if (vb) {
      vb.gridR = b.r;
      vb.gridC = b.c;
      jobs.push(
        this.tween({ targets: vb, x: cellX(b.c), y: cellY(b.r), duration: 150, ease: "Back.easeOut" }),
      );
    }
    await Promise.all(jobs);
  }

  private async animInvalid(a: PlacedPiece, b: PlacedPiece): Promise<void> {
    this.sfx.invalid();
    const va = this.views.get(a.id);
    const vb = this.views.get(b.id);
    this.cameras.main.shake(90, 0.0018);
    const jobs: Promise<void>[] = [];
    const bump = (v: PieceView | undefined, toward: PlacedPiece): void => {
      if (!v) return;
      const tx = v.x + (cellX(toward.c) - v.x) * 0.35;
      const ty = v.y + (cellY(toward.r) - v.y) * 0.35;
      jobs.push(
        this.tween({
          targets: v,
          x: tx,
          y: ty,
          duration: 90,
          yoyo: true,
          ease: "Quad.easeOut",
        }),
      );
    };
    bump(va, b);
    bump(vb, a);
    await Promise.all(jobs);
  }

  private async animClear(
    step: Extract<Step, { type: "clear" }>,
  ): Promise<void> {
    const { pieces, created, effects, cascade } = step;
    const big = effects.some((e) => e.kind === "bomb" || e.kind === "bombAll" || e.kind === "wrapped");
    const staggered = effects.some((e) => e.kind === "bomb" || e.kind === "bombAll");

    if (big) this.hitstop();
    for (const e of effects) this.playEffect(e);

    const amp = Math.min(
      0.002 + 0.0016 * (cascade - 1) + pieces.length * 0.00008 + (big ? 0.004 : 0),
      0.012,
    );
    this.cameras.main.shake(150, amp);

    if (cascade >= 2) {
      const word = COMBO_WORDS[Math.min(cascade - 2, COMBO_WORDS.length - 1)] ?? "TASTY!";
      const accent = ACCENTS[pieces[0]?.color ?? 0] ?? 0xffffff;
      this.sfx.combo(cascade);
      this.banner(word, accent, 56 + Math.min(cascade * 6, 30));
      this.confetti(GAME_WIDTH / 2, BOARD_Y + (ROWS * CELL) / 2, 14 + cascade * 8);
    }

    // Score popup at the centroid of the cleared pieces.
    if (pieces.length > 0) {
      const cx = pieces.reduce((s, p) => s + cellX(p.c), 0) / pieces.length;
      const cy = pieces.reduce((s, p) => s + cellY(p.r), 0) / pieces.length;
      this.floatScore(step.score, cx, cy, ACCENTS[pieces[0]?.color ?? 0] ?? 0xffffff);
    }

    const stagger = staggered ? 26 : 13;
    const jobs = pieces.map((p, i) => this.popPiece(p, Math.min(i * stagger, 420), cascade, i));
    await Promise.all(jobs);

    if (created.length > 0) {
      this.sfx.specialCreate();
      await Promise.all(created.map((p) => this.spawnPiece(p, true)));
    }
  }

  private async popPiece(p: PlacedPiece, delayMs: number, cascade: number, index: number): Promise<void> {
    const view = this.views.get(p.id);
    if (!view) return;
    this.views.delete(p.id);
    await this.delay(delayMs);
    this.sfx.pop(cascade, index);
    const accent = p.special === "bomb" ? 0xffffff : (ACCENTS[p.color] ?? 0xffffff);
    this.burst(view.x, view.y, "crumb", accent, 7, 190, 0.5);
    this.burst(view.x, view.y, "particle_soft", accent, 3, 60, 0.9, Phaser.BlendModes.ADD);
    await this.tween({
      targets: view,
      scale: { from: 1, to: 1.28 },
      duration: 60,
      ease: "Quad.easeOut",
    });
    await this.tween({
      targets: view,
      scale: 0,
      alpha: 0,
      duration: 110,
      ease: "Back.easeIn",
    });
    view.destroy();
  }

  private spawnPiece(p: PlacedPiece, celebrate: boolean): Promise<void> {
    const view = new PieceView(this, p, cellX(p.c), cellY(p.r));
    this.piecesLayer.add(view);
    this.views.set(p.id, view);
    if (celebrate) {
      this.burst(view.x, view.y, "particle_soft", 0xffffff, 4, 50, 1.0, Phaser.BlendModes.ADD);
      view.setScale(0);
      return this.tween({ targets: view, scale: 1, duration: 240, ease: "Back.easeOut" });
    }
    return Promise.resolve();
  }

  private async animFallAndRefill(
    moves: Array<{ id: number; fromR: number; toR: number; c: number }>,
    spawns: PlacedPiece[],
  ): Promise<void> {
    const jobs: Promise<void>[] = [];

    for (const m of moves) {
      const view = this.views.get(m.id);
      if (!view) continue;
      view.gridR = m.toR;
      const dist = m.toR - m.fromR;
      jobs.push(
        this.tween({
          targets: view,
          y: cellY(m.toR),
          duration: 100 + 52 * dist,
          ease: "Quad.easeIn",
        }).then(() => this.squashLand(view)),
      );
    }

    const perCol = new Map<number, number>();
    for (const s of spawns) perCol.set(s.c, (perCol.get(s.c) ?? 0) + 1);
    for (const s of spawns) {
      const count = perCol.get(s.c) ?? 1;
      const view = new PieceView(this, s, cellX(s.c), cellY(s.r - count));
      this.piecesLayer.add(view);
      this.views.set(s.id, view);
      jobs.push(
        this.tween({
          targets: view,
          y: cellY(s.r),
          duration: 110 + 52 * count,
          ease: "Quad.easeIn",
        }).then(() => this.squashLand(view)),
      );
    }

    await Promise.all(jobs);
  }

  private async squashLand(view: PieceView): Promise<void> {
    this.sfx.land();
    await this.tween({
      targets: view,
      scaleY: 0.82,
      scaleX: 1.12,
      duration: 55,
      yoyo: true,
      ease: "Quad.easeOut",
    });
    view.setScale(1);
  }

  private async animShuffle(layout: PlacedPiece[]): Promise<void> {
    this.sfx.shuffle();
    this.banner("FRESH DONUTS!", 0xff9ecf, 48);
    const jobs: Promise<void>[] = [];
    const seen = new Set<number>();
    for (const p of layout) {
      seen.add(p.id);
      const view = this.views.get(p.id);
      if (view) {
        view.gridR = p.r;
        view.gridC = p.c;
        jobs.push(
          this.tween({
            targets: view,
            x: cellX(p.c),
            y: cellY(p.r),
            duration: 480,
            ease: "Cubic.easeInOut",
          }),
        );
      } else {
        jobs.push(this.spawnPiece(p, false));
      }
    }
    // Remove any views whose pieces were replaced by a full re-deal.
    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        this.views.delete(id);
        view.destroy();
      }
    }
    await Promise.all(jobs);
  }

  // ------------------------------------------------------------------
  // effects & juice
  // ------------------------------------------------------------------

  private playEffect(e: Effect): void {
    const r = Phaser.Math.Clamp(e.r, 0, ROWS - 1);
    const c = Phaser.Math.Clamp(e.c, 0, COLS - 1);
    switch (e.kind) {
      case "stripeH":
        this.sfx.stripedFire();
        this.beam(true, r);
        break;
      case "stripeV":
        this.sfx.stripedFire();
        this.beam(false, c);
        break;
      case "wrapped": {
        this.sfx.wrappedBlast();
        this.shockwave(cellX(c), cellY(r), 0xffb347);
        this.time.delayedCall(110, () => this.shockwave(cellX(c), cellY(r), 0xffffff));
        break;
      }
      case "bomb": {
        this.sfx.colorBomb();
        this.cameras.main.flash(130, 255, 244, 235);
        this.starburst(cellX(c), cellY(r), ACCENTS[e.color] ?? 0xffffff);
        break;
      }
      case "bombAll": {
        this.sfx.colorBomb();
        this.cameras.main.flash(220, 255, 255, 255);
        this.starburst(cellX(c), cellY(r), 0xffffff);
        this.cameras.main.shake(300, 0.014);
        break;
      }
    }
  }

  private beam(horizontal: boolean, index: number): void {
    const x = horizontal ? BOARD_X + (COLS * CELL) / 2 : cellX(index);
    const y = horizontal ? cellY(index) : BOARD_Y + (ROWS * CELL) / 2;
    const glow = this.add
      .image(x, y, "particle_soft")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    if (horizontal) glow.setScale((COLS * CELL) / 128 + 1, 0.85);
    else glow.setScale(0.85, (ROWS * CELL) / 128 + 1);
    this.fxLayer.add(glow);
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.95, to: 0 },
      scaleX: glow.scaleX * (horizontal ? 1.05 : 1.9),
      scaleY: glow.scaleY * (horizontal ? 1.9 : 1.05),
      duration: 300,
      ease: "Quad.easeOut",
      onComplete: () => glow.destroy(),
    });
  }

  private shockwave(x: number, y: number, tint: number): void {
    const ring = this.add
      .image(x, y, "ring")
      .setTint(tint)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.15)
      .setAlpha(0.95);
    this.fxLayer.add(ring);
    this.tweens.add({
      targets: ring,
      scale: 1.6,
      alpha: 0,
      duration: 380,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy(),
    });
    this.burst(x, y, "crumb", tint, 12, 260, 0.55);
  }

  private starburst(x: number, y: number, tint: number): void {
    const flash = this.add
      .image(x, y, "star")
      .setTint(tint)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.4)
      .setAlpha(1);
    this.fxLayer.add(flash);
    this.tweens.add({
      targets: flash,
      scale: 3.4,
      angle: 90,
      alpha: 0,
      duration: 430,
      ease: "Cubic.easeOut",
      onComplete: () => flash.destroy(),
    });
    this.burst(x, y, "star", tint, 10, 320, 0.35, Phaser.BlendModes.ADD);
  }

  /** One-shot particle burst; the emitter cleans itself up. */
  private burst(
    x: number,
    y: number,
    texture: string,
    tint: number,
    count: number,
    speed: number,
    scale: number,
    blend: Phaser.BlendModes = Phaser.BlendModes.NORMAL,
  ): void {
    const emitter = this.add.particles(x, y, texture, {
      speed: { min: speed * 0.4, max: speed },
      angle: { min: 0, max: 360 },
      scale: { start: scale, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 320, max: 620 },
      gravityY: texture === "crumb" || texture === "sprinkle" ? 500 : 0,
      rotate: { min: -180, max: 180 },
      tint,
      blendMode: blend,
      emitting: false,
    });
    emitter.explode(count);
    this.time.delayedCall(900, () => emitter.destroy());
  }

  private confetti(x: number, y: number, count: number): void {
    const emitter = this.add.particles(x, y, "sprinkle", {
      speed: { min: 180, max: 460 },
      angle: { min: 200, max: 340 },
      scale: { start: 0.9, end: 0.5 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 700, max: 1200 },
      gravityY: 900,
      rotate: { min: -360, max: 360 },
      tint: [...ACCENTS],
      emitting: false,
    });
    emitter.explode(count);
    this.time.delayedCall(1500, () => emitter.destroy());
  }

  private banner(text: string, tint: number, size: number): void {
    const color = `#${tint.toString(16).padStart(6, "0")}`;
    const t = this.add
      .text(GAME_WIDTH / 2, BOARD_Y + (ROWS * CELL) / 2 - 30, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color,
        stroke: "#1c0e14",
        strokeThickness: 12,
      })
      .setOrigin(0.5)
      .setShadow(0, 6, "#1c0e14", 12)
      .setAngle(Phaser.Math.Between(-5, 5))
      .setScale(0);
    this.tweens.add({
      targets: t,
      scale: 1,
      duration: 220,
      ease: "Back.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: t,
          alpha: 0,
          y: t.y - 46,
          delay: 430,
          duration: 240,
          onComplete: () => t.destroy(),
        });
      },
    });
  }

  private floatScore(amount: number, x: number, y: number, tint: number): void {
    const size = Math.min(26 + Math.floor(amount / 60) * 4, 58);
    const color = `#${tint.toString(16).padStart(6, "0")}`;
    const t = this.add
      .text(x, y, `+${amount.toLocaleString()}`, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color,
        stroke: "#1c0e14",
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({
      targets: t,
      alpha: { from: 0, to: 1 },
      y: y - 20,
      scale: { from: 0.6, to: 1 },
      duration: 140,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: t,
          alpha: 0,
          y: t.y - 40,
          delay: 260,
          duration: 320,
          onComplete: () => t.destroy(),
        });
      },
    });
  }

  /** Brief slow-motion + zoom punch for the big payoffs. */
  private hitstop(): void {
    this.tweens.timeScale = 0.15;
    const cam = this.cameras.main;
    cam.setZoom(1.025);
    this.time.delayedCall(80, () => {
      this.tweens.timeScale = 1;
      this.tweens.add({ targets: cam, zoom: 1, duration: 140, ease: "Quad.easeOut" });
    });
  }

  // ------------------------------------------------------------------
  // entrance
  // ------------------------------------------------------------------

  private async entrance(): Promise<void> {
    this.locked = true;
    this.sfx.start();
    const jobs: Promise<void>[] = [];
    for (const p of this.engine.board) {
      const view = new PieceView(this, p, cellX(p.c), cellY(p.r) - (ROWS + 2) * CELL);
      this.piecesLayer.add(view);
      this.views.set(p.id, view);
      jobs.push(
        this.tween({
          targets: view,
          y: cellY(p.r),
          delay: p.c * 36 + p.r * 14,
          duration: 520,
          ease: "Bounce.easeOut",
        }),
      );
    }
    await Promise.all(jobs);
    this.locked = false;
    this.lastAction = this.time.now;
  }
}
