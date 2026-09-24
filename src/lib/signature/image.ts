/**
 * Pixel operations on signature images (RGBA, row by row, as from canvas
 * getImageData). Pure functions: no canvas needed, easy to test.
 */

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function luminance(data: Uint8ClampedArray, o: number): number {
  return 0.299 * data[o]! + 0.587 * data[o + 1]! + 0.114 * data[o + 2]!;
}

/**
 * Makes paper transparent in a photo or scan of a signature.
 * Pixels lighter than `threshold` (0-255) become fully transparent; darker
 * ones stay opaque, with a soft ramp of `softness` levels so edges are not
 * jagged. Ink keeps its own colour.
 */
export function removeBackground(image: RgbaImage, threshold: number, softness = 24): RgbaImage {
  const data = new Uint8ClampedArray(image.data);
  const start = threshold - softness;
  for (let o = 0; o < data.length; o += 4) {
    const l = luminance(data, o);
    let alpha: number;
    if (l >= threshold) alpha = 0;
    else if (l <= start) alpha = 1;
    else alpha = (threshold - l) / softness;
    data[o + 3] = Math.round(data[o + 3]! * alpha);
  }
  return { width: image.width, height: image.height, data };
}

/**
 * A threshold that separates ink from paper for most photos: halfway
 * between the typical paper brightness (a high percentile) and the ink.
 */
export function suggestThreshold(image: RgbaImage): number {
  const histogram = new Uint32Array(256);
  const n = image.width * image.height;
  for (let o = 0; o < image.data.length; o += 4) histogram[Math.round(luminance(image.data, o))]!++;
  const percentile = (p: number) => {
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += histogram[v]!;
      if (seen >= p * n) return v;
    }
    return 255;
  };
  const paper = percentile(0.6);
  const ink = percentile(0.02);
  return Math.max(60, Math.min(245, Math.round((paper + ink) / 2 + (paper - ink) * 0.2)));
}

/** Smallest box containing pixels with alpha above `minAlpha`, plus a margin; null if empty. */
export function contentBounds(image: RgbaImage, minAlpha = 16, margin = 2): PixelBox | null {
  const { width, height, data } = image;
  let x1 = width;
  let y1 = height;
  let x2 = -1;
  let y2 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > minAlpha) {
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
    }
  }
  if (x2 < 0) return null;
  x1 = Math.max(0, x1 - margin);
  y1 = Math.max(0, y1 - margin);
  x2 = Math.min(width - 1, x2 + margin);
  y2 = Math.min(height - 1, y2 + margin);
  return { x: x1, y: y1, width: x2 - x1 + 1, height: y2 - y1 + 1 };
}

/** Copies a region of an image. */
export function crop(image: RgbaImage, box: PixelBox): RgbaImage {
  const data = new Uint8ClampedArray(box.width * box.height * 4);
  for (let y = 0; y < box.height; y++) {
    const from = ((box.y + y) * image.width + box.x) * 4;
    data.set(image.data.subarray(from, from + box.width * 4), y * box.width * 4);
  }
  return { width: box.width, height: box.height, data };
}
