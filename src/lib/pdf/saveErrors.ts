// Kept apart from save.ts so the UI can use it without loading pdf-lib.
export type SaveErrorCode = 'encrypted' | 'unsupported-characters' | 'unknown';

export class PdfSaveError extends Error {
  readonly code: SaveErrorCode;
  /** For 'unsupported-characters': the characters the font cannot draw. */
  readonly characters: string[];

  constructor(code: SaveErrorCode, options?: { cause?: unknown; characters?: string[] }) {
    super(`PDF save failed: ${code}`, options);
    this.name = 'PdfSaveError';
    this.code = code;
    this.characters = options?.characters ?? [];
  }
}
