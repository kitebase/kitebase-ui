/**
 * aggregate.ts — the buffer of a record and the collections edited with it.
 *
 * A node has the shape `load_tree` returns and `save_tree` accepts, at any depth:
 * `{id, values, children: {collection_id: [node, ...]}}`, plus the `op` the client
 * adds where the user acted. Deleted rows stay in the array carrying `op: delete`
 * rather than moving to a log of their own, so "copy a subtree" and "serialize for
 * the save" are one operation and there is no second state to keep in step.
 *
 * No imports on purpose: everything here is a function over plain objects, which
 * is what makes the serializer testable. The reactive half — who holds the buffer
 * and hands it down — belongs to the frame that owns the aggregate.
 */

export type NodeOp = 'create' | 'update' | 'delete';

export interface TreeNode {
  /** Real key, or a negative temporary id for a row that has never been written. */
  id: number;
  values: Record<string, unknown>;
  children: Record<string, TreeNode[]>;
  /** Absent on an untouched row: the payload calls that a pass-through. */
  op?: NodeOp;
  /**
   * Which keys the user changed, each with the value it had when loaded: the
   * base a three-way merge compares against. Client-side only, stripped on
   * serialization. An update writes these keys and nothing else: the form knows
   * what it edited, and sending back every loaded column would write values
   * nobody touched. A key brought back to its loaded value leaves the map. On a
   * create there is no base, and the map only lists the keys.
   */
  touched?: Record<string, unknown>;
  /**
   * The order of a collection below changed by hand — client-side only. The
   * order lives in the arrays, and a sequence is numbered from them when the
   * tree is saved; until then this is what says there is something to save.
   */
  reordered?: boolean;
  /**
   * What the server says about the record without it being a value: `$version`,
   * by which a save proves which version it was made from. Kept as received and
   * sent back on the root, never read here.
   */
  [meta: `$${string}`]: unknown;
}

export interface Aggregate {
  /** Page id — the descriptor that declares what may be written (relations.md §7). */
  page: string;
  root: TreeNode;
  /**
   * How many temporary ids this tree has handed out. One counter per tree, never
   * one per collection: `id_map` is global to the payload, so two nodes at
   * different depths both called -1 would graft one onto the other in silence.
   */
  seq: number;
}

// ── Building ────────────────────────────────────────────────────────────────

export function newAggregate(page: string, values: Record<string, unknown> = {}): Aggregate {
  const agg: Aggregate = { page, root: emptyNode(-1), seq: 1 };
  agg.root.op = 'create';
  agg.root.values = { ...values };
  agg.root.touched = keysOf(values);
  return agg;
}

/**
 * A new tree with rows already in it — a document the server prepared (a
 * sheet, a duplicate) for the person to finish. Every node is a create with a
 * temporary id, so the form opens with something to save and nothing written.
 */
export function draftAggregate(page: string, tree: DraftNode): Aggregate {
  const agg = newAggregate(page, tree.values ?? {});
  const fill = (node: TreeNode, children: DraftNode['children']) => {
    for (const [cid, rows] of Object.entries(children ?? {})) {
      for (const row of rows) {
        const child = newRow(agg, row.values ?? {});
        attachRow(node, cid, child);
        fill(child, row.children);
      }
    }
  };
  fill(agg.root, tree.children);
  return agg;
}

/** A tree as the server proposes it: values and rows, no ids. */
export interface DraftNode {
  values?: Record<string, unknown>;
  children?: Record<string, DraftNode[]>;
}

/** Wrap what `load_tree` returned: every id is real, nothing is touched yet. */
export function loadedAggregate(page: string, root: TreeNode): Aggregate {
  return { page, root: normalize(root), seq: 0 };
}

export function nextTempId(agg: Aggregate): number {
  agg.seq += 1;
  return -agg.seq;
}

/** A create's map: the keys, with no base to remember. */
function keysOf(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.keys(values).map((key) => [key, undefined]));
}

