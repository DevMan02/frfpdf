import type { Plugin } from 'vite';

/**
 * Content Security Policy: the browser itself refuses to load anything that
 * does not come from the app's own origin. This is what guarantees, at a
 * technical level, that no file or data can be sent elsewhere.
 *
 * - 'wasm-unsafe-eval' lets pdf.js compile its bundled WebAssembly decoders;
 *   it does NOT allow JavaScript eval().
 * - The policy is injected only in production builds: the Vite dev server needs
 *   inline scripts and a WebSocket for hot reload.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

export function contentSecurityPolicy(): Plugin {
  return {
    name: 'frfpdf:csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}
