import {
  area,
  height,
  inset,
  intersection,
  overlapRatio,
  textBox,
  width,
  type Box,
  type HLine,
  type TextRun,
  type VLine,
} from './geometry';
import { inferLabelHint } from './labels';
import { substringSpan } from './textWidths';

/**
 * Finds the places to fill in a flat form page. Input and output are in
 * display space (points, origin top-left, y down): see geometry.ts.
 * The same rules run on vector pages (lines from the PDF drawing commands)
 * and on scanned pages (lines found in the pixels).
 */

export type DetectedKind = 'text' | 'multiline' | 'date' | 'checkbox' | 'signature';
export type DetectedOrigin = 'glyph' | 'underscore' | 'box' | 'cell' | 'line';

export interface DetectedField {
  box: Box;
  kind: DetectedKind;
  /** Nearby text that names the field ('' when none, e.g. on scans). */
  label: string;
  origin: DetectedOrigin;
  /**
   * Something is already written there (e.g. "Mancardi Devin" under the
   * caption "Full legal name"). Editing it covers the old content.
   */
  prefilled?: boolean;
  /** The text already written, when it can be read (vector PDFs). */
  value?: string;
}

export interface DetectionInput {
  pageWidth: number;
  pageHeight: number;
  texts: TextRun[];
  hLines: HLine[];
  vLines: VLine[];
  /** Square boxes found elsewhere (scans). Vector boxes are rebuilt from lines. */
  boxes?: Box[];
  /** Something (other than lines) is already written in the box. Default: text overlaps it. */
  occupied?: (box: Box) => boolean;
  /** Scans only: where the ink is inside a box (to find a caption on top of an empty cell). */
  inkBounds?: (box: Box) => Box | null;
  /** Scans only: bands of written rows inside a box, top to bottom. */
  inkBands?: (box: Box) => { y1: number; y2: number }[];
}

/** Tolerance when matching line ends and edges, in points. */
const TOL = 3;
/** Collinear pieces closer than this are one line (scans break thin lines). */
const LINE_GAP = 6;
const CHECKBOX_MIN = 5;
const CHECKBOX_MAX = 24;
const MULTILINE_MIN_HEIGHT = 36;
const MIN_FIELD_HEIGHT = 9;
const MIN_LINE_FIELD_LENGTH = 25;

export function detectFields(input: DetectionInput): DetectedField[] {
  const texts = input.texts.filter((t) => t.str.trim());
  const textBoxes = texts.map(textBox);
  const hasText = (box: Box) => textBoxes.some((tb) => overlapRatio(tb, box) > 0.25 && intersection(tb, box));
  const occupied = input.occupied ?? hasText;
  const isFree = (box: Box) => !hasText(box) && !occupied(box);

  const hs = mergeHLines(input.hLines);
  const vs = mergeVLines(input.vLines);
  const pageArea = input.pageWidth * input.pageHeight;
  const cells = findCells(hs, vs).filter((c) => area(c) < 0.4 * pageArea);

  const fromText = detectInText(texts);
  const fromBoxes = (input.boxes ?? []).map<DetectedField>((b) => ({
    box: b,
    kind: 'checkbox',
    label: labelRightOf(b, texts),
    origin: 'box',
  }));
  const fromCells = classifyCells(cells, texts, isFree, input.inkBounds, input.inkBands);
  const fromLines = freeLineFields(hs, vs, cells, texts, hasText, occupied);

  // Earlier sources win when two candidates overlap.
  const kept: DetectedField[] = [];
  for (const field of [...fromText, ...fromBoxes, ...fromCells, ...fromLines]) {
    if (width(field.box) < 5 || height(field.box) < 5) continue;
    if (kept.some((k) => overlapRatio(k.box, field.box) > 0.5)) continue;
    kept.push(field);
  }
  return kept.map(withHintKind);
}