function emptyNode(id: number): TreeNode {
  return { id, values: {}, children: {} };
}

/** Fill in what a payload may legitimately omit — an absent `children` is a fact. */
function normalize(node: TreeNode): TreeNode {
  node.values ??= {};
  node.children ??= {};
  for (const rows of Object.values(node.children)) rows.forEach(normalize);
  return node;
}

// ── Reading ─────────────────────────────────────────────────────────────────

/**
 * The rows of a collection, creating the key so a caller can push into it.
 *
 * For **writers** only: it mutates, so calling it while rendering is forbidden —
 * Svelte refuses a write inside a derived, and rightly. Readers use `liveRows`.
 */
export function rowsOf(node: TreeNode, cid: string): TreeNode[] {
  return (node.children[cid] ??= []);
}

/**
 * What a grid shows: a deleted row is still in the buffer, but not on screen.
 *
 * Reads without creating. A collection nobody has added to yet is *absent*, and
 * an empty list is a different fact from a missing key — the serializer reads
 * that difference, and a render pass has no business writing it.
 */
export function liveRows(node: TreeNode, cid: string): TreeNode[] {
  return (node.children[cid] ?? []).filter((row) => row.op !== 'delete');
}

/** True when anything in the subtree carries an operation. */
export function isDirty(node: TreeNode): boolean {
  if (node.op || node.reordered) return true;
  return Object.values(node.children).some((rows) => rows.some(isDirty));
}

/**
 * A deep copy — a child frame edits its own and the parent replaces it on confirm.
 *
 * Written out rather than `structuredClone`, which throws on a node that lives in
 * a `$state` tree: a reactive proxy is not cloneable. Copying the structure we own
 * and leaving the leaf values alone is also the more honest copy — a value is
 * replaced whole, never mutated in place.
 */
export function cloneNode(node: TreeNode): TreeNode {
  const copy: TreeNode = {
    id: node.id,
    values: { ...node.values },
    children: Object.fromEntries(
      Object.entries(node.children).map(([cid, rows]) => [cid, rows.map(cloneNode)])
    ),
  };
  if (node.op) copy.op = node.op;
  if (node.touched) copy.touched = { ...node.touched };
  if (node.reordered) copy.reordered = true;
  return copy;
}

// ── Writing ─────────────────────────────────────────────────────────────────

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return (a === null || a === undefined) && (b === null || b === undefined);
}

/**
 * Apply what an editing surface produced. Returns true when something moved.
 *
 * The first change of a key records the value it had; a key brought back to
 * that value is no longer a change, and a row left with none is clean again.
 * A row already being created stays a create (its values travel whole), and a
 * deleted row is not resurrected by a stray write.
 */
export function setValues(node: TreeNode, patch: Record<string, unknown>): boolean {
  if (node.op === 'delete') return false;

  const touched = { ...(node.touched ?? {}) };
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    if (same(node.values[key], value)) continue;
    if (!(key in touched)) touched[key] = node.values[key];
    node.values[key] = value;
    if (node.op !== 'create' && same(value, touched[key])) delete touched[key];
    changed = true;
  }
  if (!changed) return false;

  node.touched = touched;
  if (node.op === 'create') return true;
  if (Object.keys(touched).length > 0) node.op = 'update';
  else delete node.op;
  return true;
}

/**
 * A row that belongs to no collection yet.
 *
 * Detached on purpose: a row being filled in on a frame that the user may still
 * cancel has no business showing up in the parent's grid, and attaching it only
 * on confirm means there is nothing to undo.
 *
 * The foreign key to the parent is deliberately absent: it is a value the
 * framework writes, and leaving it out is why a row created under a parent that
 * has no key yet needs no special case here.
 */
export function newRow(agg: Aggregate, values: Record<string, unknown> = {}): TreeNode {
  const row = emptyNode(nextTempId(agg));
  row.op = 'create';
  row.values = { ...values };
  row.touched = keysOf(values);
  return row;
}

