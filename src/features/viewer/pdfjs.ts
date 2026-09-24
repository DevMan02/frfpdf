import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PageGeometry, PdfRect } from '../../lib/pdf/coords';
import { hasPdfHeader } from '../../lib/pdf/header';
import { PdfLoadError } from '../../lib/pdf/loadErrors';

// The worker is bundled by Vite and served from our own origin, never from a CDN.
GlobalWorkerOptions.workerSrc = workerUrl;

/** Folder where build/pdfjs-assets.ts publishes CMaps, fonts and wasm decoders. */
export const assetsBase = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href;

export interface PageSize {
  /** Width and height in PDF points, with the page's own /Rotate applied. */
  width: number;
  height: number;
  /** Page box and rotation, for converting between PDF and screen coordinates. */
  geometry: PageGeometry;
}

export interface LoadedPdf {
  proxy: PDFDocumentProxy;
  pages: PageSize[];
  /** Frees the document and its worker. */
  close: () => Promise<void>;
}

/**
 * Opens a PDF with pdf.js. Throws PdfLoadError for files that are clearly not
 * PDFs; pdf.js errors (password, corrupted) are passed through for
 * classifyLoadError to translate.
 */
export async function openPdf(bytes: Uint8Array): Promise<LoadedPdf> {
  if (bytes.length === 0) throw new PdfLoadError('empty');
  if (!hasPdfHeader(bytes)) throw new PdfLoadError('not-pdf');

  const task = getDocument({
    // pdf.js transfers the buffer to its worker: give it a copy, we keep the original.
    data: bytes.slice(),
    cMapUrl: `${assetsBase}cmaps/`,
    standardFontDataUrl: `${assetsBase}standard_fonts/`,
    wasmUrl: `${assetsBase}wasm/`,
    iccUrl: `${assetsBase}iccs/`,
    enableXfa: false,
  });
  const close = () => task.destroy();

  try {
    const proxy = await task.promise;
    const pages: PageSize[] = [];
    for (let n = 1; n <= proxy.numPages; n++) {
      const page = await proxy.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      pages.push({
        width: viewport.width,
        height: viewport.height,
        geometry: { view: page.view as PdfRect, rotation: page.rotate },
      });
    }
    return { proxy, pages, close };
  } catch (error) {
    // Also frees the worker when opening fails (wrong password, broken file).
    await close();
    throw error;
  }
}
