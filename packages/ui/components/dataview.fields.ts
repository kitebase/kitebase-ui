/**
 * dataview.fields.ts — which fields the rule editor may talk about.
 *
 * Pure functions: no Svelte state, no side effects. Turns what the server says
 * about a table into the flat list the field picker shows, and answers the two
 * questions the editor asks of every field: which operators fit it, and which
 * widget collects its values.
 *
 * §9 of the querybuilder design says the common case declares nothing — a column
 * of the main table is in the picker because it exists. Relational paths are the
 * declared case and arrive later; the shape here already carries a path in
 * `name`, since a rule field is a string either way.
 */

import type { TableInfo, TableColumnInfo, TypeRegistry, QueryRank } from '../api/serverConfig.svelte';
import type { RuleOperator } from './dataview.rules';
import { operatorsFor } from './dataview.rules';

/** What decides both the operator list and the value widget. */
export type FieldPrimitive =
  | 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'time' | 'fk' | 'codes';

export interface FilterField {
  /** The rule's `field`: a column name today, a declared path tomorrow. */
  name: string;
  label: string;
  primitive: FieldPrimitive;
  /** Target table of a foreign key — the lookup the value widget opens. */
  fkTarget?: string;
  /** Where the codes of a set come from — the value widget's choices. */
  choicesEndpoint?: string;
  /** Part of the primary key. */
  pk?: boolean;
  /**
   * Sorting this column is something the database can do without sorting
   * everything: a suggestion in the order combo, never a restriction. A large
   * archive ordered on a free column is a legitimate request, paid in waiting.
   */
  indexed?: boolean;
  /** Declared on the column (`query_rank:`); absent means `normal`. */
  rank?: QueryRank;
}

// ── Primitive resolution ───────────────────────────────────────────────────
// The base type names are the only fixed point — SQLAlchemy's and the core's
// own — and a plugin type is followed up its inheritance chain until one of
// them answers.

const BASE_PRIMITIVE: Record<string, FieldPrimitive> = {
  String: 'string', Text: 'string', Unicode: 'string', UnicodeText: 'string',
  Integer: 'number', BigInteger: 'number', SmallInteger: 'number',
  Float: 'number', Numeric: 'number', Decimal: 'number',
  Boolean: 'boolean',
  Date: 'date', DateTime: 'datetime', Time: 'time',
  CodeSet: 'codes',
};

/** Types nothing sensible can be asked of in a where clause. */
const UNFILTERABLE = new Set(['JSON', 'LargeBinary', 'PickleType']);

export function fieldPrimitive(
  typeName: string | undefined,
  types: TypeRegistry,
): FieldPrimitive | undefined {
  if (!typeName) return undefined;
  if (UNFILTERABLE.has(typeName)) return undefined;
  if (BASE_PRIMITIVE[typeName]) return BASE_PRIMITIVE[typeName];

  const info = types[typeName];
  if (!info) return undefined;
  for (const ancestor of info.inheritance ?? []) {
    if (UNFILTERABLE.has(ancestor)) return undefined;
    if (BASE_PRIMITIVE[ancestor]) return BASE_PRIMITIVE[ancestor];
  }
  if (info.python_type && BASE_PRIMITIVE[info.python_type]) {
    return BASE_PRIMITIVE[info.python_type];
  }
  return undefined;
}

/**
 * Operators for a field. A foreign key is identity only — see the note on
 * OPERATORS_BY_PRIMITIVE for why a "contains" on an FK is never offered.
 */
export function operatorsForField(field: FilterField): RuleOperator[] {
  return operatorsFor(field.primitive);
}

// ── The picker's list ──────────────────────────────────────────────────────

function humanize(name: string): string {
  return name
    .replace(/_id$/, '')
    .replace(/_/g, ' ')
    .replace(/^./, c => c.toUpperCase());
}

// A position, not a verdict: `top` opens the list, `low` closes the visible
// part, `more` waits behind "Show more", `none` is never offered. Within a rank
// the declaration order holds, so a derived plugin moves a field by giving it a
// rank, without reordering the columns of the base.
const RANK_WEIGHT: Record<string, number> = { top: 0, normal: 1, low: 2, more: 3 };

function rankWeight(f: FilterField): number {
  return RANK_WEIGHT[f.rank ?? 'normal'] ?? RANK_WEIGHT.normal;
}

/**
 * Every column of the table a rule may name, by `query_rank` and then in
 * declaration order.
 *
 * Left out, and why each:
 *  - `query_rank: none`: the model says nobody asks for it;
 *  - `secret`: not addressable from a client in any direction. The server
 *    refuses a filter or an order naming one, so offering it would build a
 *    picker whose entries produce errors;
 *  - `virtual`: computed for the select, with no column behind it to compare;
 *  - types nothing can be asked of (JSON, binary).
 */
export function filterFields(
  table: TableInfo | undefined,
  types: TypeRegistry,
): FilterField[] {
  if (!table) return [];

  const pkSet = new Set(table.pk_fields ?? []);
  // A compound index is usable for ordering by its leading column: the ones
  // after it only refine an order that already started there.
  const leading = new Set<string>(
    (table.indexes ?? [])
      .map(idx => idx.columns?.[0])
      .filter((c): c is string => !!c),
  );

  const out: FilterField[] = [];
  for (const col of table.columns ?? []) {
    const field = filterField(col, types, pkSet, leading);
    if (field) out.push(field);
  }
  // Array.prototype.sort is stable: equal ranks keep the declaration order.
  return out.sort((a, b) => rankWeight(a) - rankWeight(b));
}

/** The fields shown at once, and the ones behind "Show more". */
export function splitByRank(fields: FilterField[]): { main: FilterField[]; more: FilterField[] } {
  return {
    main: fields.filter(f => f.rank !== 'more'),
    more: fields.filter(f => f.rank === 'more'),
  };
}

function filterField(
  col: TableColumnInfo,
  types: TypeRegistry,
  pkSet: Set<string>,
  leading: Set<string>,
): FilterField | null {
  if (col.secret || col.virtual || col.query_rank === 'none') return null;

  const fk = col.foreign_key;
  const primitive = fk ? 'fk' : fieldPrimitive(col.type, types);
  if (!primitive) return null;

  const pk = pkSet.has(col.name);
  return {
    name: col.name,
    label: col.label ?? humanize(col.name),
    primitive,
    ...(fk ? { fkTarget: fk.target } : {}),
    ...(col.choices_endpoint ? { choicesEndpoint: col.choices_endpoint } : {}),
    ...(pk ? { pk: true } : {}),
    ...(pk || col.index === true || col.unique === true || leading.has(col.name)
      ? { indexed: true } : {}),
    ...(col.query_rank && col.query_rank !== 'normal' ? { rank: col.query_rank } : {}),
  };
}

/**
 * The same fields for the order combo: by `query_rank` first, and within a
 * rank the ones the database can order cheaply on top — the key, then the
 * indexed columns, then the rest in their own order. A set of codes is left
 * out: its stored form sorts, but by nothing a reader would recognise.
 */
export function orderFields(fields: FilterField[]): FilterField[] {
  const cheap = (f: FilterField) => (f.pk ? 0 : f.indexed ? 1 : 2);
  return fields.filter(f => f.primitive !== 'codes').sort((a, b) => rankWeight(a) - rankWeight(b) || cheap(a) - cheap(b));
}
