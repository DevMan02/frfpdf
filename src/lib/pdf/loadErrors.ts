export type LoadErrorCode = 'not-pdf' | 'password' | 'corrupted' | 'empty' | 'unknown';

/** Error raised by our own loading code, with a code the UI can translate. */
export class PdfLoadError extends Error {
  readonly code: LoadErrorCode;

  constructor(code: LoadErrorCode, options?: { cause?: unknown }) {
    super(`PDF load failed: ${code}`, options);
    this.name = 'PdfLoadError';
    this.code = code;
  }
}

/**
 * Maps whatever was thrown while opening a file to a LoadErrorCode.
 * pdf.js errors are recognised by their `name`, so this stays independent
 * from the pdf.js runtime and can be unit-tested with plain objects.
 */
export function classifyLoadError(error: unknown): LoadErrorCode {
  if (error instanceof PdfLoadError) return error.code;
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;
  switch (name) {
    case 'PasswordException':
      return 'password';
    case 'InvalidPDFException':
    case 'FormatError':
      return 'corrupted';
    default:
      return 'unknown';
  }
}
