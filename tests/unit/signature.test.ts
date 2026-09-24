import { PDFDocument } from 'pdf-lib';
import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { commit, createHistory, patchAll, redo, seal, undo } from '../../src/lib/history';
import { pdfToScreenRect, screenToPdfRect, type PageGeometry, type PdfRect } from '../../src/lib/pdf/coords';
import { savePdf } from '../../src/lib/pdf/save';
import { contentBounds, crop, removeBackground, suggestThreshold, type RgbaImage } from '../../src/lib/signature/image';
import { clampToPage, defaultPlacement, fitInto, resizeKeepingAspect } from '../../src/lib/signature/placement';
import type { PlacedSignature } from '../../src/lib/signature/types';
import { fieldFont, fixture, openWithPdfjs, pageText } from './helpers';

function image(width: number, height: number, fill: [number, number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(fill, i * 4);
  return { width, height, data };
}

function paint(img: RgbaImage, x1: number, y1: number, x2: number, y2: number, rgba: [number, number, number, number]) {
  for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) img.data.set(rgba, (y * img.width + x) * 4);
}

const alphaAt = (img: RgbaImage, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];

describe('signature image processing', () => {
  it('turns paper transparent and keeps ink, with soft edges', () => {
    const img = image(10, 1, [245, 243, 238, 255]); // off-white paper
    img.data.set([20, 30, 90, 255], 0); // blue ink
    img.data.set([190, 190, 190, 255], 4); // anti-aliased edge
    const out = removeBackground(img, 200, 24);
    expect(alphaAt(out, 0, 0)).toBe(255);
    expect(alphaAt(out, 1, 0)).toBeGreaterThan(0);
    expect(alphaAt(out, 1, 0)).toBeLessThan(255);
    expect(alphaAt(out, 5, 0)).toBe(0);
    expect(Array.from(out.data.slice(0, 3))).toEqual([20, 30, 90]); // ink colour kept
    expect(alphaAt(img, 5, 0)).toBe(255); // input untouched
  });

  it('suggests a threshold between ink and paper', () => {
    const img = image(100, 100, [240, 240, 240, 255]);
    paint(img, 10, 40, 90, 50, [30, 30, 30, 255]);
    const threshold = suggestThreshold(img);
    expect(threshold).toBeGreaterThan(30);
    expect(threshold).toBeLessThan(240);
  });

  it('crops to the signature with a small margin', () => {
    const img = image(100, 50, [0, 0, 0, 0]);
    paint(img, 20, 10, 60, 30, [0, 0, 0, 255]);
    const box = contentBounds(img, 16, 2)!;
    expect(box).toEqual({ x: 18, y: 8, width: 44, height: 24 });
    const cropped = crop(img, box);
    expect([cropped.width, cropped.height]).toEqual([44, 24]);
    expect(alphaAt(cropped, 2, 2)).toBe(255);
    expect(contentBounds(image(5, 5, [0, 0, 0, 0]))).toBeNull();
  });
});

describe('signature placement', () => {
  it('fits a signature into a field keeping its proportions, centred', () => {
    // 200×40 minus 2 of padding = 196×36: a 4:1 signature is 144×36, centred.
    expect(fitInto({ left: 0, top: 0, width: 200, height: 40 }, 4, 2)).toEqual({ left: 28, top: 2, width: 144, height: 36 });
    const tall = fitInto({ left: 10, top: 10, width: 100, height: 100 }, 4);
    expect(tall.width).toBe(100);
    expect(tall.height).toBe(25);
    expect(tall.top).toBe(47.5);
  });

  it('places a signature in the middle of the page when there is no field', () => {
    const r = defaultPlacement({ width: 595, height: 842 }, 3);
    expect(r.width).toBe(180);
    expect(r.left + r.width / 2).toBeCloseTo(297.5);
    expect(r.top + r.height / 2).toBeCloseTo(421);
  });

  it('resizes keeping the aspect ratio and stays on the page', () => {
    const r = resizeKeepingAspect({ left: 0, top: 0, width: 100, height: 25 }, 60, 4, 12);
    expect([r.width, r.height]).toEqual([160, 40]);
    expect(resizeKeepingAspect(r, -500, 4, 12).width).toBe(12);
    expect(clampToPage({ left: 550, top: -10, width: 100, height: 25 }, { width: 595, height: 842 })).toEqual({
      left: 495,
      top: 0,
      width: 100,
      height: 25,
    });
  });

  it('converts a placement on screen to PDF coordinates and back, at any zoom and rotation', () => {
    for (const rotation of [0, 90, 180, 270]) {
      const geometry: PageGeometry = { view: [0, 0, 595, 842], rotation };
      for (const scale of [0.5, 1.33, 2]) {
        const onScreen = { left: 120 * scale, top: 300 * scale, width: 160 * scale, height: 40 * scale };
        const rect = screenToPdfRect(onScreen, geometry, scale);
        const back = pdfToScreenRect(rect, geometry, scale);
        expect(back.left).toBeCloseTo(onScreen.left);
        expect(back.top).toBeCloseTo(onScreen.top);
        expect(back.width).toBeCloseTo(onScreen.width);
        expect(back.height).toBeCloseTo(onScreen.height);
      }
    }
  });
});

