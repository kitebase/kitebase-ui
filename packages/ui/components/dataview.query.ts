/**
 * dataview.query.ts — query construction helpers for DataView.
 *
 * Pure functions: no Svelte state, no side effects.
 * Used by DataView.svelte for loadData/loadMore, and will be the foundation
 * for the visual where-rule editor.
 */

import type { ViewSource, ViewColumn } from './dataview.types';
import { serializeRuleSet, toBlocks, type RuleRow } from './dataview.rules';

/**
 * What the user adds to the view's own query: the rules they built and the text
 * they typed. Both decide *which* rows, so both reload from offset 0.
 */
/** One level of ordering, as the editor's order row produces it. */
export interface OrderSpec {
  field: string;
  dir: 'asc' | 'desc';
}

export interface QueryExtras {
  /**
   * The table's primary key, so the select always carries something that names
   * the row. Defaults to `id` when the caller does not know it yet (the schema
   * may not have arrived) — which is right for most tables and wrong loudly,
   * not silently, for the others.
   */
  pk?: string;
  /** The rule editor's flat list; blocks and payload are derived from it. */
  rules?: RuleRow[];
  /** Quick search text — expanded server-side over the table's search fields. */
  search?: string;
  /**
   * The order the query asks the server for, replacing the descriptor's own
   * `order_by` — which only says how the list opens.
   *
   * It belongs to the query definition, not to the grid: clicking a column
   * header sorts what is loaded, locally and instantly, and must not cost a
   * fetch and a reset of the pagination. The rule editor is where an order over
   * the *whole* set is asked for, deliberately, along with the conditions.
   */
  order?: OrderSpec[];
  /**
   * Keys the server asked the view to carry, verbatim, on every query — the
   * answer of a command such as `{action: 'set_query_params'}`. The view does
   * not read them: what `include_archived` means is between the command that
   * set it and the query behavior that honours it.
   */
  params?: Record<string, unknown>;
  /**
   * Restrict the query to these keys, everything else unchanged. It is how a
   * view asks "which of these rows do you still show, and how" after a
   * record was touched — the answer comes from the same filters, joins and
   * behaviors as the list itself, so the view never has to guess.
   */
  only?: unknown[];
  /**
   * Fields a renderer needs whether or not the view shows them: the board
   * reads the state of every row, which the list may show only by name.
   */
  also?: string[];
  /**
   * Conditions a renderer holds while it is on screen, ANDed like the
   * domain: the board shows one pipeline at a time.
   */
  context?: Record<string, unknown>;
}

// ── Field key extraction ───────────────────────────────────────────────────
// columns.field may be a plain name ("title"), a Model.field notation
// ("Author.first_name"), or a full QB select expression with alias
// ("CASE WHEN ... END as display_name"). The Tabulator field key is always
// the alias (everything after the last " as "), or the last dot-segment.

export function extractFieldKey(expr: string): string {
  const lower = expr.toLowerCase();
  const asIdx = lower.lastIndexOf(' as ');
  if (asIdx !== -1) return expr.slice(asIdx + 4).trim();
  const dot = expr.lastIndexOf('.');
  if (dot !== -1) return expr.slice(dot + 1);
  return expr;
}

// ── Trigger variable substitution ─────────────────────────────────────────
// Recursively replace $trigger.field with values from the trigger payload.
// When the entire string is a single $trigger.field reference, the raw typed
// value is returned (preserving number/boolean types for QB filter comparisons).
// When $trigger.* appears inside a larger string, values are stringified.

export function applyTriggerVars(value: unknown, trig: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const exact = value.match(/^\$trigger\.(\w+)$/);
    if (exact) {
      const v = trig[exact[1]];
      return v !== undefined ? v : value;
    }
    return value.replace(/\$trigger\.(\w+)/g, (_, key) => {
      const v = trig[key];
      return v !== undefined ? String(v) : '';
    });
  }
  if (Array.isArray(value)) return value.map(v => applyTriggerVars(v, trig));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = applyTriggerVars(v, trig);
    }
    return out;
  }
  return value;
}

// Returns true if value (or any nested value) contains a $trigger.* reference.
export function hasTriggerVars(value: unknown): boolean {
  if (typeof value === 'string') return /\$trigger\./.test(value);
  if (Array.isArray(value)) return value.some(hasTriggerVars);
  if (value && typeof value === 'object') return Object.values(value as object).some(hasTriggerVars);
  return false;
}

// ── Join normalisation ─────────────────────────────────────────────────────
// Convert a descriptor join item to QB-compatible object.

export function normalizeJoin(
  j: string | Record<string, unknown>,
  trig: Record<string, unknown>,
): Record<string, unknown> {
  if (typeof j === 'string') return { table: j };
  if (typeof j.table === 'string' && typeof j.on === 'string') {
    return { [j.table]: j.on };
  }
  // Pass-through (e.g. { via: ..., where: [...] }) — apply trigger substitution
  return applyTriggerVars(j, trig) as Record<string, unknown>;
}

