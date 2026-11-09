/**
 * dataview.rules.ts — the user-built WHERE clause.
 *
 * Pure functions: no Svelte state, no side effects. The editor holds a flat list
 * of rows, each bound to the previous one by AND or OR; blocks are *derived* from
 * that list, never built by hand. With the standard precedence — AND binds tighter
 * than OR — a flat list is exactly an OR of AND groups, so the grouping the editor
 * draws is a rendering of the list and nothing else. Depth is two by construction:
 * there is no way to express a parenthesis, and so no way to reach a state the
 * editor cannot draw.
 *
 * The output is a querybuilder condition group, meant to sit beside the view's
 * domain as a sibling — see mergeDomain in dataview.query.ts.
 */

// ── Operators ──────────────────────────────────────────────────────────────
// The operators the user picks are not the ones the querybuilder applies:
// "contains" is an ilike whose wildcards this module supplies, "is empty" carries
// no value at all. Serialisation maps one onto the other.

export type RuleOperator =
  | 'contains' | 'startswith'
  | 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le'
  | 'between' | 'in' | 'has'
  | 'istrue' | 'isfalse'
  | 'empty' | 'notempty';

/** How many values the operator needs — drives both the widget and completeness. */
export type ValueArity = 'none' | 'one' | 'two' | 'many';

export const OPERATOR_ARITY: Record<RuleOperator, ValueArity> = {
  contains: 'one', startswith: 'one',
  eq: 'one', ne: 'one', gt: 'one', ge: 'one', lt: 'one', le: 'one',
  between: 'two', in: 'many', has: 'many',
  istrue: 'none', isfalse: 'none',
  empty: 'none', notempty: 'none',
};

/**
 * Operators offered per primitive type. A schema type may override this list
 * (an interval, a delimited set): the base map answers for the primitives, which
 * are not an application decision.
 *
 * On a foreign key the line is not identity against order: it is the key against
 * the display. There is deliberately no "contains" on an FK, because a display
 * may be a concatenation (code + description, primary key included) and the
 * predicate would then depend on presentation settings; the well-defined form is
 * a path to a named column of the target, which belongs to the relational step.
 * A range, on the other hand, reads the stored key — "articles from AB to
 * ABzzzz", "payment methods 1 to 100" is the selection mask every gestionale has
 * had — and is as well defined as an equality. `between` with one bound filled
 * covers "from X onwards", which is why `≥` and `≤` are not offered on top.
 */
