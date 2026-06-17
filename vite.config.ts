import { defineConfig } from 'vite';

export default defineConfig({
  base: '/ottm3/',
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep the Babylon engine in its own long-lived vendor chunk so the
          // game code can change without busting the (large) engine cache.
          if (id.includes('node_modules/@babylonjs')) return 'babylon';
        },
      },
    },
  },
  define: {
    'process.env': {},
  },
});
