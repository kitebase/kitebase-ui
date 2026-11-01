/**
 * Media values as the client sees them (server: kitebase.media).
 *
 * A media column leaves the server as a signed URL relative to the API
 * prefix (`media/covers/2026/11/a.jpg?e=...&s=...`): the client puts its own
 * base in front and never composes a path. An upload answers a reference
 * (`covers:2026/11/a.jpg`), which the form saves like any other value.
 */
import { config } from '../config';

const REFERENCE = /^[A-Za-z_][A-Za-z0-9_-]*:/;

/** True for a `root:path` reference, the value an upload gives to save. */
export function isMediaRef(value: unknown): value is string {
  return typeof value === 'string' && REFERENCE.test(value) && !value.includes('?');
}

/** The URL to put in an <img> or a link; null when there is no file. */
export function mediaUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url === '' || isMediaRef(url)) return null;
  if (/^(https?:|blob:|data:|\/)/.test(url)) return url;
  return `${config.api.root}/${url}`;
}

/** The file name a media URL ends with. */
export function mediaFileName(url: unknown): string {
  if (typeof url !== 'string') return '';
  const path = url.split('?')[0];
  try {
    return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
  } catch {
    return path.slice(path.lastIndexOf('/') + 1);
  }
}