export function attachRow(parent: TreeNode, cid: string, row: TreeNode): void {
  rowsOf(parent, cid).push(row);
}

/** Put an edited copy back where the one it was copied from sits. */
export function replaceRow(parent: TreeNode, cid: string, row: TreeNode): void {
  const rows = rowsOf(parent, cid);
  const index = rows.findIndex((candidate) => candidate.id === row.id);
  if (index < 0) return;
  rows[index] = row;
}

export function addRow(
  agg: Aggregate,
  parent: TreeNode,
  cid: string,
  values: Record<string, unknown> = {}
): TreeNode {
  const row = newRow(agg, values);
  attachRow(parent, cid, row);
  return row;
}

/**
 * Remove a row.
 *
 * A row the database never saw simply goes: `save_tree` refuses a delete on a
 * negative id, and rightly — there is nothing there to delete. One that exists
 * stays in the array wearing `op: delete`, which is how the save learns of it.
 */
export function removeRow(parent: TreeNode, cid: string, id: number): void {
  const rows = rowsOf(parent, cid);
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return;

  if (id < 0) {
    rows.splice(index, 1);
    return;
  }
  rows[index].op = 'delete';
}

// ── Proposals ───────────────────────────────────────────────────────────────

/**
 * The document as a proposal reads it: the values and the live rows, at every
 * depth. Unlike `serialize` nothing is pruned: a proposal judges the whole
 * document, not what changed. `values` replaces the node's own, for the draft a
 * form holds before it hands it to the buffer.
 */
export function snapshot(node: TreeNode, values?: Record<string, unknown>): TreeNode {
  const children: Record<string, TreeNode[]> = {};
  for (const cid of Object.keys(node.children)) {
    children[cid] = liveRows(node, cid).map((row) => snapshot(row));
  }
  return { id: node.id, values: { ...(values ?? node.values) }, children };
}

/** A row as a proposal returns it: an id the buffer knows, or none for a new one. */
export interface RowPatch {
  id?: number | null;
  values: Record<string, unknown>;
}

/**
 * Make a collection what a proposal says it should be. Returns true when
 * anything moved.
 *
 * A row the buffer knows takes the values that differ; a row without a known id
 * is created; a live row the proposal left out is removed, as the user would
 * remove it. The rows end up in the proposal's order.
 */
export function applyRows(agg: Aggregate, parent: TreeNode, cid: string, rows: RowPatch[]): boolean {
  const current = rowsOf(parent, cid);
  const live = new Map(current.filter((row) => row.op !== 'delete').map((row) => [row.id, row]));
  const kept: TreeNode[] = [];
  let changed = false;

  for (const patch of rows) {
    const row = patch.id != null ? live.get(patch.id) : undefined;
    if (row) {
      live.delete(row.id);
      if (setValues(row, patch.values)) changed = true;
      kept.push(row);
    } else {
      kept.push(newRow(agg, patch.values));
      changed = true;
    }
  }

  // What the proposal left out goes; what was already going stays going
  const going = current.filter((row) => row.op === 'delete');
  for (const row of live.values()) {
    changed = true;
    if (row.id >= 0) {
      row.op = 'delete';
      going.push(row);
    }
  }

  const order = (list: TreeNode[]) => list.map((row) => row.id).join(',');
  if (order(kept) !== order(current.filter((row) => row.op !== 'delete'))) changed = true;
  parent.children[cid] = [...kept, ...going];
  return changed;
}

// ── Order ───────────────────────────────────────────────────────────────────

/**
 * The live rows of a collection in the order of `ids` (what the grid shows
 * after a drag). A row the list does not name keeps its place after the
 * named ones; the rows on their way out stay at the end, where they were.
 */
