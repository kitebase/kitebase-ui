/**
 * The page a foreign key field picks from ("Search more…").
 *
 * The page is declared (`lookup.page` on the field) or it is the list of the
 * target table, `{table}_list` in lower case like `{model}_form`. There is no
 * `_lookup` naming convention: a dedicated page is named, not guessed.
 * `lookup.page: false` means there is none, and the server sets it when the
 * user may not open the page: the drop-down stays, "Search more…" goes.
 */
import type { ViewDescriptor } from './dataview.types';
import type { RuleRow } from './dataview.rules';
import { resolveRecordTokens } from './record';

export function lookupPageId(field: object, table: string): string | null {
  const lookup = (field as { lookup?: { page?: unknown } }).lookup;
  if (lookup?.page === false) return null;
  return typeof lookup?.page === 'string' && lookup.page
    ? lookup.page
    : `${table.toLowerCase()}_list`;
}

/**
 * The list a picker shows, taken from a page descriptor: its table view as
 * written — joins, columns, order, navigator commands — with the navigator in
 * lookup mode. Side panels are not taken: a picker is the list and nothing
 * else. Null when the page holds no table view, so the caller falls back.
 */
export function pickerView(page: unknown): ViewDescriptor | null {
  const content = (page as { content?: Record<string, unknown> } | null)?.content;
  if (!content || content.type !== 'table') return null;
  const navigator = (content.navigator ?? {}) as Record<string, unknown>;
  return { ...content, navigator: { ...navigator, mode: 'lookup' } } as ViewDescriptor;
}

/**
 * The initial filter of a field's search, `lookup.filters`, read from the draft.
 *
 * A filter and not a constraint: the drop-down applies it, "Search more…"
 * starts from it as rules the user may remove. Equality only, field by field,
 * with `$record.x` read from what the form shows. A condition whose value is
 * still empty falls: with no town chosen, every person is offered.
 */
export function lookupFilters(field: object, record: Record<string, unknown>): Record<string, unknown> {
  const declared = (field as { lookup?: { filters?: Record<string, unknown> } }).lookup?.filters;
  return Object.fromEntries(
    Object.entries(resolveRecordTokens(declared, record))
      .filter(([, v]) => v != null && v !== '')
  );
}

/** The filters as querybuilder conditions, for the drop-down's query. */
export function filterConditions(filters: Record<string, unknown>): Record<string, unknown>[] {
  return Object.entries(filters).map(([k, v]) => ({ [k]: v }));
}

/** The filters as the rules a list starts from, which the user can remove. */
export function filterRules(filters: Record<string, unknown>): RuleRow[] {
  return Object.entries(filters).map(([field, value]) => ({
    rule: { field, op: 'eq', value },
    join: 'and',
  }));
}
