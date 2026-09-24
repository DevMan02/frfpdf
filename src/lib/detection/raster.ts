/**
 * "Strada A": finds form lines and boxes in a scanned page by looking at the
 * pixels. No AI and no OCR: long thin runs of dark pixels are lines, small
 * hollow squares are checkboxes, and counting dark pixels tells whether an
 * area is empty. All coordinates here are image pixels (origin top-left).
 */

export interface Bitmap {
  width: number;
  height: number;
  /** 1 = ink, 0 = paper; row by row. */
  ink: Uint8Array;
}

export interface PxHLine {
  x1: number;
  x2: number;
  y: number;
}
export interface PxVLine {
  y1: number;
  y2: number;
  x: number;
}
export interface PxBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Printed form lines are often thin and light grey in scans: they are looked for with a lighter threshold. */
export const LINE_THRESHOLD = 205;

/**
 * RGBA pixels (as from canvas getImageData) to ink/paper. Without an explicit
 * threshold it is chosen with Otsu's method, clamped so light-grey shading
 * stays paper.
 */
export function binarize(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  fixedThreshold?: number,
): Bitmap {
  const n = width * height;
  const gray = new Uint8Array(n);
  const histogram = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const alpha = rgba[o + 3]! / 255;
    // Transparent pixels count as white paper.
    const l = 0.299 * rgba[o]! + 0.587 * rgba[o + 1]! + 0.114 * rgba[o + 2]!;
    const v = Math.round(l * alpha + 255 * (1 - alpha));
    gray[i] = v;
    histogram[v]!++;
  }
  const threshold = fixedThreshold ?? Math.min(170, Math.max(90, otsu(histogram, n)));
  const ink = new Uint8Array(n);
  for (let i = 0; i < n; i++) ink[i] = gray[i]! < threshold ? 1 : 0;
  return { width, height, ink };
}

function otsu(histogram: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i]!;
  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    weightB += histogram[t]!;
    if (!weightB) continue;
    const weightF = total - weightB;
    if (!weightF) break;
    sumB += t * histogram[t]!;
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

export interface LineOptions {
  /** Shortest line to keep, in pixels. */
  minLength: number;
  /** Thicker groups are filled areas (logos, bars), not lines. */
  maxThickness: number;
  /** Paper gaps tolerated inside a line (scan noise), in pixels. */
  maxGap?: number;
}

interface Run {
  a: number;
  b: number;
}

/** Runs of ink along one row (or column), bridging small gaps. */
function runsOf(get: (i: number) => number, length: number, minLength: number, maxGap: number): Run[] {
  const runs: Run[] = [];
  let start = -1;
  let lastInk = -1;
  for (let i = 0; i <= length; i++) {
    const inked = i < length && get(i) === 1;
    if (inked) {
      if (start < 0) start = i;
      lastInk = i;
    } else if (start >= 0 && i - lastInk > maxGap) {
      if (lastInk - start + 1 >= minLength) runs.push({ a: start, b: lastInk });
      start = -1;
    }
  }
  if (start >= 0 && lastInk - start + 1 >= minLength) runs.push({ a: start, b: lastInk });
  return runs;
}

interface Group {
  a: number;
  b: number;
  first: number;
  last: number;
}

/** Stacks runs of consecutive rows into lines; drops groups that are too thick. */
function groupRuns(rows: Run[][], maxThickness: number): Group[] {
  const done: Group[] = [];
  let active: Group[] = [];
  rows.forEach((runs, index) => {
    const next: Group[] = [];
    for (const run of runs) {
      const match = active.find(
        (g) => Math.min(g.b, run.b) - Math.max(g.a, run.a) >= 0.6 * Math.min(g.b - g.a, run.b - run.a),
      );
      if (match) {
        active = active.filter((g) => g !== match);
        next.push({ a: Math.min(match.a, run.a), b: Math.max(match.b, run.b), first: match.first, last: index });
      } else {
        next.push({ a: run.a, b: run.b, first: index, last: index });
      }
    }
    done.push(...active);
    active = next;
  });
  done.push(...active);
  return done.filter((g) => g.last - g.first + 1 <= maxThickness);
}

export function findLines(bmp: Bitmap, options: LineOptions): { h: PxHLine[]; v: PxVLine[] } {
  const { width, height, ink } = bmp;
  const maxGap = options.maxGap ?? 2;

  const rowRuns: Run[][] = [];
  for (let y = 0; y < height; y++) {
    const offset = y * width;
    rowRuns.push(runsOf((x) => ink[offset + x]!, width, options.minLength, maxGap));
  }
  const colRuns: Run[][] = [];
  for (let x = 0; x < width; x++) {
    colRuns.push(runsOf((y) => ink[y * width + x]!, height, options.minLength, maxGap));
  }

  return {
    h: groupRuns(rowRuns, options.maxThickness).map((g) => ({ x1: g.a, x2: g.b + 1, y: (g.first + g.last + 1) / 2 })),
    v: groupRuns(colRuns, options.maxThickness).map((g) => ({ y1: g.a, y2: g.b + 1, x: (g.first + g.last + 1) / 2 })),
  };
}