export function moveRows(parent: TreeNode, cid: string, ids: unknown[]): void {
  const current = rowsOf(parent, cid);
  const live = current.filter((row) => row.op !== 'delete');
  const going = current.filter((row) => row.op === 'delete');
  const at = new Map(ids.map((id, i) => [id, i]));
  const named = live.filter((row) => at.has(row.id)).sort((a, b) => at.get(a.id)! - at.get(b.id)!);
  const next = [...named, ...live.filter((row) => !at.has(row.id))];
  if (next.some((row, i) => row !== live[i])) parent.reordered = true;
  parent.children[cid] = [...next, ...going];
}

/** One row a step up (-1) or down (1) among the live ones; at an end, nothing. */
export function moveRow(parent: TreeNode, cid: string, id: number, delta: -1 | 1): void {
  const ids = liveRows(parent, cid).map((row) => row.id);
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  moveRows(parent, cid, ids);
}

/**
 * Number the live rows 1, 2, 3 in their order, in the column a collection
 * declares as its `sequence`: a row whose number changes is a change to save,
 * a new one (0) gets the number of its place. Done when the tree is saved,
 * every time: in the buffer the order is the arrays', and numbering rows
 * already in order changes nothing.
 */
export function renumber(parent: TreeNode, cid: string, field: string): void {
  liveRows(parent, cid).forEach((row, i) => {
    if (row.values[field] !== i + 1) setValues(row, { [field]: i + 1 });
  });
}

// ── Merge ───────────────────────────────────────────────────────────────────

/** Where a node sits: the collections and row ids from the root down. */
export type NodePath = { cid: string; id: number }[];

/** What the others did, as the user will be told it. */
export type Change =
  | { kind: 'field'; path: NodePath; field: string; from: unknown; to: unknown }
  | { kind: 'added'; path: NodePath; cid: string; id: number }
  | { kind: 'removed'; path: NodePath; cid: string; id: number };

/**
 * Where my change and theirs meet. The merged tree holds a provisional answer
 * (said for each kind) that the person confirms or reverses.
 */
export type Conflict =
  /** We both changed a field. Provisionally mine. */
  | { kind: 'field'; path: NodePath; field: string; base: unknown; mine: unknown; theirs: unknown }
  /** I changed a row they removed. Provisionally gone; `row` is what I had. */
  | { kind: 'removed'; path: NodePath; cid: string; row: TreeNode }
  /** I removed a row they changed. Provisionally still removed. */
  | { kind: 'changed'; path: NodePath; cid: string; id: number };

export interface Merge {
  /** The fresh tree with my changes on top: what the form shows next. */
  root: TreeNode;
  changes: Change[];
  conflicts: Conflict[];
}

/**
 * Put my changes on the tree as it stands now, after a save of theirs.
 *
 * Three versions meet on each node: the base (what I loaded), mine, theirs (the
 * fresh tree). The base is known only where I changed something, and that is
 * the only place it is needed: a key I touched is mine if they left it alone,
 * theirs if we wrote the same, a conflict otherwise; every other key takes their
 * value. Rows are matched by id: theirs that I do not have were added by them,
 * mine with a temporary id were added by me and stay, a row missing from the
 * fresh tree was removed by them.
 *
 * Nothing is saved: the result is dirty with my changes, its touched keys now
 * based on the fresh values, and the next save carries the fresh `$` keys (the
 * new version) and passes the check again. Pure: neither tree is modified.
 */
export function mergeTrees(mine: TreeNode, theirs: TreeNode): Merge {
  const changes: Change[] = [];
  const conflicts: Conflict[] = [];
  const root = mergeNode(mine, theirs, [], changes, conflicts);
  for (const [key, value] of Object.entries(theirs)) {
    if (key.startsWith('$')) root[key as `$${string}`] = value;
  }
  return { root, changes, conflicts };
}

/**
 * Same value, by structure: the two trees come from two answers, so a list (the
 * ids of a set of tags) is never the same object on both sides.
 */
