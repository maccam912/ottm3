/**
 * End-to-end smoke test: boots the real game in headless Chrome, plays moves
 * through the same code path as user input, and verifies the score moves.
 *
 * If a local oMLX server (localhost:8000) is up, also asks its vision model
 * whether the screenshot looks like a polished match-3 — gated so the test
 * works without it.
 *
 * Run: npm run smoke   (starts the dev server itself if needed)
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const URL_BASE = "http://localhost:5173";
const OUT_DIR = join(import.meta.dirname, "..", "smoke-output");

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

async function serverUp(url: string, timeoutMs = 1000): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const chrome = CHROME_PATHS.find((p) => existsSync(p));
  if (!chrome) throw new Error("no Chrome/Chromium found for smoke test");

  let dev: ChildProcess | null = null;
  if (!(await serverUp(URL_BASE))) {
    console.log("starting dev server…");
    dev = spawn("npm", ["run", "dev"], { stdio: "ignore" });
    let up = false;
    for (let i = 0; i < 30 && !up; i++) {
      await new Promise((r) => setTimeout(r, 500));
      up = await serverUp(URL_BASE);
    }
    if (!up) throw new Error("dev server did not come up");
  }

  const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1200 });
    await page.goto(`${URL_BASE}/?seed=123`, { waitUntil: "networkidle0" });

    // Wait for the entrance animation to finish and the board to unlock.
    await page.waitForFunction(() => window.__glaze && !window.__glaze.isLocked(), {
      timeout: 20000,
    });

    const boardSize = await page.evaluate(() => window.__glaze!.board().length);
    if (boardSize !== 64) throw new Error(`expected 64 pieces, got ${boardSize}`);
    console.log("✓ board rendered with 64 pieces");

    // Play 5 moves via the hint (same doSwap path as real input).
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        const g = window.__glaze!;
        const h = g.hint();
        if (!h) throw new Error("no hint available");
        g.swap(h[0], h[1]);
      });
      await page.waitForFunction(() => !window.__glaze!.isLocked(), { timeout: 20000 });
    }

    const score = await page.evaluate(() => window.__glaze!.score());
    if (score <= 0) throw new Error("score did not increase after 5 moves");
    console.log(`✓ played 5 moves through the input path, score = ${score}`);

    const settled = await page.evaluate(() => window.__glaze!.board().length);
    if (settled !== 64) throw new Error(`board not settled: ${settled} pieces`);
    console.log("✓ board settled back to 64 pieces");

    // Ghost check: the number of sprites must match the engine's board.
    const viewCount = await page.evaluate(() => window.__glaze!.viewCount());
    if (viewCount !== 64) {
      throw new Error(`sprite/board mismatch: ${viewCount} sprites for 64 pieces (ghosts?)`);
    }
    console.log("✓ sprite count matches board (no ghost donuts)");

    mkdirSync(OUT_DIR, { recursive: true });
    const shot = (await page.screenshot({ type: "png" })) as Buffer;
    const shotPath = join(OUT_DIR, "smoke.png");
    writeFileSync(shotPath, shot);
    console.log(`✓ screenshot saved to ${shotPath}`);

    await omlxCheck(shot);
  } finally {
    await browser.close();
    if (dev) dev.kill("SIGTERM");
  }
  console.log("SMOKE PASSED");
}

/** Optional fuzzy visual QA via local oMLX vision model. Skips when down. */
async function omlxCheck(png: Buffer): Promise<void> {
  const base = "http://localhost:8000/v1";
  try {
    const ping = await fetch(`${base}/models`, { signal: AbortSignal.timeout(1500) });
    if (!ping.ok) throw new Error("bad status");
  } catch {
    console.log("· oMLX not reachable — skipping visual QA");
    return;
  }
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer 0000" },
    body: JSON.stringify({
      model: "gemma-4-e2b-it-4bit",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${png.toString("base64")}` },
            },
            {
              type: "text",
              text:
                "This is a screenshot of a match-3 puzzle game. Answer with YES or NO then one sentence: " +
                "does it show a complete grid of colorful donut-like pieces with a visible score, " +
                "and no rendering glitches (missing tiles, garbled text, black boxes)?",
            },
          ],
        },
      ],
      max_tokens: 100,
    }),
    signal: AbortSignal.timeout(60000),
  });
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const answer = data.choices?.[0]?.message?.content?.trim() ?? "(no answer)";
  console.log(`· oMLX visual QA: ${answer}`);
  if (/^no\b/i.test(answer)) throw new Error(`oMLX flagged the screenshot: ${answer}`);
}

await main();
