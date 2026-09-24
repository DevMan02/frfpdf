/**
 * pdf.js gives the width of a whole text run, not of each character. To find
 * where "____" sits inside "Nome ____ Cognome ____", character widths are
 * estimated with Helvetica metrics (close to Arial/Liberation, used by most
 * forms) and scaled so that the total matches the real run width.
 */

// Helvetica advance widths (1/1000 em) for ASCII 32..126.
const ASCII_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
  556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

function charWidth(char: string): number {
  const code = char.codePointAt(0)!;
  if (code >= 32 && code <= 126) return ASCII_WIDTHS[code - 32]!;
  if (char === '…') return 1000;
  if ('☐□❑❒▢◻⬜'.includes(char)) return 800;
  return 556;
}

/**
 * Horizontal extent of characters [start, end) of `str`, given the run's
 * starting x and total width.
 */
export function substringSpan(str: string, start: number, end: number, x: number, totalWidth: number): [number, number] {
  const chars = [...str];
  const widths = chars.map(charWidth);
  const total = widths.reduce((a, b) => a + b, 0) || 1;
  const k = totalWidth / total;
  const before = widths.slice(0, start).reduce((a, b) => a + b, 0);
  const inside = widths.slice(start, end).reduce((a, b) => a + b, 0);
  return [x + before * k, x + (before + inside) * k];
}
