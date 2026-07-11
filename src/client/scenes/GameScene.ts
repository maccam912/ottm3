import Phaser from "phaser";
import { Game, type MoveEval } from "../../engine/game";
import type { Cell, ComboKind, Effect, PlacedPiece, Step } from "../../engine/types";
import { OverdrivePipeline } from "../OverdrivePipeline";
import {
  ACCENTS,
  BOARD_X,
  BOARD_Y,
  BODY_FONT,
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

interface Ottm3Hook {
  score: () => number;
  best: () => number;
  stage: () => number;
  movesLeft: () => number;
  hype: () => number;
  isLocked: () => boolean;
  hint: () => [Cell, Cell] | null;
  bestMove: () => MoveEval | null;
  setAutoplay: (on: boolean) => void;
  isAutoplay: () => boolean;
  swap: (a: Cell, b: Cell) => void;
  board: () => PlacedPiece[];
  viewCount: () => number;
}

declare global {
  interface Window {
    __ottm3?: Ottm3Hook;
  }
}

const FUSION_TITLES: Record<ComboKind, string> = {
  "rocket-parallel-h": "TWIN HORIZON",
  "rocket-parallel-v": "TWIN VERTIGO",
  "rocket-cross": "LASER CRUCIFIX",
  "rocket-pulse": "THUNDER GRID",
  "rocket-nova": "FIVE-LANE ARMAGEDDON",
  "rocket-prism": "RAINBOW ROCKET RAIN",
  "pulse-pulse": "DOUBLE CRATER",
  "pulse-nova": "SUPERNOVA STAMPEDE",
  "pulse-prism": "RAINBOW MINEFIELD",
  "nova-nova": "STAR SYSTEM FAILURE",
  "nova-prism": "PRISMATIC APOCALYPSE",
  "prism-prism": "DOUBLE RAINBOW DOOM",
  singularity: "THE BIGGEST BANG",
};

const STAGE_MOVES = 15;

export class GameScene extends Phaser.Scene {
  private engine!: Game;
  private sfx!: Sfx;
  private views = new Map<number, PieceView>();
  private piecesLayer!: Phaser.GameObjects.Container;
  private fxLayer!: Phaser.GameObjects.Container;
  private hudLayer!: Phaser.GameObjects.Container;
  private boardMask!: Phaser.Display.Masks.GeometryMask;

  private locked = true;
  private gameOver = false;
  private selected: Cell | null = null;
  private dragStart: DragStart | null = null;
  private lastAction = 0;

  private autoplay = false;
  private runToken = 0;
  private bestMoveFx: Phaser.GameObjects.GameObject[] = [];

  private shownScore = 0;
  private lastScoreTextAt = 0;
  private best = 0;
  private lastMilestone = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private stageText!: Phaser.GameObjects.Text;
  private movesText!: Phaser.GameObjects.Text;
  private targetText!: Phaser.GameObjects.Text;
  private hypeText!: Phaser.GameObjects.Text;
  private progressGfx!: Phaser.GameObjects.Graphics;
  private hypeGfx!: Phaser.GameObjects.Graphics;
  private bulbRing: Phaser.GameObjects.Arc[] = [];

  private stage = 1;
  private movesLeft = STAGE_MOVES;
  private stageStartScore = 0;
  private stageTarget = 10_000;
  private stageSecured = false;
  private biggestCascade = 1;
  private fusionCount = 0;

  private hype = 0;
  private overdriveTurns = 0;
  private trauma = 0;
  private zoomKick = 0;
  private shaderKick = 0;
  private shader: OverdrivePipeline | null = null;
  private reducedFx = false;
  private recipes: Phaser.GameObjects.Container | null = null;

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
    this.bulbRing = [];
    this.selected = null;
    this.dragStart = null;
    this.shownScore = 0;
    this.lastMilestone = 0;
    this.stage = 1;
    this.movesLeft = STAGE_MOVES;
    this.stageStartScore = 0;
    this.stageTarget = this.targetForStage(1);
    this.stageSecured = false;
    this.biggestCascade = 1;
    this.fusionCount = 0;
    this.hype = 0;
    this.overdriveTurns = 0;
    this.trauma = 0;
    this.zoomKick = 0;
    this.shaderKick = 0;
    this.autoplay = false;
    this.gameOver = false;
    this.runToken++;
    this.bestMoveFx = [];
    this.best = Number(localStorage.getItem("ottm3.best") ?? 0);
    this.reducedFx =
      localStorage.getItem("ottm3.fx") === "reduced" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    this.makeArena();
    this.drawBoardChrome();
    this.piecesLayer = this.add.container(0, 0);
    this.fxLayer = this.add.container(0, 0);
    this.hudLayer = this.add.container(0, 0);
    const maskShape = this.make
      .graphics()
      .fillRect(BOARD_X - 14, BOARD_Y - 10, COLS * CELL + 28, ROWS * CELL + 24);
    this.boardMask = maskShape.createGeometryMask();
    this.piecesLayer.setMask(this.boardMask);

    this.drawHud();
    this.bindInput();
    this.exposeTestHook();
    this.setupShader();
    this.sfx.startMusic();

    void this.entrance();
  }

  override update(time: number, dt: number): void {
    const target = this.engine.score;
    if (Math.round(this.shownScore) !== target) {
      const step = Math.max(1, Math.abs(target - this.shownScore) * Math.min(1, dt / 105));
      this.shownScore =
        this.shownScore < target
          ? Math.min(target, this.shownScore + step)
          : Math.max(target, this.shownScore - step);
      // Rasterizing this Text re-renders its canvas and re-uploads a GPU
      // texture, so while the counter ticks we refresh it at ~12Hz (or when it
      // lands on the target) instead of every frame.
      const settled = Math.round(this.shownScore) === target;
      if (settled || time - this.lastScoreTextAt >= 80) {
        this.lastScoreTextAt = time;
        this.scoreText.setText(Math.round(this.shownScore).toLocaleString());
      }
      const scale = 1 + Math.min(Math.abs(target - this.shownScore) / 150_000, 0.1);
      this.scoreText.setScale(scale);
    } else {
      this.scoreText.setScale(1);
    }

    for (const view of this.views.values()) view.updatePhysics(dt);

    this.trauma = Math.max(0, this.trauma - dt * (this.reducedFx ? 0.0048 : 0.0029));
    this.zoomKick = Math.max(0, this.zoomKick - dt * 0.00009);
    const trauma2 = this.trauma * this.trauma;
    const camera = this.cameras.main;
    camera.setRotation(
      this.reducedFx ? 0 : Math.sin(time * 0.081) * trauma2 * 0.008 + Math.sin(time * 0.137) * trauma2 * 0.004,
    );
    camera.setZoom(1 + this.zoomKick + (this.overdriveTurns > 0 ? Math.sin(time * 0.008) * 0.002 : 0));

    this.shaderKick = Math.max(0, this.shaderKick - dt * (this.reducedFx ? 0.0035 : 0.0017));
    if (this.shader) {
      const overdrive = this.overdriveTurns > 0 ? 0.24 : 0;
      this.shader.intensity = this.reducedFx
        ? Math.min(0.12, this.shaderKick)
        : Phaser.Math.Clamp(this.shaderKick + overdrive + (this.hype / 100) * 0.09, 0, 1);
    }

    for (let i = 0; i < this.bulbRing.length; i++) {
      const bulb = this.bulbRing[i];
      if (!bulb) continue;
      const wave = (Math.sin(time * (this.overdriveTurns > 0 ? 0.018 : 0.006) - i * 0.55) + 1) / 2;
      bulb.setAlpha(0.18 + wave * (0.35 + this.hype * 0.0045));
      bulb.setScale(0.78 + wave * (this.overdriveTurns > 0 ? 0.5 : 0.2));
    }

    if (!this.locked && !this.gameOver && time - this.lastAction > 6500) {
      this.lastAction = time;
      const hint = this.engine.hint();
      if (hint) {
        this.viewAt(hint[0])?.wobble();
        this.viewAt(hint[1])?.wobble();
      }
    }
  }

  private makeArena(): void {
    const bg = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, "arena_bg");
    bg.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.tweens.add({
      targets: bg,
      scaleX: bg.scaleX * 1.025,
      scaleY: bg.scaleY * 1.025,
      duration: 5200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // A Graphics veil would be re-triangulated on every frame; a thin gradient
    // strip stretched over the screen renders as one cached, batched quad.
    if (!this.textures.exists("veil_grad")) {
      const canvas = this.textures.createCanvas("veil_grad", 2, 256);
      if (canvas) {
        const ctx = canvas.getContext();
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, "rgba(5, 0, 12, 0.15)");
        grad.addColorStop(1, "rgba(19, 0, 25, 0.36)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 2, 256);
        canvas.refresh();
      }
    }
    this.add.image(0, 0, "veil_grad").setOrigin(0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT);

    const dust = this.add.particles(GAME_WIDTH / 2, GAME_HEIGHT / 2, "particle_soft", {
      x: { min: -GAME_WIDTH / 2, max: GAME_WIDTH / 2 },
      y: { min: -GAME_HEIGHT / 2, max: GAME_HEIGHT / 2 },
      speedY: { min: -20, max: -6 },
      speedX: { min: -5, max: 5 },
      scale: { min: 0.025, max: 0.11 },
      alpha: { start: 0.5, end: 0 },
      lifespan: { min: 2600, max: 5200 },
      frequency: this.reducedFx ? 220 : 85,
      tint: [...ACCENTS],
      blendMode: Phaser.BlendModes.ADD,
    });
    dust.setDepth(0.5);
  }

  private drawBoardChrome(): void {
    const pad = 17;
    const x = BOARD_X - pad;
    const y = BOARD_Y - pad;
    const w = COLS * CELL + pad * 2;
    const h = ROWS * CELL + pad * 2;

    // Phaser re-triangulates a Graphics object's entire command list on every
    // frame, and this chrome holds 128+ rounded rects. It never changes, so we
    // draw it once into a texture and display that as a single batched image.
    const texW = w + 18;
    const texH = h + 18;
    const ox = x - 9;
    const oy = y - 9;
    if (!this.textures.exists("board_chrome")) {
      const gfx = this.make.graphics();
      gfx.fillStyle(0xff2bd6, 0.13);
      gfx.fillRoundedRect(0, 0, w + 18, h + 18, 34);
      gfx.lineStyle(8, 0x36f1ff, 0.22);
      gfx.strokeRoundedRect(5, 5, w + 8, h + 8, 31);

      gfx.fillStyle(0x05000d, 0.87);
      gfx.fillRoundedRect(9, 9, w, h, 27);
      gfx.lineStyle(5, 0xffd94a, 0.92);
      gfx.strokeRoundedRect(9, 9, w, h, 27);
      gfx.lineStyle(2, 0xffffff, 0.56);
      gfx.strokeRoundedRect(16, 16, w - 14, h - 14, 21);

      const cellOx = BOARD_X - ox;
      const cellOy = BOARD_Y - oy;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          gfx.fillStyle((r + c) % 2 === 0 ? 0x240939 : 0x071b32, 0.68);
          gfx.fillRoundedRect(cellOx + c * CELL + 3, cellOy + r * CELL + 3, CELL - 6, CELL - 6, 15);
          gfx.lineStyle(1.5, ACCENTS[(r + c) % ACCENTS.length] ?? 0xffffff, 0.16);
          gfx.strokeRoundedRect(cellOx + c * CELL + 5, cellOy + r * CELL + 5, CELL - 10, CELL - 10, 13);
        }
      }
      gfx.generateTexture("board_chrome", texW, texH);
      gfx.destroy();
    }
    this.add.image(ox, oy, "board_chrome").setOrigin(0);

    const addBulb = (bx: number, by: number, index: number): void => {
      const bulb = this.add.circle(bx, by, 4.2, ACCENTS[index % ACCENTS.length] ?? 0xffffff, 1);
      bulb.setBlendMode(Phaser.BlendModes.ADD);
      this.bulbRing.push(bulb);
    };
    for (let i = 0; i < 12; i++) {
      const px = x + 30 + (i * (w - 60)) / 11;
      addBulb(px, y - 5, i);
      addBulb(px, y + h + 5, i + 3);
    }
    for (let i = 1; i < 10; i++) {
      const py = y + (i * h) / 10;
      addBulb(x - 5, py, i + 1);
      addBulb(x + w + 5, py, i + 4);
    }
  }

  private drawHud(): void {
    const titleShadowA = this.add
      .text(GAME_WIDTH / 2 - 3, 43, "OTTM3", {
        fontFamily: FONT,
        fontSize: "62px",
        color: "#ff2bd6",
        stroke: "#120018",
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setAlpha(0.82);
    const titleShadowB = this.add
      .text(GAME_WIDTH / 2 + 3, 43, "OTTM3", {
        fontFamily: FONT,
        fontSize: "62px",
        color: "#36f1ff",
        stroke: "#120018",
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setAlpha(0.82);
    const title = this.add
      .text(GAME_WIDTH / 2, 40, "OTTM3", {
        fontFamily: FONT,
        fontSize: "62px",
        color: "#ffffff",
        stroke: "#25002f",
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setShadow(0, 0, "#ff2bd6", 16);
    title.setTint(0xffd23f, 0xffffff, 0xff2bd6, 0x36f1ff);

    const subtitle = this.add
      .text(GAME_WIDTH / 2, 87, "OVER  THE  TOP  MATCH  3", {
        fontFamily: BODY_FONT,
        fontStyle: "bold",
        fontSize: "17px",
        color: "#aeefff",
        letterSpacing: 3,
      })
      .setOrigin(0.5);

    const scoreLabel = this.add
      .text(GAME_WIDTH / 2, 110, "COSMIC PAYOUT", {
        fontFamily: BODY_FONT,
        fontStyle: "bold",
        fontSize: "14px",
        color: "#ffd84d",
      })
      .setOrigin(0.5);
    this.scoreText = this.add
      .text(GAME_WIDTH / 2, 144, "0", {
        fontFamily: FONT,
        fontSize: "55px",
        color: "#ffffff",
        stroke: "#120018",
        strokeThickness: 9,
      })
      .setOrigin(0.5)
      .setShadow(0, 0, "#36f1ff", 12);

    this.stageText = this.add
      .text(62, 128, "STAGE 1", {
        fontFamily: FONT,
        fontSize: "21px",
        color: "#55ff8a",
        stroke: "#08000d",
        strokeThickness: 5,
        align: "center",
      })
      .setOrigin(0.5);
    this.movesText = this.add
      .text(GAME_WIDTH - 62, 128, `${STAGE_MOVES}\nMOVES`, {
        fontFamily: FONT,
        fontSize: "21px",
        color: "#ffdf45",
        stroke: "#08000d",
        strokeThickness: 5,
        align: "center",
      })
      .setOrigin(0.5);

    this.bestText = this.add
      .text(GAME_WIDTH / 2, 184, this.best > 0 ? `ALL-TIME BEST  ${this.best.toLocaleString()}` : "NEW COSMIC RECORD IN PROGRESS", {
        fontFamily: BODY_FONT,
        fontStyle: "bold",
        fontSize: "16px",
        color: "#d3bff8",
      })
      .setOrigin(0.5);

    this.targetText = this.add
      .text(42, 210, "", {
        fontFamily: BODY_FONT,
        fontStyle: "bold",
        fontSize: "14px",
        color: "#ffffff",
      })
      .setOrigin(0, 0.5);
    this.progressGfx = this.add.graphics();
    this.hypeText = this.add
      .text(GAME_WIDTH - 42, 241, "HYPE 0%", {
        fontFamily: FONT,
        fontSize: "15px",
        color: "#ff74e8",
      })
      .setOrigin(1, 0.5);
    this.hypeGfx = this.add.graphics();

    const footer = this.add
      .text(GAME_WIDTH / 2, BOARD_Y + ROWS * CELL + 48, "FUSE ANY TWO POWERUPS • 15 UNIQUE CATASTROPHES", {
        fontFamily: FONT,
        fontSize: "18px",
        color: "#ffe34e",
        stroke: "#0c0012",
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    const hint = this.neonButton(118, 1030, 176, "BEST MOVE", 0xffd83d, () => this.showBestMove());
    const lab = this.neonButton(308, 1030, 176, "POWERUP LAB", 0xff2bd6, () => this.toggleRecipes());
    const fx = this.neonButton(498, 1030, 176, this.reducedFx ? "FX: KIND" : "FX: MAX", 0x36f1ff, () => {
      this.reducedFx = !this.reducedFx;
      localStorage.setItem("ottm3.fx", this.reducedFx ? "reduced" : "max");
      this.setupShader();
      fx.label.setText(this.reducedFx ? "FX: KIND" : "FX: MAX");
      this.banner(this.reducedFx ? "MERELY RIDICULOUS" : "MAXIMUM EVERYTHING", 0x36f1ff, 38);
    });
    const sound = this.neonButton(630, 1030, 78, this.sfx.muted ? "OFF" : "SFX", 0x55ff8a, () => {
      sound.label.setText(this.sfx.toggleMute() ? "OFF" : "SFX");
    });

    const rule = this.add
      .text(GAME_WIDTH / 2, 1091, "4=ROCKET  •  2×2=PULSE  •  T/L=NOVA  •  5=PRISM  •  6+=SINGULARITY", {
        fontFamily: BODY_FONT,
        fontStyle: "bold",
        fontSize: "15px",
        color: "#e9dfff",
        stroke: "#0c0012",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const dare = this.add
      .text(GAME_WIDTH / 2, 1133, "DRAG A RELIC. BREAK REALITY. REPEAT.", {
        fontFamily: FONT,
        fontSize: "23px",
        color: "#ffffff",
        stroke: "#3b0048",
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setShadow(0, 0, "#ff2bd6", 10);
    const restart = this.add
      .text(GAME_WIDTH / 2, 1192, "NEW RUN  ↻", {
        fontFamily: BODY_FONT,
        fontStyle: "bold",
        fontSize: "17px",
        color: "#a98cc7",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    restart.on("pointerdown", () => this.scene.restart({ seed: (Math.random() * 2 ** 31) | 0 }));

    this.hudLayer.add([
      titleShadowA,
      titleShadowB,
      title,
      subtitle,
      scoreLabel,
      this.scoreText,
      this.stageText,
      this.movesText,
      this.bestText,
      this.targetText,
      this.progressGfx,
      this.hypeText,
      this.hypeGfx,
      footer,
      hint.container,
      lab.container,
      fx.container,
      sound.container,
      rule,
      dare,
      restart,
    ]);
    this.updateStageHud();
  }

  private neonButton(
    x: number,
    y: number,
    width: number,
    text: string,
    color: number,
    onPress: () => void,
  ): { container: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text } {
    const container = this.add.container(x, y);
    const glow = this.add.rectangle(0, 0, width, 48, color, 0.16).setStrokeStyle(3, color, 0.95);
    const label = this.add
      .text(0, 0, text, {
        fontFamily: FONT,
        fontSize: "16px",
        color: "#ffffff",
        stroke: "#09000e",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    container.add([glow, label]);
    container.setSize(width, 54).setInteractive({ useHandCursor: true });
    container.on("pointerover", () => glow.setFillStyle(color, 0.36));
    container.on("pointerout", () => glow.setFillStyle(color, 0.16));
    container.on("pointerdown", (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.tweens.add({ targets: container, scale: 0.9, duration: 55, yoyo: true });
      onPress();
    });
    return { container, label };
  }

  private bindInput(): void {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.lastAction = this.time.now;
      this.clearBestMoveFx();
      if (this.locked || this.gameOver || this.recipes) return;
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
      if (!this.dragStart || this.locked || !pointer.isDown || this.recipes) return;
      const dx = pointer.x - this.dragStart.x;
      const dy = pointer.y - this.dragStart.y;
      if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
      const from = this.dragStart.cell;
      const to: Cell =
        Math.abs(dx) > Math.abs(dy)
          ? { r: from.r, c: from.c + Math.sign(dx) }
          : { r: from.r + Math.sign(dy), c: from.c };
      this.dragStart = null;
      this.select(null);
      if (to.r >= 0 && to.r < ROWS && to.c >= 0 && to.c < COLS) void this.doSwap(from, to);
    });

    this.input.on("pointerup", () => {
      this.dragStart = null;
    });
  }

  private exposeTestHook(): void {
    window.__ottm3 = {
      score: () => this.engine.score,
      best: () => this.best,
      stage: () => this.stage,
      movesLeft: () => this.movesLeft,
      hype: () => this.hype,
      isLocked: () => this.locked,
      hint: () => this.engine.hint(),
      bestMove: () => this.engine.bestMove(),
      setAutoplay: (on) => {
        if (on !== this.autoplay) this.toggleAutoplay();
      },
      isAutoplay: () => this.autoplay,
      swap: (a, b) => void this.doSwap(a, b),
      board: () => this.engine.board,
      viewCount: () => this.views.size,
    };
  }

  private setupShader(): void {
    if (!(this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;
    // The post pipeline costs a full-screen render-to-texture pass every
    // frame, which is the difference between smooth and slideshow on machines
    // stuck with software WebGL — so FX: KIND drops it entirely.
    if (this.reducedFx) {
      if (this.shader) {
        this.cameras.main.removePostPipeline("Overdrive");
        this.shader = null;
      }
      return;
    }
    if (this.shader) return;
    this.cameras.main.setPostPipeline("Overdrive");
    const pipeline = this.cameras.main.getPostPipeline("Overdrive");
    this.shader = (Array.isArray(pipeline) ? pipeline[0] : pipeline) as OverdrivePipeline;
  }

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
    for (const view of this.views.values()) {
      if (view.gridR === cell.r && view.gridC === cell.c) return view;
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

  private async doSwap(a: Cell, b: Cell): Promise<void> {
    if (this.locked || this.gameOver) return;
    this.clearBestMoveFx();
    const steps = this.engine.swap(a, b);
    if (steps.length === 0) return;
    const valid = steps[0]?.type === "swap";
    if (valid) {
      this.movesLeft = Math.max(0, this.movesLeft - 1);
      if (this.overdriveTurns > 0) {
        this.overdriveTurns--;
        if (this.overdriveTurns === 0) this.hype = 0;
      } else {
        this.hype = Math.max(0, this.hype - 4);
      }
      this.updateStageHud();
    }
    await this.replay(steps);
    await this.afterMove(valid);
  }

  private clearBestMoveFx(): void {
    for (const obj of this.bestMoveFx) obj.destroy();
    this.bestMoveFx = [];
  }

  private highlightSwap(move: { a: Cell; b: Cell }, tint: number, label: string): void {
    for (const cell of [move.a, move.b]) {
      const ring = this.add
        .image(cellX(cell.c), cellY(cell.r), "double_ring")
        .setTint(tint)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.72)
        .setAlpha(0.95);
      this.fxLayer.add(ring);
      this.tweens.add({
        targets: ring,
        scale: { from: 0.72, to: 1.12 },
        angle: 180,
        alpha: { from: 1, to: 0.35 },
        duration: 430,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.bestMoveFx.push(ring);
      this.viewAt(cell)?.wobble();
    }
    const text = this.add
      .text((cellX(move.a.c) + cellX(move.b.c)) / 2, Math.min(cellY(move.a.r), cellY(move.b.r)) - 53, label, {
        fontFamily: FONT,
        fontSize: "24px",
        color: `#${tint.toString(16).padStart(6, "0")}`,
        stroke: "#08000d",
        strokeThickness: 7,
      })
      .setOrigin(0.5);
    this.fxLayer.add(text);
    this.bestMoveFx.push(text);
  }

  private showBestMove(): MoveEval | null {
    if (this.locked || this.gameOver) return null;
    const best = this.engine.bestMove();
    if (!best) return null;
    this.clearBestMoveFx();
    this.sfx.select();
    this.highlightSwap(best, 0xffe34e, `DESTROY +${best.score.toLocaleString()}`);
    return best;
  }

  private toggleAutoplay(): void {
    this.autoplay = !this.autoplay;
    if (this.autoplay) void this.autoplayLoop(this.runToken);
    else this.clearBestMoveFx();
  }

  private async autoplayLoop(token: number): Promise<void> {
    while (this.autoplay && token === this.runToken && !this.gameOver) {
      if (this.locked) {
        await this.delay(100);
        continue;
      }
      const best = this.showBestMove();
      if (!best) {
        await this.delay(250);
        continue;
      }
      await this.delay(300);
      if (this.autoplay && token === this.runToken && !this.locked) await this.doSwap(best.a, best.b);
      await this.delay(180);
    }
  }

  private async afterMove(valid: boolean): Promise<void> {
    this.lastAction = this.time.now;
    if (this.engine.score > this.best) {
      this.best = this.engine.score;
      localStorage.setItem("ottm3.best", String(this.best));
      this.bestText.setText(`ALL-TIME BEST  ${this.best.toLocaleString()}`);
    }
    const milestone = Math.floor(this.engine.score / 25_000);
    if (milestone > this.lastMilestone) {
      this.lastMilestone = milestone;
      this.sfx.milestone();
      this.fusionTitle("MEGA PAYOUT", `${(milestone * 25_000).toLocaleString()} POINTS`);
      this.confetti(GAME_WIDTH / 2, BOARD_Y - 20, 100);
    }

    if (this.hype >= 100 && this.overdriveTurns === 0) {
      this.hype = 100;
      this.overdriveTurns = 3;
      this.shaderKick = 1;
      this.trauma = 0.8;
      this.sfx.overdrive();
      this.fusionTitle("HYPE MAXED", "3 TURNS OF OVERDRIVE");
      this.confetti(GAME_WIDTH / 2, GAME_HEIGHT / 2, 150);
    }
    this.updateStageHud();

    if (valid && this.movesLeft <= 0) {
      this.locked = true;
      await this.delay(500);
      await this.finishStage();
    }
  }

  private async finishStage(): Promise<void> {
    const stageScore = this.engine.score - this.stageStartScore;
    if (stageScore >= this.stageTarget) {
      this.fusionTitle("JACKPOT SECURED", `STAGE ${this.stage} OBLITERATED`);
      this.sfx.milestone();
      this.confetti(GAME_WIDTH / 2, BOARD_Y + (ROWS * CELL) / 2, 180);
      this.trauma = 1;
      this.shaderKick = 0.85;
      await this.delay(this.reducedFx ? 650 : 1150);
      this.stage++;
      this.movesLeft = STAGE_MOVES;
      this.stageStartScore = this.engine.score;
      this.stageTarget = this.targetForStage(this.stage);
      this.stageSecured = false;
      localStorage.setItem(
        "ottm3.bestStage",
        String(Math.max(this.stage, Number(localStorage.getItem("ottm3.bestStage") ?? 1))),
      );
      this.updateStageHud();
      this.banner(`STAGE ${this.stage}: GO LOUDER`, ACCENTS[this.stage % ACCENTS.length] ?? 0xffffff, 46);
      this.locked = false;
    } else {
      this.showResults();
    }
  }

  private showResults(): void {
    this.gameOver = true;
    this.autoplay = false;
    this.clearBestMoveFx();
    const overlay = this.add.container(0, 0).setDepth(5000);
    const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x050009, 0.9);
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 610, 640, 0x130020, 0.98).setStrokeStyle(6, 0xff2bd6, 1);
    const header = this.add
      .text(GAME_WIDTH / 2, 390, "REALITY SURVIVED", {
        fontFamily: FONT,
        fontSize: "48px",
        color: "#ffffff",
        stroke: "#4d005f",
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setShadow(0, 0, "#ff2bd6", 14);
    const sub = this.add
      .text(GAME_WIDTH / 2, 448, "UNACCEPTABLE. HIT IT HARDER.", {
        fontFamily: BODY_FONT,
        fontStyle: "bold",
        fontSize: "20px",
        color: "#36f1ff",
      })
      .setOrigin(0.5);
    const stats = this.add
      .text(
        GAME_WIDTH / 2,
        585,
        [
          `PAYOUT  ${this.engine.score.toLocaleString()}`,
          `STAGE  ${this.stage}`,
          `BIGGEST CASCADE  x${this.biggestCascade}`,
          `POWER FUSIONS  ${this.fusionCount}`,
          `TARGET MISSED BY  ${Math.max(0, this.stageTarget - (this.engine.score - this.stageStartScore)).toLocaleString()}`,
        ].join("\n\n"),
        {
          fontFamily: FONT,
          fontSize: "24px",
          color: "#ffffff",
          align: "center",
          lineSpacing: 5,
        },
      )
      .setOrigin(0.5);
    const button = this.add.rectangle(GAME_WIDTH / 2, 820, 420, 88, 0xff2bd6, 0.35).setStrokeStyle(5, 0xffe34e, 1);
    const buttonText = this.add
      .text(GAME_WIDTH / 2, 820, "NEW RUN • DETONATE", {
        fontFamily: FONT,
        fontSize: "27px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
    button.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
      this.scene.restart({ seed: (Math.random() * 2 ** 31) | 0 });
    });
    overlay.add([dim, panel, header, sub, stats, button, buttonText]);
    overlay.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: overlay, scale: 1, alpha: 1, duration: 360, ease: "Back.easeOut" });
  }

  private toggleRecipes(): void {
    if (this.recipes) {
      this.recipes.destroy(true);
      this.recipes = null;
      return;
    }
    const modal = this.add.container(0, 0).setDepth(4500);
    const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x030007, 0.82);
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 640, 850, 0x11001f, 0.98).setStrokeStyle(5, 0x36f1ff, 1);
    const title = this.add
      .text(GAME_WIDTH / 2, 260, "POWERUP LAB", {
        fontFamily: FONT,
        fontSize: "48px",
        color: "#ffffff",
        stroke: "#570068",
        strokeThickness: 9,
      })
      .setOrigin(0.5);
    const body = this.add
      .text(
        GAME_WIDTH / 2,
        600,
        [
          "MATCH 4  →  ROCKET",
          "Clears a whole line",
          "",
          "MAKE A 2×2  →  PULSE",
          "Explodes a 3×3 crater",
          "",
          "MAKE A T OR L  →  NOVA",
          "Row + column + core blast",
          "",
          "MATCH 5  →  PRISM",
          "Erases one entire color",
          "",
          "MATCH 6+  →  SINGULARITY",
          "The board files a complaint",
          "",
          "FUSE ANY TWO POWERUPS",
          "15 combinations. Every pair is different.",
        ].join("\n"),
        {
          fontFamily: BODY_FONT,
          fontStyle: "bold",
          fontSize: "22px",
          color: "#ffffff",
          align: "center",
          lineSpacing: 5,
        },
      )
      .setOrigin(0.5);
    const close = this.add
      .text(GAME_WIDTH / 2, 955, "TAP ANYWHERE TO RESUME DESTRUCTION", {
        fontFamily: FONT,
        fontSize: "17px",
        color: "#ffe34e",
      })
      .setOrigin(0.5);
    modal.add([dim, panel, title, body, close]);
    dim.setInteractive().on("pointerdown", () => this.toggleRecipes());
    panel.setInteractive().on("pointerdown", () => this.toggleRecipes());
    this.recipes = modal;
  }

  private updateStageHud(): void {
    if (!this.stageText) return;
    const stageScore = Math.max(0, this.engine.score - this.stageStartScore);
    const progress = Phaser.Math.Clamp(stageScore / this.stageTarget, 0, 1);
    this.stageText.setText(`STAGE\n${this.stage}`);
    this.movesText.setText(`${this.movesLeft}\nMOVES`);
    this.movesText.setColor(this.movesLeft <= 3 ? "#ff4a72" : "#ffdf45");
    this.targetText.setText(`STAGE PAYOUT  ${stageScore.toLocaleString()} / ${this.stageTarget.toLocaleString()}`);

    this.progressGfx.clear();
    this.progressGfx.fillStyle(0x090014, 0.9);
    this.progressGfx.fillRoundedRect(42, 222, GAME_WIDTH - 84, 11, 6);
    this.progressGfx.fillGradientStyle(0x55ff8a, 0x36f1ff, 0xff2bd6, 0xffe34e, 1);
    this.progressGfx.fillRoundedRect(42, 222, (GAME_WIDTH - 84) * progress, 11, 6);

    this.hypeText.setText(this.overdriveTurns > 0 ? `OVERDRIVE • ${this.overdriveTurns} TURNS` : `HYPE ${Math.floor(this.hype)}%`);
    this.hypeText.setColor(this.overdriveTurns > 0 ? "#ffffff" : "#ff74e8");
    this.hypeGfx.clear();
    this.hypeGfx.fillStyle(0x090014, 0.92);
    this.hypeGfx.fillRoundedRect(42, 247, GAME_WIDTH - 84, 10, 5);
    const hypeProgress = this.overdriveTurns > 0 ? 1 : this.hype / 100;
    this.hypeGfx.fillGradientStyle(0xff2bd6, 0xffe34e, 0x36f1ff, 0xffffff, 1);
    this.hypeGfx.fillRoundedRect(42, 247, (GAME_WIDTH - 84) * Phaser.Math.Clamp(hypeProgress, 0, 1), 10, 5);

    if (!this.stageSecured && progress >= 1 && this.movesLeft > 0) {
      this.stageSecured = true;
      this.banner("JACKPOT SECURED • VICTORY LAP!", 0x55ff8a, 38);
      this.sfx.milestone();
      this.confetti(GAME_WIDTH / 2, BOARD_Y, 80);
    }
  }

  private targetForStage(stage: number): number {
    return Math.round((10_000 * Math.pow(1.42, stage - 1)) / 1000) * 1000;
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
    if (!this.gameOver) this.locked = false;
  }

  private tween(cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.add({
        ...cfg,
        onComplete: (...args) => {
          if (cfg.onComplete) (cfg.onComplete as (...a: unknown[]) => void)(...args);
          resolve();
        },
      });
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
      jobs.push(this.tween({ targets: va, x: cellX(a.c), y: cellY(a.r), duration: 135, ease: "Back.easeOut" }));
    }
    if (vb) {
      vb.gridR = b.r;
      vb.gridC = b.c;
      jobs.push(this.tween({ targets: vb, x: cellX(b.c), y: cellY(b.r), duration: 135, ease: "Back.easeOut" }));
    }
    await Promise.all(jobs);
  }

  private async animInvalid(a: PlacedPiece, b: PlacedPiece): Promise<void> {
    this.sfx.invalid();
    const va = this.views.get(a.id);
    const vb = this.views.get(b.id);
    this.trauma = Math.max(this.trauma, 0.22);
    const jobs: Promise<void>[] = [];
    const bump = (view: PieceView | undefined, toward: PlacedPiece): void => {
      if (!view) return;
      view.impact(7, Math.atan2(cellY(toward.r) - view.y, cellX(toward.c) - view.x));
      jobs.push(
        this.tween({
          targets: view,
          x: view.x + (cellX(toward.c) - view.x) * 0.28,
          y: view.y + (cellY(toward.r) - view.y) * 0.28,
          duration: 75,
          yoyo: true,
          ease: "Quad.easeOut",
        }),
      );
    };
    bump(va, b);
    bump(vb, a);
    await Promise.all(jobs);
  }

  private async animClear(step: Extract<Step, { type: "clear" }>): Promise<void> {
    const { pieces, created, effects, cascade } = step;
    const combo = effects.find((effect): effect is Extract<Effect, { kind: "combo" }> => effect.kind === "combo");
    const fusion = !!combo;
    const impact = Phaser.Math.Clamp(
      0.12 + 0.08 * (cascade - 1) + 0.015 * pieces.length + 0.1 * effects.length + (fusion ? 0.34 : 0),
      0.16,
      1,
    );
    this.biggestCascade = Math.max(this.biggestCascade, cascade);
    if (fusion) this.fusionCount++;

    const cx = pieces.length > 0 ? pieces.reduce((sum, p) => sum + cellX(p.c), 0) / pieces.length : GAME_WIDTH / 2;
    const cy = pieces.length > 0 ? pieces.reduce((sum, p) => sum + cellY(p.r), 0) / pieces.length : BOARD_Y + (ROWS * CELL) / 2;
    this.applyImpact(cx, cy, impact, cascade, fusion);
    this.hype = Phaser.Math.Clamp(
      this.hype + pieces.length + created.length * 5 + Math.max(0, cascade - 1) * 8 + (fusion ? 20 : 0),
      0,
      100,
    );
    this.updateStageHud();

    await this.hitstop(impact);
    for (const effect of effects) this.playEffect(effect);

    if (combo) {
      this.fusionTitle("POWER FUSION", FUSION_TITLES[combo.combo]);
    } else if (cascade >= 2) {
      const word = COMBO_WORDS[Math.min(cascade - 2, COMBO_WORDS.length - 1)] ?? `REALITY ERROR x${cascade}`;
      const accent = ACCENTS[pieces[0]?.color ?? 0] ?? 0xffffff;
      this.sfx.combo(cascade);
      this.banner(cascade > COMBO_WORDS.length ? `REALITY ERROR x${cascade}!` : word, accent, 46 + Math.min(cascade * 5, 28));
      this.confetti(GAME_WIDTH / 2, BOARD_Y + (ROWS * CELL) / 2, 18 + cascade * 9);
    }

    this.floatScore(step.score, cx, cy, ACCENTS[pieces[0]?.color ?? 0] ?? 0xffffff, cascade);
    const stagger = this.reducedFx ? 2 : fusion ? 9 : Math.max(5, 13 - cascade);
    const jobs = pieces.map((piece, index) =>
      this.popPiece(piece, Math.min(index * stagger, this.reducedFx ? 60 : 250), cascade, index, impact),
    );
    await Promise.all(jobs);

    if (created.length > 0) {
      this.sfx.specialCreate(created[0]?.special ?? "none");
      for (const piece of created) this.specialCreatedCallout(piece);
      await Promise.all(created.map((piece) => this.spawnPiece(piece, true)));
    }
  }

  private applyImpact(x: number, y: number, impact: number, cascade: number, fusion: boolean): void {
    const scaled = this.reducedFx ? impact * 0.35 : impact;
    this.trauma = Phaser.Math.Clamp(this.trauma + scaled * 0.82, 0, 1);
    this.zoomKick = Math.max(this.zoomKick, scaled * (fusion ? 0.032 : 0.016));
    this.shaderKick = Math.max(this.shaderKick, scaled * (fusion ? 1 : 0.58));
    const maxDist = Math.hypot(COLS * CELL, ROWS * CELL);
    for (const view of this.views.values()) {
      const angle = Math.atan2(view.y - y, view.x - x);
      const distance = Math.hypot(view.x - x, view.y - y);
      const falloff = 1 - Math.min(distance / maxDist, 0.62);
      view.impact((4 + scaled * 24 + cascade * 1.4) * falloff, angle);
    }
    this.sfx.impact?.(impact, fusion, cascade);
  }

  private async popPiece(
    piece: PlacedPiece,
    delayMs: number,
    cascade: number,
    index: number,
    impact: number,
  ): Promise<void> {
    const view = this.views.get(piece.id);
    if (!view) return;
    this.views.delete(piece.id);
    await this.delay(delayMs);
    this.sfx.pop(cascade, index);
    const accent = piece.color < 0 ? 0xffffff : (ACCENTS[piece.color] ?? 0xffffff);
    const count = this.reducedFx ? 3 : 6 + Math.floor(impact * 8);
    this.burst(view.x, view.y, "shard", accent, count, 170 + impact * 210, 0.42);
    this.burst(view.x, view.y, "particle_soft", accent, this.reducedFx ? 2 : 5, 70, 0.85, Phaser.BlendModes.ADD);
    await this.tween({ targets: view, scale: { from: 1, to: 1.24 + impact * 0.22 }, duration: 48, ease: "Quad.easeOut" });
    await this.tween({ targets: view, scale: 0, alpha: 0, angle: Phaser.Math.Between(-30, 30), duration: 95, ease: "Back.easeIn" });
    view.destroy();
  }

  private specialCreatedCallout(piece: PlacedPiece): void {
    const labels: Record<PlacedPiece["special"], string> = {
      none: "",
      rocketH: "ROCKET ONLINE!",
      rocketV: "ROCKET ONLINE!",
      pulse: "PULSE CHARGED!",
      nova: "NOVA BORN!",
      prism: "PRISM JACKPOT!",
      singularity: "SINGULARITY!!!",
    };
    const label = labels[piece.special];
    if (!label) return;
    const color = piece.color < 0 ? 0xffffff : (ACCENTS[piece.color] ?? 0xffffff);
    this.floatLabel(label, cellX(piece.c), cellY(piece.r) - 44, color);
  }

  private spawnPiece(piece: PlacedPiece, celebrate: boolean): Promise<void> {
    const view = new PieceView(this, piece, cellX(piece.c), cellY(piece.r));
    this.piecesLayer.add(view);
    this.views.set(piece.id, view);
    if (!celebrate) return Promise.resolve();
    this.burst(view.x, view.y, "star", 0xffffff, this.reducedFx ? 3 : 8, 90, 0.46, Phaser.BlendModes.ADD);
    this.shockwave(view.x, view.y, piece.color < 0 ? 0xffffff : (ACCENTS[piece.color] ?? 0xffffff), 0.72);
    view.setScale(0);
    return this.tween({ targets: view, scale: 1, duration: 220, ease: "Back.easeOut" });
  }

  private async animFallAndRefill(
    moves: Array<{ id: number; fromR: number; toR: number; c: number }>,
    spawns: PlacedPiece[],
  ): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const move of moves) {
      const view = this.views.get(move.id);
      if (!view) continue;
      view.gridR = move.toR;
      const distance = move.toR - move.fromR;
      jobs.push(
        this.tween({
          targets: view,
          y: cellY(move.toR),
          duration: Math.max(90, 92 + 42 * distance),
          ease: "Quad.easeIn",
        }).then(() => this.squashLand(view, distance)),
      );
    }

    const perCol = new Map<number, number>();
    for (const spawn of spawns) perCol.set(spawn.c, (perCol.get(spawn.c) ?? 0) + 1);
    for (const spawn of spawns) {
      const count = perCol.get(spawn.c) ?? 1;
      const view = new PieceView(this, spawn, cellX(spawn.c), cellY(spawn.r - count));
      this.piecesLayer.add(view);
      this.views.set(spawn.id, view);
      jobs.push(
        this.tween({
          targets: view,
          y: cellY(spawn.r),
          duration: Math.max(100, 105 + 40 * count),
          ease: "Quad.easeIn",
        }).then(() => this.squashLand(view, count)),
      );
    }
    await Promise.all(jobs);
  }

  private async squashLand(view: PieceView, distance: number): Promise<void> {
    this.sfx.land();
    view.impact(Math.min(5 + distance * 2, 12), Math.PI / 2);
    for (const other of this.views.values()) {
      if (other !== view && other.gridR === view.gridR && Math.abs(other.gridC - view.gridC) <= 1) {
        other.impact(2.5 + distance, other.gridC < view.gridC ? Math.PI : 0);
      }
    }
    await this.tween({
      targets: view,
      scaleY: 0.8,
      scaleX: 1.14,
      duration: 45,
      yoyo: true,
      ease: "Quad.easeOut",
    });
    view.setScale(1);
  }

  private async animShuffle(layout: PlacedPiece[]): Promise<void> {
    this.sfx.shuffle();
    this.fusionTitle("REALITY REROLL", "NO DEAD BOARDS ALLOWED");
    this.shaderKick = 0.6;
    const jobs: Promise<void>[] = [];
    const seen = new Set<number>();
    for (const piece of layout) {
      seen.add(piece.id);
      const view = this.views.get(piece.id);
      if (view) {
        view.gridR = piece.r;
        view.gridC = piece.c;
        jobs.push(
          this.tween({
            targets: view,
            x: cellX(piece.c),
            y: cellY(piece.r),
            angle: Phaser.Math.Between(-360, 360),
            duration: this.reducedFx ? 220 : 440,
            ease: "Cubic.easeInOut",
            onComplete: () => view.setAngle(0),
          }),
        );
      } else jobs.push(this.spawnPiece(piece, false));
    }
    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        this.views.delete(id);
        view.destroy();
      }
    }
    await Promise.all(jobs);
  }

  private playEffect(effect: Effect): void {
    const r = Phaser.Math.Clamp(effect.r, 0, ROWS - 1);
    const c = Phaser.Math.Clamp(effect.c, 0, COLS - 1);
    switch (effect.kind) {
      case "laser":
        this.sfx.rocket?.();
        this.beam(effect.axis, effect.axis === "h" ? r : c, 0x36f1ff, 1);
        break;
      case "pulse":
        this.sfx.pulse?.();
        for (let i = 0; i < Math.max(2, effect.radius); i++) {
          this.time.delayedCall(i * 70, () => this.shockwave(cellX(c), cellY(r), i % 2 ? 0xffe34e : 0xff2bd6, 0.7 + i * 0.28));
        }
        break;
      case "nova":
        this.sfx.nova?.();
        this.novaBlast(cellX(c), cellY(r), effect.radius);
        break;
      case "prism":
        this.sfx.prism?.();
        this.prismSweep(effect.color, effect.mode);
        break;
      case "singularity":
        this.sfx.singularity?.();
        this.singularityBlast(cellX(c), cellY(r));
        break;
      case "combo":
        this.sfx.fusion?.(effect.combo);
        this.fusionEffect(effect);
        break;
    }
  }

  private beam(axis: "h" | "v", index: number, tint: number, width: number): void {
    const horizontal = axis === "h";
    const x = horizontal ? BOARD_X + (COLS * CELL) / 2 : cellX(index);
    const y = horizontal ? cellY(index) : BOARD_Y + (ROWS * CELL) / 2;
    const outer = this.add.image(x, y, "particle_soft").setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.95);
    const core = this.add.image(x, y, "particle_soft").setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(1);
    if (horizontal) {
      outer.setScale((COLS * CELL) / 100, 0.42 * width);
      core.setScale((COLS * CELL) / 100, 0.12 * width);
    } else {
      outer.setScale(0.42 * width, (ROWS * CELL) / 100);
      core.setScale(0.12 * width, (ROWS * CELL) / 100);
    }
    this.fxLayer.add([outer, core]);
    this.tweens.add({ targets: [outer, core], alpha: 0, scaleX: `*=${horizontal ? 1.05 : 2.2}`, scaleY: `*=${horizontal ? 2.2 : 1.05}`, duration: 260, ease: "Quad.easeOut", onComplete: () => { outer.destroy(); core.destroy(); } });
  }

  private novaBlast(x: number, y: number, radius: number): void {
    this.starburst(x, y, 0xffffff, 3.6);
    this.shockwave(x, y, 0xff2bd6, 1.6);
    const length = COLS * CELL * 1.4;
    for (const angle of [0, 45, 90, 135]) {
      const ray = this.add.rectangle(x, y, length, 18 + radius * 2, 0x36f1ff, 0.88).setBlendMode(Phaser.BlendModes.ADD).setAngle(angle);
      this.fxLayer.add(ray);
      this.tweens.add({ targets: ray, scaleY: { from: 0.1, to: 2.2 }, alpha: 0, duration: 390, onComplete: () => ray.destroy() });
    }
  }

  private prismSweep(color: number, mode: Extract<Effect, { kind: "prism" }>["mode"]): void {
    const centerY = BOARD_Y + (ROWS * CELL) / 2;
    const tint = color >= 0 ? (ACCENTS[color] ?? 0xffffff) : 0xffffff;
    const bands = mode === "clear" ? 3 : this.reducedFx ? 4 : 8;
    for (let i = 0; i < bands; i++) {
      const band = this.add
        .rectangle(BOARD_X - 80, centerY, 70, ROWS * CELL + 80, ACCENTS[i % ACCENTS.length] ?? tint, 0.42)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAngle(-10);
      this.fxLayer.add(band);
      this.tweens.add({
        targets: band,
        x: BOARD_X + COLS * CELL + 80,
        delay: i * 42,
        duration: 430,
        alpha: 0,
        ease: "Cubic.easeIn",
        onComplete: () => band.destroy(),
      });
    }
    this.cameras.main.flash(90, 255, 245, 255);
  }

  private singularityBlast(x: number, y: number): void {
    const hole = this.add.circle(x, y, 8, 0x000000, 1).setStrokeStyle(7, 0xffffff, 1);
    const corona = this.add.image(x, y, "ring").setTint(0xb56cff).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2);
    this.fxLayer.add([hole, corona]);
    this.tweens.add({ targets: [hole, corona], scale: { from: 0.2, to: 4.6 }, angle: 360, duration: 520, ease: "Cubic.easeOut" });
    this.tweens.add({ targets: [hole, corona], alpha: 0, delay: 330, duration: 260, onComplete: () => { hole.destroy(); corona.destroy(); } });
    for (const view of this.views.values()) {
      view.impact(this.reducedFx ? 4 : 18, Math.atan2(y - view.y, x - view.x));
    }
    this.time.delayedCall(210, () => this.cameras.main.flash(160, 255, 255, 255));
  }

  private fusionEffect(effect: Extract<Effect, { kind: "combo" }>): void {
    const r = Phaser.Math.Clamp(effect.r, 0, ROWS - 1);
    const c = Phaser.Math.Clamp(effect.c, 0, COLS - 1);
    const huge = ["nova-nova", "prism-prism", "singularity"].includes(effect.combo);
    this.shaderKick = huge ? 1 : Math.max(this.shaderKick, 0.75);
    this.trauma = huge ? 1 : Math.max(this.trauma, 0.75);
    switch (effect.combo) {
      case "rocket-parallel-h":
        for (const d of [-1, 0, 1]) this.beam("h", Phaser.Math.Clamp(r + d, 0, ROWS - 1), 0xffe34e, 1.2);
        break;
      case "rocket-parallel-v":
        for (const d of [-1, 0, 1]) this.beam("v", Phaser.Math.Clamp(c + d, 0, COLS - 1), 0xffe34e, 1.2);
        break;
      case "rocket-cross":
      case "rocket-pulse":
        for (const d of [-1, 0, 1]) {
          this.beam("h", Phaser.Math.Clamp(r + d, 0, ROWS - 1), 0x36f1ff, 1.15);
          this.beam("v", Phaser.Math.Clamp(c + d, 0, COLS - 1), 0xff2bd6, 1.15);
        }
        break;
      case "rocket-nova":
        for (const d of [-2, -1, 0, 1, 2]) {
          this.time.delayedCall((d + 2) * 35, () => {
            this.beam("h", Phaser.Math.Clamp(r + d, 0, ROWS - 1), 0xffe34e, 1.25);
            this.beam("v", Phaser.Math.Clamp(c + d, 0, COLS - 1), 0xff2bd6, 1.25);
          });
        }
        break;
      case "pulse-pulse":
      case "pulse-nova":
        for (let i = 0; i < 5; i++) this.time.delayedCall(i * 70, () => this.shockwave(cellX(c), cellY(r), ACCENTS[i % ACCENTS.length] ?? 0xffffff, 0.8 + i * 0.42));
        break;
      case "rocket-prism":
      case "pulse-prism":
      case "nova-prism":
        this.prismSweep(effect.color ?? -1, effect.combo === "rocket-prism" ? "rocket-rain" : effect.combo === "pulse-prism" ? "blast-field" : "cross-storm");
        break;
      case "nova-nova":
        this.novaBlast(cellX(c), cellY(r), 6);
        this.time.delayedCall(150, () => this.novaBlast(GAME_WIDTH / 2, BOARD_Y + (ROWS * CELL) / 2, 8));
        break;
      case "prism-prism":
        this.prismSweep(-1, "cross-storm");
        this.time.delayedCall(170, () => this.prismSweep(-1, "rocket-rain"));
        break;
      case "singularity":
        this.singularityBlast(cellX(c), cellY(r));
        this.time.delayedCall(280, () => this.singularityBlast(GAME_WIDTH / 2, BOARD_Y + (ROWS * CELL) / 2));
        break;
    }
  }

  private shockwave(x: number, y: number, tint: number, maxScale = 1.6): void {
    const ring = this.add.image(x, y, "double_ring").setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(0.12).setAlpha(1);
    this.fxLayer.add(ring);
    this.tweens.add({ targets: ring, scale: maxScale, angle: 120, alpha: 0, duration: 360, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
    this.burst(x, y, "shard", tint, this.reducedFx ? 5 : 15, 290, 0.5);
  }

  private starburst(x: number, y: number, tint: number, maxScale = 3.4): void {
    const flash = this.add.image(x, y, "star").setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(0.35).setAlpha(1);
    this.fxLayer.add(flash);
    this.tweens.add({ targets: flash, scale: maxScale, angle: 120, alpha: 0, duration: 420, ease: "Cubic.easeOut", onComplete: () => flash.destroy() });
    this.burst(x, y, "star", tint, this.reducedFx ? 4 : 12, 340, 0.32, Phaser.BlendModes.ADD);
  }

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
      speed: { min: speed * 0.35, max: speed },
      angle: { min: 0, max: 360 },
      scale: { start: scale, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 280, max: 680 },
      gravityY: texture === "shard" || texture === "sprinkle" ? 520 : 0,
      rotate: { min: -360, max: 360 },
      tint,
      blendMode: blend,
      emitting: false,
    });
    emitter.explode(this.reducedFx ? Math.max(2, Math.floor(count * 0.4)) : count);
    this.time.delayedCall(850, () => emitter.destroy());
  }

  private confetti(x: number, y: number, count: number): void {
    const emitter = this.add.particles(x, y, "shard", {
      speed: { min: 190, max: 560 },
      angle: { min: 195, max: 345 },
      scale: { start: 0.8, end: 0.22 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 740, max: 1450 },
      gravityY: 920,
      rotate: { min: -720, max: 720 },
      tint: [...ACCENTS, 0xffffff, 0xffe34e],
      emitting: false,
    });
    emitter.explode(this.reducedFx ? Math.max(10, Math.floor(count * 0.25)) : count);
    this.time.delayedCall(1600, () => emitter.destroy());
  }

  private banner(text: string, tint: number, size: number): void {
    const color = `#${tint.toString(16).padStart(6, "0")}`;
    const ghostA = this.add
      .text(GAME_WIDTH / 2 - 4, BOARD_Y + (ROWS * CELL) / 2 - 28, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color: "#ff2bd6",
        stroke: "#08000d",
        strokeThickness: 12,
        align: "center",
      })
      .setOrigin(0.5)
      .setAlpha(0.7);
    const ghostB = this.add
      .text(GAME_WIDTH / 2 + 4, ghostA.y, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color: "#36f1ff",
        stroke: "#08000d",
        strokeThickness: 12,
        align: "center",
      })
      .setOrigin(0.5)
      .setAlpha(0.7);
    const main = this.add
      .text(GAME_WIDTH / 2, ghostA.y, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color,
        stroke: "#08000d",
        strokeThickness: 11,
        align: "center",
        wordWrap: { width: 650 },
      })
      .setOrigin(0.5)
      .setShadow(0, 0, color, 15)
      .setAngle(Phaser.Math.Between(-4, 4));
    const group = [ghostA, ghostB, main];
    for (const item of group) item.setScale(0);
    this.tweens.add({
      targets: group,
      scale: 1,
      duration: 180,
      ease: "Back.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: group,
          alpha: 0,
          y: `-=55`,
          delay: this.reducedFx ? 220 : 430,
          duration: 260,
          onComplete: () => group.forEach((item) => item.destroy()),
        });
      },
    });
  }

  private fusionTitle(kicker: string, title: string): void {
    const y = BOARD_Y + (ROWS * CELL) / 2;
    const plate = this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH + 80, 160, 0x08000f, 0.88).setScale(0, 1);
    plate.setStrokeStyle(5, 0xffe34e, 0.9);
    const top = this.add
      .text(GAME_WIDTH / 2, y - 40, kicker, {
        fontFamily: BODY_FONT,
        fontStyle: "bold",
        fontSize: "20px",
        color: "#36f1ff",
        letterSpacing: 4,
      })
      .setOrigin(0.5)
      .setAlpha(0);
    const main = this.add
      .text(GAME_WIDTH / 2, y + 12, title, {
        fontFamily: FONT,
        fontSize: "43px",
        color: "#ffffff",
        stroke: "#5d006f",
        strokeThickness: 9,
        align: "center",
        wordWrap: { width: 670 },
      })
      .setOrigin(0.5)
      .setShadow(0, 0, "#ff2bd6", 14)
      .setScale(0);
    this.tweens.add({ targets: plate, scaleX: 1, duration: 160, ease: "Cubic.easeOut" });
    this.tweens.add({ targets: top, alpha: 1, delay: 80, duration: 100 });
    this.tweens.add({
      targets: main,
      scale: 1,
      delay: 70,
      duration: 210,
      ease: "Back.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: [plate, top, main],
          alpha: 0,
          delay: this.reducedFx ? 320 : 650,
          duration: 260,
          onComplete: () => { plate.destroy(); top.destroy(); main.destroy(); },
        });
      },
    });
  }

  private floatScore(amount: number, x: number, y: number, tint: number, cascade: number): void {
    const size = Math.min(29 + Math.floor(Math.log10(Math.max(10, amount))) * 7 + cascade * 2, 67);
    const color = `#${tint.toString(16).padStart(6, "0")}`;
    const text = this.add
      .text(x, y, `+${amount.toLocaleString()}${cascade > 1 ? `  x${cascade}` : ""}`, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color,
        stroke: "#08000d",
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setShadow(0, 0, color, 10);
    this.tweens.add({
      targets: text,
      alpha: 1,
      y: y - 24,
      scale: { from: 0.45, to: 1.1 },
      duration: 125,
      ease: "Back.easeOut",
      onComplete: () => {
        this.tweens.add({ targets: text, alpha: 0, y: text.y - 52, delay: 300, duration: 300, onComplete: () => text.destroy() });
      },
    });
  }

  private floatLabel(label: string, x: number, y: number, tint: number): void {
    const text = this.add
      .text(x, y, label, {
        fontFamily: FONT,
        fontSize: "18px",
        color: `#${tint.toString(16).padStart(6, "0")}`,
        stroke: "#08000d",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScale(0);
    this.tweens.add({
      targets: text,
      scale: 1,
      y: y - 15,
      duration: 170,
      ease: "Back.easeOut",
      onComplete: () => this.tweens.add({ targets: text, alpha: 0, y: text.y - 35, delay: 300, duration: 240, onComplete: () => text.destroy() }),
    });
  }

  private async hitstop(impact: number): Promise<void> {
    if (this.reducedFx) return;
    const duration = 20 + impact * 62;
    this.tweens.timeScale = impact > 0.65 ? 0.06 : 0.18;
    await this.delay(duration);
    this.tweens.timeScale = 1;
  }

  private async entrance(): Promise<void> {
    this.locked = true;
    this.sfx.start();
    const jobs: Promise<void>[] = [];
    for (const piece of this.engine.board) {
      const view = new PieceView(this, piece, cellX(piece.c), cellY(piece.r) - (ROWS + 2) * CELL);
      this.piecesLayer.add(view);
      this.views.set(piece.id, view);
      jobs.push(
        this.tween({
          targets: view,
          y: cellY(piece.r),
          delay: piece.c * 28 + piece.r * 10,
          duration: this.reducedFx ? 260 : 470,
          ease: "Bounce.easeOut",
        }),
      );
    }
    await Promise.all(jobs);
    this.banner("WELCOME TO MAXIMUM", 0xffe34e, 48);
    this.confetti(GAME_WIDTH / 2, BOARD_Y, 55);
    this.locked = false;
    this.lastAction = this.time.now;
  }
}