export const OPERATORS_BY_PRIMITIVE: Record<string, RuleOperator[]> = {
  string: ['contains', 'startswith', 'eq', 'ne', 'in', 'empty', 'notempty'],
  number: ['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'between', 'in', 'empty', 'notempty'],
  date: ['eq', 'lt', 'gt', 'between', 'empty', 'notempty'],
  datetime: ['eq', 'lt', 'gt', 'between', 'empty', 'notempty'],
  time: ['eq', 'lt', 'gt', 'between', 'empty', 'notempty'],
  // A boolean asks one question with three answers — true, false, and not
  // asking — and an operator pair can only say two of them. `is` with a
  // three-state value keeps the general rule instead of an exception: an empty
  // value is a switched off row, here as everywhere else, so a boolean row can
  // sit in a selection mask waiting to be decided. `istrue`/`isfalse` remain
  // expressible for a rule declared in YAML, where there is no widget to fill.
  boolean: ['eq', 'empty', 'notempty'],
  fk: ['eq', 'in', 'between', 'empty', 'notempty'],
  // A set of codes is asked which codes it holds: `has` with several is any of
  // them. Holding none is stored as nothing, so `empty` asks that.
  codes: ['has', 'empty', 'notempty'],
};

export function operatorsFor(primitive: string, override?: RuleOperator[]): RuleOperator[] {
  return override ?? OPERATORS_BY_PRIMITIVE[primitive] ?? OPERATORS_BY_PRIMITIVE.string;
}

/**
 * Words to choose with, symbols to read back.
 *
 * An operator is picked rarely and re-read constantly, and the two want opposite
 * notations: the dropdown carries words, because an operator is discovered by
 * reading it; the cell and the chip carry the symbol where a convention already
 * exists, because every character saved there is width that goes to the value —
 * the part that tells one condition from another. Where no convention exists the
 * word stays: inventing a symbol for "contains" would ask the reader to learn it.
 *
 * Both are English keys: the caller runs them through `_()`.
 */
export const OPERATOR_WORD: Record<RuleOperator, string> = {
  contains: 'contains', startswith: 'starts with',
  eq: 'is', ne: 'is not',
  gt: 'greater than', ge: 'greater or equal',
  lt: 'less than', le: 'less or equal',
  between: 'between', in: 'is one of', has: 'has any of',
  istrue: 'is true', isfalse: 'is false',
  empty: 'is empty', notempty: 'is not empty',
};

const OPERATOR_SYMBOL: Partial<Record<RuleOperator, string>> = {
  eq: '=', ne: '≠',
  gt: '>', ge: '≥', lt: '<', le: '≤',
  between: '><',
};

/** The symbol where one exists, the English word where it does not. */
export function operatorSymbol(op: RuleOperator): string {
  return OPERATOR_SYMBOL[op] ?? OPERATOR_WORD[op] ?? op;
}

// ── Model ──────────────────────────────────────────────────────────────────

export interface Rule {
  /** Column name, or a declared path once relational steps land. */
  field: string;
  op: RuleOperator;
  /** Scalar for one, [lo, hi] for two, array for many. Absent when arity is none. */
  value?: unknown;
  /**
   * Display labels for values that are records, kept beside the ids they belong
   * to. Presentation only: never serialised, never sent. The lookup hands them
   * over at the moment of choosing, so they cost nothing; a rule arriving from
   * outside the session (declared in YAML, or reloaded from a saved query) has
   * none, and shows its ids until the picker is reopened.
   */
  labels?: string[];
}

/** `join` binds the row to the one above it; it is ignored on the first row. */
export interface RuleRow {
  rule: Rule;
  join: 'and' | 'or';
}

/**
 * The rules a view declares it opens with (`rules:` in its YAML), as the rows
 * the filter panel shows. Undefined when it declares none.
 */
export function declaredRules(
  view: { rules?: Array<{ field: string; op: string; value?: unknown }> },
): RuleRow[] | undefined {
  return view.rules?.map(({ field, op, value }) => ({
    rule: { field, op: op as RuleOperator, ...(value !== undefined ? { value } : {}) },
    join: 'and' as const,
  }));
}

/** Conditions in AND. */
export type Block = Rule[];

/** Blocks in OR — disjunctive normal form, depth two by construction. */
export type RuleSet = Block[];

// ── Flat list ↔ blocks ─────────────────────────────────────────────────────

/** Split the edited list into blocks: every row joined by OR opens a new one. */
export function toBlocks(rows: RuleRow[]): RuleSet {
  const blocks: RuleSet = [];
  rows.forEach((row, i) => {
    if (i === 0 || row.join === 'or') blocks.push([]);
    blocks[blocks.length - 1].push(row.rule);
  });
  return blocks;
}

/**
 * The same split, but carrying the row indices instead of the rules — what the
 * editor needs to draw a box around rows it keeps in one flat list.
 */
export function blockRowIndices(rows: RuleRow[]): number[][] {
  const blocks: number[][] = [];
  rows.forEach((row, i) => {
    if (i === 0 || row.join === 'or') blocks.push([]);
    blocks[blocks.length - 1].push(i);
  });
  return blocks;
}

/** Flatten blocks back into the edited list. Inverse of toBlocks. */
export function toRows(blocks: RuleSet): RuleRow[] {
  const rows: RuleRow[] = [];
  blocks.forEach((block, b) => {
    block.forEach((rule, i) => {
      rows.push({ rule, join: i === 0 && b > 0 ? 'or' : 'and' });
    });
  });
  return rows;
}

/**
 * Duplicate a block and append it as a new alternative. This is what makes the
 * normal form bearable: expressing `A AND (B OR C)` means repeating A, and
 * repeating it must be one click rather than retyping.
 */
export function duplicateBlock(blocks: RuleSet, index: number): RuleSet {
  const source = blocks[index];
  if (!source) return blocks;
  return [...blocks, source.map(r => ({ ...r }))];
}

// ── Completeness ───────────────────────────────────────────────────────────

/**
 * A rule the user has not finished is not a rule. Emitting it would silently
 * narrow the set — an empty text compared for equality matches nothing.
 */
export function isComplete(rule: Rule): boolean {
  const arity = OPERATOR_ARITY[rule.op];
  if (arity === undefined) return false;
  if (!rule.field) return false;

  switch (arity) {
    case 'none':
      return true;
    case 'two':
      // One bound is enough: an interval filled on one side only is an open
      // interval, not an unfinished row. The real question is nearly always
      // open on one side — "from January onwards", "up to a thousand" — and
      // demanding the other end would ask the user to write something false
      // (31/12/2099) to satisfy the form.
      return Array.isArray(rule.value) && rule.value.some(hasValue);
    case 'many':
      return Array.isArray(rule.value) && rule.value.length > 0;
    default:
      return hasValue(rule.value);
  }
}

function hasValue(v: unknown): boolean {
  return v !== undefined && v !== null && v !== '';
}

// ── Serialisation ──────────────────────────────────────────────────────────

function escapeLike(v: unknown): string {
  return String(v).replace(/([%_\\])/g, '\\$1');
}

/**
 * An interval missing one end degrades into the comparison it means. Both ends
 * empty never reaches here — the rule is incomplete and does not enter the query.
 */
function serializeBetween(f: string, value: unknown): Record<string, unknown> {
  const [lo, hi] = Array.isArray(value) ? value : [];
  if (hasValue(lo) && hasValue(hi)) return { [f]: ['between', lo, hi] };
  if (hasValue(lo)) return { [f]: ['ge', lo] };
  return { [f]: ['le', hi] };
}

/**
 * One rule as a querybuilder concise condition: `{field: value}` for equality,
 * `{field: [op, ...values]}` otherwise. The querybuilder applies ilike patterns
 * verbatim, so the wildcards are added here.
 */
export function serializeRule(rule: Rule): Record<string, unknown> {
  const f = rule.field;
  switch (rule.op) {
    case 'eq':         return { [f]: rule.value };
    case 'istrue':     return { [f]: true };
    case 'isfalse':    return { [f]: false };
    case 'contains':   return { [f]: ['ilike', `%${escapeLike(rule.value)}%`] };
    case 'startswith': return { [f]: ['ilike', `${escapeLike(rule.value)}%`] };
    case 'empty':      return { [f]: ['isnull'] };
    case 'notempty':   return { [f]: ['isnotnull'] };
    case 'between':    return serializeBetween(f, rule.value);
    case 'in':         return { [f]: ['in', rule.value] };
    default:           return { [f]: [rule.op, rule.value] };
  }
}

/**
 * The whole rule set as the contents of one condition group, ready to be placed
 * beside the domain. A single block stays a flat AND list; two or more become an
 * `or` node whose branches are those lists.
 *
 * Incomplete rules and the blocks left empty by dropping them never reach the
 * query: an empty block would otherwise widen the set to everything.
 * Returns undefined when nothing is left, so the caller can omit the slot.
 */
export function serializeRuleSet(blocks: RuleSet): unknown[] | undefined {
  const groups = blocks
    .map(block => block.filter(isComplete).map(serializeRule))
    .filter(group => group.length > 0);

  if (groups.length === 0) return undefined;
  if (groups.length === 1) return groups[0];
  return [{ op: 'or', conditions: groups }];
}

// ── Contradictions ─────────────────────────────────────────────────────────

/**
 * Two rows on the same field inside the same block can contradict each other —
 * `is 5` AND `is 7` — and the result is "no rows": a wrong answer given with
 * confidence, produced by the editor instead of by the query. The client can
 * prove it without asking the server anything.
 *
 * This is not a uniqueness check: two conditions on one field in AND are often
 * the right ones (`≥ 5` AND `≤ 10` is an interval). It is a contradiction check,
 * and it stops at the pairs that are cheap to decide — on a `contains` it is not,
 * and guessing would be worse than keeping quiet.
 *
 * What the editor does with it is say it on the row and offer the OR in one
 * click. It does not turn the block off by itself: silently reducing a query the
 * user wrote is changing the question without saying so.
 */
export type ConflictReason =
  | 'distinct-values'      // is X AND is Y, or two disjoint value lists
  | 'value-outside-bounds' // is X AND a range X falls outside of
  | 'disjoint-bounds'      // ≤ 10 AND ≥ 20
  | 'null-and-value';      // is empty AND anything that demands a value

export interface RuleConflict {
  /** Indices inside the block, in the order the rules appear. */
  a: number;
  b: number;
  field: string;
  reason: ConflictReason;
}

/** What a rule claims about the field, when the claim is cheap to compare. */
type Claim =
  | { kind: 'null' }
  | { kind: 'notnull' }
  | { kind: 'set'; values: unknown[] }
  | { kind: 'range'; lo?: unknown; loStrict?: boolean; hi?: unknown; hiStrict?: boolean }
  | null;

function claimOf(rule: Rule): Claim {
  switch (rule.op) {
    case 'empty':    return { kind: 'null' };
    case 'notempty': return { kind: 'notnull' };
    // Equality and membership are the same claim with a different cardinality,
    // which is what lets one comparison cover `is`/`is`, `is`/`is one of` and
    // `is one of`/`is one of`.
    case 'eq':       return { kind: 'set', values: [rule.value] };
    case 'istrue':   return { kind: 'set', values: [true] };
    case 'isfalse':  return { kind: 'set', values: [false] };
    case 'in':       return Array.isArray(rule.value) ? { kind: 'set', values: rule.value } : null;
    case 'ge':       return { kind: 'range', lo: rule.value };
    case 'gt':       return { kind: 'range', lo: rule.value, loStrict: true };
    case 'le':       return { kind: 'range', hi: rule.value };
    case 'lt':       return { kind: 'range', hi: rule.value, hiStrict: true };
    case 'between': {
      const [lo, hi] = Array.isArray(rule.value) ? rule.value : [];
      const range: Claim = { kind: 'range' };
      if (hasValue(lo)) range.lo = lo;
      if (hasValue(hi)) range.hi = hi;
      return range.lo === undefined && range.hi === undefined ? null : range;
    }
    // `is not`, `contains`, `starts with`: nothing decidable at this price.
    default:         return null;
  }
}

/** Ordering, only where it is unambiguous. Anything else declines to answer. */
function cmp(a: unknown, b: unknown): number | null {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return null;
}

/** Values are compared as written: `5` and `'5'` count as the same value. */
function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  return String(a) === String(b);
}

