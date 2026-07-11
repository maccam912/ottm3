/**
 * Render-performance harness: boots the real game in headless Chrome and
 * reports FPS, frame time, WebGL draw calls per frame, and per-frame texture
 * uploads — at idle and during autoplay cascades. Draw calls are the number
 * to watch: every Phaser batch flush (blend-mode change, pipeline switch,
 * texture-unit overflow) becomes one, and hundreds per frame means the
 * renderer is spending its time on GL overhead instead of frames.
 *
 * Run: npm run dev (in another shell), then: npx tsx scripts/perf.mts
 */
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const URL_BASE = "http://localhost:5173";

const CHROME_PATHS = [
  process.env.CHROME_PATH ?? "",
  "/opt/pw-browsers/chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean);

interface Sample {
  fps: number;
  minFps: number;
  drawCallsAvg: number;
  drawCallsMax: number;
  texUploadsAvg: number;
  frameMsAvg: number;
  frameMsP95: number;
}

async function main(): Promise<void> {
  const chrome = CHROME_PATHS.find((p) => existsSync(p));
  if (!chrome) throw new Error("no Chrome/Chromium found (set CHROME_PATH)");

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu-vsync", "--disable-frame-rate-limit"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1200 });

    // Instrument GL draw calls + texture uploads before any page script runs.
    await page.evaluateOnNewDocument(() => {
      const counters = { draws: 0, texUploads: 0 };
      (window as unknown as { __glCounters: typeof counters }).__glCounters = counters;
      for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
        const da = proto.drawArrays;
        proto.drawArrays = function (...args) { counters.draws++; return da.apply(this, args); };
        const de = proto.drawElements;
        proto.drawElements = function (...args) { counters.draws++; return de.apply(this, args); };
        const ti = proto.texImage2D as (...a: unknown[]) => void;
        proto.texImage2D = function (this: unknown, ...args: unknown[]) { counters.texUploads++; return ti.apply(this, args); } as typeof proto.texImage2D;
        const ts = proto.texSubImage2D as (...a: unknown[]) => void;
        proto.texSubImage2D = function (this: unknown, ...args: unknown[]) { counters.texUploads++; return ts.apply(this, args); } as typeof proto.texSubImage2D;
      }
    });

    // tsx/esbuild inject a `__name` helper into serialized evaluate functions.
    await page.evaluateOnNewDocument("window.__name = (fn) => fn;");
    await page.goto(`${URL_BASE}/?seed=123`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__ottm3 && !window.__ottm3.isLocked(), { timeout: 30000 });

    const sample = (label: string, ms: number): Promise<Sample> =>
      page
        .evaluate(async (durMs: number) => {
          const counters = (window as unknown as { __glCounters: { draws: number; texUploads: number } }).__glCounters;
          const frames: { dt: number; draws: number; tex: number }[] = [];
          let last = performance.now();
          let lastDraws = counters.draws;
          let lastTex = counters.texUploads;
          await new Promise<void>((resolve) => {
            const started = performance.now();
            const tick = (): void => {
              const now = performance.now();
              frames.push({ dt: now - last, draws: counters.draws - lastDraws, tex: counters.texUploads - lastTex });
              last = now;
              lastDraws = counters.draws;
              lastTex = counters.texUploads;
              if (now - started < durMs) requestAnimationFrame(tick);
              else resolve();
            };
            requestAnimationFrame(tick);
          });
          frames.shift();
          const dts = frames.map((f) => f.dt).sort((a, b) => a - b);
          const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
          return {
            fps: 1000 / avg(dts),
            minFps: 1000 / (dts[dts.length - 1] ?? 1),
            drawCallsAvg: avg(frames.map((f) => f.draws)),
            drawCallsMax: Math.max(...frames.map((f) => f.draws)),
            texUploadsAvg: avg(frames.map((f) => f.tex)),
            frameMsAvg: avg(dts),
            frameMsP95: dts[Math.floor(dts.length * 0.95)] ?? 0,
          };
        }, ms)
        .then((r: Sample) => {
          console.log(
            `${label.padEnd(10)} fps=${r.fps.toFixed(1)} (min ${r.minFps.toFixed(1)})  frameMs avg=${r.frameMsAvg.toFixed(2)} p95=${r.frameMsP95.toFixed(2)}  drawCalls avg=${r.drawCallsAvg.toFixed(0)} max=${r.drawCallsMax}  texUploads/frame=${r.texUploadsAvg.toFixed(2)}`,
          );
          return r;
        });

    await sample("idle", 4000);

    await page.evaluate(() => window.__ottm3!.setAutoplay(true));
    await new Promise((r) => setTimeout(r, 1500));
    await sample("cascades", 8000);
    await page.evaluate(() => window.__ottm3!.setAutoplay(false));
    await new Promise((r) => setTimeout(r, 1200));
    await sample("idle2", 4000);
  } finally {
    await browser.close();
  }
}

await main();
