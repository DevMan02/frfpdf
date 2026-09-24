import type { DetectionInput } from './detect';
import type { Box, TextRun } from './geometry';
import { findBoxes, findLines, hasWriting, inkBands, inkBounds, type Bitmap } from './raster';
import type { VectorPrimitives } from './vector';

/** A page is treated as a scan when an image covers most of it and there are (almost) no drawn lines. */
export function isRasterPage(primitives: VectorPrimitives): boolean {
  return primitives.imageCoverage > 0.5 && primitives.hLines.length + primitives.vLines.length < 4;
}

export function vectorInput(
  texts: TextRun[],
  primitives: VectorPrimitives,
  pageWidth: number,
  pageHeight: number,
): DetectionInput {
  return { pageWidth, pageHeight, texts, hLines: primitives.hLines, vLines: primitives.vLines };
}

/**
 * Detection input for a scanned page. `bitmap` is the page rendered upright
 * (as displayed) at `pxPerPt` pixels per point; `lineBitmap` the same page
 * binarized with a lighter threshold, used to find faint printed lines.
 * `texts` may come from an OCR layer already inside the PDF; usually empty.
 */
export function rasterInput(
  bitmap: Bitmap,
  pxPerPt: number,
  texts: TextRun[],
  pageWidth: number,
  pageHeight: number,
  lineBitmap: Bitmap = bitmap,
): DetectionInput {
  const lines = findLines(lineBitmap, {
    minLength: Math.round(15 * pxPerPt),
    maxThickness: Math.max(2, Math.round(2.2 * pxPerPt)),
    maxGap: Math.max(1, Math.round(pxPerPt)),
  });
  const boxes = findBoxes(bitmap, { minSize: Math.round(4 * pxPerPt), maxSize: Math.round(24 * pxPerPt) });
  const toPt = (v: number) => v / pxPerPt;
  const toPx = (box: Box) => ({ x1: box.x1 * pxPerPt, y1: box.y1 * pxPerPt, x2: box.x2 * pxPerPt, y2: box.y2 * pxPerPt });

  return {
    pageWidth,
    pageHeight,
    texts,
    hLines: lines.h.map((l) => ({ x1: toPt(l.x1), x2: toPt(l.x2), y: toPt(l.y) })),
    vLines: lines.v.map((l) => ({ y1: toPt(l.y1), y2: toPt(l.y2), x: toPt(l.x) })),
    boxes: boxes.map((b) => ({ x1: toPt(b.x1), y1: toPt(b.y1), x2: toPt(b.x2), y2: toPt(b.y2) })),
    occupied: (box: Box) => hasWriting(bitmap, toPx(box), 10 * pxPerPt),
    inkBounds: (box: Box) => {
      const b = inkBounds(bitmap, toPx(box));
      return b && { x1: toPt(b.x1), y1: toPt(b.y1), x2: toPt(b.x2), y2: toPt(b.y2) };
    },
    inkBands: (box: Box) =>
      inkBands(bitmap, toPx(box), Math.round(1.5 * pxPerPt)).map((b) => ({ y1: toPt(b.y1), y2: toPt(b.y2) })),
  };
}
