import { degrees, rgb, type PDFDocument, type PDFFont, type PDFImage } from 'pdf-lib';
import type { PlacedSignature } from '../signature/types';
import { normalizeRotation, pdfToScreenRect, screenToPdfPoint, type PageGeometry, type ScreenRect } from './coords';

const INK = rgb(0.118, 0.149, 0.22); // #1E2638

export interface SignatureDrawOptions {
  signatures: PlacedSignature[];
  /** PNG bytes of each signature image, by asset id. */
  images: Record<string, Uint8Array>;
  geometries: PageGeometry[];
  /** Date written next to every signature (e.g. "24/09/2026"), or null. */
  date: string | null;
  /** Needed when `date` is set. */
  font?: PDFFont;
}

/** Where the date goes, next to a signature (display space, scale 1). */
export function dateBox(signature: ScreenRect): { left: number; baseline: number; size: number } {
  const size = Math.min(12, Math.max(8, signature.height * 0.3));
  return { left: signature.left + signature.width + 6, baseline: signature.top + signature.height * 0.75, size };
}

/**
 * Draws each signature image on its page, upright as the page is displayed
 * (also on rotated pages), and the date next to it when requested.
 */
export async function drawSignatures(doc: PDFDocument, options: SignatureDrawOptions): Promise<void> {
  const embedded = new Map<string, PDFImage>();
  for (const signature of options.signatures) {
    const bytes = options.images[signature.assetId];
    if (!bytes) continue;
    let image = embedded.get(signature.assetId);
    if (!image) {
      image = await doc.embedPng(bytes);
      embedded.set(signature.assetId, image);
    }

    const geometry = options.geometries[signature.pageIndex]!;
    const page = doc.getPage(signature.pageIndex);
    const rotate = degrees(normalizeRotation(geometry.rotation));
    const box = pdfToScreenRect(signature.rect, geometry, 1);
    // pdf-lib rotates the image around its bottom-left corner: use the corner
    // that is bottom-left on screen, and the size as seen on screen.
    const [x, y] = screenToPdfPoint(box.left, box.top + box.height, geometry, 1);
    page.drawImage(image, { x, y, width: box.width, height: box.height, rotate });

    if (options.date && options.font) {
      const d = dateBox(box);
      const [dx, dy] = screenToPdfPoint(d.left, d.baseline, geometry, 1);
      page.drawText(options.date, { x: dx, y: dy, size: d.size, font: options.font, color: INK, rotate });
    }
  }
}
