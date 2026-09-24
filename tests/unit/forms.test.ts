import { describe, expect, it } from 'vitest';
import { humanizeFieldName, inferLabelHint } from '../../src/lib/detection/labels';
import { formatDateIT } from '../../src/lib/forms/date';
import { sortReadingOrder } from '../../src/lib/forms/readingOrder';
import { countAnswerable, countEmpty, type FormField } from '../../src/lib/forms/types';
import type { PageGeometry, PdfRect } from '../../src/lib/pdf/coords';

function field(id: string, rect: PdfRect, extra: Partial<FormField> = {}): FormField {
  return { id, valueKey: id, pageIndex: 0, rect, kind: 'text', label: id, source: 'manual', ...extra };
}

describe('inferLabelHint', () => {
  it.each([
    ['Data di nascita', 'date'],
    ['data_nascita', 'date'],
    ['Nato il', 'date'],
    ['Firma del richiedente', 'signature'],
    ['E-mail', 'email'],
    ['PEC', 'email'],
    ['Codice Fiscale', 'tax-code'],
    ['Cognome', 'name'],
    ['Indirizzo', null],
    ['', null],
  ])('%s -> %s', (label, hint) => {
    expect(inferLabelHint(label)).toBe(hint);
  });

  it('does not match words that only contain the keyword', () => {
    expect(inferLabelHint('Database')).toBeNull();
    expect(inferLabelHint('Nomenclatura')).toBeNull();
  });
});

describe('humanizeFieldName', () => {
  it('turns technical names into labels', () => {
    expect(humanizeFieldName('data_nascita')).toBe('Data nascita');
    expect(humanizeFieldName('form1.page1.codiceFiscale')).toBe('Codice Fiscale');
  });
});

describe('sortReadingOrder', () => {
  const geometry = (): PageGeometry => ({ view: [0, 0, 595, 842], rotation: 0 });

  it('reads rows from the top, left to right, page by page', () => {
    const fields = [
      field('p2', [100, 700, 200, 720], { pageIndex: 1 }),
      field('bottom', [100, 500, 200, 520]),
      field('right', [300, 702, 400, 718]), // same row as "left", slightly misaligned
      field('left', [100, 700, 200, 720]),
    ];
    expect(sortReadingOrder(fields, geometry).map((f) => f.id)).toEqual(['left', 'right', 'bottom', 'p2']);
  });

  it('follows the displayed orientation on rotated pages', () => {
    // Rotated 90°: what is on the left in PDF space is at the top on screen.
    const fields = [field('b', [300, 400, 320, 500]), field('a', [100, 400, 120, 500])];
    expect(sortReadingOrder(fields, () => ({ view: [0, 0, 595, 842], rotation: 90 })).map((f) => f.id)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('empty field counter', () => {
  const fields = [
    field('nome', [0, 0, 1, 1]),
    field('r1', [0, 0, 1, 1], { valueKey: 'tipo', kind: 'radio' }),
    field('r2', [0, 0, 1, 1], { valueKey: 'tipo', kind: 'radio' }),
    field('privacy', [0, 0, 1, 1], { kind: 'checkbox' }),
    field('firma', [0, 0, 1, 1], { kind: 'signature' }),
    field('bloccato', [0, 0, 1, 1], { kind: 'dropdown', readOnly: true }),
  ];

  it('counts a radio group once and ignores checkboxes, signatures and read-only fields', () => {
    expect(countAnswerable(fields)).toBe(2);
    expect(countEmpty(fields, {})).toBe(2);
    expect(countEmpty(fields, { nome: 'Mario' })).toBe(1);
    expect(countEmpty(fields, { nome: 'Mario', tipo: 'ridotta' })).toBe(0);
  });
});

describe('formatDateIT', () => {
  it('uses dd/mm/yyyy', () => {
    expect(formatDateIT(new Date(2026, 8, 4))).toBe('04/09/2026');
  });
});
