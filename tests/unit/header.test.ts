import { describe, expect, it } from 'vitest';
import { hasPdfHeader } from '../../src/lib/pdf/header';
import { fixture } from './helpers';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('hasPdfHeader', () => {
  it('accepts real PDFs', () => {
    expect(hasPdfHeader(fixture('simple.pdf'))).toBe(true);
    expect(hasPdfHeader(fixture('protected.pdf'))).toBe(true);
  });

  it('accepts a header preceded by junk within 1024 bytes', () => {
    expect(hasPdfHeader(bytes(' '.repeat(500) + '%PDF-1.7'))).toBe(true);
  });

  it('rejects files without the marker', () => {
    expect(hasPdfHeader(fixture('not-a-pdf.pdf'))).toBe(false);
    expect(hasPdfHeader(bytes(''))).toBe(false);
    expect(hasPdfHeader(bytes('%PDF'))).toBe(false);
    expect(hasPdfHeader(bytes(' '.repeat(1100) + '%PDF-1.7'))).toBe(false);
  });
});
