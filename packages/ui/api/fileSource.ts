/**
 * A source of files: what a list of files talks to, whoever keeps them.
 *
 * The widget never knows where the files live. A Files column keeps them in a
 * folder of the record; a document store will keep them elsewhere and link
 * them to the record. Both answer the same five things.
 *
 * Two rules every source keeps:
 * - an entry carries an opaque `key`, its identity: the name is for people,
 *   and two sources may not agree on what identifies a file;
 * - an entry is not necessarily a file: `url` is optional, and `kind` says
 *   what it is (a MIME type for a file, other words for other things).
 */
import type { APIResponse } from './types';

export interface FileEntry {
  key: string;
  name: string;
  /** A MIME type for a file. */
  kind: string;
  size?: number;
  /** Seconds since the epoch. */
  modified?: number;
  description: string;
  /** Where the entry opens, signed by the server; absent for what is not a file. */
  url?: string;
  /** A small rendition of an image, for a list. */
  thumb?: string;
}

export interface FileSourceCapabilities {
  describe: boolean;
  remove: boolean;
}

export interface FileSource {
  readonly capabilities: FileSourceCapabilities;
  list(): Promise<APIResponse<FileEntry[]>>;
  upload(file: Blob, filename: string): Promise<APIResponse<FileEntry>>;
  describe(key: string, text: string): Promise<APIResponse<null>>;
  remove(key: string): Promise<APIResponse<null>>;
}

/** What the server says of a file of a Files folder. */
export interface ServerEntry {
  name: string;
  size: number;
  mime: string;
  modified: number;
  description: string;
  url: string;
  thumb?: string;
}

/** A file of a folder: its name is its key, unique in the folder. */
export function entryOf(e: ServerEntry): FileEntry {
  return {
    key: e.name, name: e.name, kind: e.mime, size: e.size, modified: e.modified,
    description: e.description ?? '', url: e.url, thumb: e.thumb,
  };
}
