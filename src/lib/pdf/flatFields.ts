import { degrees, rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';
import { isChanged, type FormField, type FormValues } from '../forms/types';
import {
  normalizeRotation,
  pdfToScreenRect,
  screenToPdfPoint,
  type PageGeometry,
  type ScreenRect,
} from './coords';
import { DEFAULT_LINE_HEIGHT, DEFAULT_PADDING, fitFontSize, wrapLines } from './fitText';

/**
 * Fields that are not AcroForm fields (detected in flat PDFs or added by the
 * user) are written upright as the page is displayed, even on rotated pages.
 */
export interface FlatFieldOptions {
  fields: FormField[];
  values: FormValues;
  /** Values already in the document (prefilled cells): unchanged ones are left alone. */
  initialValues: FormValues;
  /** Page box and rotation of every page, as used on screen. */
  geometries: PageGeometry[];
  /**
   * true: values are drawn into the page content.
   * false: each field becomes a real AcroForm field ("modulo compilabile").
   */
  flatten: boolean;
}

const INK = rgb(0.118, 0.149, 0.22); // #1E2638
const PAPER = rgb(1, 1, 1);

export function writeFlatFields(doc: PDFDocument, font: PDFFont, options: FlatFieldOptions): void {
  const { values, initialValues, geometries, flatten } = options;
  const measure = (text: string, size: number) => font.widthOfTextAtSize(text, size);

  // Fields over existing content: untouched ones keep the original; changed
  // ones hide it under a white box (the old content stays in the file below).
  const fields = options.fields.filter((f) => !f.cover || isChanged(f, values, initialValues));
  for (const field of fields) if (field.cover) coverArea(doc.getPage(field.pageIndex), field);

  if (flatten) {
    for (const field of fields) drawValue(doc.getPage(field.pageIndex), field, values[field.valueKey], geometries[field.pageIndex]!, font, measure);
  } else {
    createAcroFields(doc, font, fields, values, geometries, measure);
  }
}

function coverArea(page: PDFPage, field: FormField) {
  const [x1, y1, x2, y2] = field.rect;
  page.drawRectangle({ x: x1, y: y1, width: x2 - x1, height: y2 - y1, color: PAPER });
}

/** Size of the field box as seen on screen (scale 1), and its font size. */
function layout(field: FormField, geometry: PageGeometry, text: string, measure: (t: string, s: number) => number) {
  const box = pdfToScreenRect(field.rect, geometry, 1);
  const size = fitFontSize(text, measure, {
    width: box.width,
    height: box.height,
    multiline: field.kind === 'multiline',
  });
  return { box, size };
}

function drawValue(
  page: PDFPage,
  field: FormField,
  value: FormValues[string] | undefined,
  geometry: PageGeometry,
  font: PDFFont,
  measure: (t: string, s: number) => number,
) {
  const rotate = degrees(normalizeRotation(geometry.rotation));

  if (field.kind === 'checkbox') {
    if (value !== true) return;
    drawCheck(page, pdfToScreenRect(field.rect, geometry, 1), geometry);
    return;
  }
  if (typeof value !== 'string' || !value.trim() || field.kind === 'signature') return;

  const { box, size } = layout(field, geometry, value, measure);
  const lines =
    field.kind === 'multiline' ? wrapLines(value, measure, size, box.width - 2 * DEFAULT_PADDING) : [value];
  lines.forEach((line, i) => {
    // Baselines match the on-screen input: centred for one line, from the top for several.
    const sy =
      field.kind === 'multiline'
        ? box.top + DEFAULT_PADDING + size * 0.92 + i * size * DEFAULT_LINE_HEIGHT
        : box.top + box.height / 2 + size * 0.35;
    const [x, y] = screenToPdfPoint(box.left + DEFAULT_PADDING, sy, geometry, 1);
    page.drawText(line, { x, y, size, font, color: INK, rotate });
  });
}

function drawCheck(page: PDFPage, box: ScreenRect, geometry: PageGeometry) {
  const point = (fx: number, fy: number) => {
    const [x, y] = screenToPdfPoint(box.left + fx * box.width, box.top + fy * box.height, geometry, 1);
    return { x, y };
  };
  const thickness = Math.max(0.8, Math.min(box.width, box.height) * 0.12);
  const a = point(0.2, 0.55);
  const b = point(0.42, 0.78);
  const c = point(0.82, 0.22);
  page.drawLine({ start: a, end: b, thickness, color: INK, lineCap: 1 });
  page.drawLine({ start: b, end: c, thickness, color: INK, lineCap: 1 });
}

function createAcroFields(
  doc: PDFDocument,
  font: PDFFont,
  fields: FormField[],
  values: FormValues,
  geometries: PageGeometry[],
  measure: (t: string, s: number) => number,
) {
  const form = doc.getForm();
  const used = new Set(form.getFields().map((f) => f.getName()));

  for (const field of fields) {
    if (field.kind === 'signature') continue; // signing arrives with phase 3
    const geometry = geometries[field.pageIndex]!;
    const page = doc.getPage(field.pageIndex);
    const name = uniqueName(field.label, used);
    const placement = widgetPlacement(field, geometry);
    const value = values[field.valueKey];

    if (field.kind === 'checkbox') {
      const checkBox = form.createCheckBox(name);
      checkBox.addToPage(page, { ...placement, borderWidth: 0 });
      if (value === true) checkBox.check();
      continue;
    }

    const text = typeof value === 'string' ? value : '';
    const textField = form.createTextField(name);
    if (field.kind === 'multiline') textField.enableMultiline();
    textField.setText(text);
    textField.addToPage(page, { ...placement, font, borderWidth: 0 });
    textField.setFontSize(layout(field, geometry, text, measure).size);
  }
  form.updateFieldAppearances(font);
}

/**
 * pdf-lib takes the field size in the text direction plus a rotation pivot
 * (see rotateRectangle in pdf-lib): convert our page-space rectangle.
 */
function widgetPlacement(field: FormField, geometry: PageGeometry) {
  const [x1, y1, x2, y2] = field.rect;
  const rotation = normalizeRotation(geometry.rotation);
  const pageW = x2 - x1;
  const pageH = y2 - y1;
  const upright = rotation % 180 === 0 ? { width: pageW, height: pageH } : { width: pageH, height: pageW };
  const pivot = { 0: [x1, y1], 90: [x2, y1], 180: [x2, y2], 270: [x1, y2] }[rotation];
  return { x: pivot[0]!, y: pivot[1]!, ...upright, rotate: degrees(rotation) };
}

function uniqueName(label: string, used: Set<string>): string {
  const base =
    label
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'campo';
  let name = base;
  for (let i = 2; used.has(name); i++) name = `${base}_${i}`;
  used.add(name);
  return name;
}