function inRange(v: unknown, r: { lo?: unknown; loStrict?: boolean; hi?: unknown; hiStrict?: boolean }): boolean | null {
  if (r.lo !== undefined) {
    const c = cmp(v, r.lo);
    if (c === null) return null;
    if (c < 0 || (c === 0 && r.loStrict)) return false;
  }
  if (r.hi !== undefined) {
    const c = cmp(v, r.hi);
    if (c === null) return null;
    if (c > 0 || (c === 0 && r.hiStrict)) return false;
  }
  return true;
}

function conflictOf(a: Claim, b: Claim): ConflictReason | null {
  // A NULL satisfies no comparison, so `is empty` excludes every other condition
  // on the field — `is not empty`, and equally the ones this module makes no
  // claim about: `contains 'x'` and `is not 5` are both unknown for a NULL, and
  // a row is kept only by a condition that is true.
  if (a?.kind === 'null' || b?.kind === 'null') {
    const other = a?.kind === 'null' ? b : a;
    return other?.kind === 'null' ? null : 'null-and-value';
  }

  if (!a || !b) return null;
  if (a.kind === 'notnull' || b.kind === 'notnull') return null;

  if (a.kind === 'set' && b.kind === 'set') {
    const shared = a.values.some(x => b.values.some(y => sameValue(x, y)));
    return shared ? null : 'distinct-values';
  }

  if (a.kind === 'set' || b.kind === 'set') {
    const set = a.kind === 'set' ? a : (b as Extract<Claim & object, { kind: 'set' }>);
    const range = a.kind === 'set' ? b : a;
    if (range.kind !== 'range') return null;
    let anyPossible = false;
    for (const v of set.values) {
      const fits = inRange(v, range);
      if (fits === null) return null;   // not comparable: no claim
      if (fits) anyPossible = true;
    }
    return anyPossible ? null : 'value-outside-bounds';
  }

  if (a.kind === 'range' && b.kind === 'range') {
    // The intersection is empty when the greatest lower bound passes the least
    // upper bound — or meets it while one of the two excludes it.
    const lo = pickBound(a, b, 'lo');
    const hi = pickBound(a, b, 'hi');
    if (lo === null || hi === null) return null;
    if (lo === undefined || hi === undefined) return null;
    const c = cmp(lo.value, hi.value);
    if (c === null) return null;
    if (c > 0 || (c === 0 && (lo.strict || hi.strict))) return 'disjoint-bounds';
  }

  return null;
}

