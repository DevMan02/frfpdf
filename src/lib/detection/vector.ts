import { pdfToScreenPoint, type PageGeometry } from '../pdf/coords';
import type { HLine, TextRun, VLine } from './geometry';

/**
 * Extracts straight horizontal/vertical lines from a pdf.js operator list and
 * converts them to display space. Rectangles (drawn as four edges, or as
 * thin filled bars — the usual way Word and InDesign draw table borders)
 * become lines too; the detector rebuilds cells from them.
 */

/** pdf.js OPS codes used here (passed in so this module stays free of pdf.js). */
export interface OpCodes {
  save: number;
  restore: number;
  transform: number;
  setLineWidth: number;
  setStrokeRGBColor: number;
  setFillRGBColor: number;
  constructPath: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
  paintImageXObject: number;
  paintInlineImageXObject: number;
  paintImageMaskXObject: number;
  stroke: number;
  closeStroke: number;
  fill: number;
  eoFill: number;
  fillStroke: number;
  eoFillStroke: number;
  closeFillStroke: number;
  closeEOFillStroke: number;
}

/** pdf.js path commands inside constructPath data. */
const MOVE_TO = 0;
const LINE_TO = 1;
const CURVE_TO = 2;
const QUAD_TO = 3;
const CLOSE = 4;

/** Filled bars thinner than this are lines. */
const MAX_BAR_THICKNESS = 2.5;
/** Strokes thicker than this are decoration, not form lines. */
const MAX_STROKE_WIDTH = 4;
const AXIS_TOLERANCE = 0.5;

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  // Result = n × m (apply n first, then m), as in PDF "cm".
  return [
    n[0] * m[0] + n[1] * m[2],
    n[0] * m[1] + n[1] * m[3],
    n[2] * m[0] + n[3] * m[2],
    n[2] * m[1] + n[3] * m[3],
    n[4] * m[0] + n[5] * m[2] + m[4],
    n[4] * m[1] + n[5] * m[3] + m[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function isLight(hex: unknown): boolean {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return false;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.85;
}

export interface VectorPrimitives {
  hLines: HLine[];
  vLines: VLine[];
  /** Largest share of the page covered by a single image (0..1). */
  imageCoverage: number;
}

export function extractVectorPrimitives(
  fnArray: ArrayLike<number>,
  argsArray: ArrayLike<unknown>,
  ops: OpCodes,
  geometry: PageGeometry,
): VectorPrimitives {
  const hLines: HLine[] = [];
  const vLines: VLine[] = [];
  let imageCoverage = 0;

  const [vx0, vy0, vx1, vy1] = geometry.view;
  const pageArea = Math.abs((vx1 - vx0) * (vy1 - vy0)) || 1;

  let ctm: Matrix = IDENTITY;
  let lineWidth = 1;
  let strokeLight = false;
  let fillLight = false;
  const stack: { ctm: Matrix; lineWidth: number; strokeLight: boolean; fillLight: boolean }[] = [];

  const toScreen = (x: number, y: number) => {
    const [px, py] = apply(ctm, x, y);
    return pdfToScreenPoint(px, py, geometry, 1);
  };

  const addSegment = (a: [number, number], b: [number, number]) => {
    const [ax, ay] = a;
    const [bx, by] = b;
    if (Math.abs(ay - by) <= AXIS_TOLERANCE && Math.abs(ax - bx) > AXIS_TOLERANCE) {
      hLines.push({ x1: Math.min(ax, bx), x2: Math.max(ax, bx), y: (ay + by) / 2 });
    } else if (Math.abs(ax - bx) <= AXIS_TOLERANCE && Math.abs(ay - by) > AXIS_TOLERANCE) {
      vLines.push({ y1: Math.min(ay, by), y2: Math.max(ay, by), x: (ax + bx) / 2 });
    }
  };

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] as unknown[] | null;

    if (fn === ops.save) {
      stack.push({ ctm, lineWidth, strokeLight, fillLight });
    } else if (fn === ops.restore) {
      const s = stack.pop();
      if (s) ({ ctm, lineWidth, strokeLight, fillLight } = s);
    } else if (fn === ops.transform) {
      ctm = multiply(ctm, args as Matrix);
    } else if (fn === ops.paintFormXObjectBegin) {
      stack.push({ ctm, lineWidth, strokeLight, fillLight });
      const matrix = args?.[0];
      if (Array.isArray(matrix) || ArrayBuffer.isView(matrix)) ctm = multiply(ctm, Array.from(matrix as number[]) as Matrix);
    } else if (fn === ops.paintFormXObjectEnd) {
      const s = stack.pop();
      if (s) ({ ctm, lineWidth, strokeLight, fillLight } = s);
    } else if (fn === ops.setLineWidth) {
      lineWidth = Number(args?.[0]) || 0;
    } else if (fn === ops.setStrokeRGBColor) {
      strokeLight = isLight(args?.[0]);
    } else if (fn === ops.setFillRGBColor) {
      fillLight = isLight(args?.[0]);
    } else if (fn === ops.paintImageXObject || fn === ops.paintInlineImageXObject || fn === ops.paintImageMaskXObject) {
      // Images are drawn in the unit square transformed by the CTM.
      const corners = [apply(ctm, 0, 0), apply(ctm, 1, 0), apply(ctm, 0, 1), apply(ctm, 1, 1)];
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const w = Math.min(Math.max(...xs), vx1) - Math.max(Math.min(...xs), vx0);
      const h = Math.min(Math.max(...ys), vy1) - Math.max(Math.min(...ys), vy0);
      if (w > 0 && h > 0) imageCoverage = Math.max(imageCoverage, (w * h) / pageArea);
    } else if (fn === ops.constructPath && args) {
      const paintOp = args[0] as number;
      const data = (args[1] as ArrayLike<number>[] | undefined)?.[0];
      if (!data) continue;
      const stroked = [ops.stroke, ops.closeStroke, ops.fillStroke, ops.eoFillStroke, ops.closeFillStroke, ops.closeEOFillStroke].includes(paintOp);
      const filled = [ops.fill, ops.eoFill, ops.fillStroke, ops.eoFillStroke, ops.closeFillStroke, ops.closeEOFillStroke].includes(paintOp);
      const strokeVisible = stroked && !strokeLight && lineWidth * Math.hypot(ctm[0], ctm[1]) <= MAX_STROKE_WIDTH;
      const fillVisible = filled && !fillLight;
      if (!strokeVisible && !fillVisible) continue;
      parsePath(data, toScreen, strokeVisible, fillVisible, addSegment, hLines, vLines);
    }
  }
  return { hLines, vLines, imageCoverage };
}