function withHintKind(field: DetectedField): DetectedField {
  if (field.kind !== 'text') return field;
  const hint = inferLabelHint(field.label);
  if (hint === 'date') return { ...field, kind: 'date' };
  if (hint === 'signature') return { ...field, kind: 'signature' };
  return field;
}

// ---------------------------------------------------------------------------
// Lines

export function mergeHLines(lines: HLine[]): HLine[] {
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.x1 - b.x1);
  const merged: HLine[] = [];
  for (const line of sorted) {
    const target = merged.find((m) => Math.abs(m.y - line.y) <= 1.5 && line.x1 <= m.x2 + LINE_GAP && line.x2 >= m.x1 - LINE_GAP);
    if (target) {
      target.x1 = Math.min(target.x1, line.x1);
      target.x2 = Math.max(target.x2, line.x2);
    } else {
      merged.push({ ...line });
    }
  }
  return merged;
}

export function mergeVLines(lines: VLine[]): VLine[] {
  const sorted = [...lines].sort((a, b) => a.x - b.x || a.y1 - b.y1);
  const merged: VLine[] = [];
  for (const line of sorted) {
    const target = merged.find((m) => Math.abs(m.x - line.x) <= 1.5 && line.y1 <= m.y2 + LINE_GAP && line.y2 >= m.y1 - LINE_GAP);
    if (target) {
      target.y1 = Math.min(target.y1, line.y1);
      target.y2 = Math.max(target.y2, line.y2);
    } else {
      merged.push({ ...line });
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Cells (tables and rectangles)

/** Smallest rectangles enclosed by horizontal and vertical lines. */
export function findCells(hs: HLine[], vs: VLine[]): Box[] {
  const cells: Box[] = [];
  for (const top of hs) {
    for (const bottom of hs) {
      const h = bottom.y - top.y;
      if (h < CHECKBOX_MIN || h > 600) continue;
      const ox1 = Math.max(top.x1, bottom.x1);
      const ox2 = Math.min(top.x2, bottom.x2);
      if (ox2 - ox1 < CHECKBOX_MIN - TOL) continue;

      const xs = uniqueSorted(
        vs
          .filter((v) => v.x >= ox1 - TOL && v.x <= ox2 + TOL && v.y1 <= top.y + TOL && v.y2 >= bottom.y - TOL)
          .map((v) => v.x),
      );
      for (let k = 1; k < xs.length; k++) {
        const xa = xs[k - 1]!;
        const xb = xs[k]!;
        if (xb - xa < CHECKBOX_MIN) continue;
        // Minimal: no line crossing the whole candidate from inside.
        const splitH = hs.some((l) => l.y > top.y + TOL && l.y < bottom.y - TOL && l.x1 <= xa + TOL && l.x2 >= xb - TOL);
        if (splitH) continue;
        const splitV = vs.some(
          (l) =>
            l.x > xa + TOL &&
            l.x < xb - TOL &&
            Math.min(l.y2, bottom.y) - Math.max(l.y1, top.y) > 0.5 * h,
        );
        if (splitV) continue;
        cells.push({ x1: xa, y1: top.y, x2: xb, y2: bottom.y });
      }
    }
  }
  // Remove duplicates (e.g. double borders).
  const unique: Box[] = [];
  for (const c of cells) {
    if (!unique.some((u) => Math.abs(u.x1 - c.x1) <= TOL && Math.abs(u.x2 - c.x2) <= TOL && Math.abs(u.y1 - c.y1) <= TOL && Math.abs(u.y2 - c.y2) <= TOL)) {
      unique.push(c);
    }
  }
  return unique;
}

function uniqueSorted(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const result: number[] = [];
  for (const v of sorted) if (!result.length || v - result[result.length - 1]! > TOL) result.push(v);
  return result;
}

function textsInside(box: Box, texts: TextRun[]): TextRun[] {
  return texts.filter((t) => {
    const tb = textBox(t);
    const cx = (tb.x1 + tb.x2) / 2;
    const cy = (tb.y1 + tb.y2) / 2;
    return cx > box.x1 && cx < box.x2 && cy > box.y1 && cy < box.y2;
  });
}

function joinTexts(texts: TextRun[]): string {
  return [...texts]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((t) => t.str.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s:]+$/, '')
    .trim();
}

function union(boxes: Box[]): Box {
  return {
    x1: Math.min(...boxes.map((b) => b.x1)),
    y1: Math.min(...boxes.map((b) => b.y1)),
    x2: Math.max(...boxes.map((b) => b.x2)),
    y2: Math.max(...boxes.map((b) => b.y2)),
  };
}

function isCheckboxSize(b: Box): boolean {
  const w = width(b);
  const h = height(b);
  return w >= CHECKBOX_MIN && h >= CHECKBOX_MIN && w <= CHECKBOX_MAX && h <= CHECKBOX_MAX && Math.max(w, h) / Math.min(w, h) <= 1.4;
}

function classifyCells(
  cells: Box[],
  texts: TextRun[],
  isFree: (b: Box) => boolean,
  inkBoundsOf?: (b: Box) => Box | null,
  inkBandsOf?: (b: Box) => { y1: number; y2: number }[],
): DetectedField[] {
  const fields: DetectedField[] = [];
  for (const cell of cells) {
    const inside = textsInside(cell, texts);
    if (!inside.length) {
      if (!isFree(inset(cell, 2))) {
        // Scans: a small caption printed at the top of the cell, with the
        // room below either empty (a field to fill) or written (prefilled).
        const caption = scannedCaption(cell, inkBoundsOf, inkBandsOf);
        if (caption !== null) {
          const below: Box = { x1: cell.x1 + 1, y1: caption + 1.5, x2: cell.x2 - 1, y2: cell.y2 - 1 };
          if (height(below) >= 10 && width(below) >= 30) {
            fields.push({
              box: below,
              kind: height(below) >= MULTILINE_MIN_HEIGHT ? 'multiline' : 'text',
              label: '',
              origin: 'cell',
              prefilled: !isFree(below),
            });
          }
        }
        continue;
      }
      if (isCheckboxSize(cell)) {
        fields.push({ box: cell, kind: 'checkbox', label: labelRightOf(cell, texts), origin: 'cell' });
        continue;
      }
      if (height(cell) < MIN_FIELD_HEIGHT || width(cell) < 12) continue;
      fields.push({
        box: inset(cell, 1),
        kind: height(cell) >= MULTILINE_MIN_HEIGHT ? 'multiline' : 'text',
        label: cellLabel(cell, cells, texts),
        origin: 'cell',
      });
      continue;
    }

    // A small caption on top and a value below it ("Restrizioni alimentari"
    // over "Nessuna"): a prefilled field that can be corrected.
    const lines = textLines(inside);
    if (lines.length >= 2) {
      const captionBox = union(lines[0]!.map(textBox));
      const valueTexts = lines.slice(1).flat();
      const captionIsSmall = lines[0]!.every((t) => valueTexts.every((v) => t.size <= v.size + 0.5));
      if (captionIsSmall && captionBox.y2 - cell.y1 < 0.5 * height(cell)) {
        const below: Box = { x1: cell.x1 + 1, y1: captionBox.y2 + 1, x2: cell.x2 - 1, y2: cell.y2 - 1 };
        if (height(below) >= 10 && width(below) >= 30) {
          const multiline = height(below) >= MULTILINE_MIN_HEIGHT;
          fields.push({
            box: below,
            kind: multiline ? 'multiline' : 'text',
            label: joinTexts(lines[0]!),
            origin: 'cell',
            prefilled: true,
            value: lines
              .slice(1)
              .map((line) => joinTexts(line))
              .join(multiline ? '\n' : ' '),
          });
          continue;
        }
      }
    }

    // A label inside the cell, with room left to write: below a small caption
    // ("Religione" on top of an empty cell), or right of "Nome:". Text without
    // a colon on the left is a table value or a question, not a label.
    const tb = union(inside.map(textBox));
    const label = joinTexts(inside);
    const below: Box = { x1: cell.x1 + 1, y1: tb.y2 + 1, x2: cell.x2 - 1, y2: cell.y2 - 1 };
    const right: Box = { x1: tb.x2 + 3, y1: cell.y1 + 1, x2: cell.x2 - 1, y2: cell.y2 - 1 };
    const labelOnTop = tb.y2 - cell.y1 < 0.5 * height(cell);
    const labelOnLeft = tb.x1 - cell.x1 < 15 && /:\s*$/.test(inside.map((t) => t.str).join(''));
    if (labelOnTop && height(below) >= 11 && width(below) >= 30 && isFree(below)) {
      fields.push({
        box: below,
        kind: height(below) >= MULTILINE_MIN_HEIGHT ? 'multiline' : 'text',
        label,
        origin: 'cell',
      });
    } else if (labelOnLeft && width(right) >= 50 && height(right) >= 10 && isFree(right)) {
      fields.push({ box: right, kind: 'text', label, origin: 'cell' });
    }
  }
  return fields;
}

/** Text runs grouped into lines (same baseline), top to bottom. */
function textLines(texts: TextRun[]): TextRun[][] {
  const lines: TextRun[][] = [];
  for (const t of [...texts].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines.find((l) => Math.abs(l[0]!.y - t.y) < 2);
    if (line) line.push(t);
    else lines.push([t]);
  }
  return lines;
}

/**
 * Scans: bottom of a caption printed at the top of the cell, or null. The
 * caption is the first band of written rows, short and in the upper part.
 */
function scannedCaption(
  cell: Box,
  inkBoundsOf?: (b: Box) => Box | null,
  inkBandsOf?: (b: Box) => { y1: number; y2: number }[],
): number | null {
  const inner = inset(cell, 2);
  const bands = inkBandsOf?.(inner);
  if (bands?.length) {
    const first = bands[0]!;
    const isCaption = first.y2 - first.y1 < 10 && first.y2 - cell.y1 < Math.max(14, 0.5 * height(cell));
    return isCaption ? first.y2 : null;
  }
  const ink = inkBoundsOf?.(inner);
  return ink && ink.y2 - cell.y1 < Math.max(14, 0.45 * height(cell)) ? ink.y2 : null;
}

/** Row label (cell on the left) and column header (cell above), as "Row — Column". */
function cellLabel(cell: Box, cells: Box[], texts: TextRun[]): string {
  const sameRow = cells
    .filter((c) => c !== cell && Math.abs(c.y1 - cell.y1) <= TOL && Math.abs(c.y2 - cell.y2) <= TOL && c.x2 <= cell.x1 + TOL)
    .sort((a, b) => b.x2 - a.x2);
  let row = '';
  for (const c of sameRow) {
    row = joinTexts(textsInside(c, texts));
    if (row) break;
  }

  // Column header: the top cell of the column (walking up while cells touch).
  let column = '';
  let current = cell;
  for (;;) {
    const up = cells.find(
      (c) => Math.abs(c.x1 - current.x1) <= TOL && Math.abs(c.x2 - current.x2) <= TOL && Math.abs(c.y2 - current.y1) <= TOL,
    );
    if (!up) break;
    current = up;
  }
  if (current !== cell) column = joinTexts(textsInside(current, texts));

  const parts = [...new Set([row, column].filter(Boolean))];
  if (parts.length) return parts.join(' — ');

  // Free text just above the cell ("Note" over a big box).
  const above = texts
    .filter((t) => {
      const tb = textBox(t);
      return tb.y2 <= cell.y1 + 1 && cell.y1 - tb.y2 < 20 && tb.x2 > cell.x1 && tb.x1 < cell.x2;
    })
    .sort((a, b) => b.y - a.y || a.x - b.x);
  if (above.length) return joinTexts(above.filter((t) => Math.abs(t.y - above[0]!.y) < 2));
  return labelLeftOf(cell, texts);
}

// ---------------------------------------------------------------------------
// Underscores, dots and checkbox characters inside the text

const BLANK_PATTERN = /_{3,}|\.{5,}|…{2,}|[☐□❑❒▢◻⬜]/gu;
const GLYPHS = '☐□❑❒▢◻⬜';

interface Blank {
  start: number;
  end: number;
  glyph: boolean;
}

function detectInText(texts: TextRun[]): DetectedField[] {
  const fields: DetectedField[] = [];
  for (const t of texts) {
    const chars = [...t.str];
    const str = chars.join('');
    // Code-point indices of every blank in the run.
    const blanks: Blank[] = [];
    for (const m of str.matchAll(BLANK_PATTERN)) {
      const start = [...str.slice(0, m.index)].length;
      blanks.push({ start, end: start + [...m[0]].length, glyph: GLYPHS.includes(m[0]) });
    }
    // "___/___/_____" is one date field, not three.
    const merged: Blank[] = [];
    for (const b of blanks) {
      const prev = merged[merged.length - 1];
      const between = prev ? chars.slice(prev.end, b.start).join('') : '';
      if (prev && !prev.glyph && !b.glyph && between.length <= 3 && /^[\s/\-.]*$/.test(between)) prev.end = b.end;
      else merged.push({ ...b });
    }

    merged.forEach((b, index) => {
      const [sx1, sx2] = substringSpan(str, b.start, b.end, t.x, t.width);
      const prevEnd = index > 0 ? merged[index - 1]!.end : 0;
      const nextStart = index < merged.length - 1 ? merged[index + 1]!.start : chars.length;
      if (b.glyph) {
        const s = t.size * 0.72;
        const cx = (sx1 + sx2) / 2;
        const box = { x1: cx - s / 2, y1: t.y - s - t.size * 0.02, x2: cx + s / 2, y2: t.y - t.size * 0.02 };
        const after = cleanLabel(chars.slice(b.end, nextStart).join(''));
        fields.push({ box, kind: 'checkbox', label: after || labelRightOf(box, texts, t), origin: 'glyph' });
        return;
      }
      if (sx2 - sx1 < 12) return;
      const box = { x1: sx1, y1: t.y - t.size * 1.05, x2: sx2, y2: t.y + t.size * 0.15 };
      const before = cleanLabel(chars.slice(prevEnd, b.start).join(''));
      fields.push({
        box,
        kind: 'text',
        label: before || labelLeftOf(box, texts, t) || labelBelow(box, texts),
        origin: 'underscore',
      });
    });
  }
  return fields;
}

function cleanLabel(text: string): string {
  return text
    .replace(/[_.…]{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:,;]+|[\s:,;]+$/g, '')
    .trim();
}

// ---------------------------------------------------------------------------
// Free lines ("Nome ________" drawn as a line)

function freeLineFields(
  hs: HLine[],
  vs: VLine[],
  cells: Box[],
  texts: TextRun[],
  hasText: (b: Box) => boolean,
  occupied: (b: Box) => boolean,
): DetectedField[] {
  const fields: DetectedField[] = [];
  for (const line of hs) {
    const length = line.x2 - line.x1;
    if (length < MIN_LINE_FIELD_LENGTH) continue;
    const isCellEdge = cells.some(
      (c) =>
        (Math.abs(c.y1 - line.y) <= TOL || Math.abs(c.y2 - line.y) <= TOL) &&
        Math.min(c.x2, line.x2) - Math.max(c.x1, line.x1) > 0.5 * Math.min(length, width(c)),
    );
    if (isCellEdge) continue;
    // A line touched by vertical lines is a table border, not a line to write on.
    const touchesVertical = vs.some(
      (v) => v.x >= line.x1 - TOL && v.x <= line.x2 + TOL && v.y1 <= line.y + TOL && v.y2 >= line.y - TOL,
    );
    if (touchesVertical) continue;
    // Just below a line to write on there is paper (or a caption a few points
    // lower). Ink right below means the "line" is the top of a row of text.
    if (occupied({ x1: line.x1, y1: line.y + 1.5, x2: line.x2, y2: line.y + 3.5 })) continue;

    // Room above the line, up to the next line or text.
    let room = 16;
    for (const other of hs) {
      if (other === line || other.y >= line.y) continue;
      if (Math.min(other.x2, line.x2) - Math.max(other.x1, line.x1) <= 0) continue;
      room = Math.min(room, line.y - other.y - 2);
    }
    for (const t of texts) {
      const tb = textBox(t);
      if (tb.y2 > line.y - 2 || tb.x2 <= line.x1 || tb.x1 >= line.x2) continue;
      room = Math.min(room, line.y - tb.y2 - 1);
    }
    if (room < MIN_FIELD_HEIGHT) {
      // Text sits right on the line: underlined text or an already written value.
      continue;
    }
    const box = { x1: line.x1, y1: line.y - room, x2: line.x2, y2: line.y - 0.5 };
    if (hasText(box) || occupied(inset(box, 1))) continue;
    fields.push({ box, kind: 'text', label: labelLeftOf(box, texts) || labelBelow(box, texts), origin: 'line' });
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Labels

/** Nearest text ending just left of the box, on the same line. */
function labelLeftOf(box: Box, texts: TextRun[], self?: TextRun): string {
  const candidates = texts.filter((t) => {
    if (t === self) return false;
    const tb = textBox(t);
    const lineMatch = t.y >= box.y1 - 2 && t.y <= box.y2 + 4;
    return lineMatch && tb.x2 <= box.x1 + 3 && tb.x2 >= box.x1 - 150;
  });
  const nearest = candidates.sort((a, b) => b.x + b.width - (a.x + a.width))[0];
  return nearest ? cleanLabel(lastSegment(nearest.str)) : '';
}

/** Nearest text starting just right of the box, on the same line ("☐ Sì"). */
function labelRightOf(box: Box, texts: TextRun[], self?: TextRun): string {
  const cy = (box.y1 + box.y2) / 2;
  const candidates = texts.filter((t) => {
    if (t === self) return false;
    const tb = textBox(t);
    return cy >= tb.y1 - 2 && cy <= tb.y2 + 2 && tb.x1 >= box.x2 - 2 && tb.x1 <= box.x2 + 40;
  });
  const nearest = candidates.sort((a, b) => a.x - b.x)[0];
  return nearest ? cleanLabel(firstSegment(nearest.str)) : '';
}

/** Caption printed under a line ("Firma", "Luogo e data"). */
function labelBelow(box: Box, texts: TextRun[]): string {
  const cx = (box.x1 + box.x2) / 2;
  const candidates = texts.filter((t) => {
    const tb = textBox(t);
    return tb.y1 >= box.y2 - 2 && tb.y1 <= box.y2 + 14 && tb.x1 <= box.x2 && tb.x2 >= box.x1 && Math.abs((tb.x1 + tb.x2) / 2 - cx) < width(box);
  });
  const nearest = candidates.sort((a, b) => a.y - b.y)[0];
  return nearest ? cleanLabel(nearest.str) : '';
}

/** "Nome ____ Cognome" → the part after the last blank. */
function lastSegment(str: string): string {
  const parts = str.split(BLANK_PATTERN);
  return parts[parts.length - 1]?.trim() || str;
}

function firstSegment(str: string): string {
  return str.split(BLANK_PATTERN)[0]?.trim() || str;
}