type Bound = { value: unknown; strict: boolean };

/**
 * The tighter of the two bounds: the greater lower bound, the lesser upper one.
 * `null` means the two are not comparable and nothing can be concluded.
 */
function pickBound(
  a: { lo?: unknown; loStrict?: boolean; hi?: unknown; hiStrict?: boolean },
  b: { lo?: unknown; loStrict?: boolean; hi?: unknown; hiStrict?: boolean },
  side: 'lo' | 'hi',
): Bound | undefined | null {
  const strictKey = side === 'lo' ? 'loStrict' : 'hiStrict';
  const av = a[side], bv = b[side];
  if (av === undefined && bv === undefined) return undefined;
  if (av === undefined) return { value: bv, strict: !!b[strictKey] };
  if (bv === undefined) return { value: av, strict: !!a[strictKey] };
  const c = cmp(av, bv);
  if (c === null) return null;
  const takeA = side === 'lo' ? c >= 0 : c <= 0;
  return takeA ? { value: av, strict: !!a[strictKey] } : { value: bv, strict: !!b[strictKey] };
}

/** Every contradicting pair of a block, as indices into it. */
export function blockConflicts(block: Block): RuleConflict[] {
  const out: RuleConflict[] = [];
  // An unfinished row is not a rule and does not enter the query, so it cannot
  // contradict anything: it is skipped rather than given an empty claim.
  const complete = block.map(isComplete);
  const claims = block.map(claimOf);

  for (let i = 0; i < block.length; i++) {
    for (let j = i + 1; j < block.length; j++) {
      if (!complete[i] || !complete[j]) continue;
      if (!block[i].field || block[i].field !== block[j].field) continue;
      const reason = conflictOf(claims[i], claims[j]);
      if (reason) out.push({ a: i, b: j, field: block[i].field, reason });
    }
  }
  return out;
}
