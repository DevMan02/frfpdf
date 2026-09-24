import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageGeometry } from '../../lib/pdf/coords';
import { sortReadingOrder } from '../../lib/forms/readingOrder';
import type { FormField, FormValues } from '../../lib/forms/types';
import { widgetsToFields, type WidgetAnnotation } from './acroform';

/** none: no XFA. hybrid: XFA plus standard fields (we use the latter). pure: XFA only, unsupported. */
export type XfaStatus = 'none' | 'hybrid' | 'pure';

export interface FormInfo {
  /** Fields in reading order (this is also the Tab order). */
  fields: FormField[];
  initialValues: FormValues;
  xfa: XfaStatus;
}

export async function readForm(pdf: PDFDocumentProxy, geometries: PageGeometry[]): Promise<FormInfo> {
  const fields: FormField[] = [];
  const initialValues: FormValues = {};
  for (let i = 0; i < pdf.numPages; i++) {
    const page = await pdf.getPage(i + 1);
    const annotations = (await page.getAnnotations()) as WidgetAnnotation[];
    const result = widgetsToFields(i, annotations);
    fields.push(...result.fields);
    for (const [key, value] of Object.entries(result.values)) {
      if (!(key in initialValues) || !initialValues[key]) initialValues[key] = value;
    }
  }

  const { info } = (await pdf.getMetadata()) as { info: { IsXFAPresent?: boolean } };
  const xfa: XfaStatus = !info.IsXFAPresent ? 'none' : fields.length ? 'hybrid' : 'pure';

  return {
    fields: sortReadingOrder(fields, (index) => geometries[index]!),
    initialValues,
    xfa,
  };
}
