/**
 * How an entry of a file list opens, by its kind.
 *
 * The kind is a MIME type for a file, and may be another word for an entry
 * that is not one (a link, a note): the registry matches on the kind, never
 * on the name. A plugin registers its viewers first in line, so it can take
 * over a kind the core already handles.
 */
import type { FileEntry } from '../../api/fileSource';

/**
 * `overlay`: shown over the page (an image); `tab`: opened in a new tab, where
 * the browser has a viewer (a PDF); `download`: saved.
 */
export type ViewerMode = 'overlay' | 'tab' | 'download';

export interface Viewer {
  /** Whether this viewer takes an entry of that kind. */
  accepts(kind: string): boolean;
  mode: ViewerMode;
  /** The family the icon is drawn from. */
  icon: 'image' | 'pdf' | 'text' | 'sheet' | 'archive' | 'file';
}

const BUILT_IN: Viewer[] = [
  { accepts: (k) => k.startsWith('image/'), mode: 'overlay', icon: 'image' },
  { accepts: (k) => k === 'application/pdf', mode: 'tab', icon: 'pdf' },
  { accepts: (k) => k.startsWith('text/'), mode: 'tab', icon: 'text' },
  { accepts: (k) => /spreadsheet|excel|csv/.test(k), mode: 'download', icon: 'sheet' },
  { accepts: (k) => /zip|compressed|tar|gzip/.test(k), mode: 'download', icon: 'archive' },
];

const FALLBACK: Viewer = { accepts: () => true, mode: 'download', icon: 'file' };

const registered: Viewer[] = [];

export function registerViewer(viewer: Viewer): void {
  registered.unshift(viewer);
}

export function viewerOf(entry: Pick<FileEntry, 'kind'>): Viewer {
  return registered.find((v) => v.accepts(entry.kind))
    ?? BUILT_IN.find((v) => v.accepts(entry.kind))
    ?? FALLBACK;
}
