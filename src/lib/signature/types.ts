import type { PdfRect } from '../pdf/coords';

/** A signature image created by the user (drawn, uploaded or typed). */
export interface SignatureAsset {
  id: string;
  /** PNG with transparent background, cropped to the signature. */
  png: Uint8Array;
  /** Width / height of the image. */
  aspect: number;
  source: 'drawn' | 'image' | 'typed';
}

/** A signature placed on a page. */
export interface PlacedSignature {
  id: string;
  assetId: string;
  pageIndex: number;
  /** PDF user space; the image stays upright as the page is displayed. */
  rect: PdfRect;
  /** The form field it was placed into (AcroForm or detected), if any. */
  fieldId?: string;
}
