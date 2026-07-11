import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { defineConfig } from "vite";

const DIST_DIR = resolve(process.cwd(), "dist");
const BUILD_TOKEN = "__OTTM3_BUILD__";

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = resolve(dir, entry.name);
      return entry.isDirectory() ? listFiles(path) : Promise.resolve([path]);
    }),
  );
  return files.flat().sort();
}

function relativeUrl(path: string): string {
  const segments = relative(DIST_DIR, path).split(sep).map(encodeURIComponent);
  return `./${segments.join("/")}`;
}

/**
 * Vite copies the worker from publicDir verbatim. Once the final hashed bundle
 * names are known, stamp the worker with a content revision and give it a
 * complete list of the emitted app shell. No extra PWA/build dependency is
 * needed, and the Pages artifact remains the ordinary dist directory.
 */
const ottm3Precache = {
  name: "ottm3-precache-manifest",
  apply: "build" as const,
  async closeBundle(): Promise<void> {
    const manifestPath = resolve(DIST_DIR, "precache-manifest.json");
    const files = (await listFiles(DIST_DIR)).filter((path) => path !== manifestPath);
    const workerPath = resolve(DIST_DIR, "sw.js");
    const workerSource = await readFile(workerPath, "utf8");

    if (!workerSource.includes(BUILD_TOKEN)) {
      throw new Error(`dist/sw.js is missing the ${BUILD_TOKEN} build token`);
    }

    const urls = [
      "./",
      ...files.map(relativeUrl),
      "./precache-manifest.json",
    ].filter((url, index, all) => all.indexOf(url) === index);

    const hash = createHash("sha256");
    hash.update("ottm3-precache-v1\0");
    hash.update(urls.join("\0"));
    hash.update("\0");
    for (const file of files) {
      hash.update(relative(DIST_DIR, file));
      hash.update("\0");
      hash.update(await readFile(file));
      hash.update("\0");
    }
    const build = hash.digest("hex").slice(0, 20);

    await writeFile(workerPath, workerSource.replaceAll(BUILD_TOKEN, build));

    await writeFile(
      manifestPath,
      `${JSON.stringify({ build, urls }, null, 2)}\n`,
    );
  },
};

export default defineConfig({
  base: "./",
  publicDir: "assets",
  plugins: [ottm3Precache],
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
  },
});
