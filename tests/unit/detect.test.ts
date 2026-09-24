import { degrees, PDFDocument, rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { detectFields, type DetectedField } from '../../src/lib/detection/detect';
import type { Box } from '../../src/lib/detection/geometry';
import { extractVectorPrimitives } from '../../src/lib/detection/vector';
import type { PageGeometry, PdfRect } from '../../src/lib/pdf/coords';
import { detectScannedFixture, detectVectorFixture, OP_CODES, scannedFixtureBitmap } from './detectionHelpers';
import { openWithPdfjs } from './helpers';
import { isRasterPage } from '../../src/lib/detection/pageInput';

type Expected = { kind: DetectedField['kind']; label: string; box?: [number, number, number, number] };

/** Compares kind and label in order, and the box within `tolerance` points. */
function expectFields(actual: DetectedField[], expected: Expected[], tolerance = 3) {
  expect(actual.map((f) => [f.kind, f.label])).toEqual(expected.map((e) => [e.kind, e.label]));
  expected.forEach((e, i) => {
    if (!e.box) return;
    const b = actual[i]!.box;
    [b.x1, b.y1, b.x2, b.y2].forEach((v, k) => expect(Math.abs(v - e.box![k]!)).toBeLessThanOrEqual(tolerance));
  });
}

// Display coordinates: y is measured from the top of the page.
const top = (pdfY: number) => 841.89 - pdfY;

describe('case B: blanks written with characters', () => {
  it('finds underscores and dots, with the label on their left', async () => {
    expectFields(await detectVectorFixture('flat-underscores.pdf'), [
      { kind: 'text', label: 'Il/La sottoscritto/a', box: [161, top(750) - 11.5, 406, top(750) + 1.6] },
      { kind: 'text', label: 'nato/a a' },
      { kind: 'date', label: 'il' }, // "___/___/______" is a single field
      { kind: 'text', label: 'Codice fiscale' },
      { kind: 'text', label: 'Email' }, // dots
      { kind: 'date', label: 'Luogo e data' },
      { kind: 'signature', label: 'Firma' },
    ]);
  });

  it('recognises checkbox characters and the text after them', () => {
    const fields = detectFields({
      pageWidth: 595,
      pageHeight: 842,
      texts: [{ str: 'Fumatore: ☐ Sì ☐ No', x: 72, y: 100, width: 110, size: 11 }],
      hLines: [],
      vLines: [],
    });
    expect(fields.map((f) => [f.kind, f.label])).toEqual([
      ['checkbox', 'Sì'],
      ['checkbox', 'No'],
    ]);
    expect(fields[0]!.box.x2).toBeLessThan(fields[1]!.box.x1);
  });
});

describe('lines that are not places to write', () => {
  const base = { pageWidth: 595, pageHeight: 842, vLines: [] };

  it('ignores a line sitting on top of a row of text', () => {
    const fields = detectFields({
      ...base,
      hLines: [{ x1: 100, x2: 300, y: 100 }],
      texts: [{ str: 'testo sotto la linea', x: 100, y: 110, width: 200, size: 10 }],
    });
    expect(fields).toEqual([]);
  });

  it('ignores a table border touched by vertical lines', () => {
    const fields = detectFields({
      ...base,
      hLines: [{ x1: 100, x2: 300, y: 100 }],
      vLines: [{ x: 100, y1: 100, y2: 140 }],
      texts: [],
    });
    expect(fields).toEqual([]);
  });

  it('keeps a free line with room above and paper below', () => {
    const fields = detectFields({ ...base, hLines: [{ x1: 100, x2: 300, y: 100 }], texts: [] });
    expect(fields.map((f) => f.origin)).toEqual(['line']);
  });
});

describe('case B: drawn lines and boxes', () => {
  it('finds lines next to labels, captions under lines, checkboxes and big boxes', async () => {
    expectFields(await detectVectorFixture('flat-lines.pdf'), [
      { kind: 'checkbox', label: 'Sì', box: [72, top(600), 82, top(590)] },
      { kind: 'checkbox', label: 'No', box: [130, top(600), 140, top(590)] },
      { kind: 'multiline', label: 'Note', box: [73, top(519), 522, top(401)] },
      { kind: 'text', label: 'Nome', box: [110, top(757) - 15.5, 300, top(757) - 0.5] },
      { kind: 'text', label: 'Cognome' },
      { kind: 'signature', label: 'Firma' }, // caption printed under the line
      // The underlined heading "Informativa sulla privacy" is not a field.
    ]);
  });
});

describe('case B: tables', () => {
  it('finds empty cells, named after their column, and skips filled or label-only cells', async () => {
    const fields = await detectVectorFixture('flat-table.pdf');
    const headers = ['Lingua', 'Anni di studio', 'Parlato', 'Letto', 'Scritto'];
    expectFields(fields, [
      ...headers.map((label) => ({ kind: 'text' as const, label })), // row 3
      ...headers.map((label) => ({ kind: 'text' as const, label })), // row 4
      { kind: 'text', label: 'Religione', box: [73, top(630) + 1.6 + 1, 221, top(600) - 1] }, // room under the caption
      { kind: 'checkbox', label: 'Sì' },
      { kind: 'checkbox', label: 'No' },
      // Not fields: header row, the filled row, "Restrizioni alimentari: Nessuna", the question "Fumi?".
    ]);
    expect(fields[0]!.box.y1).toBeCloseTo(top(720) + 1, 0);
  });
});

describe('case C: scanned pages (pixels only)', () => {
  const pt = (px: number) => px / (1240 / 595.28);

  it('treats a page covered by one image as a scan', async () => {
    const pdf = await openWithPdfjs((await import('./helpers')).fixture('scanned.pdf'));
    const page = await pdf.getPage(1);
    const ops = await page.getOperatorList();
    const geometry: PageGeometry = { view: page.view as PdfRect, rotation: page.rotate };
    const primitives = extractVectorPrimitives(ops.fnArray, ops.argsArray, OP_CODES, geometry);
    expect(primitives.imageCoverage).toBeGreaterThan(0.95);
    expect(isRasterPage(primitives)).toBe(true);
  });

  it('finds the line, table cells, checkboxes and the big box; skips the line already written on', async () => {
    const fields = await detectScannedFixture();
    const byOrigin = (origin: DetectedField['origin']) => fields.filter((f) => f.origin === origin);

    expect(byOrigin('box').map((f) => f.kind)).toEqual(['checkbox', 'checkbox']);
    expect(pt(0) + byOrigin('box')[0]!.box.x1).toBeCloseTo(pt(150), 0);

    const cells = byOrigin('cell');
    expect(cells.filter((f) => f.kind === 'text')).toHaveLength(6); // 2 empty rows × 3 columns
    expect(cells.filter((f) => f.kind === 'multiline')).toHaveLength(1);

    const lines = byOrigin('line');
    expect(lines).toHaveLength(1);
    const line = lines[0]!.box;
    expect(line.x1).toBeCloseTo(pt(360), 0);
    expect(line.x2).toBeCloseTo(pt(900), 0);
    expect(line.y2).toBeLessThan(pt(319.5)); // ends just above the line (centre at 319.5 px)
    // The header row (with "text") and the written line at the bottom are not fields.
    expect(fields.every((f) => f.box.y1 < pt(1250))).toBe(true);
    expect(fields.some((f) => overlaps(f.box, { x1: pt(150), y1: pt(500), x2: pt(1090), y2: pt(560) }))).toBe(false);
    expect(fields.every((f) => f.label === '')).toBe(true);
  });

  it('analyses a 150 dpi page quickly', async () => {
    await scannedFixtureBitmap(); // warm-up
    const start = performance.now();
    await detectScannedFixture();
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

describe('extractVectorPrimitives', () => {
  it('reports lines in display space, also on rotated pages, ignoring white and curved strokes', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);
    page.drawLine({ start: { x: 100, y: 700 }, end: { x: 300, y: 700 }, thickness: 1 });
    page.drawLine({ start: { x: 100, y: 600 }, end: { x: 300, y: 600 }, thickness: 1, color: rgb(1, 1, 1) });
    page.drawCircle({ x: 300, y: 300, size: 50, borderWidth: 1, borderColor: rgb(0, 0, 0) });
    page.setRotation(degrees(90));
    const pdf = await openWithPdfjs(await doc.save());
    const p = await pdf.getPage(1);
    const ops = await p.getOperatorList();
    const geometry: PageGeometry = { view: p.view as PdfRect, rotation: p.rotate };
    const { hLines, vLines } = extractVectorPrimitives(ops.fnArray, ops.argsArray, OP_CODES, geometry);
    // Rotated 90°: the horizontal PDF line becomes vertical on screen, at x = 700.
    expect(hLines).toHaveLength(0);
    expect(vLines).toHaveLength(1);
    expect(vLines[0]!.x).toBeCloseTo(700);
    expect([vLines[0]!.y1, vLines[0]!.y2]).toEqual([100, 300]);
  });
});

function overlaps(a: Box, b: Box) {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}
