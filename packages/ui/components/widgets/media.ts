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

import type { TableColumnInfo } from '../../api/serverConfig.svelte';
import { _, _t } from '../../i18n';
import { msgbox } from '../msgbox.svelte';

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

/**
 * The image to send for a column: the original, or the image reduced to its
 * `resize:` when it is over it and the user agrees. null when the user
 * cancels. The original is offered only when it fits `max_size`.
 */
export async function prepareImage(file: File, column: TableColumnInfo): Promise<File | null> {
  const side = column.resize;
  if (!side) return file;
  const size = await reducibleSize(file);
  if (!size || Math.max(size.width, size.height) <= side) return file;
  const max = column.max_size;
  const fits = !max || file.size <= max;
  const message = _t('{name} is {width}x{height} pixels, {size}. This field reduces images to {side} pixels on the longest side.',
                     { name: file.name, width: size.width, height: size.height,
                       size: sizeText(file.size), side })
    + (fits ? '' : ' ' + _t('The original is over the limit of {max}.', { max: sizeText(max!) }));
  const choice = await msgbox.show({
    title: _('Image larger than required'),
    message,
    variant: 'warning',
    modal: true,
    buttons: [
      { label: _('Cancel'), value: 'cancel', variant: 'secondary' },
      ...(fits ? [{ label: _('Keep the original'), value: 'keep', variant: 'secondary' as const }] : []),
      { label: _('Reduce'), value: 'reduce', variant: 'primary' },
    ],
  });
  if (choice === 'keep') return file;
  if (choice === 'reduce') return reduceImage(file, side);
  return null;
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
