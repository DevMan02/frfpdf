import { PDFCheckBox, PDFDocument, PDFTextField } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { detectedToFields } from '../../src/lib/detection/toFields';
import { toTextRuns, type PdfjsTextItem } from '../../src/lib/detection/vector';
import type { FormField, FormValues } from '../../src/lib/forms/types';
import { pdfToScreenRect, screenToPdfRect, type PageGeometry, type PdfRect } from '../../src/lib/pdf/coords';
import { savePdf } from '../../src/lib/pdf/save';
import { detectVectorFixture } from './detectionHelpers';
import { fieldFont, fixture, openWithPdfjs } from './helpers';

async function geometriesOf(bytes: Uint8Array): Promise<PageGeometry[]> {
  const pdf = await openWithPdfjs(bytes);
  const result: PageGeometry[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    result.push({ view: page.view as PdfRect, rotation: page.rotate });
  }
  return result;
}

/** Text runs of a page that read left-to-right on screen, in display coordinates. */
async function screenTexts(bytes: Uint8Array, pageIndex: number) {
  const pdf = await openWithPdfjs(bytes);
  const page = await pdf.getPage(pageIndex + 1);
  const geometry: PageGeometry = { view: page.view as PdfRect, rotation: page.rotate };
  return toTextRuns((await page.getTextContent()).items as PdfjsTextItem[], geometry);
}

function manualField(id: string, pageIndex: number, geometry: PageGeometry, box: { left: number; top: number; width: number; height: number }, kind: FormField['kind'] = 'text'): FormField {
  return {
    id,
    valueKey: id,
    pageIndex,
    rect: screenToPdfRect(box, geometry, 1),
    kind,
    label: id,
    source: 'manual',
    orientation: 'display',
  };
}

async function save(original: Uint8Array, fields: FormField[], values: FormValues, flatten: boolean) {
  return savePdf(original, {
    form: { fields, values, initialValues: {}, flatten, geometries: await geometriesOf(original) },
    fontBytes: fieldFont(),
  });
}

describe('saving detected fields (flattened)', () => {
  it('writes each value inside its field, on the baseline the screen shows', async () => {
    const original = fixture('flat-underscores.pdf');
    const [geometry] = await geometriesOf(original);
    const fields = detectedToFields(0, await detectVectorFixture('flat-underscores.pdf'), geometry!, (i) => `Campo ${i}`);
    const values: FormValues = { [fields[0]!.valueKey]: 'Mario Rossi', [fields[3]!.valueKey]: 'RSSMRA80A01F205X' };

    const bytes = await save(original, fields, values, true);
    expect((await PDFDocument.load(bytes)).getForm().getFields()).toHaveLength(0);

    const runs = await screenTexts(bytes, 0);
    for (const [index, text] of [
      [0, 'Mario Rossi'],
      [3, 'RSSMRA80A01F205X'],
    ] as const) {
      const run = runs.find((r) => r.str === text);
      expect(run, text).toBeDefined();
      const box = pdfToScreenRect(fields[index]!.rect, geometry!, 1);
      expect(run!.x).toBeGreaterThanOrEqual(box.left);
      expect(run!.x + run!.width).toBeLessThanOrEqual(box.left + box.width);
      expect(run!.y).toBeGreaterThan(box.top);
      expect(run!.y).toBeLessThanOrEqual(box.top + box.height);
    }
  });

  it('keeps text upright on rotated pages and draws ticks for checked boxes', async () => {
    const original = fixture('rotated.pdf');
    const geometries = await geometriesOf(original);
    const fields = [1, 2, 3].flatMap((pageIndex) => [
      manualField(`t${pageIndex}`, pageIndex, geometries[pageIndex]!, { left: 100, top: 100, width: 200, height: 18 }),
      manualField(`c${pageIndex}`, pageIndex, geometries[pageIndex]!, { left: 100, top: 150, width: 12, height: 12 }, 'checkbox'),
    ]);
    const values: FormValues = { t1: 'Novanta', t2: 'Centottanta', t3: 'Duecentosettanta', c1: true, c2: true, c3: true };
    const bytes = await save(original, fields, values, true);

    for (const [pageIndex, text] of [
      [1, 'Novanta'],
      [2, 'Centottanta'],
      [3, 'Duecentosettanta'],
    ] as const) {
      // toTextRuns keeps only text that reads horizontally on screen.
      const run = (await screenTexts(bytes, pageIndex)).find((r) => r.str === text);
      expect(run, `page ${pageIndex + 1}`).toBeDefined();
      expect(run!.x).toBeCloseTo(102, 0);
      expect(run!.y).toBeGreaterThan(100);
      expect(run!.y).toBeLessThan(118);
    }
  });

  it('leaves empty fields and signature placeholders out of the page', async () => {
    const original = fixture('simple.pdf');
    const [geometry] = await geometriesOf(original);
    const fields = [
      manualField('vuoto', 0, geometry!, { left: 100, top: 100, width: 200, height: 18 }),
      manualField('firma', 0, geometry!, { left: 100, top: 200, width: 200, height: 40 }, 'signature'),
    ];
    const bytes = await save(original, fields, { vuoto: '', firma: 'x' }, true);
    const runs = await screenTexts(bytes, 0);
    expect(runs.map((r) => r.str)).not.toContain('x');
  });
});

describe('saving detected fields as a fillable form', () => {
  it('turns them into real AcroForm fields named after their labels', async () => {
    const original = fixture('flat-lines.pdf');
    const [geometry] = await geometriesOf(original);
    const fields = detectedToFields(0, await detectVectorFixture('flat-lines.pdf'), geometry!, (i) => `Campo ${i}`);
    const byLabel = (label: string) => fields.find((f) => f.label === label)!;
    const values: FormValues = { [byLabel('Nome').valueKey]: 'Mario', [byLabel('Sì').valueKey]: true };

    const bytes = await save(original, fields, values, false);
    const form = (await PDFDocument.load(bytes)).getForm();
    const names = form.getFields().map((f) => f.getName());
    // Every detected field except the signature placeholder.
    expect(names).toEqual(['si', 'no', 'note', 'nome', 'cognome']);
    expect((form.getField('nome') as PDFTextField).getText()).toBe('Mario');
    expect((form.getField('si') as PDFCheckBox).isChecked()).toBe(true);
    expect(form.getTextField('note').isMultiline()).toBe(true);

    // The new widgets sit where the fields were.
    const pdf = await openWithPdfjs(bytes);
    const widgets = (await (await pdf.getPage(1)).getAnnotations()).filter((a) => a.fieldName === 'nome');
    const rect = widgets[0]!.rect as number[];
    byLabel('Nome').rect.forEach((v, i) => expect(rect[i]!).toBeCloseTo(v, 0));
  });

  it('places widgets correctly on rotated pages', async () => {
    const original = fixture('rotated.pdf');
    const geometries = await geometriesOf(original);
    const field = manualField('ruotato', 1, geometries[1]!, { left: 100, top: 100, width: 200, height: 18 });
    const bytes = await save(original, [field], { ruotato: 'Ciao' }, false);
    const pdf = await openWithPdfjs(bytes);
    const [widget] = (await (await pdf.getPage(2)).getAnnotations()).filter((a) => a.subtype === 'Widget');
    (widget!.rect as number[]).forEach((v, i) => expect(v).toBeCloseTo(field.rect[i]!, 0));
  });
});
