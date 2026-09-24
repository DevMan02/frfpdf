import fontkit from '@pdf-lib/fontkit';
import { PDFDocument } from 'pdf-lib';
import type { FormField, FormValues } from '../forms/types';
import { fillAcroForm } from './fillForm';
import { PdfSaveError } from './saveErrors';

export { PdfSaveError, type SaveErrorCode } from './saveErrors';

export interface SaveOptions {
  form?: {
    fields: FormField[];
    values: FormValues;
    initialValues: FormValues;
    flatten: boolean;
  };
  /** TrueType font used for field values (full Unicode coverage). Required with `form`. */
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

  const { form, fontBytes } = options;
  if (form && form.fields.some((f) => f.source === 'acroform')) {
    if (!fontBytes) throw new PdfSaveError('unknown', { cause: new Error('Missing field font') });
    const missing = unsupportedCharacters(form.values, fontBytes);
    if (missing.length) throw new PdfSaveError('unsupported-characters', { characters: missing });
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(fontBytes, { subset: true });
    fillAcroForm(doc, font, form);
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
