import { defineConfig } from 'vite';

export default defineConfig({
  base: '/ottm3/',
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
  },
  define: {
    'process.env': {}
  }
});
