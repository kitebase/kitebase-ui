import { describe, it, expect, vi } from 'vitest';

vi.mock('./formDialog.svelte', () => ({ formDialog: { open: vi.fn() } }));
// English, as the keys are: the test reads the sentences, not a catalogue
vi.mock('../i18n', () => ({
  _: (key: string) => key,
  _t: (key: string, vars: Record<string, unknown>) =>
    key.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? '')),
}));

import { labelsOf, mergeMessage, nodeAt, resolveConflicts, shown, tell } from './conflict';
import { formDialog } from './formDialog.svelte';
import { loadedAggregate, mergeTrees, removeRow, serialize, setValues, type TreeNode } from './aggregate';
import type { FormDescriptor } from './dataform.types';

const form = {
  type: 'form',
  layout: [
    { name: 'title', label: 'Title' },
    { type: 'tabs', pages: [{ label: 'Authors', layout: [
      { type: 'collection', id: 'authors', model: 'BookAuthor', fk: 'book_id' }] }] },
  ],
} as unknown as FormDescriptor;

const loaded = (): TreeNode => ({
  id: 7,
  values: { title: '1984', isbn: 'A' },
  children: { authors: [
    { id: 42, values: { notes: 'first' }, children: {} },
    { id: 43, values: { notes: null }, children: {} },
  ] },
});

describe('the words of the form', () => {
  it('names fields by label, and a collection by the tab it sits alone in', () => {
    expect(labelsOf(form)).toEqual({ fields: { title: 'Title' }, collections: { authors: 'Authors' } });
  });

  it('shows a value as a person reads it', () => {
    expect(shown(null)).toBe('(empty)');
    expect(shown([1, 2])).toBe('1, 2');
    expect(shown(true)).toBe('Yes');
  });

  it('finds a row by its path, and nothing once it is gone', () => {
    const root = loaded();
    expect(nodeAt(root, [{ cid: 'authors', id: 43 }])?.id).toBe(43);
    expect(nodeAt(root, [{ cid: 'authors', id: 99 }])).toBeUndefined();
  });
});

describe('telling what the others did', () => {
  it('says the fields of the record with their values, and counts the rows', () => {
    const agg = loadedAggregate('book_form', loaded());
    const theirs = loaded();
    theirs.values.title = 'Animal Farm';
    theirs.children.authors[0].values.notes = 'changed';
    theirs.children.authors.push({ id: 44, values: {}, children: {} });
    const merge = mergeTrees(agg.root, theirs);
    expect(tell(merge.changes, labelsOf(form)))
      .toBe('Title from 1984 to Animal Farm; Authors: 1 changed, 1 added');
  });

  it('says so when rows I changed are gone', () => {
    const agg = loadedAggregate('book_form', loaded());
    setValues(agg.root.children.authors[1], { notes: 'mine' });
    const theirs = loaded();
    theirs.children.authors.splice(1, 1);
    const message = mergeMessage(mergeTrees(agg.root, theirs), labelsOf(form));
    expect(message).toContain('Authors: 1 removed');
    expect(message).toContain('1 rows you changed were removed');
  });
});

describe('asking where we meet', () => {
  it('takes their value where the person says so, and the field is clean', async () => {
    const agg = loadedAggregate('book_form', loaded());
    setValues(agg.root, { title: 'Mine', isbn: 'B' });
    const theirs = loaded();
    theirs.values.title = 'Theirs';
    const merge = mergeTrees(agg.root, theirs);

    vi.mocked(formDialog.open).mockResolvedValueOnce({ c0: 'theirs' });
    await resolveConflicts(merge, labelsOf(form));

    expect(merge.root.values.title).toBe('Theirs');
    expect(serialize({ ...agg, root: merge.root }).root.values).toEqual({ isbn: 'B' });
  });

  it('keeps a row I removed when the person keeps their change', async () => {
    const agg = loadedAggregate('book_form', loaded());
    removeRow(agg.root, 'authors', 42);
    const theirs = loaded();
    theirs.children.authors[0].values.notes = 'theirs';
    const merge = mergeTrees(agg.root, theirs);

    vi.mocked(formDialog.open).mockResolvedValueOnce({ c0: 'theirs' });
    await resolveConflicts(merge, labelsOf(form));

    expect(merge.root.children.authors.map((r) => [r.id, r.op])).toEqual([[42, undefined], [43, undefined]]);
  });

  it('a dismissed dialog keeps what the merge chose', async () => {
    const agg = loadedAggregate('book_form', loaded());
    setValues(agg.root, { title: 'Mine' });
    const theirs = loaded();
    theirs.values.title = 'Theirs';
    const merge = mergeTrees(agg.root, theirs);

    vi.mocked(formDialog.open).mockResolvedValueOnce(null);
    await resolveConflicts(merge, labelsOf(form));
    expect(merge.root.values.title).toBe('Mine');
  });

  it('asks nothing when nothing meets', async () => {
    vi.mocked(formDialog.open).mockClear();
    const agg = loadedAggregate('book_form', loaded());
    await resolveConflicts(mergeTrees(agg.root, loaded()), labelsOf(form));
    expect(formDialog.open).not.toHaveBeenCalled();
  });
});
