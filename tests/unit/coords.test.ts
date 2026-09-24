import { degrees, PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  displaySize,
  normalizeRotation,
  pdfToScreenPoint,
  pdfToScreenRect,
  screenToPdfPoint,
  screenToPdfRect,
  type PageGeometry,
  type PdfRect,
} from '../../src/lib/pdf/coords';
import { openWithPdfjs } from './helpers';

const A4: PageGeometry = { view: [0, 0, 595, 842], rotation: 0 };

describe('pdfToScreenPoint', () => {
  it('flips the y axis on an unrotated page', () => {
    expect(pdfToScreenPoint(0, 842, A4, 1)).toEqual([0, 0]); // top-left corner
    expect(pdfToScreenPoint(0, 0, A4, 1)).toEqual([0, 842]); // bottom-left corner
    expect(pdfToScreenPoint(100, 700, A4, 2)).toEqual([200, 284]);
  });

  it.each([
    [90, [0, 0]],
    [180, [595, 0]],
    [270, [842, 595]],
  ] as const)('puts the PDF origin in the right corner at %i°', (rotation, expected) => {
    expect(pdfToScreenPoint(0, 0, { ...A4, rotation }, 1)).toEqual(expected);
  });

  it('accepts rotations outside 0-359', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(pdfToScreenPoint(10, 20, { ...A4, rotation: -270 }, 1)).toEqual(
      pdfToScreenPoint(10, 20, { ...A4, rotation: 90 }, 1),
    );
  });
});

describe('screen <-> PDF round trip', () => {
  const geometries: PageGeometry[] = [0, 90, 180, 270].flatMap((rotation) => [
    { view: [0, 0, 595, 842], rotation },
    { view: [50, 60, 400, 500], rotation }, // crop box not starting at the origin
  ]);

  it.each(geometries)('returns to the same point (%o)', (geo) => {
    for (const scale of [0.5, 1, 1.75]) {
      const [sx, sy] = pdfToScreenPoint(123.5, 321.25, geo, scale);
      const [x, y] = screenToPdfPoint(sx, sy, geo, scale);
      expect(x).toBeCloseTo(123.5);
      expect(y).toBeCloseTo(321.25);
    }
  });

  it.each(geometries)('keeps rectangles (%o)', (geo) => {
    const rect: PdfRect = [100, 200, 250, 230];
    const back = screenToPdfRect(pdfToScreenRect(rect, geo, 1.5), geo, 1.5);
    back.forEach((v, i) => expect(v).toBeCloseTo(rect[i]!));
  });

  it('swaps width and height for 90° and 270°', () => {
    expect(displaySize({ ...A4, rotation: 90 }, 2)).toEqual({ width: 1684, height: 1190 });
    expect(displaySize(A4, 2)).toEqual({ width: 1190, height: 1684 });
    const rect = pdfToScreenRect([100, 200, 250, 230], { ...A4, rotation: 90 }, 1);
    expect(rect.width).toBeCloseTo(30);
    expect(rect.height).toBeCloseTo(150);
  });
});

describe('matches pdf.js', () => {
  it('gives the same screen points as pdf.js viewports for every rotation and zoom', async () => {
    const doc = await PDFDocument.create();
    for (const rotation of [0, 90, 180, 270]) {
      const page = doc.addPage([595, 842]);
      page.setCropBox(50, 60, 350, 440);
      page.setRotation(degrees(rotation));
    }
    const pdf = await openWithPdfjs(await doc.save());

    for (let n = 1; n <= 4; n++) {
      const page = await pdf.getPage(n);
      const geo: PageGeometry = { view: page.view as PdfRect, rotation: page.rotate };
      for (const scale of [0.5, 1, 4 / 3, 2.25]) {
        const viewport = page.getViewport({ scale });
        expect(displaySize(geo, scale).width).toBeCloseTo(viewport.width);
        expect(displaySize(geo, scale).height).toBeCloseTo(viewport.height);
        for (const [x, y] of [
          [50, 60],
          [120.5, 300.25],
          [350, 440],
        ] as const) {
          const [ex, ey] = viewport.convertToViewportPoint(x, y);
          const [ax, ay] = pdfToScreenPoint(x, y, geo, scale);
          expect(ax).toBeCloseTo(ex, 6);
          expect(ay).toBeCloseTo(ey, 6);
        }
      }
    }
  });
});
