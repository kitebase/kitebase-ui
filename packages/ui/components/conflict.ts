/**
 * A save refused because someone else saved first, told rather than only refused.
 *
 * `mergeTrees` (aggregate.ts) puts my changes on the tree as it stands now; this
 * module says to the person what the others did, and asks where our changes
 * meet. The question is a form: one pick per conflict, mine or theirs, with
 * mine already chosen, as the merged tree has it.
 */
import { _, _t } from '../i18n';
import { formDialog } from './formDialog.svelte';
import type { Change, Conflict, Merge, NodePath, TreeNode } from './aggregate';
import type { FormDescriptor, FormField, LayoutNode } from './dataform.types';

/** The names a form gives its fields and collections, to speak its language. */
export interface Labels {
  fields: Record<string, string>;
  collections: Record<string, string>;
}

export function labelsOf(descriptor: FormDescriptor | null | undefined): Labels {
  const labels: Labels = { fields: {}, collections: {} };
  // `around` is the label of what encloses a node (a tab): a collection alone
  // in its tab is called as the tab is, the way the form shows it
  const walk = (obj: unknown, around?: string): void => {
    if (Array.isArray(obj)) { obj.forEach((item) => walk(item, around)); return; }
    if (obj === null || typeof obj !== 'object') return;
    const node = obj as Record<string, unknown>;
    if (node.type === 'collection') {
      const id = node.id as string;
      labels.collections[id] = (node.label as string | undefined) ?? around ?? id;
      return;
    }
    if (typeof node.name === 'string' && typeof node.label === 'string') {
      labels.fields[node.name] = node.label;
    }
    const label = typeof node.label === 'string' ? node.label : around;
    Object.values(node).forEach((value) => walk(value, label));
  };
  walk(descriptor?.layout ?? descriptor?.fields ?? []);
  return labels;
}

/** The node a path leads to, or nothing if a row on the way is gone. */
export function nodeAt(root: TreeNode, path: NodePath): TreeNode | undefined {
  let node: TreeNode | undefined = root;
  for (const step of path) {
    node = node?.children[step.cid]?.find((row) => row.id === step.id);
  }
  return node;
}

