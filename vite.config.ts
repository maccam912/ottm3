import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: "assets",
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
  },
});