function equal(a: unknown, b: unknown): boolean {
  if (same(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The values a node had when loaded: what is there, with the touched keys put back. */
function baseOf(node: TreeNode): Record<string, unknown> {
  return { ...node.values, ...(node.touched ?? {}) };
}

/** A fresh node as the buffer holds a loaded one: values copied, nothing touched. */
function fresh(node: TreeNode): TreeNode {
  return {
    id: node.id,
    values: { ...node.values },
    children: Object.fromEntries(
      Object.entries(node.children ?? {}).map(([cid, rows]) => [cid, rows.map(fresh)])
    ),
  };
}

function mergeNode(mine: TreeNode, theirs: TreeNode, path: NodePath,
                   changes: Change[], conflicts: Conflict[]): TreeNode {
  const base = baseOf(mine);
  const out = fresh({ ...theirs, children: {} });

  for (const [field, to] of Object.entries(theirs.values)) {
    if (!equal(base[field], to)) changes.push({ kind: 'field', path, field, from: base[field], to });
  }

  const touched: Record<string, unknown> = {};
  for (const field of Object.keys(mine.touched ?? {})) {
    const was = base[field];
    const mineValue = mine.values[field];
    const theirValue = theirs.values[field];
    if (equal(theirValue, mineValue)) continue;      // they left it as I did, or wrote the same
    if (!equal(theirValue, was)) {
      conflicts.push({ kind: 'field', path, field, base: was, mine: mineValue, theirs: theirValue });
    }
    out.values[field] = mineValue;
    touched[field] = theirValue;
  }
  if (Object.keys(touched).length > 0) {
    out.touched = touched;
    out.op = 'update';
  }

  const cids = new Set([...Object.keys(mine.children), ...Object.keys(theirs.children ?? {})]);
  for (const cid of cids) {
    const rows = mergeRows(mine, cid, theirs.children?.[cid] ?? [], path, changes, conflicts);
    if (rows.length > 0 || cid in (theirs.children ?? {})) out.children[cid] = rows;
  }
  if (mine.reordered) out.reordered = true;
  return out;
}

function mergeRows(mine: TreeNode, cid: string, theirRows: TreeNode[], path: NodePath,
                   changes: Change[], conflicts: Conflict[]): TreeNode[] {
  const myRows = mine.children[cid] ?? [];
  const byId = new Map(myRows.map((row) => [row.id, row]));
  const present = new Set(theirRows.map((row) => row.id));
  const merged = new Map<number, TreeNode>();

  for (const row of theirRows) {
    const at = [...path, { cid, id: row.id }];
    const my = byId.get(row.id);
    if (!my) {
      changes.push({ kind: 'added', path, cid, id: row.id });
      merged.set(row.id, fresh(row));
    } else if (my.op === 'delete') {
      // Gone on my side; whether they changed it is what decides a conflict
      const seen: Change[] = [];
      const kept = mergeNode({ ...my, op: undefined }, row, at, seen, []);
      changes.push(...seen);
      if (seen.length > 0) conflicts.push({ kind: 'changed', path, cid, id: row.id });
      kept.op = 'delete';
      merged.set(row.id, kept);
    } else {
      merged.set(row.id, mergeNode(my, row, at, changes, conflicts));
    }
  }

  for (const my of myRows) {
    if (my.id < 0 || present.has(my.id) || my.op === 'delete') continue;
    changes.push({ kind: 'removed', path, cid, id: my.id });
    if (isDirty(my)) conflicts.push({ kind: 'removed', path, cid, row: cloneNode(my) });
  }

  // My order where I chose one, theirs otherwise; my new rows after the row
  // they followed on my side, so a row added under another stays under it
  const order = mine.reordered
    ? [...myRows.filter((row) => merged.has(row.id)).map((row) => row.id),
       ...theirRows.filter((row) => !byId.has(row.id)).map((row) => row.id)]
    : theirRows.map((row) => row.id);
  const out = order.map((id) => merged.get(id)!);
  let anchor: TreeNode | undefined;
  for (const my of myRows) {
    if (my.id < 0) {
      const index = anchor ? out.indexOf(anchor) + 1 : 0;
      const row = cloneNode(my);
      out.splice(index, 0, row);
      anchor = row;
    } else if (merged.has(my.id)) {
      anchor = merged.get(my.id);
    }
  }
  // A row on its way out keeps its place, as `removeRow` leaves it: kept after
  // all, it is back where it was
  return out;
}

// ── Serialization ───────────────────────────────────────────────────────────

/**
 * The payload for `save_tree` — what the user did, and the rows on the way there.
 *
 * An untouched row is pruned; one that only carries a changed descendant travels
 * without an `op`, which the server reads as a pass-through: nothing written, the
 * descent continues. A deleted row travels alone — its children go with it,
 * through the ORM composition the model declares, and the server refuses anything
 * but deletions below a row that goes away.
 */
export function serialize(agg: Aggregate): { page: string; root: TreeNode } {
  return { page: agg.page, root: { ...pack(agg.root, true)!, ...metadataOf(agg.root) } };
}

/** The `$` keys of a node, as the server handed them out. */
function metadataOf(node: TreeNode): Record<string, unknown> {
  return Object.fromEntries(Object.entries(node).filter(([key]) => key.startsWith('$')));
}

function pack(node: TreeNode, isRoot: boolean): TreeNode | null {
  if (node.op === 'delete') {
    return { op: 'delete', id: node.id, values: {}, children: {} };
  }

  const children: Record<string, TreeNode[]> = {};
  let touchedBelow = false;
  for (const [cid, rows] of Object.entries(node.children)) {
    const kept = rows.map((row) => pack(row, false)).filter((row): row is TreeNode => row !== null);
    if (kept.length > 0) {
      children[cid] = kept;
      touchedBelow = true;
    }
  }

  // The root always carries an operation, even when its own fields did not move:
  // a change below it is a change of the document. An intermediate row has no
  // such reason to be written.
  const op = node.op ?? (isRoot ? (node.id < 0 ? 'create' : 'update') : undefined);
  if (!op && !touchedBelow) return null;

  const out: TreeNode = { id: node.id, values: valuesFor(node, op), children };
  if (op) out.op = op;
  return out;
}

function valuesFor(node: TreeNode, op: NodeOp | undefined): Record<string, unknown> {
  if (op === 'create') return { ...node.values };
  if (op === 'update') {
    return Object.fromEntries(Object.keys(node.touched ?? {}).map((key) => [key, node.values[key]]));
  }
  return {};   // a pass-through writes nothing, so it carries nothing
}

// ── Descriptors ─────────────────────────────────────────────────────────────

export interface CollectionSpec {
  id: string;
  label?: string;
  model: string;
  fk: string;
  form?: string;
  [key: string]: unknown;
}

/**
 * The collection nodes a form layout declares, in reading order.
 *
 * A node's own `view` is not descended into: a collection inside a collection is
 * declared in the row form, not in the grid that presents it — the same boundary
 * the server walks in `pages.py`, and the two must agree.
 *
 * This is also how the client knows an aggregate when it sees one: no flag says
 * so, the nodes do.
 */
export function collectionNodes(layout: unknown): CollectionSpec[] {
  const found: CollectionSpec[] = [];
  walk(layout, found);
  return found;
}

function walk(obj: unknown, found: CollectionSpec[]): void {
  if (Array.isArray(obj)) {
    for (const item of obj) walk(item, found);
    return;
  }
  if (obj === null || typeof obj !== 'object') return;

  const node = obj as Record<string, unknown>;
  if (node.type === 'collection') {
    found.push(node as unknown as CollectionSpec);
    return;                       // and no deeper: the node's `view` is presentation
  }
  for (const value of Object.values(node)) walk(value, found);
}
