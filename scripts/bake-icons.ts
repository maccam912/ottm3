/**
 * Draw the OTTM3 neon cosmic-jackpot PWA icons with no source bitmap.
 * The maskable variant keeps the badge and lettering inside the central
 * adaptive-icon safe circle while allowing the energy field to be cropped.
 *
 *   npm run bake:icons
 */
import { createCanvas } from "@napi-rs/canvas";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const IMG_DIR = join(process.cwd(), "assets", "img");
const TAU = Math.PI * 2;

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function traceStar(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  x: number,
  y: number,
  outer: number,
  inner: number,
  points = 5,
): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawIcon(size: number, maskable: boolean): Buffer {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const center = size / 2;
  const badgeRadius = size * (maskable ? 0.3 : 0.385);
  const random = seededRandom(size + (maskable ? 912 : 3));

  const background = ctx.createRadialGradient(
    center * 0.72,
    center * 0.58,
    size * 0.03,
    center,
    center,
    size * 0.72,
  );
  background.addColorStop(0, "#6313a8");
  background.addColorStop(0.34, "#22004d");
  background.addColorStop(0.72, "#09001c");
  background.addColorStop(1, "#020008");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, size, size);

  // Slot-machine rays are decorative and intentionally reach beyond the
  // adaptive mask; the central badge below contains all critical artwork.
  ctx.save();
  ctx.translate(center, center);
  ctx.globalAlpha = 0.34;
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * TAU;
    ctx.save();
    ctx.rotate(angle);
    const ray = ctx.createLinearGradient(badgeRadius * 0.72, 0, size * 0.72, 0);
    ray.addColorStop(0, i % 2 === 0 ? "#ff2bd600" : "#36f1ff00");
    ray.addColorStop(0.42, i % 2 === 0 ? "#ff2bd6aa" : "#36f1ffaa");
    ray.addColorStop(1, "#ffffff00");
    ctx.fillStyle = ray;
    ctx.beginPath();
    ctx.moveTo(badgeRadius * 0.72, -size * 0.012);
    ctx.lineTo(size * 0.72, -size * 0.045);
    ctx.lineTo(size * 0.72, size * 0.045);
    ctx.lineTo(badgeRadius * 0.72, size * 0.012);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // Deterministic cosmic sparks keep even the 192px icon crisp.
  for (let i = 0; i < 44; i++) {
    const angle = random() * TAU;
    const radius = size * (0.31 + random() * 0.39);
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    const spark = size * (0.0035 + random() * 0.008);
    ctx.fillStyle = i % 3 === 0 ? "#ffe53b" : i % 2 === 0 ? "#36f1ff" : "#ff65e6";
    ctx.globalAlpha = 0.55 + random() * 0.45;
    ctx.fillRect(x - spark * 0.5, y - spark * 2, spark, spark * 4);
    ctx.fillRect(x - spark * 2, y - spark * 0.5, spark * 4, spark);
  }
  ctx.globalAlpha = 1;

  // Alternating cyan/magenta jackpot arcs.
  ctx.lineWidth = size * 0.025;
  ctx.lineCap = "round";
  ctx.shadowBlur = size * 0.055;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.strokeStyle = i % 2 === 0 ? "#36f1ff" : "#ff2bd6";
    ctx.shadowColor = ctx.strokeStyle;
    const start = -Math.PI / 2 + (i * TAU) / 8 + 0.04;
    ctx.arc(center, center, badgeRadius * 1.08, start, start + TAU / 8 - 0.08);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // A beveled six-sided jackpot badge.
  ctx.save();
  ctx.translate(center, center);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = -Math.PI / 2 + (i * TAU) / 6;
    const x = Math.cos(angle) * badgeRadius;
    const y = Math.sin(angle) * badgeRadius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const badge = ctx.createLinearGradient(-badgeRadius, -badgeRadius, badgeRadius, badgeRadius);
  badge.addColorStop(0, "#350064");
  badge.addColorStop(0.48, "#080018");
  badge.addColorStop(1, "#1c0041");
  ctx.fillStyle = badge;
  ctx.shadowColor = "#ff2bd6";
  ctx.shadowBlur = size * 0.08;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = size * 0.016;
  ctx.strokeStyle = "#ffe53b";
  ctx.stroke();
  ctx.lineWidth = size * 0.006;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.restore();

  // Triple jackpot crown lights.
  for (const [offset, color] of [
    [-0.42, "#ff2bd6"],
    [0, "#ffe53b"],
    [0.42, "#36f1ff"],
  ] as const) {
    traceStar(
      ctx,
      center + badgeRadius * offset,
      center - badgeRadius * 0.78,
      badgeRadius * 0.14,
      badgeRadius * 0.06,
      4,
    );
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.04;
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  const stroke = size * 0.018;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.font = `900 ${Math.round(badgeRadius * 0.63)}px "Arial Black", Impact, sans-serif`;
  ctx.lineWidth = stroke * 2.2;
  ctx.strokeStyle = "#14001f";
  ctx.strokeText("OTT", center, center - badgeRadius * 0.2, badgeRadius * 1.62);
  ctx.lineWidth = stroke;
  ctx.strokeStyle = "#ff2bd6";
  ctx.shadowColor = "#ff2bd6";
  ctx.shadowBlur = size * 0.035;
  ctx.strokeText("OTT", center, center - badgeRadius * 0.2, badgeRadius * 1.62);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("OTT", center, center - badgeRadius * 0.2, badgeRadius * 1.62);

  ctx.font = `900 ${Math.round(badgeRadius * 0.88)}px "Arial Black", Impact, sans-serif`;
  ctx.lineWidth = stroke * 2.4;
  ctx.strokeStyle = "#14001f";
  ctx.strokeText("M3", center, center + badgeRadius * 0.38, badgeRadius * 1.5);
  ctx.lineWidth = stroke;
  ctx.strokeStyle = "#36f1ff";
  ctx.shadowColor = "#36f1ff";
  ctx.shadowBlur = size * 0.04;
  ctx.strokeText("M3", center, center + badgeRadius * 0.38, badgeRadius * 1.5);
  const lettering = ctx.createLinearGradient(0, center, 0, center + badgeRadius);
  lettering.addColorStop(0, "#ffffff");
  lettering.addColorStop(0.45, "#ffe53b");
  lettering.addColorStop(1, "#ff8a00");
  ctx.fillStyle = lettering;
  ctx.fillText("M3", center, center + badgeRadius * 0.38, badgeRadius * 1.5);
  ctx.shadowBlur = 0;

  return canvas.toBuffer("image/png");
}

for (const [size, maskable, filename] of [
  [192, false, "icon-192.png"],
  [512, false, "icon-512.png"],
  [512, true, "icon-maskable-512.png"],
] as const) {
  await writeFile(join(IMG_DIR, filename), drawIcon(size, maskable));
  console.log(`wrote assets/img/${filename}`);
}
