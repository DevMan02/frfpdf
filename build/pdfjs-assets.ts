import { createReadStream, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Ships the pdf.js runtime data (CMaps, standard fonts, WebAssembly decoders,
 * ICC profiles) together with the app, so pdf.js never has to fetch anything
 * from a CDN.
 *
 * - dev server: files are served straight from node_modules;
 * - build: files are emitted into `dist/pdfjs/<folder>/`.
 */
const PDFJS_DIR = resolve(import.meta.dirname, '../node_modules/pdfjs-dist');
const FOLDERS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'] as const;
const URL_PREFIX = 'pdfjs/';

const MIME: Record<string, string> = {
  '.wasm': 'application/wasm',
  '.js': 'text/javascript',
  '.ttf': 'font/ttf',
};

function listFiles(folder: string): string[] {
  const dir = join(PDFJS_DIR, folder);
  return readdirSync(dir).filter((name) => statSync(join(dir, name)).isFile());
}

export function pdfjsAssets(): Plugin {
  let base = '/';
  return {
    name: 'frfpdf:pdfjs-assets',
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        const prefix = base + URL_PREFIX;
        if (!url.startsWith(prefix)) return next();
        const [folder, file, ...rest] = url.slice(prefix.length).split('/');
        if (!FOLDERS.includes(folder as (typeof FOLDERS)[number]) || !file || rest.length) {
          return next();
        }
        const path = join(PDFJS_DIR, folder, decodeURIComponent(file));
        if (!path.startsWith(join(PDFJS_DIR, folder))) return next();
        try {
          statSync(path);
        } catch {
          return next();
        }
        res.setHeader('Content-Type', MIME[extname(path)] ?? 'application/octet-stream');
        createReadStream(path).pipe(res);
      });
    },
    generateBundle() {
      for (const folder of FOLDERS) {
        for (const file of listFiles(folder)) {
          this.emitFile({
            type: 'asset',
            fileName: `${URL_PREFIX}${folder}/${file}`,
            source: readFileSync(join(PDFJS_DIR, folder, file)),
          });
        }
      }
    },
  };
}
