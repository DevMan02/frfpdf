import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { PdfSaveError, savePdf } from '../../src/lib/pdf/save';
import { fixture } from './helpers';

describe('savePdf (no edits)', () => {
  it('produces a valid PDF with the same pages and sizes', async () => {
    const original = fixture('simple.pdf');
    const saved = await PDFDocument.load(await savePdf(original));
    const source = await PDFDocument.load(original);
    expect(saved.getPageCount()).toBe(3);
    expect(saved.getPages().map((p) => p.getSize())).toEqual(source.getPages().map((p) => p.getSize()));
  });

  it('preserves page rotations', async () => {
    const saved = await PDFDocument.load(await savePdf(fixture('rotated.pdf')));
    expect(saved.getPages().map((p) => p.getRotation().angle)).toEqual([0, 90, 180, 270]);
  });

  it('never modifies the input bytes', async () => {
    const original = fixture('simple.pdf');
    const copy = original.slice();
    await savePdf(original);
    expect(original).toEqual(copy);
  });

  it('reports encrypted documents with a dedicated code', async () => {
    await expect(savePdf(fixture('protected.pdf'))).rejects.toMatchObject({
      name: 'PdfSaveError',
      code: 'encrypted',
    });
  });

  it('reports broken documents as unknown save errors', async () => {
    const error = await savePdf(fixture('not-a-pdf.pdf')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PdfSaveError);
    expect((error as PdfSaveError).code).toBe('unknown');
  });
});