function parsePath(
  data: ArrayLike<number>,
  toScreen: (x: number, y: number) => [number, number],
  stroke: boolean,
  fill: boolean,
  addSegment: (a: [number, number], b: [number, number]) => void,
  hLines: HLine[],
  vLines: VLine[],
) {
  let subpath: [number, number][] = [];
  let curved = false;

  const flush = () => {
    if (subpath.length >= 2 && !curved) {
      if (stroke) for (let k = 1; k < subpath.length; k++) addSegment(subpath[k - 1]!, subpath[k]!);
      if (fill && !stroke) addFilledBar(subpath, hLines, vLines);
    }
    subpath = [];
    curved = false;
  };

  for (let i = 0; i < data.length; ) {
    const op = data[i++];
    if (op === MOVE_TO) {
      flush();
      subpath.push(toScreen(data[i]!, data[i + 1]!));
      i += 2;
    } else if (op === LINE_TO) {
      subpath.push(toScreen(data[i]!, data[i + 1]!));
      i += 2;
    } else if (op === CURVE_TO) {
      curved = true;
      i += 6;
    } else if (op === QUAD_TO) {
      curved = true;
      i += 4;
    } else if (op === CLOSE) {
      if (subpath.length) subpath.push(subpath[0]!);
      flush();
    } else {
      break; // unknown command: stop parsing this path
    }
  }
  flush();
}

/** A filled axis-aligned rectangle that is very thin is a line. */
function addFilledBar(points: [number, number][], hLines: HLine[], vLines: VLine[]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x1 = Math.min(...xs);
  const x2 = Math.max(...xs);
  const y1 = Math.min(...ys);
  const y2 = Math.max(...ys);
  // Only rectangles: every point sits on the bounding box edges.
  const onEdges = points.every(
    ([x, y]) =>
      Math.abs(x - x1) < AXIS_TOLERANCE ||
      Math.abs(x - x2) < AXIS_TOLERANCE ||
      Math.abs(y - y1) < AXIS_TOLERANCE ||
      Math.abs(y - y2) < AXIS_TOLERANCE,
  );
  if (!onEdges) return;
  const w = x2 - x1;
  const h = y2 - y1;
  if (h <= MAX_BAR_THICKNESS && w > h * 4) hLines.push({ x1, x2, y: (y1 + y2) / 2 });
  else if (w <= MAX_BAR_THICKNESS && h > w * 4) vLines.push({ y1, y2, x: (x1 + x2) / 2 });
}

/** pdf.js text item (subset). */
export interface PdfjsTextItem {
  str: string;
  transform: number[];
  width: number;
}

/**
 * Converts pdf.js text items to display space, keeping only text that reads
 * left-to-right horizontally on screen.
 */
export function toTextRuns(items: PdfjsTextItem[], geometry: PageGeometry): TextRun[] {
  const runs: TextRun[] = [];
  for (const item of items) {
    if (!item.str || !item.str.trim() || item.transform.length < 6) continue;
    const [a, b, , , e, f] = item.transform as [number, number, number, number, number, number];
    const size = Math.hypot(a, b);
    if (size <= 0) continue;
    const [sx, sy] = pdfToScreenPoint(e, f, geometry, 1);
    const [dx, dy] = pdfToScreenPoint(e + a / size, f + b / size, geometry, 1);
    // Direction on screen must be (1, 0).
    if (Math.abs(dy - sy) > 0.05 || dx - sx < 0.95) continue;
    runs.push({ str: item.str, x: sx, y: sy, width: item.width, size });
  }
  return runs;
}
