import { PDFDocument } from 'pdf-lib';
import { PdfSaveError } from './saveErrors';

export { PdfSaveError, type SaveErrorCode } from './saveErrors';

/**
 * Produces the bytes of the file to download.
 *
 * Phase 1: no edits yet, the document is simply re-serialised through pdf-lib.
 * Later phases will apply form values, signatures and page operations here.
 * The input array is never modified.
 */
export async function savePdf(original: Uint8Array): Promise<Uint8Array> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(original, { ignoreEncryption: true, updateMetadata: false });
  } catch (error) {
    throw new PdfSaveError('unknown', { cause: error });
  }
  // Files with only an owner password open fine in the viewer, but pdf-lib
  // cannot decrypt them, so rewriting would produce a broken file.
  if (doc.isEncrypted) throw new PdfSaveError('encrypted');
  return doc.save();
}
