import { describe, expect, it } from 'vitest';
import { classifyLoadError, PdfLoadError } from '../../src/lib/pdf/loadErrors';

describe('classifyLoadError', () => {
  it('maps pdf.js exceptions by name', () => {
    expect(classifyLoadError({ name: 'PasswordException' })).toBe('password');
    expect(classifyLoadError({ name: 'InvalidPDFException' })).toBe('corrupted');
    expect(classifyLoadError({ name: 'FormatError' })).toBe('corrupted');
  });

  it('keeps the code of our own errors', () => {
    expect(classifyLoadError(new PdfLoadError('not-pdf'))).toBe('not-pdf');
    expect(classifyLoadError(new PdfLoadError('empty'))).toBe('empty');
  });

  it('falls back to unknown', () => {
    expect(classifyLoadError(new Error('boom'))).toBe('unknown');
    expect(classifyLoadError('boom')).toBe('unknown');
    expect(classifyLoadError(null)).toBe('unknown');
  });
});
