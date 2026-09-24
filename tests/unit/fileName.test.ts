import { describe, expect, it } from 'vitest';
import { buildOutputFileName } from '../../src/lib/pdf/fileName';

describe('buildOutputFileName', () => {
  it('adds the suffix before the extension', () => {
    expect(buildOutputFileName('contratto.pdf', 'modified')).toBe('contratto_modificato.pdf');
    expect(buildOutputFileName('contratto.pdf', 'signed')).toBe('contratto_firmato.pdf');
  });

  it('handles upper-case or missing extensions', () => {
    expect(buildOutputFileName('SCAN.PDF', 'modified')).toBe('SCAN_modificato.pdf');
    expect(buildOutputFileName('modulo', 'modified')).toBe('modulo_modificato.pdf');
  });

  it('keeps dots and spaces inside the name', () => {
    expect(buildOutputFileName('Modulo v1.2 finale.pdf', 'signed')).toBe('Modulo v1.2 finale_firmato.pdf');
  });

  it('does not repeat the same suffix', () => {
    expect(buildOutputFileName('contratto_modificato.pdf', 'modified')).toBe('contratto_modificato.pdf');
    expect(buildOutputFileName('contratto_modificato.pdf', 'signed')).toBe('contratto_modificato_firmato.pdf');
  });

  it('falls back to a default name', () => {
    expect(buildOutputFileName('.pdf', 'modified')).toBe('documento_modificato.pdf');
    expect(buildOutputFileName('  ', 'signed')).toBe('documento_firmato.pdf');
  });
});
