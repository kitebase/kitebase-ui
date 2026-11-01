/**
 * The source of a Files column: the folder of one record (server:
 * kitebase.endpoint_media). Kept apart from the contract, which is pure.
 */
import { api } from './client';
import type { APIResponse } from './types';
import { entryOf, type FileSource, type ServerEntry } from './fileSource';

function mapped<S, T>(res: APIResponse<S>, f: (s: S) => T): APIResponse<T> {
  return res.status === 'success' ? { ...res, data: f(res.data as S) } : (res as unknown as APIResponse<T>);
}

/**
 * The folder of a Files column for one record. Removing moves the file into
 * the folder's `.trash/`, never deleting it.
 */
export function filesSource(table: string, field: string, id: number | string): FileSource {
  const where = { table, field, id };
  return {
    capabilities: { describe: true, remove: true },
    async list() {
      const res = await api.endpoint<ServerEntry[]>('media_list', where);
      return mapped(res, (rows) => (rows ?? []).map(entryOf));
    },
    async upload(file, filename) {
      const res = await api.upload<ServerEntry>(table, field, id, file, filename);
      return mapped(res, entryOf);
    },
    describe(key, text) {
      return api.endpoint<null>('media_describe', { ...where, name: key, description: text });
    },
    remove(key) {
      return api.endpoint<null>('media_trash', { ...where, name: key });
    },
  };
}
