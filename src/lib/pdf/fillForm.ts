import {
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFRef,
  PDFSignature,
  PDFTextField,
  type PDFDocument,
  type PDFFont,
} from 'pdf-lib';
import type { FormField, FormValues } from '../forms/types';
import { fitFontSize } from './fitText';

export interface FillOptions {
  fields: FormField[];
  values: FormValues;
  /** Values when the file was opened: untouched fields keep their original look. */
  initialValues: FormValues;
  /** Merge the values into the page content and remove the fields. */
  flatten: boolean;
}

/**
 * Writes the user's values into the AcroForm fields of `doc`.
 * `font` must cover every character typed (we embed a full Unicode font).
 */
export function fillAcroForm(doc: PDFDocument, font: PDFFont, options: FillOptions): void {
  const { fields, values, initialValues, flatten } = options;
  // Note: getForm() also drops any XFA packet, so XFA-aware readers show our values.
  const form = doc.getForm();

  const byName = new Map<string, FormField>();
  for (const f of fields) if (f.source === 'acroform' && f.acroName && !byName.has(f.acroName)) byName.set(f.acroName, f);

  for (const [name, model] of byName) {
    const value = values[model.valueKey];
    if (value === initialValues[model.valueKey]) continue;
    const field = form.getFieldMaybe(name);
    if (!field) continue;

    if (field instanceof PDFTextField) {
      let text = typeof value === 'string' ? value : '';
      const maxLength = field.getMaxLength();
      if (maxLength !== undefined) text = text.slice(0, maxLength);
      field.setText(text);
      const [x1, y1, x2, y2] = model.rect;
      field.setFontSize(
        fitFontSize(text, (t, size) => font.widthOfTextAtSize(t, size), {
          width: x2 - x1,
          height: y2 - y1,
          multiline: field.isMultiline(),
          maxSize: model.fontSize && model.fontSize > 0 ? Math.min(model.fontSize, 12) : undefined,
        }),
      );
    } else if (field instanceof PDFCheckBox) {
      if (value === true) field.check();
      else field.uncheck();
    } else if (field instanceof PDFRadioGroup) {
      if (typeof value === 'string' && value && field.getOptions().includes(value)) field.select(value);
      else field.clear();
    } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      if (typeof value === 'string' && value) field.select(value);
      else field.clear();
    }
  }

  form.updateFieldAppearances(font);

  if (flatten) {
    // Empty signature fields have nothing to draw: remove them before flattening.
    for (const field of form.getFields()) {
      if (field instanceof PDFSignature) removeFieldAndWidgets(doc, field);
    }
    form.flatten({ updateFieldAppearances: false });
  }
}

/**
 * Like form.removeField(), which throws on widgets without an appearance
 * stream (typical of empty signature fields).
 */
export function removeFieldAndWidgets(doc: PDFDocument, field: PDFSignature): void {
  const refs: PDFRef[] = [field.ref];
  const kids = field.acroField.Kids();
  for (let i = 0; i < (kids?.size() ?? 0); i++) {
    const kid = kids!.get(i);
    if (kid instanceof PDFRef) refs.push(kid);
  }
  for (const page of doc.getPages()) for (const ref of refs) page.node.removeAnnot(ref);
  doc.getForm().acroForm.removeField(field.acroField);
  for (const ref of refs) doc.context.delete(ref);
}
