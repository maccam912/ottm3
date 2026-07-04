/**
 * Generate the PWA icons from the baked donut sprite: a warm cocoa gradient
 * tile with the pink donut centered. The maskable variant keeps the donut
 * inside the 80% safe zone so launchers can crop it into any shape.
 *
 *   npx tsx scripts/make-icons.ts
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import path from "node:path";

const IMG_DIR = path.join(process.cwd(), "assets", "img");

async function makeIcon(size: number, donutRatio: number, file: string): Promise<void> {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, "#42283a");
  g.addColorStop(0.55, "#382030");
  g.addColorStop(1, "#241019");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const glow = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.1,
    size / 2,
    size / 2,
    size * 0.6,
  );
  glow.addColorStop(0, "rgba(255, 158, 207, 0.22)");
  glow.addColorStop(1, "rgba(255, 158, 207, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  const donut = await loadImage(path.join(IMG_DIR, "donut_pink.png"));
  const d = size * donutRatio;
  ctx.drawImage(donut, (size - d) / 2, (size - d) / 2, d, d);

  writeFileSync(path.join(IMG_DIR, file), canvas.toBuffer("image/png"));
  console.log(`wrote assets/img/${file}`);
}

await makeIcon(192, 0.82, "icon-192.png");
await makeIcon(512, 0.82, "icon-512.png");
await makeIcon(512, 0.62, "icon-maskable-512.png");
