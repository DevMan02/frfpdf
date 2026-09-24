/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pdfjsAssets } from './build/pdfjs-assets.ts';
import { contentSecurityPolicy } from './build/csp.ts';

// The app is served from https://<user>.github.io/frfpdf/ on GitHub Pages.
const BASE = '/frfpdf/';

export default defineConfig({
  base: BASE,
  plugins: [react(), pdfjsAssets(), contentSecurityPolicy()],
  build: {
    target: 'es2022',
    // Keep source maps out of the public build: smaller download, nothing hidden
    // (the source is public on GitHub anyway).
    sourcemap: false,
    // pdf.js alone is ~450 kB. pdf-lib + fontkit (~1.1 MB) are split out and
    // loaded only on the first "Scarica PDF", from the same origin.
    chunkSizeWarningLimit: 1200,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
