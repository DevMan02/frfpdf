/**
 * Conversions between PDF user space and screen (CSS pixel) coordinates.
 *
 * PDF user space: origin at the bottom-left of the page box, y grows upwards,
 * units are typographic points (1/72 inch). The page may carry a /Rotate of
 * 0, 90, 180 or 270 degrees (clockwise) and a page box that does not start at 0,0.
 *
 * Screen space: origin at the top-left of the page as displayed (rotation
 * applied), y grows downwards, units are CSS pixels = points × scale.
 */

/** [x1, y1, x2, y2] in PDF user space. */
export type PdfRect = [number, number, number, number];

export interface PageGeometry {
  /** Visible page box in PDF user space ([x0, y0, x1, y1], pdf.js `page.view`). */
  view: PdfRect;
  /** Clockwise rotation in degrees, any multiple of 90. */
  rotation: number;
}

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function normalizeRotation(rotation: number): 0 | 90 | 180 | 270 {
  const r = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  return r as 0 | 90 | 180 | 270;
}

/** Size of the page as displayed, in CSS pixels. */
export function displaySize(geo: PageGeometry, scale: number): { width: number; height: number } {
  const w = geo.view[2] - geo.view[0];
  const h = geo.view[3] - geo.view[1];
  const swap = normalizeRotation(geo.rotation) % 180 !== 0;
  return { width: (swap ? h : w) * scale, height: (swap ? w : h) * scale };
}

export function pdfToScreenPoint(x: number, y: number, geo: PageGeometry, scale: number): [number, number] {
  const [x0, y0, x1, y1] = geo.view;
  const w = x1 - x0;
  const h = y1 - y0;
  const u = x - x0; // from the left edge of the unrotated page
  const v = y - y0; // from the bottom edge of the unrotated page
  let sx: number;
  let sy: number;
  switch (normalizeRotation(geo.rotation)) {
    case 0:
      [sx, sy] = [u, h - v];
      break;
    case 90:
      [sx, sy] = [v, u];
      break;
    case 180:
      [sx, sy] = [w - u, v];
      break;
    case 270:
      [sx, sy] = [h - v, w - u];
      break;
  }
  return [sx * scale, sy * scale];
}

export function screenToPdfPoint(sx: number, sy: number, geo: PageGeometry, scale: number): [number, number] {
  const [x0, y0, x1, y1] = geo.view;
  const w = x1 - x0;
  const h = y1 - y0;
  const px = sx / scale;
  const py = sy / scale;
  let u: number;
  let v: number;
  switch (normalizeRotation(geo.rotation)) {
    case 0:
      [u, v] = [px, h - py];
      break;
    case 90:
      [u, v] = [py, px];
      break;
    case 180:
      [u, v] = [w - px, py];
      break;
    case 270:
      [u, v] = [w - py, h - px];
      break;
  }
  return [u + x0, v + y0];
}

export function pdfToScreenRect(rect: PdfRect, geo: PageGeometry, scale: number): ScreenRect {
  const [ax, ay] = pdfToScreenPoint(rect[0], rect[1], geo, scale);
  const [bx, by] = pdfToScreenPoint(rect[2], rect[3], geo, scale);
  return {
    left: Math.min(ax, bx),
    top: Math.min(ay, by),
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay),
  };
}

export function screenToPdfRect(rect: ScreenRect, geo: PageGeometry, scale: number): PdfRect {
  const [ax, ay] = screenToPdfPoint(rect.left, rect.top, geo, scale);
  const [bx, by] = screenToPdfPoint(rect.left + rect.width, rect.top + rect.height, geo, scale);
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
}

/** Normalises a rect so that x1 <= x2 and y1 <= y2. */
export function normalizeRect([a, b, c, d]: PdfRect): PdfRect {
  return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
}
