import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFSignature, type PDFFont } from 'pdf-lib';
import type { FormField, FormValues } from '../forms/types';
import type { PlacedSignature } from '../signature/types';
import type { PageGeometry } from './coords';
import { fillAcroForm, removeFieldAndWidgets } from './fillForm';
import { writeFlatFields } from './flatFields';
import { drawSignatures } from './signatures';
import { PdfSaveError } from './saveErrors';

export { PdfSaveError, type SaveErrorCode } from './saveErrors';

export interface SaveOptions {
  form?: {
    fields: FormField[];
    values: FormValues;
    initialValues: FormValues;
    flatten: boolean;
    /** Page box and rotation of every page, as shown on screen. */
    geometries: PageGeometry[];
  };
  signatures?: {
    placed: PlacedSignature[];
    /** PNG bytes by asset id. */
    images: Record<string, Uint8Array>;
    geometries: PageGeometry[];
    /** Date written next to each signature, or null. */
    date: string | null;
    /** AcroForm signature fields that received a signature: removed from the form. */
    signedFieldNames: string[];
  };
  /** TrueType font used for field values and dates (full Unicode coverage). Required with `form` or a date. */
  fontBytes?: Uint8Array;
}

/**
 * Produces the bytes of the file to download. The input array is never modified.
 */
export async function savePdf(original: Uint8Array, options: SaveOptions = {}): Promise<Uint8Array> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(original, { ignoreEncryption: true, updateMetadata: false });
  } catch (error) {
    throw new PdfSaveError('unknown', { cause: error });
  }
  // Files with only an owner password open fine in the viewer, but pdf-lib
  // cannot decrypt them, so rewriting would produce a broken file.
  if (doc.isEncrypted) throw new PdfSaveError('encrypted');

  const { form, fontBytes, signatures } = options;
  let font: PDFFont | undefined;
  const needsFont = (form && form.fields.length > 0) || !!signatures?.date;
  if (needsFont) {
    if (!fontBytes) throw new PdfSaveError('unknown', { cause: new Error('Missing field font') });
    if (form) {
      const missing = unsupportedCharacters(form.values, fontBytes);
      if (missing.length) throw new PdfSaveError('unsupported-characters', { characters: missing });
    }
    doc.registerFontkit(fontkit);
    font = await doc.embedFont(fontBytes, { subset: true });
  }

  if (form && form.fields.length && font) {
    const acroFields = form.fields.filter((f) => f.source === 'acroform');
    const flatFields = form.fields.filter((f) => f.source !== 'acroform');
    if (acroFields.length) fillAcroForm(doc, font, { ...form, fields: acroFields });
    if (flatFields.length) {
      writeFlatFields(doc, font, {
        fields: flatFields,
        values: form.values,
        initialValues: form.initialValues,
        geometries: form.geometries,
        flatten: form.flatten,
      });
    }
  }

  if (signatures?.placed.length) {
    // An empty signature field that now has a signature on it is removed.
    for (const name of signatures.signedFieldNames) {
      const field = doc.getForm().getFieldMaybe(name);
      if (field instanceof PDFSignature) removeFieldAndWidgets(doc, field);
    }
    await drawSignatures(doc, { ...signatures, signatures: signatures.placed, font });
  }

  // Appearances are generated above with our font; pdf-lib's own pass would use Helvetica.
  return doc.save({ updateFieldAppearances: false });
}

/**
 * Characters typed by the user that the font has no glyph for. They would
 * silently disappear from the PDF, so saving stops and lists them instead.
 */
export function unsupportedCharacters(values: FormValues, fontBytes: Uint8Array): string[] {
  const font = fontkit.create(fontBytes);
  const missing = new Set<string>();
  for (const value of Object.values(values)) {
    if (typeof value !== 'string') continue;
    for (const char of value) {
      if (/\s/.test(char)) continue;
      if (!font.hasGlyphForCodePoint(char.codePointAt(0)!)) missing.add(char);
    }
  }
  return [...missing];
}
