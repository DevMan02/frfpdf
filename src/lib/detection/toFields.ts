import { screenToPdfRect, type PageGeometry } from '../pdf/coords';
import type { FormField, FormValues } from '../forms/types';
import type { DetectedField } from './detect';

/**
 * Detected fields (display space) to FormFields (PDF space), with the values
 * already written in the document when they can be read. `nameFor` gives a
 * readable label to fields found without nearby text (e.g. on scans).
 */
export function detectedToFields(
  pageIndex: number,
  detected: DetectedField[],
  geometry: PageGeometry,
  nameFor: (index: number) => string,
): { fields: FormField[]; values: FormValues } {
  const values: FormValues = {};
  const fields = detected.map<FormField>((d, i) => {
    const id = `det-${pageIndex}-${i}`;
    if (d.value) values[id] = d.value;
    return {
      id,
      valueKey: id,
      pageIndex,
      rect: screenToPdfRect(
        { left: d.box.x1, top: d.box.y1, width: d.box.x2 - d.box.x1, height: d.box.y2 - d.box.y1 },
        geometry,
        1,
      ),
      kind: d.kind,
      label: d.label || nameFor(i),
      source: 'detected',
      orientation: 'display',
      cover: d.prefilled || undefined,
    };
  });
  return { fields, values };
}
