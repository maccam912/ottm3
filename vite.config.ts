import { defineConfig } from "vite";

export default defineConfig({
  publicDir: "assets",
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
  },
});
