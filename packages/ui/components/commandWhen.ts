/**
 * `when` on a command: whether it shows for the row in hand.
 *
 *   when: tasks_to_copy                          # a field of the row, true when full
 *   when: {field: layout, op: notempty}          # a rule, the shape of a list's rules
 *   when: [{field: state, op: in, value: [planned, active]},
 *          {field: assignee_id, op: eq, value: $ctx.partner_id}]   # all of them
 *
 * The row is the one the list loaded: its own columns, the ones it joins, the
 * virtual ones, hidden or not. What a condition needs from elsewhere is
 * brought into the row by a column. Only the operators a loaded value
 * decides are here; tokens resolve as in a view's rules.
 *
 * It hides, it does not protect: the endpoint checks again on every call.
 */
import { resolveContextToken } from './contextTokens';

export interface WhenRule {
  field: string;
  op: 'eq' | 'ne' | 'in' | 'gt' | 'ge' | 'lt' | 'le' | 'empty' | 'notempty';
  value?: unknown;
}

export type When = string | WhenRule | WhenRule[];

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === ''
    || (Array.isArray(value) && value.length === 0);
}

/** A field read as a yes: full, and not false or zero. */
function truthy(value: unknown): boolean {
  return !isEmpty(value) && value !== false && value !== 0 && value !== '0';
}

function same(a: unknown, b: unknown): boolean {
  if (isEmpty(a) || isEmpty(b)) return isEmpty(a) && isEmpty(b);
  return String(a) === String(b);
}

function compare(a: unknown, b: unknown): number | null {
  if (isEmpty(a) || isEmpty(b)) return null;
  const x = Number(a), y = Number(b);
  if (!Number.isNaN(x) && !Number.isNaN(y)) return x - y;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function ruleHolds(rule: WhenRule, row: Record<string, unknown>): boolean {
  const value = row[rule.field];
  const wanted = resolveContextToken(rule.value);
  switch (rule.op) {
    case 'empty': return isEmpty(value);
    case 'notempty': return !isEmpty(value);
    case 'eq': return same(value, wanted);
    case 'ne': return !same(value, wanted);
    case 'in': return (Array.isArray(wanted) ? wanted : [wanted])
      .some((w) => same(value, resolveContextToken(w)));
    default: {
      const order = compare(value, wanted);
      if (order === null) return false;
      return rule.op === 'gt' ? order > 0 : rule.op === 'ge' ? order >= 0
        : rule.op === 'lt' ? order < 0 : order <= 0;
    }
  }
}

/**
 * Whether a command with this `when` shows for `row`. No `when`: always. A
 * `when` and no row: never, since there is nothing to ask it of.
 */
export function commandApplies(when: When | undefined, row: Record<string, unknown> | null): boolean {
  if (when === undefined || when === null) return true;
  if (!row) return false;
  if (typeof when === 'string') return truthy(row[when]);
  const rules = Array.isArray(when) ? when : [when];
  return rules.every((rule) => ruleHolds(rule, row));
}