describe('undo / redo history', () => {
  it('undoes and redoes steps, merging a gesture into one step', () => {
    let h = createHistory({ n: 0 });
    h = commit(h, { n: 1 }, 'type:a');
    h = commit(h, { n: 2 }, 'type:a'); // same field: merged
    h = commit(h, { n: 3 }, 'drag:b');
    expect(h.past.map((s) => s.n)).toEqual([0, 2]);
    h = undo(h);
    expect(h.present.n).toBe(2);
    h = undo(h);
    expect(h.present.n).toBe(0);
    h = undo(h); // nothing left
    expect(h.present.n).toBe(0);
    h = redo(redo(h));
    expect(h.present.n).toBe(3);
  });

  it('starts a new step after undo, seal or a new action, and drops the redo branch', () => {
    let h = commit(createHistory({ n: 0 }), { n: 1 }, 'k');
    h = seal(h);
    h = commit(h, { n: 2 }, 'k');
    expect(h.past).toHaveLength(2);
    h = undo(h);
    h = commit(h, { n: 9 });
    expect(h.future).toEqual([]);
  });

  it('applies background changes to every snapshot without adding a step', () => {
    let h = commit(createHistory({ list: [] as number[] }), { list: [1] });
    h = patchAll(h, (s) => ({ list: [...s.list, 42] }));
    expect(h.present.list).toEqual([1, 42]);
    expect(undo(h).present.list).toEqual([42]);
  });
});

describe('saving signatures', () => {
  // 4×2 PNG: a tiny opaque signature image.
  async function tinyPng(): Promise<Uint8Array> {
    const { deflateSync } = await import('node:zlib');
    const width = 4;
    const height = 2;
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw.set([20, 30, 90, 255], y * (width * 4 + 1) + 1 + x * 4);
    const crcTable = Array.from({ length: 256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
    const crc32 = (buf: Buffer) => {
      let c = 0xffffffff;
      for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(body));
      return Buffer.concat([len, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6; // RGBA
    return new Uint8Array(
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0)),
      ]),
    );
  }

  async function geometriesOf(bytes: Uint8Array) {
    const pdf = await openWithPdfjs(bytes);
    const result: PageGeometry[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      result.push({ view: page.view as PdfRect, rotation: page.rotate });
    }
    return result;
  }

  /** Transform matrices of the images painted on a page. */
  async function paintedImages(bytes: Uint8Array, pageNumber: number) {
    const pdf = await openWithPdfjs(bytes);
    const ops = await (await pdf.getPage(pageNumber)).getOperatorList();
    const matrices: number[][] = [];
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack: number[][] = [];
    const mul = (m: number[], n: number[]) => [
      n[0]! * m[0]! + n[1]! * m[2]!,
      n[0]! * m[1]! + n[1]! * m[3]!,
      n[2]! * m[0]! + n[3]! * m[2]!,
      n[2]! * m[1]! + n[3]! * m[3]!,
      n[4]! * m[0]! + n[5]! * m[2]! + m[4]!,
      n[4]! * m[1]! + n[5]! * m[3]! + m[5]!,
    ];
    ops.fnArray.forEach((fn, i) => {
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
      else if (fn === OPS.transform) ctm = mul(ctm, ops.argsArray[i] as number[]);
      else if (fn === OPS.paintImageXObject) matrices.push(ctm);
    });
    return matrices;
  }

  it('draws each signature where it was placed, upright, with the date next to it', async () => {
    const original = fixture('rotated.pdf');
    const geometries = await geometriesOf(original);
    const onScreen = { left: 100, top: 200, width: 160, height: 40 };
    const placed: PlacedSignature[] = [0, 1].map((pageIndex) => ({
      id: `s${pageIndex}`,
      assetId: 'a',
      pageIndex,
      rect: screenToPdfRect(onScreen, geometries[pageIndex]!, 1),
    }));
    const bytes = await savePdf(original, {
      signatures: { placed, images: { a: await tinyPng() }, geometries, date: '24/09/2026', signedFieldNames: [] },
      fontBytes: fieldFont(),
    });

    // Page 1 (no rotation): the image fills the rectangle, bottom-left at (100, 842 - 240).
    const [m1] = await paintedImages(bytes, 1);
    expect(m1![0]).toBeCloseTo(160);
    expect(m1![3]).toBeCloseTo(40);
    expect(m1![4]).toBeCloseTo(100);
    expect(m1![5]).toBeCloseTo(841.89 - 240, 1);

    // Page 2 (rotated 90°): the image is rotated with the page so it reads upright.
    const [m2] = await paintedImages(bytes, 2);
    expect(m2![0]).toBeCloseTo(0);
    expect(m2![1]).toBeCloseTo(160);
    expect(m2![2]).toBeCloseTo(-40);
    expect(m2![3]).toBeCloseTo(0);

    expect(await pageText(bytes, 1)).toContain('24/09/2026');
  });

  it('removes the empty signature field that received the signature', async () => {
    const original = fixture('acroform.pdf');
    const geometries = await geometriesOf(original);
    const signature: PlacedSignature = { id: 's', assetId: 'a', pageIndex: 1, rect: [160, 620, 400, 680] };
    const bytes = await savePdf(original, {
      signatures: { placed: [signature], images: { a: await tinyPng() }, geometries, date: null, signedFieldNames: ['firma'] },
    });
    const form = (await PDFDocument.load(bytes)).getForm();
    expect(form.getFields().map((f) => f.getName())).not.toContain('firma');
    expect(form.getFields().length).toBeGreaterThan(5); // the other fields are still there
    expect(await paintedImages(bytes, 2)).toHaveLength(1);
  });
});
