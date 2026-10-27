import { cpSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Runtime assets (sprites, audio, maps) are fetched by URL from `data/`.
// The dev server already serves the project root, so `data/` only needs to be
// copied into the bundle output on build.
function copyDataDir(): Plugin {
  let outDir = 'dist';
  return {
    name: 'tankkit:copy-data',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      cpSync(resolve(__dirname, 'data'), resolve(__dirname, outDir, 'data'), {
        recursive: true,
      });
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [copyDataDir()],
  server: {
    port: 8080,
    open: true,
    // `npm run server` in another terminal handles live classes in dev
    proxy: {
      '/live-info': 'http://localhost:8787',
      '/live': { target: 'ws://localhost:8787', ws: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true, emptyOutDir: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
