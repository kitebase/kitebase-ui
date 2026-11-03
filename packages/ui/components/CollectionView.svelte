<script lang="ts">
  /**
   * CollectionView.svelte — a collection edited inside its parent's form.
   *
   * The grid shows the buffer and the navigator's three gestures write to it.
   * Nothing here talks to the database: the frame that owns the aggregate writes
   * the whole tree in one transaction (relations.md §17).
   *
   * A row opens on a frame of its own, which edits a **copy** and hands it back
   * on confirm. The live reference would spare the copy and make cancelling
   * impossible, because it would mean undoing mutations that already happened.
   *
   * Props:
   *   node    CollectionNode   the layout node: model, fk, row form, view
   *   agg     Aggregate        the tree — its counter hands out temporary ids
   *   parent  TreeNode         the node this collection hangs from
   *   record  object           the parent's live draft, read by `prefill`
   *   onCommand (endpoint, scope, title) => …  runs a command of the rows as a
   *           proposal on the whole document: the frame that owns the draft does
   */
  import { getContext, untrack } from 'svelte';
  import { _ } from '../i18n';
  import DataView from './DataView.svelte';
  import DataFormView from './DataFormView.svelte';
  import { stack as globalStack } from '$kitebase/stack/stack.svelte';
  import type { StackInstance } from '$kitebase/stack/stack.svelte';
  import { serverConfig } from '$kitebase/api/serverConfig.svelte';
  import { api } from '$kitebase/api/client';
  import { fkSpecs, missingKeys, withLabels, type LabelCache } from './fkLabels';
  import {
    liveRows, rowsOf, newRow, attachRow, replaceRow, removeRow, cloneNode,
    moveRows, moveRow, renumber,
    type Aggregate, type TreeNode,
  } from './aggregate';
  import { rowDefaults } from './record';
  import type { CollectionNode } from './dataform.types';
  import type { ViewDescriptor } from './dataview.types';

  let { node, agg, parent, record = {}, readonly = false, fallbackLabel = undefined,
        onCommand = undefined }: {
    node: CollectionNode;
    agg: Aggregate;
    parent: TreeNode;
    record?: Record<string, unknown>;
    readonly?: boolean;
    /** The name of what encloses the grid — a tab — when the node carries none. */
    fallbackLabel?: string;
    onCommand?: (endpoint: string, scope: Record<string, unknown>, title?: string) => Promise<void>;
  } = $props();

  const stack: StackInstance = getContext<StackInstance>('kb:stack') ?? globalStack;

  const pkField = $derived(serverConfig.tables[node.model]?.pk_fields?.[0] ?? 'id');
  const formId  = $derived(node.form ?? `${node.model.toLowerCase()}_form`);

  // Tabulator measures its container, and a container that grows with its content
  // measures zero — so the grid always gets a height. A band inside a form has a
  // default one; `fill` is for the frame, where the grid is the whole page.
  const height    = $derived(node.height ?? '14rem');
  const gridStyle = $derived(height === 'fill' ? 'flex: 1; min-height: 0' : `height: ${height}`);

  /**
   * The buffer's own value objects, so a confirmed edit appears without a second
   * copy to keep in step. A deleted row stays in the buffer wearing its
   * operation, and is not here.
   */
  const values = $derived(
    liveRows(parent, node.id).map((row) => row.values as Record<string, unknown>)
  );

  // ── Foreign keys, shown as what they stand for ─────────────────────────────

  // Declared, never inferred: a column asks for a lookup by naming the path from
  // the key to the field to show (`author_id.full_name`). A bare `author_id` is
  // the key itself and costs nothing.
  const shownFields = $derived(
    ((node.view?.columns as Array<{ field?: string }> | undefined) ?? [])
      .map((c) => c.field)
      .filter((f): f is string => !!f)
  );
  const specs = $derived(fkSpecs(node.model, shownFields, serverConfig.tables));

  /** Keys already resolved. Grows; a key's label does not change under us. */
  let labels = $state<LabelCache>({});

  const rows = $derived(withLabels(values, specs, labels));

  // Ask for what the cache cannot answer — one query per column, and on a row
  // just added, one query for one key. Reading `values` here is what makes a new
  // row resolve itself the moment it lands in the buffer.
  $effect(() => {
    // Read every reactive value before the guard: the rows, and the specs, which
    // are empty until the table registry has loaded. The cache is read untracked
    // — filling it is the effect's own doing, and would otherwise re-run it.
    const current = values;
    const columns = specs;
    untrack(() => {
      for (const spec of columns) {
        const wanted = missingKeys(current, spec, labels);
        if (wanted.length > 0) resolve(spec, wanted);
      }
    });
  });

  async function resolve(spec: typeof specs[number], keys: Array<string | number>) {
    // `resolve: true` — a stored key is read back whole: a row archived after the
    // fact must still show its name, or the only place it can be edited hides it.
    const res = await api.endpoint('query', {
      format: 'records',
      query: {
        table: spec.target,
        select: [spec.targetPk, spec.displayField],
        filters: { conditions: { column: spec.targetPk, op: 'in', value: keys } },
        resolve: true,
      },
    });
    if (res.status !== 'success' || !Array.isArray(res.data)) return;

    const found = { ...(labels[spec.key] ?? {}) };
    for (const row of res.data as Array<Record<string, unknown>>) {
      found[String(row[spec.targetPk])] = String(row[spec.displayField] ?? '');
    }
    labels = { ...labels, [spec.key]: found };
  }

  // A declared sequence: the order is the buffer's, so the grid sorts nothing
  // on its own and the rows move by hand
  const movable = $derived(!!node.sequence && !readonly);

  const view = $derived<ViewDescriptor>({
    type: 'table',
    ...(node.view ?? {}),
    source: node.sequence
      ? { ...omitOrder((node.view?.source as Record<string, unknown>) ?? {}), model: node.model }
      : { ...((node.view?.source as object) ?? {}), model: node.model },
    // Read-only leaves nothing to offer: the three gestures are gone, and there
    // is no set to search, filter or re-query — the rows arrived with the parent
    // and leave with it. So the bar goes too, rather than sitting there empty.
    navigator: readonly ? false : {
      ...(typeof node.view?.navigator === 'object' ? node.view.navigator : {}),
      mode: 'buffered',
    },
  } as ViewDescriptor);

  function omitOrder(source: Record<string, unknown>): Record<string, unknown> {
    const { order_by: _, ...rest } = source;
    return rest;
  }

  /**
   * From the row object the grid handed back to the node that holds it.
   *
   * By key, and never by identity: what the grid holds is a copy, with the
   * resolved labels added beside the values.
   */
  function nodeOf(row: unknown): TreeNode | undefined {
    const data = row as Record<string, unknown>;
    return rowsOf(parent, node.id).find(
      (candidate) => candidate.values[pkField] === data[pkField]
    );
  }

  /**
   * Open a row on its own frame.
   *
   * A new row is created detached and attached only on confirm — cancelling then
   * leaves nothing behind. The frame is told which fields the parent supplies:
   * the foreign key always, the key itself while it is still a negative
   * placeholder, because a number the save is about to replace has no business
   * on screen (§17), and whatever `defaults` stamps. What `prefill` brings from
   * the parent's draft stays visible: it is a suggestion, not a constraint.
   *
   * The stamped fields are hidden for the same reason the node stamps them: they
   * are the other half of `domain`, so editing one moves the row out of the view
   * that made it — a tab emptying itself under the hands of whoever typed. What
   * a grid filters for is not a value of the row you are editing.
   */
  function openRow(target: TreeNode, isNew: boolean) {
    const editing = cloneNode(target);
    const stamped = [...Object.keys(node.defaults ?? {}), ...(node.sequence ? [node.sequence] : [])];

    stack.push(DataFormView, {
      formId,
      // Moving the label onto the tab left the node without one, and the frame
      // was announcing the table name: it falls back on what encloses the grid.
      title: node.label ?? fallbackLabel ?? node.model,
      buffer: { agg, node: editing },
      defaults: isNew ? rowDefaults(node, record) : undefined,
      hideFields: isNew ? [node.fk, pkField, ...stamped] : [node.fk, ...stamped],
      onSaved: () => {
        if (isNew) {
          // The key is the buffer's until the save assigns a real one: the grid
          // needs it to tell the row from its neighbours, and `save_tree` drops a
          // negative key on a create.
          editing.values[pkField] ??= editing.id;
          attachRow(parent, node.id, editing);
        } else {
          replaceRow(parent, node.id, editing);
        }
      },
    });
  }

  function handleEvent(name: string, data: unknown) {
    if (name === 'rows_moved' && node.sequence) {
      moveRows(parent, node.id, data as unknown[]);
      renumber(parent, node.id, node.sequence);
      return;
    }
    if (name === 'row_move' && node.sequence) {
      const { id, delta } = data as { id: number; delta: -1 | 1 };
      moveRow(parent, node.id, id, delta);
      renumber(parent, node.id, node.sequence);
      return;
    }
    if (name === 'row_command') {
      const { command, label, current, checked, visible } = data as {
        command: { endpoint?: string }; label?: string; current?: unknown; checked: unknown[];
        visible?: unknown[];
      };
      if (command.endpoint) {
        onCommand?.(command.endpoint, { collection: node.id, current, checked, visible }, label);
      }
      return;
    }
    if (name === 'row_add') {
      openRow(newRow(agg), true);
      return;
    }
    const target = nodeOf(data);
    if (!target) return;
    if (name === 'row_edit') openRow(target, false);
    if (name === 'row_delete') removeRow(parent, node.id, target.id);
  }
</script>

<div class="kb-collection" class:kb-collection-fill={height === 'fill'}>
  {#if node.label}
    <div class="kb-collection-label">{node.label}</div>
  {/if}
  <div class="kb-collection-grid" style={gridStyle}>
    <DataView {view} data={rows} movableRows={movable} onEvent={handleEvent} />
  </div>
</div>

<style>
  .kb-collection {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 1rem;
    min-height: 0;
  }

  .kb-collection-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--kb-text-subtle);
  }

  /* Height comes from the node — see the derivation above. */
  .kb-collection-grid {
    border: 1px solid var(--kb-border);
    border-radius: 0.375rem;
    overflow: hidden;
  }

  /* `fill`: the grid is the page, so the wrapper must claim the space first. */
  .kb-collection-fill {
    flex: 1;
    margin-bottom: 0;
    height: 100%;
  }
</style>
