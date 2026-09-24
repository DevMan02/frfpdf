import { pdfToScreenRect, type PageGeometry, type ScreenRect } from '../pdf/coords';
import type { FormField } from './types';

/**
 * Sorts fields in reading order: page by page, then row by row from the top,
 * left to right within a row. Two fields are on the same row when their
 * vertical extents overlap for at least half of the shorter one.
 * Works on the page as displayed, so rotated pages read naturally.
 */
export function sortReadingOrder(fields: FormField[], geometryOf: (pageIndex: number) => PageGeometry): FormField[] {
  const boxes = new Map<FormField, ScreenRect>(
    fields.map((f) => [f, pdfToScreenRect(f.rect, geometryOf(f.pageIndex), 1)]),
  );
  const box = (f: FormField) => boxes.get(f)!;

  const byPage = new Map<number, FormField[]>();
  for (const f of fields) byPage.set(f.pageIndex, [...(byPage.get(f.pageIndex) ?? []), f]);

  const result: FormField[] = [];
  for (const pageIndex of [...byPage.keys()].sort((a, b) => a - b)) {
    const pending = [...byPage.get(pageIndex)!].sort((a, b) => box(a).top - box(b).top);
    while (pending.length) {
      const first = box(pending[0]!);
      const row = pending.filter((f) => sameRow(first, box(f)));
      row.sort((a, b) => box(a).left - box(b).left);
      result.push(...row);
      for (const f of row) pending.splice(pending.indexOf(f), 1);
    }
  }
  return result;
}

function sameRow(a: ScreenRect, b: ScreenRect): boolean {
  const overlap = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return overlap >= 0.5 * Math.min(a.height, b.height);
}
