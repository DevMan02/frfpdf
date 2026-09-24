/**
 * Chooses the font size for a value inside a field box, so that the text never
 * leaves the box. The same function runs on screen (measuring with a canvas)
 * and when writing the PDF (measuring with pdf-lib), so both look the same.
 */

/** Width of `text` at font size `size`, in the same unit as the box. */
export type MeasureText = (text: string, size: number) => number;

export interface FitOptions {
  width: number;
  height: number;
  multiline?: boolean;
  /** Upper bound, e.g. the size requested by the form. Default 12. */
  maxSize?: number;
  minSize?: number;
  /** Inner margin on every side. */
  padding?: number;
  lineHeight?: number;
}

export const DEFAULT_MAX_SIZE = 12;
export const DEFAULT_MIN_SIZE = 4;
export const DEFAULT_PADDING = 2;
export const DEFAULT_LINE_HEIGHT = 1.15;

/** Largest size that keeps a single line within the height. */
function heightCap(height: number, padding: number): number {
  return Math.max(0, (height - 2 * padding) / DEFAULT_LINE_HEIGHT);
}

export function fitFontSize(text: string, measure: MeasureText, options: FitOptions): number {
  const {
    width,
    height,
    multiline = false,
    maxSize = DEFAULT_MAX_SIZE,
    minSize = DEFAULT_MIN_SIZE,
    padding = DEFAULT_PADDING,
    lineHeight = DEFAULT_LINE_HEIGHT,
  } = options;
  const innerWidth = Math.max(0, width - 2 * padding);
  const innerHeight = Math.max(0, height - 2 * padding);
  const start = Math.max(minSize, Math.min(maxSize, heightCap(height, padding)));

  if (!multiline) {
    const widthAtOne = measure(text, 1);
    if (!text || widthAtOne <= 0) return start;
    return round(Math.max(minSize, Math.min(start, innerWidth / widthAtOne)));
  }

  // Multi-line: shrink in half-point steps until the wrapped text fits.
  for (let size = start; size > minSize; size -= 0.5) {
    const lines = wrapLines(text, measure, size, innerWidth);
    if (lines.length * size * lineHeight <= innerHeight) return round(size);
  }
  return minSize;
}

/** Greedy word wrap; words longer than a line are split by characters. */
export function wrapLines(text: string, measure: MeasureText, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r\n|\r|\n/)) {
    let line = '';
    for (const word of paragraph.split(/ +/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // The word alone may still be too long: break it.
      let piece = '';
      for (const char of word) {
        if (piece && measure(piece + char, size) > maxWidth) {
          lines.push(piece);
          piece = '';
        }
        piece += char;
      }
      line = piece;
    }
    lines.push(line);
  }
  return lines;
}

function round(size: number): number {
  return Math.floor(size * 10) / 10;
}
