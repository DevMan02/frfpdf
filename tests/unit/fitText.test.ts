import { describe, expect, it } from 'vitest';
import { fitFontSize, wrapLines } from '../../src/lib/pdf/fitText';

// Every character is half the font size wide.
const measure = (text: string, size: number) => text.length * size * 0.5;

describe('fitFontSize (single line)', () => {
  it('uses the default size when the text fits', () => {
    expect(fitFontSize('Mario', measure, { width: 200, height: 20 })).toBe(12);
  });

  it('never exceeds what the height allows', () => {
    const size = fitFontSize('Mario', measure, { width: 400, height: 10 });
    expect(size * 1.15).toBeLessThanOrEqual(10 - 4);
  });

  it('respects the size requested by the form', () => {
    expect(fitFontSize('Mario', measure, { width: 200, height: 20, maxSize: 9 })).toBe(9);
  });

  it('shrinks long text so it stays inside the box', () => {
    const text = 'Via Giuseppe Garibaldi 123, Milano';
    const size = fitFontSize(text, measure, { width: 100, height: 20 });
    expect(size).toBeLessThan(12);
    expect(measure(text, size)).toBeLessThanOrEqual(100 - 4);
  });

  it('stops at the minimum size', () => {
    expect(fitFontSize('x'.repeat(500), measure, { width: 50, height: 20 })).toBe(4);
  });
});

describe('fitFontSize (multi-line)', () => {
  it('wraps before shrinking', () => {
    const text = 'uno due tre quattro cinque sei sette otto nove dieci';
    const size = fitFontSize(text, measure, { width: 100, height: 100, multiline: true });
    expect(size).toBe(12);
    const lines = wrapLines(text, measure, size, 96);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.length * size * 1.15).toBeLessThanOrEqual(96);
  });

  it('shrinks when the wrapped text is too tall', () => {
    const text = 'parola '.repeat(60).trim();
    const size = fitFontSize(text, measure, { width: 100, height: 60, multiline: true });
    expect(size).toBeLessThan(12);
    expect(wrapLines(text, measure, size, 96).length * size * 1.15).toBeLessThanOrEqual(56);
  });
});

describe('wrapLines', () => {
  it('keeps explicit line breaks and breaks very long words', () => {
    expect(wrapLines('a\nb', measure, 10, 100)).toEqual(['a', 'b']);
    expect(wrapLines('abcdefghij', measure, 10, 20)).toEqual(['abcd', 'efgh', 'ij']);
  });
});
