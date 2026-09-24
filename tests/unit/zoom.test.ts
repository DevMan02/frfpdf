import { describe, expect, it } from 'vitest';
import { fitWidthZoom, formatZoom, MAX_ZOOM, MIN_ZOOM, PDF_TO_CSS, zoomIn, zoomOut } from '../../src/features/viewer/zoom';

describe('zoom steps', () => {
  it('moves to the neighbouring step', () => {
    expect(zoomIn(1)).toBe(1.1);
    expect(zoomOut(1)).toBe(0.9);
  });

  it('snaps non-step values to the next step in the right direction', () => {
    expect(zoomIn(1.03)).toBe(1.1);
    expect(zoomOut(1.03)).toBe(1);
  });

  it('stops at the limits', () => {
    expect(zoomIn(MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(zoomOut(MIN_ZOOM)).toBe(MIN_ZOOM);
  });
});

describe('fitWidthZoom', () => {
  it('fills the available width with the page', () => {
    const a4Width = 595.28;
    const zoom = fitWidthZoom(800, a4Width);
    expect(a4Width * PDF_TO_CSS * zoom).toBeCloseTo(800);
  });

  it('is clamped and safe on degenerate input', () => {
    expect(fitWidthZoom(10, 595)).toBe(MIN_ZOOM);
    expect(fitWidthZoom(100_000, 595)).toBe(MAX_ZOOM);
    expect(fitWidthZoom(0, 595)).toBe(1);
    expect(fitWidthZoom(800, 0)).toBe(1);
  });
});

describe('formatZoom', () => {
  it('shows a rounded percentage', () => {
    expect(formatZoom(1)).toBe('100%');
    expect(formatZoom(0.6666)).toBe('67%');
  });
});
