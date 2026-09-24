import { inflateSync } from 'node:zlib';
import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import { detectFields, type DetectedField } from '../../src/lib/detection/detect';
import { isRasterPage, rasterInput, vectorInput } from '../../src/lib/detection/pageInput';
import type { Bitmap } from '../../src/lib/detection/raster';
import { extractVectorPrimitives, toTextRuns, type OpCodes, type PdfjsTextItem } from '../../src/lib/detection/vector';
import { displaySize, type PageGeometry, type PdfRect } from '../../src/lib/pdf/coords';
import { fixture, openWithPdfjs } from './helpers';

export const OP_CODES: OpCodes = {
  save: OPS.save,
  restore: OPS.restore,
  transform: OPS.transform,
  setLineWidth: OPS.setLineWidth,
  setStrokeRGBColor: OPS.setStrokeRGBColor,
  setFillRGBColor: OPS.setFillRGBColor,
  constructPath: OPS.constructPath,
  paintFormXObjectBegin: OPS.paintFormXObjectBegin,
  paintFormXObjectEnd: OPS.paintFormXObjectEnd,
  paintImageXObject: OPS.paintImageXObject,
  paintInlineImageXObject: OPS.paintInlineImageXObject,
  paintImageMaskXObject: OPS.paintImageMaskXObject,
  stroke: OPS.stroke,
  closeStroke: OPS.closeStroke,
  fill: OPS.fill,
  eoFill: OPS.eoFill,
  fillStroke: OPS.fillStroke,
  eoFillStroke: OPS.eoFillStroke,
  closeFillStroke: OPS.closeFillStroke,
  closeEOFillStroke: OPS.closeEOFillStroke,
};

/** Runs the whole vector pipeline on page 1 of a fixture, in Node. */
export async function detectVectorFixture(name: string): Promise<DetectedField[]> {
  const pdf = await openWithPdfjs(fixture(name));
  const page = await pdf.getPage(1);
  const geometry: PageGeometry = { view: page.view as PdfRect, rotation: page.rotate };
  const ops = await page.getOperatorList();
  const primitives = extractVectorPrimitives(ops.fnArray, ops.argsArray, OP_CODES, geometry);
  const texts = toTextRuns((await page.getTextContent()).items as PdfjsTextItem[], geometry);
  const size = displaySize(geometry, 1);
  if (isRasterPage(primitives)) throw new Error('Unexpected raster page');
  return detectFields(vectorInput(texts, primitives, size.width, size.height));
}

/** Reads the (single, greyscale) page image of scanned.pdf as a bitmap, without a canvas. */
export async function scannedFixtureBitmap(): Promise<{ bitmap: Bitmap; lineBitmap: Bitmap; pxPerPt: number }> {
  const doc = await PDFDocument.load(fixture('scanned.pdf'));
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.dict.get(PDFName.of('Subtype'))?.toString() !== '/Image') continue;
    const width = (obj.dict.get(PDFName.of('Width')) as PDFNumber).asNumber();
    const height = (obj.dict.get(PDFName.of('Height')) as PDFNumber).asNumber();
    // pdf-lib stores embedded PNGs as 8-bit RGB.
    const rgb = inflateSync(obj.contents);
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = rgb[i * 3]!;
      rgba[i * 4 + 1] = rgb[i * 3 + 1]!;
      rgba[i * 4 + 2] = rgb[i * 3 + 2]!;
      rgba[i * 4 + 3] = 255;
    }
    const { binarize, LINE_THRESHOLD } = await import('../../src/lib/detection/raster');
    return {
      bitmap: binarize(rgba, width, height),
      lineBitmap: binarize(rgba, width, height, LINE_THRESHOLD),
      pxPerPt: width / doc.getPage(0).getWidth(),
    };
  }
  throw new Error('No image in scanned.pdf');
}

export async function detectScannedFixture(): Promise<DetectedField[]> {
  const { bitmap, lineBitmap, pxPerPt } = await scannedFixtureBitmap();
  return detectFields(rasterInput(bitmap, pxPerPt, [], bitmap.width / pxPerPt, bitmap.height / pxPerPt, lineBitmap));
}

export function describe(fields: DetectedField[]) {
  return fields.map((f) => ({
    kind: f.kind,
    label: f.label,
    origin: f.origin,
    box: [f.box.x1, f.box.y1, f.box.x2, f.box.y2].map((v) => Math.round(v)),
  }));
}
