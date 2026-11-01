/**
 * Cell formatters of the media columns, chosen from the column's `media:`
 * (DataView), never named in a view.
 *
 *   media_image  the variant the view column names (`variant: thumb`), small
 *   media_file   the file name, a link that opens the file in a tab
 *
 * The URL is the one the row brought, signed by the server; a cell never
 * builds one. An image the server cannot give shows an empty frame, never a
 * broken-image icon.
 */
import type { CellFormatter } from './registry';
import { mediaFileName, mediaUrl } from '../api/media';

const image: CellFormatter = (cell) => {
  const src = mediaUrl(cell.getValue());
  if (!src) return '';
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.style.cssText = 'display:block;max-height:2.5rem;max-width:100%;object-fit:contain;border-radius:2px';
  img.onerror = () => {
    const frame = document.createElement('span');
    frame.style.cssText = 'display:inline-block;width:2.5rem;height:2.5rem;'
      + 'border:1px dashed var(--kb-border);border-radius:2px';
    img.replaceWith(frame);
  };
  return img;
};

const file: CellFormatter = (cell) => {
  const href = mediaUrl(cell.getValue());
  if (!href) return '';
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = mediaFileName(href);
  a.style.color = 'var(--kb-accent)';
  // Opening the file is the link's business, not the row's.
  a.addEventListener('click', (e) => e.stopPropagation());
  return a;
};

export const MEDIA_FORMATTERS: Record<string, CellFormatter> = {
  media_image: image,
  media_file: file,
};
