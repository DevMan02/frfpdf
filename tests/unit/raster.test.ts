import { describe, expect, it } from 'vitest';
import { binarize, findBoxes, findLines, hasWriting, inkBands, inkRatio, type Bitmap } from '../../src/lib/detection/raster';

function blank(width: number, height: number): Bitmap {
  return { width, height, ink: new Uint8Array(width * height) };
}

function fill(bmp: Bitmap, x1: number, y1: number, x2: number, y2: number) {
  for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) bmp.ink[y * bmp.width + x] = 1;
}

function outline(bmp: Bitmap, x1: number, y1: number, x2: number, y2: number, t = 2) {
  fill(bmp, x1, y1, x2, y1 + t);
  fill(bmp, x1, y2 - t, x2, y2);
  fill(bmp, x1, y1, x1 + t, y2);
  fill(bmp, x2 - t, y1, x2, y2);
}

describe('binarize', () => {
  it('turns dark pixels into ink and keeps light grey shading as paper', () => {
    const rgba = new Uint8Array([20, 20, 20, 255, 250, 250, 250, 255, 200, 200, 200, 255, 0, 0, 0, 0]);
    expect(Array.from(binarize(rgba, 4, 1).ink)).toEqual([1, 0, 0, 0]);
  });
});

describe('findLines', () => {
  it('finds thin lines, bridges small gaps and ignores thick blocks and short dashes', () => {
    const bmp = blank(200, 100);
    fill(bmp, 10, 20, 190, 22); // line
    fill(bmp, 10, 40, 60, 42); // line with a 2 px gap…
    fill(bmp, 62, 40, 120, 42);
    fill(bmp, 10, 60, 190, 80); // thick block (a logo or a bar)
    fill(bmp, 10, 90, 20, 92); // too short
    fill(bmp, 150, 30, 152, 95); // vertical line
    const { h, v } = findLines(bmp, { minLength: 30, maxThickness: 4 });
    expect(h.map((l) => [l.x1, l.x2, l.y])).toEqual([
      [10, 190, 21],
      [10, 120, 41],
    ]);
    expect(v.map((l) => [l.y1, l.y2, l.x])).toEqual([[30, 95, 151]]);
  });
});

describe('findBoxes', () => {
  it('keeps hollow squares, rejects filled squares, rings and long rectangles', () => {
    const bmp = blank(300, 60);
    outline(bmp, 10, 10, 30, 30); // checkbox
    fill(bmp, 50, 10, 70, 30); // filled square
    outline(bmp, 90, 10, 150, 30); // wide rectangle
    // A ring (like the letter O): no ink in the corners.
    for (let y = 10; y < 30; y++) {
      for (let x = 170; x < 190; x++) {
        const d = Math.hypot(x - 179.5, y - 19.5);
        if (d > 7.5 && d < 10) bmp.ink[y * bmp.width + x] = 1;
      }
    }
    expect(findBoxes(bmp, { minSize: 10, maxSize: 40 })).toEqual([{ x1: 10, y1: 10, x2: 30, y2: 30 }]);
  });
});

describe('inkBands', () => {
  it('splits a caption from the value written below it', () => {
    const bmp = blank(100, 60);
    fill(bmp, 5, 4, 40, 9); // caption
    fill(bmp, 5, 25, 80, 40); // value
    expect(inkBands(bmp, { x1: 0, y1: 0, x2: 100, y2: 60 }, 3)).toEqual([
      { y1: 4, y2: 9 },
      { y1: 25, y2: 40 },
    ]);
    expect(inkBands(blank(10, 10), { x1: 0, y1: 0, x2: 10, y2: 10 }, 3)).toEqual([]);
  });
});

describe('hasWriting', () => {
  it('notices one short word in a long empty box', () => {
    const bmp = blank(400, 20);
    fill(bmp, 10, 5, 30, 15);
    expect(inkRatio(bmp, { x1: 0, y1: 0, x2: 400, y2: 20 })).toBeLessThan(0.04);
    expect(hasWriting(bmp, { x1: 0, y1: 0, x2: 400, y2: 20 }, 20)).toBe(true);
    expect(hasWriting(bmp, { x1: 100, y1: 0, x2: 400, y2: 20 }, 20)).toBe(false);
  });
});

describe('inkRatio', () => {
  it('measures how much of an area is written on', () => {
    const bmp = blank(10, 10);
    fill(bmp, 0, 0, 5, 10);
    expect(inkRatio(bmp, { x1: 0, y1: 0, x2: 10, y2: 10 })).toBe(0.5);
    expect(inkRatio(bmp, { x1: 5, y1: 0, x2: 10, y2: 10 })).toBe(0);
    expect(inkRatio(bmp, { x1: -5, y1: -5, x2: 2, y2: 2 })).toBe(1);
  });
});
