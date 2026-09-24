/**
 * Hands a generated file to the user. Browser/PWA implementation: a local
 * blob: URL and a temporary <a download> link — nothing leaves the device.
 * A future desktop build (Tauri) will replace this module with a native
 * "Save as" dialog.
 */
export function saveFile(bytes: Uint8Array, fileName: string, mimeType = 'application/pdf'): void {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before releasing the memory.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
