/**
 * Guesses what a field is for from its label or name, e.g. "Data di nascita",
 * "data_nascita", "Firma del richiedente".
 */
export type LabelHint = 'date' | 'signature' | 'email' | 'tax-code' | 'name';

const RULES: [LabelHint, RegExp][] = [
  ['signature', /\b(firma|firmato|signature|sign here)\b/],
  ['date', /\b(data|date|nato il|nata il|il giorno)\b/],
  ['email', /\b(e ?mail|pec|posta elettronica)\b/],
  ['tax-code', /\b(codice fiscale|c ?f|tax code)\b/],
  ['name', /\b(nome|cognome|nominativo|name|surname)\b/],
];

/** Lower case, no accents, separators turned into spaces. */
export function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[_\-.:/()[\]]+/g, ' ')
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferLabelHint(label: string): LabelHint | null {
  const text = normalizeLabel(label);
  if (!text) return null;
  for (const [hint, pattern] of RULES) if (pattern.test(text)) return hint;
  return null;
}

/** "data_nascita" -> "Data nascita": readable name from a technical field name. */
export function humanizeFieldName(name: string): string {
  const last = name.split('.').pop() ?? name;
  const text = last
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : name;
}
