/**
 * The cell formatter of a RefSet column: the keys the row holds, shown as the
 * names of their vocabulary, one badge each (`refset,<target>,<key>,<name>`,
 * chosen from the column's type, never named in a view).
 *
 * A row carries keys, not names. The names are asked of the vocabulary once:
 * the keys missing from every cell drawn in the same tick go out in one query
 * per vocabulary, and the rows that asked are drawn again when the names
 * arrive. Until then a badge shows nothing rather than a number, which would
 * read as a name.
 *
 * Each badge carries its field and key (`data-refset-field`, `data-refset-key`):
 * a click on it is a filter, and the list that shows it is the one that knows
 * how to apply one.
 */
import type { CellFormatter } from './registry';

type Key = string;

// {vocabulary: {key: name}}, for the session: a vocabulary is short and changes rarely
const names = new Map<string, Map<Key, string>>();
// What the next query asks of each vocabulary, and the rows waiting for it
const wanted = new Map<string, { field: string; label?: string; keys: Set<Key>; rows: Set<any> }>();
let scheduled = false;

/** The name of a key, if the vocabulary has told it. */
export function refsetName(target: string, key: unknown): string | undefined {
  return names.get(target)?.get(String(key));
}

/** Names learnt elsewhere (the form's widget) go into the same cache. */
export function rememberNames(target: string, entries: Iterable<[unknown, string]>): void {
  const known = names.get(target) ?? new Map<Key, string>();
  for (const [key, name] of entries) known.set(String(key), name);
  names.set(target, known);
}

function ask(target: string, field: string, label: string | undefined, keys: Key[], row: any): void {
  const entry = wanted.get(target) ?? { field, label, keys: new Set<Key>(), rows: new Set<any>() };
  for (const key of keys) entry.keys.add(key);
  if (row) entry.rows.add(row);
  wanted.set(target, entry);
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(flush);
}

async function flush(): Promise<void> {
  scheduled = false;
  const batch = [...wanted.entries()];
  wanted.clear();
  // Imported here, not at the top: the formatters load without the API client
  const { api } = await import('../api/client');
  for (const [target, { field, label, keys, rows }] of batch) {
    try {
      const res = await api.endpoint('query', {
        format: 'records',
        query: {
          table: target,
          select: label ? [field, label] : [field],
          filters: { conditions: { column: field, op: 'in', value: [...keys] } },
          // Stored keys: an entry archived since must still show its name
          resolve: true,
        },
      });
      if (res.status === 'success' && Array.isArray(res.data)) {
        rememberNames(target, (res.data as Record<string, unknown>[])
          .map((r) => [r[field], String(r[label ?? field] ?? '')] as [unknown, string]));
      }
    } catch (_) {
      // Names that cannot be read leave the badges empty; nothing to retry here
    }
    // A key the vocabulary does not have is shown as itself, not asked again
    const known = names.get(target) ?? new Map<Key, string>();
    for (const key of keys) if (!known.has(key)) known.set(key, key);
    names.set(target, known);
    for (const row of rows) {
      try { row.reformat(); } catch (_) { /* the row left the table meanwhile */ }
    }
  }
}

export const refset: CellFormatter = (cell, params) => {
  const value = cell.getValue();
  const keys: unknown[] = Array.isArray(value) ? value : [];
  const target = params?.target as string | undefined;
  if (!keys.length || !target) return '';
  const field = (params?.field as string | undefined) ?? 'id';
  const label = params?.label as string | undefined;

  const missing = keys.map(String).filter((k) => refsetName(target, k) === undefined);
  if (missing.length) ask(target, field, label, missing, cell.getRow());

  const box = document.createElement('span');
  box.className = 'kb-refset-cell';
  for (const key of keys) {
    const name = refsetName(target, key);
    if (name === undefined) continue;
    const badge = document.createElement('span');
    badge.className = 'kb-refset-cell-badge';
    badge.textContent = name;
    badge.dataset.refsetField = cell.getField();
    // JSON: the key goes back into a filter with its type, number or string
    badge.dataset.refsetKey = JSON.stringify(key);
    badge.title = name;
    box.appendChild(badge);
  }
  return box;
};

/** `refset,<target>,<key>,<name>`: the vocabulary a column's keys belong to. */
export function refsetParams(args: string[]): Record<string, unknown> {
  return { target: args[0], field: args[1] || 'id', label: args[2] || undefined };
}
