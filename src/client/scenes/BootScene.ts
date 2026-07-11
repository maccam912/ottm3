import Phaser from "phaser";
import { OverdrivePipeline } from "../OverdrivePipeline";
import { ACCENT_CSS, CELL } from "../constants";

const IMAGES = ["particle_soft", "crumb", "sprinkle", "ring", "star"] as const;

const SOUNDS = [
  "pop_a",
  "pop_b",
  "pop_c",
  "pluck",
  "pluck_soft",
  "swap",
  "invalid",
  "select",
  "land",
  "start",
  "shuffle",
  "special_create",
  "levelup",
  "striped_fire",
  "combo_1",
  "combo_2",
  "combo_3",
  "combo_4",
  "combo_5",
  "wrapped_blast",
  "colorbomb",
  "music",
] as const;

type RelicShape = "star" | "diamond" | "bolt" | "void" | "atom" | "drop";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    this.load.image("arena_bg", "img/arena-bg.webp");
    for (const key of IMAGES) this.load.image(key, `img/${key}.png`);
    for (const key of SOUNDS) this.load.audio(key, `audio/${key}.ogg`);
  }

  create(): void {
    this.registerShader();
    this.makeRelics();
    this.makeRocketOverlays();
    this.makeFxTextures();
    this.scene.start("game");
  }

  private registerShader(): void {
    if (this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      this.game.renderer.pipelines.addPostPipeline("Overdrive", OverdrivePipeline);
    }
  }

  /** Generate six sharply different, glossy relic silhouettes at boot. */
  private makeRelics(): void {
    const shapes: RelicShape[] = ["star", "diamond", "bolt", "void", "atom", "drop"];
    const darks = ["#5f005c", "#00677e", "#8e4d00", "#26004d", "#006438", "#062d88"];

    shapes.forEach((shape, index) => {
      const key = `relic_${shape}`;
      const canvas = this.textures.createCanvas(key, 256, 256);
      if (!canvas) return;
      const ctx = canvas.getContext();
      ctx.clearRect(0, 0, 256, 256);
      ctx.save();
      ctx.translate(128, 128);

      // This baked halo is the relic's ambient glow: strong enough that the
      // board keeps its cosmic bloom without a per-piece additive aura sprite
      // (which would break sprite batching and cost a draw call per relic).
      const glow = ctx.createRadialGradient(0, 0, 22, 0, 0, 124);
      glow.addColorStop(0, `${ACCENT_CSS[index]}c4`);
      glow.addColorStop(0.55, `${ACCENT_CSS[index]}4a`);
      glow.addColorStop(1, `${ACCENT_CSS[index]}00`);
      ctx.fillStyle = glow;
      ctx.fillRect(-128, -128, 256, 256);

      ctx.save();
      ctx.shadowColor = ACCENT_CSS[index] ?? "#ffffff";
      ctx.shadowBlur = 30;
      this.traceRelic(ctx, shape, 86);
      const body = ctx.createLinearGradient(-70, -82, 70, 82);
      body.addColorStop(0, "#ffffff");
      body.addColorStop(0.16, ACCENT_CSS[index] ?? "#ffffff");
      body.addColorStop(0.58, darks[index] ?? "#222222");
      body.addColorStop(1, ACCENT_CSS[index] ?? "#ffffff");
      ctx.fillStyle = body;
      ctx.fill();
      ctx.restore();

      ctx.save();
      this.traceRelic(ctx, shape, 86);
      ctx.clip();
      const shine = ctx.createRadialGradient(-32, -42, 2, -20, -28, 104);
      shine.addColorStop(0, "rgba(255,255,255,0.98)");
      shine.addColorStop(0.18, "rgba(255,255,255,0.32)");
      shine.addColorStop(0.52, "rgba(255,255,255,0.04)");
      shine.addColorStop(1, "rgba(0,0,0,0.38)");
      ctx.fillStyle = shine;
      ctx.fillRect(-100, -100, 200, 200);

      // Facets intentionally disagree with the silhouette: more sparkle.
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = "#ffffff";
      for (const angle of [-2.4, -1.25, -0.15, 0.8, 2.15]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * 105, Math.sin(angle) * 105);
        ctx.lineTo(Math.cos(angle + 0.58) * 105, Math.sin(angle + 0.58) * 105);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      this.traceRelic(ctx, shape, 86);
      ctx.lineWidth = 8;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.stroke();
      this.traceRelic(ctx, shape, 72);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,0.42)";
      ctx.stroke();
      this.drawRelicGlyph(ctx, shape);

      ctx.restore();
      canvas.refresh();
    });
  }

  private traceRelic(ctx: CanvasRenderingContext2D, shape: RelicShape, radius: number): void {
    ctx.beginPath();
    switch (shape) {
      case "star":
        for (let i = 0; i < 16; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 8;
          const r = i % 2 === 0 ? radius : radius * 0.52;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        break;
      case "diamond":
        ctx.moveTo(0, -radius);
        ctx.lineTo(radius * 0.82, -radius * 0.22);
        ctx.lineTo(radius * 0.55, radius * 0.76);
        ctx.lineTo(0, radius);
        ctx.lineTo(-radius * 0.55, radius * 0.76);
        ctx.lineTo(-radius * 0.82, -radius * 0.22);
        ctx.closePath();
        break;
      case "bolt":
        ctx.moveTo(radius * 0.15, -radius);
        ctx.lineTo(-radius * 0.58, radius * 0.05);
        ctx.lineTo(-radius * 0.08, -radius * 0.01);
        ctx.lineTo(-radius * 0.26, radius);
        ctx.lineTo(radius * 0.65, -radius * 0.2);
        ctx.lineTo(radius * 0.12, -radius * 0.08);
        ctx.closePath();
        break;
      case "void":
        ctx.arc(0, 0, radius * 0.86, 0, Math.PI * 2);
        break;
      case "atom":
        for (let i = 0; i < 12; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 6;
          const r = i % 2 === 0 ? radius : radius * 0.8;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        break;
      case "drop":
        ctx.moveTo(0, -radius);
        ctx.bezierCurveTo(radius * 0.2, -radius * 0.45, radius * 0.74, 0, radius * 0.66, radius * 0.48);
        ctx.bezierCurveTo(radius * 0.58, radius, -radius * 0.58, radius, -radius * 0.66, radius * 0.48);
        ctx.bezierCurveTo(-radius * 0.74, 0, -radius * 0.2, -radius * 0.45, 0, -radius);
        ctx.closePath();
        break;
    }
  }

  private drawRelicGlyph(ctx: CanvasRenderingContext2D, shape: RelicShape): void {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 12;
    ctx.lineWidth = 7;
    if (shape === "void") {
      ctx.beginPath();
      ctx.arc(0, 0, 38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fillStyle = "#13001f";
      ctx.fill();
    } else if (shape === "atom") {
      for (const angle of [0, Math.PI / 3, -Math.PI / 3]) {
        ctx.save();
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.ellipse(0, 0, 47, 18, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(-24, -34);
      ctx.lineTo(24, 34);
      ctx.moveTo(25, -38);
      ctx.lineTo(-25, 38);
      ctx.stroke();
    }
    ctx.restore();
  }

  private makeRocketOverlays(): void {
    const w = CELL * 0.68;
    for (const dir of ["h", "v"] as const) {
      const gfx = this.add.graphics();
      gfx.fillStyle(0xffffff, 0.98);
      gfx.lineStyle(3, 0x36f1ff, 1);
      for (const offset of [-11, 0, 11]) {
        if (dir === "h") gfx.fillRoundedRect(0, w / 2 + offset - 3, w, 6, 3);
        else gfx.fillRoundedRect(w / 2 + offset - 3, 0, 6, w, 3);
      }
      gfx.generateTexture(`rocket_${dir}`, Math.ceil(w + 2), Math.ceil(w + 2));
      gfx.destroy();
    }
  }

  private makeFxTextures(): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(0xffffff, 1);
    gfx.fillTriangle(16, 0, 24, 32, 8, 32);
    gfx.generateTexture("shard", 32, 32);
    gfx.clear();
    gfx.lineStyle(5, 0xffffff, 1);
    gfx.strokeCircle(32, 32, 24);
    gfx.lineStyle(2, 0xffffff, 0.8);
    gfx.strokeCircle(32, 32, 12);
    gfx.generateTexture("double_ring", 64, 64);
    gfx.destroy();
  }
}
