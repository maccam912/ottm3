import Phaser from "phaser";
import { CELL, GAME_HEIGHT, GAME_WIDTH } from "../constants";

const IMAGES = [
  "donut_pink",
  "donut_mint",
  "donut_yellow",
  "donut_choc",
  "donut_white",
  "donut_blue",
  "donut_bomb",
  "particle_soft",
  "crumb",
  "sprinkle",
  "ring",
  "star",
] as const;

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

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    for (const key of IMAGES) this.load.image(key, `img/${key}.png`);
    for (const key of SOUNDS) this.load.audio(key, `audio/${key}.ogg`);
  }

  create(): void {
    this.makeBackground();
    this.makeStripeOverlays();
    this.scene.start("game");
  }

  /** Warm cocoa gradient + vignette, drawn once into a canvas texture. */
  private makeBackground(): void {
    const canvas = this.textures.createCanvas("bg", GAME_WIDTH, GAME_HEIGHT);
    if (!canvas) return;
    const ctx = canvas.getContext();
    const g = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    g.addColorStop(0, "#42283a");
    g.addColorStop(0.5, "#382030");
    g.addColorStop(1, "#241019");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    const v = ctx.createRadialGradient(
      GAME_WIDTH / 2,
      GAME_HEIGHT * 0.42,
      GAME_WIDTH * 0.2,
      GAME_WIDTH / 2,
      GAME_HEIGHT * 0.5,
      GAME_WIDTH * 0.95,
    );
    v.addColorStop(0, "rgba(255, 200, 160, 0.10)");
    v.addColorStop(0.55, "rgba(0, 0, 0, 0)");
    v.addColorStop(1, "rgba(0, 0, 0, 0.42)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    canvas.refresh();
  }

  /** Glossy stripe decorations for striped specials. */
  private makeStripeOverlays(): void {
    const w = CELL * 0.58;
    const bar = CELL * 0.11;
    for (const dir of ["h", "v"] as const) {
      const gfx = this.add.graphics();
      gfx.fillStyle(0xffffff, 0.92);
      for (const offset of [-bar * 1.6, 0, bar * 1.6]) {
        if (dir === "h") {
          gfx.fillRoundedRect(0, w / 2 + offset - bar / 2, w, bar, bar / 2);
        } else {
          gfx.fillRoundedRect(w / 2 + offset - bar / 2, 0, bar, w, bar / 2);
        }
      }
      gfx.generateTexture(`stripes_${dir}`, w + 2, w + 2);
      gfx.destroy();
    }
  }
}
