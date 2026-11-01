/**
 * What the media widget does before a file leaves the browser.
 *
 * The column declares the longest side it wants (`resize:`, through its
 * type); a photo over it is reduced, once whoever uploads it has agreed,
 * since a reduction loses detail they may want. It saves bandwidth and, as a
 * side effect, drops the EXIF block, GPS position included; `from-image`
 * keeps the photo upright. A convenience, not a guarantee: the server applies
 * its own limits to whatever arrives.
 */

// Re-encoded in their own format. A GIF may be animated and an SVG is not
// raster: both leave as they are.
const REDUCIBLE: Record<string, number | undefined> = {
  'image/jpeg': 0.85,
  'image/webp': 0.85,
  'image/png': undefined,
};

/** Width and height of an image the browser can reduce, upright; null otherwise. */
export async function reducibleSize(file: File): Promise<{ width: number; height: number } | null> {
  if (!(file.type in REDUCIBLE) || typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

export async function reduceImage(file: File, maxSide: number | undefined): Promise<File> {
  if (!maxSide || !(file.type in REDUCIBLE) || typeof createImageBitmap !== 'function') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;            // not decodable here: the server will say what it is
  }
  try {
    const { width, height } = bitmap;
    const scale = maxSide / Math.max(width, height);
    if (scale >= 1) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type, REDUCIBLE[file.type]));
    return blob ? new File([blob], file.name, { type: file.type }) : file;
  } finally {
    bitmap.close();
  }
}

/** The `accept` attribute of a file input, from the column's extensions. */
export function acceptAttr(accept: unknown): string | undefined {
  return Array.isArray(accept) && accept.length > 0
    ? accept.map((ext) => `.${ext}`).join(',')
    : undefined;
}

/** A size in bytes, for a message. */
export function sizeText(bytes: number): string {
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
