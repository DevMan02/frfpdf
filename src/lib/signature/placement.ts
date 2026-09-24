import type { ScreenRect } from '../pdf/coords';

/**
 * Largest rectangle with the given aspect ratio (width / height) that fits
 * inside `box` minus `padding`, centred.
 */
export function fitInto(box: ScreenRect, aspect: number, padding = 0): ScreenRect {
  const w = Math.max(0, box.width - 2 * padding);
  const h = Math.max(0, box.height - 2 * padding);
  const width = Math.min(w, h * aspect);
  const height = width / aspect;
  return {
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
    height,
  };
}

/**
 * Where a signature goes when there is no signature field: centred on the
 * page, 180 points wide at most (40% of a narrow page), never taller than a
 * quarter of the page.
 */
export function defaultPlacement(page: { width: number; height: number }, aspect: number): ScreenRect {
  const width = Math.min(180, page.width * 0.4, (page.height / 4) * aspect);
  const height = width / aspect;
  return { left: (page.width - width) / 2, top: (page.height - height) / 2, width, height };
}

/**
 * Resizes keeping the aspect ratio: the new width follows the pointer, the
 * height follows the width. Minimum width 12 points (at the given scale).
 */
export function resizeKeepingAspect(start: ScreenRect, dx: number, aspect: number, minWidth: number): ScreenRect {
  const width = Math.max(minWidth, start.width + dx);
  return { ...start, width, height: width / aspect };
}

/** Keeps a rectangle inside the page (moving it, never shrinking it below the page size). */
export function clampToPage(rect: ScreenRect, page: { width: number; height: number }): ScreenRect {
  const width = Math.min(rect.width, page.width);
  const height = Math.min(rect.height, page.height);
  return {
    left: Math.min(Math.max(0, rect.left), page.width - width),
    top: Math.min(Math.max(0, rect.top), page.height - height),
    width,
    height,
  };
}
