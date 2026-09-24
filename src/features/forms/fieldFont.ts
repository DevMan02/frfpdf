import { useEffect, useState } from 'react';
import { assetsBase } from '../viewer/pdfjs';

/**
 * Field values are shown and saved with Liberation Sans (SIL OFL, shipped with
 * pdf.js, metric-compatible with Arial). Using the same font on screen and in
 * the PDF keeps text size and wrapping identical in both places.
 */
const FONT_URL = `${assetsBase}standard_fonts/LiberationSans-Regular.ttf`;
export const FIELD_FONT_FAMILY = 'FrFPDF Field';
export const FIELD_FONT_STACK = `"${FIELD_FONT_FAMILY}", Arial, sans-serif`;

let loading: Promise<void> | undefined;

function loadFieldFont(): Promise<void> {
  loading ??= new FontFace(FIELD_FONT_FAMILY, `url(${FONT_URL})`)
    .load()
    .then((face) => {
      document.fonts.add(face);
    })
    .catch((error: unknown) => console.warn('Field font not loaded, using Arial', error));
  return loading;
}

/** true once the field font is ready (text measurements are then exact). */
export function useFieldFont(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void loadFieldFont().then(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, []);
  return ready;
}

let context: CanvasRenderingContext2D | null | undefined;

/** Text width in points at `size` points (widths scale linearly with size). */
export function measureFieldText(text: string, size: number): number {
  context ??= document.createElement('canvas').getContext('2d');
  if (!context) return text.length * size * 0.5;
  context.font = `100px ${FIELD_FONT_STACK}`;
  return (context.measureText(text).width * size) / 100;
}

/** Font file bytes, embedded into the PDF when saving (same origin, no network). */
export async function fetchFieldFontBytes(): Promise<Uint8Array> {
  const response = await fetch(FONT_URL);
  if (!response.ok) throw new Error(`Field font: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
