import { PDFDocument, PDFTextField } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { readForm } from '../../src/features/forms/readForm';
import type { PageGeometry, PdfRect } from '../../src/lib/pdf/coords';
import type { FormValues } from '../../src/lib/forms/types';
import { PdfSaveError, savePdf } from '../../src/lib/pdf/save';
import { fieldFont, fixture, openWithPdfjs, pageText } from './helpers';

async function read(name: string) {
  const pdf = await openWithPdfjs(fixture(name));
  const geometries: PageGeometry[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    geometries.push({ view: page.view as PdfRect, rotation: page.rotate });
  }
  return { ...(await readForm(pdf, geometries)), geometries };
}

describe('readForm (AcroForm)', () => {
  it('finds every editable field with its type, position and value', async () => {
    const form = await read('acroform.pdf');
    const summary = form.fields.map((f) => [f.acroName, f.kind, f.pageIndex]);
    expect(summary).toEqual([
      ['nome', 'text', 0],
      ['cognome', 'text', 0],
      ['codice_fiscale', 'text', 0],
      ['data_nascita', 'date', 0],
      ['email', 'text', 0],
      ['provincia', 'dropdown', 0],
      ['tipo', 'radio', 0],
      ['tipo', 'radio', 0],
      ['note', 'multiline', 0],
      // codice_pratica is read-only text: left to pdf.js, not in the list
      ['privacy', 'checkbox', 0],
      ['luogo', 'text', 1],
      ['data', 'date', 1],
      ['firma', 'signature', 1],
    ]);

    const nome = form.fields[0]!;
    expect(nome.rect.map(Math.round)).toEqual([160, 724, 321, 745]);
    expect(nome.label).toBe('Nome');
    expect(form.fields.find((f) => f.acroName === 'codice_fiscale')?.maxLength).toBe(16);
    expect(form.fields.find((f) => f.acroName === 'provincia')?.options?.map((o) => o.value)).toEqual([
      'Milano',
      'Roma',
      'Torino',
      'Napoli',
    ]);
    expect(form.fields.filter((f) => f.kind === 'radio').map((f) => f.onValue)).toEqual(['ordinaria', 'ridotta']);

    expect(form.initialValues).toMatchObject({ email: 'mario.rossi@example.com', privacy: false, tipo: '', nome: '' });
    expect(form.xfa).toBe('none');
  });

  it('recognises XFA forms', async () => {
    expect((await read('xfa-hybrid.pdf')).xfa).toBe('hybrid');
    expect((await read('xfa-pure.pdf')).xfa).toBe('pure');
    expect((await read('simple.pdf')).xfa).toBe('none');
  });
});

describe('savePdf with form values', () => {
  const values: FormValues = {
    nome: 'Łukasz',
    cognome: 'Dvořák Жуков',
    codice_fiscale: 'RSSMRA80A01F205XEXTRA', // longer than maxLength 16
    data_nascita: '01/01/1980',
    email: 'mario.rossi@example.com',
    provincia: 'Torino',
    tipo: 'ridotta',
    note: 'Prima riga\nSeconda riga con àèìòù',
    privacy: true,
    luogo: 'Milano',
    data: '24/09/2026',
    firma: '',
  };

  async function fill(flatten: boolean, file = 'acroform.pdf') {
    const original = fixture(file);
    const form = await read(file);
    const bytes = await savePdf(original, {
      form: { fields: form.fields, values, initialValues: form.initialValues, flatten, geometries: form.geometries },
      fontBytes: fieldFont(),
    });
    return { bytes, original };
  }

  it('flattens: values become page content and no field is left', async () => {
    const { bytes } = await fill(true);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getForm().getFields()).toHaveLength(0);

    const text = await pageText(bytes, 1);
    for (const expected of ['Łukasz', 'Dvořák Жуков', 'RSSMRA80A01F205X', 'Torino', 'àèìòù', 'PR-2026-001']) {
      expect(text).toContain(expected);
    }
    expect(text).not.toContain('EXTRA');
    expect(await pageText(bytes, 2)).toContain('Milano');
    // Nothing editable remains for pdf.js either.
    const pdf = await openWithPdfjs(bytes);
    const widgets = (await (await pdf.getPage(1)).getAnnotations()).filter((a) => a.subtype === 'Widget');
    expect(widgets).toHaveLength(0);
  });

  it('keeps the fields editable, with the values, when not flattening', async () => {
    const { bytes } = await fill(false);
    const form = (await PDFDocument.load(bytes)).getForm();
    expect(form.getTextField('nome').getText()).toBe('Łukasz');
    expect(form.getTextField('codice_fiscale').getText()).toBe('RSSMRA80A01F205X');
    expect(form.getCheckBox('privacy').isChecked()).toBe(true);
    expect(form.getRadioGroup('tipo').getSelected()).toBe('ridotta');
    expect(form.getDropdown('provincia').getSelected()).toEqual(['Torino']);
    expect(form.getFields().some((f) => f.getName() === 'firma')).toBe(true);
  });

  it('leaves untouched fields as they were', async () => {
    const { bytes, original } = await fill(false);
    const before = (await PDFDocument.load(original)).getForm().getTextField('email');
    const after = (await PDFDocument.load(bytes)).getForm().getField('email') as PDFTextField;
    expect(after.getText()).toBe(before.getText());
    expect(after.acroField.getDefaultAppearance()).toBe(before.acroField.getDefaultAppearance());
  });

  it('refuses characters the font cannot draw instead of dropping them', async () => {
    const form = await read('acroform.pdf');
    const error = await savePdf(fixture('acroform.pdf'), {
      form: { fields: form.fields, values: { ...values, cognome: 'Nguyễn Văn Ơn' }, initialValues: form.initialValues, flatten: true, geometries: form.geometries },
      fontBytes: fieldFont(),
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PdfSaveError);
    expect((error as PdfSaveError).code).toBe('unsupported-characters');
    expect((error as PdfSaveError).characters).toEqual(['ễ', 'Ơ']);
  });

  it('drops the XFA packet of hybrid forms so every reader shows the new values', async () => {
    const original = fixture('xfa-hybrid.pdf');
    const form = await read('xfa-hybrid.pdf');
    const bytes = await savePdf(original, {
      form: { fields: form.fields, values: { nome: 'Mario' }, initialValues: form.initialValues, flatten: false, geometries: form.geometries },
      fontBytes: fieldFont(),
    });
    const { info } = (await (await openWithPdfjs(bytes)).getMetadata()) as { info: { IsXFAPresent?: boolean } };
    expect(info.IsXFAPresent).toBe(false);
  });
});