/** A value as a person reads it. */
export function shown(value: unknown): string {
  if (value === null || value === undefined || value === '') return _('(empty)');
  if (Array.isArray(value)) return value.length ? value.map(shown).join(', ') : _('(empty)');
  if (typeof value === 'boolean') return value ? _('Yes') : _('No');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Where a node sits, in the form's words: "Authors, row 2". Empty for the record. */
function where(root: TreeNode, path: NodePath, labels: Labels): string {
  const parts: string[] = [];
  let node: TreeNode | undefined = root;
  for (const step of path) {
    const rows: TreeNode[] = node?.children[step.cid] ?? [];
    const live = rows.filter((row) => row.op !== 'delete');
    const at = live.findIndex((row) => row.id === step.id);
    const name = labels.collections[step.cid] ?? step.cid;
    // A row on its way out has no place among the live ones: its own place then
    parts.push(at >= 0
      ? _t('{collection}, row {n}', { collection: name, n: at + 1 })
      : _t('{collection}, removed row {n}', {
          collection: name, n: rows.findIndex((row) => row.id === step.id) + 1 }));
    node = rows.find((row) => row.id === step.id);
  }
  return parts.join(' / ');
}

function fieldName(field: string, labels: Labels): string {
  return labels.fields[field] ?? field;
}

/**
 * What the others did, in one paragraph: the fields of the record with their
 * old and new value, the rows counted by collection.
 */
export function tell(changes: Change[], labels: Labels): string {
  const parts: string[] = [];
  const rows: Record<string, { added: number; removed: number; changed: Set<number> }> = {};
  const of = (cid: string) => (rows[cid] ??= { added: 0, removed: 0, changed: new Set() });

  for (const change of changes) {
    if (change.kind === 'field' && change.path.length === 0) {
      parts.push(_t('{field} from {from} to {to}', {
        field: fieldName(change.field, labels), from: shown(change.from), to: shown(change.to) }));
    } else if (change.kind === 'field') {
      of(change.path[0].cid).changed.add(change.path[0].id);
    } else if (change.path.length === 0) {
      of(change.cid)[change.kind] += 1;
    } else {
      of(change.path[0].cid).changed.add(change.path[0].id);
    }
  }
  for (const [cid, n] of Object.entries(rows)) {
    const counts = [
      n.changed.size ? _t('{n} changed', { n: n.changed.size }) : '',
      n.added ? _t('{n} added', { n: n.added }) : '',
      n.removed ? _t('{n} removed', { n: n.removed }) : '',
    ].filter(Boolean).join(', ');
    parts.push(`${labels.collections[cid] ?? cid}: ${counts}`);
  }
  return parts.join('; ');
}

/** The message the form shows after a merge, whether or not anything met. */
export function mergeMessage(merge: Merge, labels: Labels): string {
  const what = tell(merge.changes, labels);
  const lost = merge.conflicts.filter((c) => c.kind === 'removed').length;
  const lines = [
    what ? _t('Someone else saved this document meanwhile: {what}.', { what })
         : _('Someone else saved this document meanwhile.'),
    lost ? _t('{n} rows you changed were removed: your changes to them are lost.', { n: lost }) : '',
    _('Your changes are back on top of theirs: check and save again.'),
  ];
  return lines.filter(Boolean).join(' ');
}

/**
 * Ask where our changes meet, and apply the answers to the merged tree.
 * Dismissing keeps what the merge chose: my value, my removal.
 */
export async function resolveConflicts(merge: Merge, labels: Labels): Promise<void> {
  const asked = merge.conflicts
    .map((conflict, i) => ({ conflict, key: `c${i}` }))
    .filter(({ conflict }) => conflict.kind !== 'removed');
  if (asked.length === 0) return;

  const layout: FormField[] = asked.map(({ conflict, key }) => question(conflict, key, merge.root, labels));
  const view: FormDescriptor = { type: 'form', layout: layout as LayoutNode[], help_display: 'inline' };
  const values = Object.fromEntries(asked.map(({ key }) => [key, 'mine']));
  const answers = await formDialog.open(view, values, _('Your changes and theirs meet'));
  if (!answers) return;

  for (const { conflict, key } of asked) {
    if (answers[key] !== 'theirs') continue;
    if (conflict.kind === 'field') {
      const node = nodeAt(merge.root, conflict.path);
      if (node) {
        // Its base is their value: taking it back leaves the field clean
        node.values[conflict.field] = conflict.theirs;
        delete node.touched?.[conflict.field];
        if (node.op === 'update' && Object.keys(node.touched ?? {}).length === 0) delete node.op;
      }
    } else if (conflict.kind === 'changed') {
      const row = nodeAt(merge.root, [...conflict.path, { cid: conflict.cid, id: conflict.id }]);
      if (row) {
        if (Object.keys(row.touched ?? {}).length > 0) row.op = 'update';
        else delete row.op;
      }
    }
  }
}

function question(conflict: Conflict, key: string, root: TreeNode, labels: Labels): FormField {
  const place = where(root, conflict.path, labels);
  if (conflict.kind === 'field') {
    const name = fieldName(conflict.field, labels);
    return {
      name: key,
      type: 'String',
      label: place ? `${place}: ${name}` : name,
      help: _t('When you opened it: {base}', { base: shown(conflict.base) }),
      choices: [
        { value: 'mine', label: _t('Mine: {value}', { value: shown(conflict.mine) }) },
        { value: 'theirs', label: _t('Theirs: {value}', { value: shown(conflict.theirs) }) },
      ],
    };
  }
  const row = where(root, [...conflict.path, { cid: (conflict as { cid: string }).cid,
                                               id: (conflict as { id: number }).id }], labels);
  return {
    name: key,
    type: 'String',
    label: row,
    help: _('You removed this row, and someone else changed it meanwhile.'),
    choices: [
      { value: 'mine', label: _('Remove it anyway') },
      { value: 'theirs', label: _('Keep the row, with their changes') },
    ],
  };
}
