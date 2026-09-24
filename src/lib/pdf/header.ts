/** The PDF spec allows the "%PDF-" marker anywhere in the first 1024 bytes. */
const HEADER_SEARCH_WINDOW = 1024;
const MARKER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** Cheap check done before handing the bytes to pdf.js. */
export function hasPdfHeader(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, HEADER_SEARCH_WINDOW) - MARKER.length;
  for (let i = 0; i <= limit; i++) {
    if (MARKER.every((byte, j) => bytes[i + j] === byte)) return true;
  }
  return false;
}
