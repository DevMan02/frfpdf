export type OutputKind = 'signed' | 'modified';

const SUFFIX: Record<OutputKind, string> = {
  signed: '_firmato',
  modified: '_modificato',
};

/**
 * Builds the download name: "contratto.pdf" -> "contratto_modificato.pdf".
 * The suffix is not repeated if the file already carries it.
 */
export function buildOutputFileName(originalName: string, kind: OutputKind): string {
  const suffix = SUFFIX[kind];
  const trimmed = originalName.trim();
  const base = trimmed.replace(/\.pdf$/i, '') || 'documento';
  const withSuffix = base.toLowerCase().endsWith(suffix) ? base : base + suffix;
  return `${withSuffix}.pdf`;
}
