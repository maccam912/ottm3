/**
 * Bakes the game's art from the Kenney "Donuts" pack (CC0) and copies the
 * audio we use from the Kenney audio packs into assets/.
 *
 * Run: npm run bake
 * Requires: Kenney Game Assets All-in-1 3.5.0 in ~/Downloads (see README).
 */
import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const KENNEY = join(homedir(), "Downloads", "Kenney Game Assets All-in-1 3.5.0");
const DONUTS = join(KENNEY, "2D assets", "Donuts", "PNG");
const AUDIO = join(KENNEY, "Audio");
const OUT_IMG = join(import.meta.dirname, "..", "assets", "img");
const OUT_AUDIO = join(import.meta.dirname, "..", "assets", "audio");

if (!existsSync(DONUTS)) {
  console.error(`Kenney pack not found at ${DONUTS}`);
  process.exit(1);
}
mkdirSync(OUT_IMG, { recursive: true });
mkdirSync(OUT_AUDIO, { recursive: true });

const SIZE = 256;

async function img(name: string): Promise<Image> {
  return loadImage(join(DONUTS, name));
}

function centered(ctx: SKRSContext2D, image: Image, scale: number): void {
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
}

/** Draw `layer` tinted by multiplying with `color`, clipped to the layer's own alpha. */
function tinted(ctx: SKRSContext2D, layer: Image, scale: number, color: string): void {
  const c = createCanvas(SIZE, SIZE);
  const cc = c.getContext("2d");
  const w = layer.width * scale;
  const h = layer.height * scale;
  cc.drawImage(layer, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  cc.globalCompositeOperation = "multiply";
  cc.fillStyle = color;
  cc.fillRect(0, 0, SIZE, SIZE);
  cc.globalCompositeOperation = "destination-in";
  cc.drawImage(layer, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  ctx.drawImage(c, 0, 0);
}

async function bakeDonuts(): Promise<void> {
  // Probed layer identities (avg RGB):
  //   donut_1 tan base, donut_2 medium brown, donut_3 dark brown
  //   glazing_1 pink, _2 white, _3 chocolate, _4 tan, _5 mint, _6 yellow
  //   sprinkles_2 rainbow, _4 white, _5 chocolate
  const base1 = await img("donut_1.png");
  const base2 = await img("donut_2.png");
  const base3 = await img("donut_3.png");
  const glazePink = await img("glazing_1.png");
  const glazeWhite = await img("glazing_2.png");
  const glazeChoc = await img("glazing_3.png");
  const glazeMint = await img("glazing_5.png");
  const glazeYellow = await img("glazing_6.png");
  const sprRainbow = await img("sprinkles_2.png");
  const sprWhite = await img("sprinkles_4.png");
  const sprChoc = await img("sprinkles_5.png");
  const zigzagWhite = await img("glazing_zigzag_2.png");

  // Slightly under 1 so the baked shadow has room inside the canvas.
  const S_BASE = (SIZE / 264) * 0.88;
  const S_GLAZE = (SIZE / 264) * 0.88;
  const S_SPR = (SIZE / 264) * 0.81;

  type Recipe = {
    name: string;
    base: Image;
    glaze?: Image;
    glazeTint?: string;
    sprinkles?: Image;
    zigzag?: boolean;
  };

  const recipes: Recipe[] = [
    { name: "donut_pink", base: base1, glaze: glazePink, sprinkles: sprWhite },
    { name: "donut_mint", base: base1, glaze: glazeMint },
    { name: "donut_yellow", base: base2, glaze: glazeYellow },
    { name: "donut_choc", base: base1, glaze: glazeChoc, sprinkles: sprRainbow },
    { name: "donut_white", base: base2, glaze: glazeWhite, sprinkles: sprChoc },
    { name: "donut_blue", base: base1, glaze: glazeWhite, glazeTint: "#58a6ff" },
    { name: "donut_bomb", base: base3, zigzag: true, sprinkles: sprRainbow },
  ];

  for (const r of recipes) {
    const c = createCanvas(SIZE, SIZE);
    const ctx = c.getContext("2d");
    // Soft drop shadow baked into the sprite (free depth at runtime).
    ctx.save();
    ctx.shadowColor = "rgba(60, 20, 30, 0.35)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 10;
    centered(ctx, r.base, S_BASE);
    ctx.restore();
    if (r.glaze) {
      if (r.glazeTint) tinted(ctx, r.glaze, S_GLAZE, r.glazeTint);
      else centered(ctx, r.glaze, S_GLAZE);
    }
    if (r.zigzag) centered(ctx, zigzagWhite, S_GLAZE);
    if (r.sprinkles) centered(ctx, r.sprinkles, S_SPR);
    writeFileSync(join(OUT_IMG, `${r.name}.png`), c.toBuffer("image/png"));
    console.log(`baked ${r.name}.png`);
  }
}

function bakeParticles(): void {
  // Soft radial glow used by all glow/burst particles (tinted at runtime).
  {
    const s = 128;
    const c = createCanvas(s, s);
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.85)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    writeFileSync(join(OUT_IMG, "particle_soft.png"), c.toBuffer("image/png"));
  }
  // Crumb: small irregular blob.
  {
    const s = 32;
    const c = createCanvas(s, s);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    for (const [x, y, r] of [
      [14, 16, 8],
      [20, 13, 6],
      [11, 11, 5],
      [18, 20, 5],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    writeFileSync(join(OUT_IMG, "crumb.png"), c.toBuffer("image/png"));
  }
  // Sprinkle: little rounded stick.
  {
    const c = createCanvas(28, 12);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(2, 2, 24, 8, 4);
    ctx.fill();
    writeFileSync(join(OUT_IMG, "sprinkle.png"), c.toBuffer("image/png"));
  }
  // Ring: shockwave.
  {
    const s = 256;
    const c = createCanvas(s, s);
    const ctx = c.getContext("2d");
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - 10, 0, Math.PI * 2);
    ctx.stroke();
    writeFileSync(join(OUT_IMG, "ring.png"), c.toBuffer("image/png"));
  }
  // Star: 4-point sparkle.
  {
    const s = 64;
    const c = createCanvas(s, s);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    const cx = s / 2;
    const r1 = s / 2 - 2;
    const r2 = s / 9;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? r1 : r2;
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      const x = cx + r * Math.cos(a);
      const y = cx + r * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    writeFileSync(join(OUT_IMG, "star.png"), c.toBuffer("image/png"));
  }
  console.log("baked particle textures");
}

function copyAudio(): void {
  const files: Array<[string, string]> = [
    // [source relative to Audio/, destination name]
    ["Impact Sounds/Audio/impactSoft_medium_000.ogg", "pop_a.ogg"],
    ["Impact Sounds/Audio/impactSoft_medium_001.ogg", "pop_b.ogg"],
    ["Impact Sounds/Audio/impactSoft_medium_002.ogg", "pop_c.ogg"],
    ["Interface Sounds/Audio/pluck_001.ogg", "pluck.ogg"],
    ["Interface Sounds/Audio/pluck_002.ogg", "pluck_soft.ogg"],
    ["Interface Sounds/Audio/switch_002.ogg", "swap.ogg"],
    ["Interface Sounds/Audio/error_004.ogg", "invalid.ogg"],
    ["Interface Sounds/Audio/click_002.ogg", "select.ogg"],
    ["Interface Sounds/Audio/tick_001.ogg", "land.ogg"],
    ["Interface Sounds/Audio/confirmation_001.ogg", "start.ogg"],
    ["Interface Sounds/Audio/scroll_002.ogg", "shuffle.ogg"],
    ["Digital Audio/Audio/powerUp2.ogg", "special_create.ogg"],
    ["Digital Audio/Audio/powerUp3.ogg", "levelup.ogg"],
    ["Digital Audio/Audio/phaserUp1.ogg", "striped_fire.ogg"],
    ["Digital Audio/Audio/pepSound1.ogg", "combo_1.ogg"],
    ["Digital Audio/Audio/pepSound2.ogg", "combo_2.ogg"],
    ["Digital Audio/Audio/pepSound3.ogg", "combo_3.ogg"],
    ["Digital Audio/Audio/pepSound4.ogg", "combo_4.ogg"],
    ["Digital Audio/Audio/pepSound5.ogg", "combo_5.ogg"],
    ["Impact Sounds/Audio/impactPunch_heavy_001.ogg", "wrapped_blast.ogg"],
    ["Impact Sounds/Audio/impactBell_heavy_002.ogg", "colorbomb.ogg"],
    ["Music Loops/Loops/Farm Frolics.ogg", "music.ogg"],
  ];
  for (const [src, dst] of files) {
    copyFileSync(join(AUDIO, src), join(OUT_AUDIO, dst));
    console.log(`copied ${dst}`);
  }
}

await bakeDonuts();
bakeParticles();
copyAudio();
console.log("done");
