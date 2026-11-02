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
   * Which keys the user changed — client-side only, stripped on serialization.
   * An update writes these and nothing else: the form knows what it edited, and
   * sending back every loaded column would write values nobody touched.
   */
  touched?: string[];
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
  agg.root.touched = Object.keys(values);
  return agg;
}

/** Wrap what `load_tree` returned: every id is real, nothing is touched yet. */
export function loadedAggregate(page: string, root: TreeNode): Aggregate {
  return { page, root: normalize(root), seq: 0 };
}

export function nextTempId(agg: Aggregate): number {
  agg.seq += 1;
  return -agg.seq;
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
  if (node.op) return true;
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
  if (node.touched) copy.touched = [...node.touched];
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
 * A row already being created stays a create — its values travel whole — and a
 * deleted row is not resurrected by a stray write.
 */
export function setValues(node: TreeNode, patch: Record<string, unknown>): boolean {
  if (node.op === 'delete') return false;

  const touched = new Set(node.touched ?? []);
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    if (same(node.values[key], value)) continue;
    node.values[key] = value;
    touched.add(key);
    changed = true;
  }
  if (!changed) return false;

  node.touched = [...touched];
  node.op ??= 'update';
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
  row.touched = Object.keys(values);
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
  return { page: agg.page, root: pack(agg.root, true)! };
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
  // the optimistic lock will want that touch (relations.md §8). An intermediate
  // row has no such reason to be written.
  const op = node.op ?? (isRoot ? (node.id < 0 ? 'create' : 'update') : undefined);
  if (!op && !touchedBelow) return null;

  const out: TreeNode = { id: node.id, values: valuesFor(node, op), children };
  if (op) out.op = op;
  return out;
}

function valuesFor(node: TreeNode, op: NodeOp | undefined): Record<string, unknown> {
  if (op === 'create') return { ...node.values };
  if (op === 'update') {
    const touched = node.touched ?? [];
    return Object.fromEntries(touched.map((key) => [key, node.values[key]]));
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
