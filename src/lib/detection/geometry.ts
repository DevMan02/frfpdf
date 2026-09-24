/**
 * Detection works in "display space": the page as shown on screen at scale 1
 * (points), origin top-left, y growing downwards, page rotation applied.
 * That way "left of" and "above" mean what the reader sees, for vector pages
 * and scanned images alike.
 */
export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Horizontal segment at height y. */
export interface HLine {
  x1: number;
  x2: number;
  y: number;
}

/** Vertical segment at abscissa x. */
export interface VLine {
  y1: number;
  y2: number;
  x: number;
}

/** A run of text on one line, in display space. */
export interface TextRun {
  str: string;
  /** Left end of the baseline. */
  x: number;
  /** Baseline, y downwards. */
  y: number;
  width: number;
  /** Font size in points. */
  size: number;
}

export const width = (b: Box) => b.x2 - b.x1;
export const height = (b: Box) => b.y2 - b.y1;
export const area = (b: Box) => Math.max(0, width(b)) * Math.max(0, height(b));

export function intersection(a: Box, b: Box): Box | null {
  const box = { x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), x2: Math.min(a.x2, b.x2), y2: Math.min(a.y2, b.y2) };
  return box.x1 < box.x2 && box.y1 < box.y2 ? box : null;
}

/** Share of the smaller box covered by the other one (0..1). */
export function overlapRatio(a: Box, b: Box): number {
  const inter = intersection(a, b);
  if (!inter) return 0;
  return area(inter) / Math.max(1e-9, Math.min(area(a), area(b)));
}

export function inset(b: Box, d: number): Box {
  return { x1: b.x1 + d, y1: b.y1 + d, x2: b.x2 - d, y2: b.y2 - d };
}

/** Approximate box of a text run: from ascender to descender. */
export function textBox(t: TextRun): Box {
  return { x1: t.x, y1: t.y - t.size * 0.8, x2: t.x + t.width, y2: t.y + t.size * 0.2 };
}