// ── Query construction ─────────────────────────────────────────────────────
// Builds a QB-compatible query object from a ViewSource descriptor.
// NOTE: limit/offset are NOT set here — they are applied by the caller
// (loadData/loadMore) as pagination parameters.

export function buildQuery(
  src: ViewSource,
  columns: ViewColumn[] | undefined,
  trig: Record<string, unknown>,
  extras?: QueryExtras,
): Record<string, unknown> {
  // The opaque params go in first: what the view builds itself wins over them.
  const q: Record<string, unknown> = { ...(extras?.params ?? {}), table: src.model };

  // select: the descriptor's column fields, plus the key — a row the grid cannot
  // name is a row it cannot edit, select or delete.
  //
  // The key is the table's own, not the literal `id`: a taxonomy keyed by its
  // code (`A1`…`A25`) has no `id`, and asking for one made the whole list fail
  // with a 400 the person only saw as an empty grid.
  if (columns && columns.length > 0) {
    const pk = extras?.pk || 'id';
    const fields = columns.map(c => c.field);
    const hasPk = fields.some(f => f === pk || extractFieldKey(f) === pk);
    if (!hasPk) fields.unshift(pk);
    for (const f of extras?.also ?? []) {
      if (!fields.some(x => x === f || extractFieldKey(x) === f)) fields.push(f);
    }
    q.select = fields;
  }

  if (src.joins && src.joins.length > 0) {
    q.joins = src.joins.map(j => normalizeJoin(j, trig));
  }

  // order_by: "-field" prefix → ["field", "desc"]
  if (extras?.order?.length) {
    q.order_by = extras.order.map(s => (s.dir === 'desc' ? [s.field, 'desc'] : s.field));
  } else if (src.order_by && src.order_by.length > 0) {
    q.order_by = src.order_by.map(f =>
      typeof f === 'string' && f.startsWith('-') ? [f.slice(1), 'desc'] : f,
    );
  }

  if (src.group_by && src.group_by.length > 0) {
    q.group_by = src.group_by;
  }

  const rules = extras?.rules?.length
    ? serializeRuleSet(toBlocks(extras.rules))
    : undefined;

  const context = extras?.context && Object.keys(extras.context).length > 0
    ? Object.entries(extras.context).map(([k, v]) => ({ [k]: v }))
    : undefined;
  const filters = mergeDomain(src, trig, rules, extras?.only, extras?.pk || 'id', context);
  if (filters !== undefined) {
    q.filters = filters;
  }

  // The quick search travels as a key of its own: the server expands it over
  // the table's search fields and ANDs it, so it can only narrow the filters,
  // and emptying the box leaves the rules untouched.
  const search = extras?.search?.trim();
  if (search) {
    q.search = search;
  }

  return q;
}

// ── Domain ─────────────────────────────────────────────────────────────────
// `domain` and `filters` share the querybuilder syntax, so either may be a
// bare condition, a list of conditions, or {conditions: [...]}.

function conditionsOf(f: unknown): unknown[] | null {
  if (f === undefined || f === null || f === '') return null;
  if (Array.isArray(f)) return f.length > 0 ? f : null;
  if (typeof f === 'object') {
    const o = f as Record<string, unknown>;
    // A wrapper is unwrapped into the group's contents — but {op: 'or',
    // conditions: [...]} is one condition that carries its own boundary, and
    // unwrapping it would spill its branches into the enclosing AND.
    if ('conditions' in o && !('op' in o)) {
      const inner = o.conditions;
      if (Array.isArray(inner)) return inner.length > 0 ? inner : null;
      return inner === undefined || inner === null ? null : [inner];
    }
  }
  return [f];
}

// Combine what the view declares with what the user built: the domain, the
// descriptor's own filters, and the rules from the editor. They go in as
// sibling groups rather than one flat list — a condition list may open with
// ['op', 'or'], and concatenating would make the domain one more branch of that
// disjunction, widening the view instead of narrowing it.
//
// Three groups also means three independent lifetimes: clearing the rules
// leaves the view's own conditions where they were.
export function mergeDomain(
  src: ViewSource,
  trig: Record<string, unknown>,
  rules?: unknown[],
  only?: unknown[],
  pk = 'id',
  context?: unknown[],
): unknown | undefined {
  const groups = [
    context && context.length > 0 ? context : null,
    conditionsOf(applyTriggerVars(src.domain, trig)),
    conditionsOf(applyTriggerVars(src.filters, trig)),
    rules && rules.length > 0 ? rules : null,
    only && only.length > 0 ? [{ [pk]: ['in', only] }] : null,
  ].filter((g): g is unknown[] => g !== null);

  if (groups.length === 0) return undefined;
  if (groups.length === 1) return { conditions: groups[0] };
  return { conditions: groups };
}