/** Share of ink pixels inside a box (0..1). */
export function inkRatio(bmp: Bitmap, box: PxBox): number {
  const x1 = Math.max(0, Math.floor(box.x1));
  const y1 = Math.max(0, Math.floor(box.y1));
  const x2 = Math.min(bmp.width, Math.ceil(box.x2));
  const y2 = Math.min(bmp.height, Math.ceil(box.y2));
  if (x2 <= x1 || y2 <= y1) return 0;
  let count = 0;
  for (let y = y1; y < y2; y++) {
    const offset = y * bmp.width;
    for (let x = x1; x < x2; x++) count += bmp.ink[offset + x]!;
  }
  return count / ((x2 - x1) * (y2 - y1));
}

/**
 * true when something is written inside the box. The box is scanned in narrow
 * vertical strips, so one short word in a long empty line still counts.
 */
export function hasWriting(bmp: Bitmap, box: PxBox, stripWidth: number, threshold = 0.04): boolean {
  const width = box.x2 - box.x1;
  if (width <= 0 || box.y2 <= box.y1) return false;
  if (width <= stripWidth) return inkRatio(bmp, box) > threshold;
  for (let x = box.x1; x < box.x2; x += stripWidth / 2) {
    const strip = { x1: x, y1: box.y1, x2: Math.min(box.x2, x + stripWidth), y2: box.y2 };
    if (inkRatio(bmp, strip) > threshold) return true;
  }
  return false;
}

/** Smallest box around the ink inside `box` (rows/columns with at least 2 ink pixels), or null. */
export function inkBounds(bmp: Bitmap, box: PxBox): PxBox | null {
  const x1 = Math.max(0, Math.floor(box.x1));
  const y1 = Math.max(0, Math.floor(box.y1));
  const x2 = Math.min(bmp.width, Math.ceil(box.x2));
  const y2 = Math.min(bmp.height, Math.ceil(box.y2));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = y1; y < y2; y++) {
    let count = 0;
    const offset = y * bmp.width;
    for (let x = x1; x < x2; x++) count += bmp.ink[offset + x]!;
    if (count >= 2) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (minY === Infinity) return null;
  for (let x = x1; x < x2; x++) {
    let count = 0;
    for (let y = y1; y < y2; y++) count += bmp.ink[y * bmp.width + x]!;
    if (count >= 2) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }
  if (minX === Infinity) return null;
  return { x1: minX, y1: minY, x2: maxX + 1, y2: maxY + 1 };
}

export interface BoxOptions {
  minSize: number;
  maxSize: number;
}

/**
 * Empty square boxes (checkboxes): connected ink shapes that are square,
 * dark along the border, dark in the corners and empty inside.
 */
export function findBoxes(bmp: Bitmap, options: BoxOptions): PxBox[] {
  const { width, height, ink } = bmp;
  const labels = new Int32Array(width * height);
  const boxes: PxBox[] = [];
  const queue = new Int32Array(width * height);
  let next = 0;

  for (let start = 0; start < ink.length; start++) {
    if (!ink[start] || labels[start]) continue;
    next++;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = next;
    let x1 = width;
    let y1 = height;
    let x2 = 0;
    let y2 = 0;
    let tooBig = false;
    while (head < tail) {
      const p = queue[head++]!;
      const x = p % width;
      const y = (p - x) / width;
      if (x < x1) x1 = x;
      if (x > x2) x2 = x;
      if (y < y1) y1 = y;
      if (y > y2) y2 = y;
      if (x2 - x1 > options.maxSize * 1.5 || y2 - y1 > options.maxSize * 1.5) tooBig = true;
      // 8-connectivity
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const q = ny * width + nx;
          if (ink[q] && !labels[q]) {
            labels[q] = next;
            queue[tail++] = q;
          }
        }
      }
    }
    if (tooBig) continue;

    const w = x2 - x1 + 1;
    const h = y2 - y1 + 1;
    if (w < options.minSize || h < options.minSize || w > options.maxSize || h > options.maxSize) continue;
    if (Math.max(w, h) / Math.min(w, h) > 1.3) continue;
    const box = { x1, y1, x2: x2 + 1, y2: y2 + 1 };
    const band = Math.max(1, Math.round(Math.min(w, h) * 0.12));
    const edges = [
      { x1, y1, x2: x2 + 1, y2: y1 + band },
      { x1, y1: y2 + 1 - band, x2: x2 + 1, y2: y2 + 1 },
      { x1, y1, x2: x1 + band, y2: y2 + 1 },
      { x1: x2 + 1 - band, y1, x2: x2 + 1, y2: y2 + 1 },
    ];
    if (edges.some((e) => inkRatio(bmp, e) < 0.6)) continue;
    const m = Math.round(Math.min(w, h) * 0.25);
    if (inkRatio(bmp, { x1: x1 + m, y1: y1 + m, x2: x2 + 1 - m, y2: y2 + 1 - m }) > 0.08) continue;
    boxes.push(box);
  }
  return boxes;
}
