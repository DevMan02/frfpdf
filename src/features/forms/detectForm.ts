import { AnnotationMode, OPS, type PDFDocumentProxy } from 'pdfjs-dist';
import { detectFields, type DetectedField } from '../../lib/detection/detect';
import { isRasterPage, rasterInput, vectorInput } from '../../lib/detection/pageInput';
import { binarize, LINE_THRESHOLD } from '../../lib/detection/raster';
import { extractVectorPrimitives, toTextRuns, type OpCodes, type PdfjsTextItem } from '../../lib/detection/vector';
import { displaySize, type PageGeometry } from '../../lib/pdf/coords';

const OP_CODES: OpCodes = {
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

/** Scans are analysed at 150 dpi: enough for lines and boxes, fast to process. */
const RASTER_PX_PER_PT = 150 / 72;

export interface PageDetection {
  detected: DetectedField[];
  /** The page is an image without text: a scan. */
  scanned: boolean;
}

/** Finds the fields of one page (vector drawing or, for scans, pixels). Runs in the browser. */
export async function detectPage(pdf: PDFDocumentProxy, pageIndex: number, geometry: PageGeometry): Promise<PageDetection> {
  const page = await pdf.getPage(pageIndex + 1);
  const ops = await page.getOperatorList({ annotationMode: AnnotationMode.DISABLE });
  const primitives = extractVectorPrimitives(ops.fnArray, ops.argsArray, OP_CODES, geometry);
  const texts = toTextRuns((await page.getTextContent()).items as PdfjsTextItem[], geometry);
  const size = displaySize(geometry, 1);

  if (!isRasterPage(primitives)) {
    return { detected: detectFields(vectorInput(texts, primitives, size.width, size.height)), scanned: false };
  }

  const viewport = page.getViewport({ scale: RASTER_PX_PER_PT });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { detected: [], scanned: texts.length === 0 };
  // 'print' renders in one go (no requestAnimationFrame): faster for an
  // off-screen analysis, and not paused while the tab is in the background.
  await page.render({
    canvas,
    canvasContext: context,
    viewport,
    intent: 'print',
    annotationMode: AnnotationMode.DISABLE,
  }).promise;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const bitmap = binarize(image.data, image.width, image.height);
  const lineBitmap = binarize(image.data, image.width, image.height, LINE_THRESHOLD);
  canvas.width = canvas.height = 0; // free the memory right away

  const pxPerPt = image.width / size.width;
  return {
    detected: detectFields(rasterInput(bitmap, pxPerPt, texts, size.width, size.height, lineBitmap)),
    scanned: texts.length === 0,
  };
}
