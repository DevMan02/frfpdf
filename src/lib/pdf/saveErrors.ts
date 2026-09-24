// Kept apart from save.ts so the UI can use it without loading pdf-lib.
export type SaveErrorCode = 'encrypted' | 'unknown';

export class PdfSaveError extends Error {
  readonly code: SaveErrorCode;

  constructor(code: SaveErrorCode, options?: { cause?: unknown }) {
    super(`PDF save failed: ${code}`, options);
    this.name = 'PdfSaveError';
    this.code = code;
  }
}
