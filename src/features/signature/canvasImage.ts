import { contentBounds, crop, removeBackground, type RgbaImage } from '../../lib/signature/image';

/** Longest side of a signature image: sharp when printed, light in the PDF. */
const MAX_SIDE = 1200;

export interface SignaturePng {
  png: Uint8Array;
  aspect: number;
}

export function readCanvas(canvas: HTMLCanvasElement): RgbaImage {
  const context = canvas.getContext('2d')!;
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: data.width, height: data.height, data: data.data };
}

export function drawImage(image: RgbaImage, canvas: HTMLCanvasElement): void {
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
}

/** Crops to the signature, limits the size and encodes as PNG. Null if the image is empty. */
export async function toSignaturePng(image: RgbaImage): Promise<SignaturePng | null> {
  const box = contentBounds(image, 16, 4);
  if (!box) return null;
  const cropped = crop(image, box);
  const canvas = document.createElement('canvas');
  drawImage(cropped, canvas);

  let output = canvas;
  const scale = Math.min(1, MAX_SIDE / Math.max(cropped.width, cropped.height));
  if (scale < 1) {
    output = document.createElement('canvas');
    output.width = Math.round(cropped.width * scale);
    output.height = Math.round(cropped.height * scale);
    output.getContext('2d')!.drawImage(canvas, 0, 0, output.width, output.height);
  }
  const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  return { png: new Uint8Array(await blob.arrayBuffer()), aspect: output.width / output.height };
}

/** Reads a PNG/JPG chosen by the user, scaled down to at most 1600 px. */
export async function readImageFile(file: File): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  // Paint on white first: transparent PNGs then behave like paper.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return readCanvas(canvas);
}

export function imageWithoutBackground(image: RgbaImage, threshold: number): RgbaImage {
  return removeBackground(image, threshold);
}

/** Draws "Nome Cognome" in a calligraphic font, transparent background. */
export function renderTypedSignature(text: string, fontFamily: string, color: string): RgbaImage {
  const size = 110;
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `${size}px "${fontFamily}"`;
  const width = Math.ceil(measure.measureText(text).width + size);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.ceil(size * 1.8);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.font = `${size}px "${fontFamily}"`;
  context.fillStyle = color;
  context.textBaseline = 'alphabetic';
  context.fillText(text, size / 2, size * 1.25);
  return readCanvas(canvas);
}
