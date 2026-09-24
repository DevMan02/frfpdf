/** Zoom levels offered by the +/− buttons (1 = real size). */
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4] as const;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/** CSS pixels per PDF point: at 100% a page is shown at its real printed size. */
export const PDF_TO_CSS = 96 / 72;

const EPSILON = 0.001;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Next step strictly above the current zoom (works for non-step values too). */
export function zoomIn(current: number): number {
  return ZOOM_STEPS.find((step) => step > current + EPSILON) ?? MAX_ZOOM;
}

/** Next step strictly below the current zoom. */
export function zoomOut(current: number): number {
  return [...ZOOM_STEPS].reverse().find((step) => step < current - EPSILON) ?? MIN_ZOOM;
}

/**
 * Zoom that makes the widest page fill the available width.
 * `pageWidthPt` is in PDF points, `availableWidthPx` in CSS pixels.
 */
export function fitWidthZoom(availableWidthPx: number, pageWidthPt: number): number {
  if (pageWidthPt <= 0 || availableWidthPx <= 0) return 1;
  return clampZoom(availableWidthPx / (pageWidthPt * PDF_TO_CSS));
}

export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}
