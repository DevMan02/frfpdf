import { humanizeFieldName, inferLabelHint } from '../../lib/detection/labels';
import { normalizeRect, type PdfRect } from '../../lib/pdf/coords';
import type { FieldKind, FormField, FormValues } from '../../lib/forms/types';

/** The subset of pdf.js annotation data used here (see `page.getAnnotations()`). */
export interface WidgetAnnotation {
  id: string;
  subtype: string;
  fieldType?: string;
  fieldName?: string;
  alternativeText?: string;
  rect: number[];
  fieldValue?: unknown;
  hidden?: boolean;
  readOnly?: boolean;
  checkBox?: boolean;
  radioButton?: boolean;
  pushButton?: boolean;
  exportValue?: string;
  buttonValue?: string;
  options?: { exportValue: string; displayValue: string }[];
  multiLine?: boolean;
  maxLen?: number;
  defaultAppearanceData?: { fontSize?: number };
}

export interface AcroFormPage {
  fields: FormField[];
  values: FormValues;
}

/**
 * Turns the widgets of one page into FormFields plus their current values.
 * Read-only text fields are left out: pdf.js keeps drawing them on the page.
 */
export function widgetsToFields(pageIndex: number, annotations: WidgetAnnotation[]): AcroFormPage {
  const fields: FormField[] = [];
  const values: FormValues = {};

  for (const a of annotations) {
    if (a.subtype !== 'Widget' || a.hidden || !a.fieldName || a.rect.length !== 4) continue;
    const kind = kindOf(a);
    if (!kind) continue;
    if (a.readOnly && (kind === 'text' || kind === 'multiline' || kind === 'date')) continue;

    const name = a.fieldName;
    const label = a.alternativeText?.trim() || humanizeFieldName(name);
    const field: FormField = {
      id: `acro-${a.id}`,
      valueKey: name,
      pageIndex,
      rect: normalizeRect(a.rect as PdfRect),
      kind,
      label,
      source: 'acroform',
      acroName: name,
      readOnly: a.readOnly || undefined,
      fontSize: a.defaultAppearanceData?.fontSize || undefined,
    };
    if (a.maxLen) field.maxLength = a.maxLen;
    if (kind === 'checkbox') field.onValue = a.exportValue ?? 'Yes';
    if (kind === 'radio') field.onValue = a.buttonValue ?? '';
    if (kind === 'dropdown') {
      field.options = (a.options ?? []).map((o) => ({ value: o.exportValue, label: o.displayValue || o.exportValue }));
    }
    fields.push(field);

    if (!(name in values)) values[name] = initialValue(kind, a);
    // A radio group reports its value on every widget; keep the first non-empty one.
    else if (kind === 'radio' && !values[name]) values[name] = initialValue(kind, a);
  }
  return { fields, values };
}

function kindOf(a: WidgetAnnotation): FieldKind | null {
  switch (a.fieldType) {
    case 'Tx': {
      if (a.multiLine) return 'multiline';
      const hint = inferLabelHint(`${a.fieldName ?? ''} ${a.alternativeText ?? ''}`);
      return hint === 'date' ? 'date' : 'text';
    }
    case 'Btn':
      if (a.pushButton) return null;
      if (a.radioButton) return 'radio';
      return a.checkBox ? 'checkbox' : null;
    case 'Ch':
      return 'dropdown';
    case 'Sig':
      return 'signature';
    default:
      return null;
  }
}

function initialValue(kind: FieldKind, a: WidgetAnnotation): string | boolean {
  const v = a.fieldValue;
  switch (kind) {
    case 'checkbox':
      return typeof v === 'string' && v !== 'Off' && v !== '';
    case 'radio':
      return typeof v === 'string' && v !== 'Off' ? v : '';
    case 'dropdown':
      if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : '';
      return typeof v === 'string' ? v : '';
    case 'signature':
      return '';
    default:
      return typeof v === 'string' ? v : '';
  }
}
