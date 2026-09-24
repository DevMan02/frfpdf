/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pdfjsAssets } from './build/pdfjs-assets';
import { contentSecurityPolicy } from './build/csp';

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
    // pdf.js alone is ~450 kB; pdf-lib is split out and loaded on first save.
    chunkSizeWarningLimit: 800,
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
