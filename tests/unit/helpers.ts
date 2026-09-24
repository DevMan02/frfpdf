import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(import.meta.dirname, '../fixtures', name)));
}

/** Liberation Sans, the font FrFPDF embeds for field values (shipped with pdf.js). */
export function fieldFont(): Uint8Array {
  return new Uint8Array(
    readFileSync(join(import.meta.dirname, '../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf')),
  );
}

/** Opens bytes with the Node build of pdf.js. */
export function openWithPdfjs(bytes: Uint8Array) {
  return getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
}

export async function pageText(bytes: Uint8Array, pageNumber: number): Promise<string> {
  const doc = await openWithPdfjs(bytes);
  const content = await (await doc.getPage(pageNumber)).getTextContent();
  return content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
}
