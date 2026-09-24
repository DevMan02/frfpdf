import type { PdfRect } from '../pdf/coords';

/** What the user fills in. */
export type FieldKind = 'text' | 'multiline' | 'date' | 'checkbox' | 'radio' | 'dropdown' | 'signature';

/** Where the field comes from. */
export type FieldSource = 'acroform' | 'detected' | 'manual';

export interface FieldOption {
  value: string;
  label: string;
}

/**
 * One fillable spot on a page. The same model covers real AcroForm fields,
 * fields detected in flat PDFs and fields added by hand.
 */
export interface FormField {
  /** Unique per widget. */
  id: string;
  /**
   * Fields sharing a key share one value: the widgets of a radio group, or
   * AcroForm fields repeated on several pages.
   */
  valueKey: string;
  pageIndex: number;
  rect: PdfRect;
  kind: FieldKind;
  /** Human-readable name, shown to screen readers and in messages. */
  label: string;
  source: FieldSource;
  /** Fully qualified AcroForm name, for source === 'acroform'. */
  acroName?: string;
  /** Value this checkbox or radio button stands for when selected. */
  onValue?: string;
  options?: FieldOption[];
  maxLength?: number;
  readOnly?: boolean;
  /** Font size requested by the form (0 or undefined = automatic). */
  fontSize?: number;
  /**
   * 'page' (AcroForm): the content turns with the page, like in every PDF reader.
   * 'display' (detected or added by hand): text stays upright as the page is shown.
   */
  orientation?: 'page' | 'display';
  /**
   * Something is already written in this area of the page (a prefilled cell
   * of a scan, or a "Sostituisci" field). A changed value is saved over a
   * white box that hides the old content.
   */
  cover?: boolean;
}

/** Checkbox: boolean. Radio group: selected onValue ('' = none). Others: text. */
export type FieldValue = string | boolean;
export type FormValues = Record<string, FieldValue>;

/**
 * A field needs an answer before download (checkboxes can stay unticked,
 * signatures come later, fields over existing content are already filled).
 */
export function isAnswerable(field: FormField): boolean {
  return !field.readOnly && !field.cover && field.kind !== 'checkbox' && field.kind !== 'signature';
}

/** The user changed this value compared with what the document already had. */
export function isChanged(field: FormField, values: FormValues, initialValues: FormValues): boolean {
  const normalize = (v: FieldValue | undefined) => (v === undefined || v === false ? '' : v);
  return normalize(values[field.valueKey]) !== normalize(initialValues[field.valueKey]);
}

export function isEmptyValue(value: FieldValue | undefined): boolean {
  return value === undefined || value === '' || value === false;
}

/** Number of distinct values still missing (a radio group counts once). */
export function countEmpty(fields: FormField[], values: FormValues): number {
  const missing = new Set<string>();
  for (const field of fields) {
    if (isAnswerable(field) && isEmptyValue(values[field.valueKey])) missing.add(field.valueKey);
  }
  return missing.size;
}

export function countAnswerable(fields: FormField[]): number {
  return new Set(fields.filter(isAnswerable).map((f) => f.valueKey)).size;
}
