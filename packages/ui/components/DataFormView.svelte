<script lang="ts">
  /**
   * DataFormView.svelte — stack page that wraps DataForm for Add/Edit.
   *
   * Loads the form descriptor lazily from `get_page` (cached per formId),
   * then renders DataForm. Intended to be pushed onto the stack by DataView.
   *
   * A form on a table, opened by page id, is a **tree**, and this frame owns its
   * buffer: it reads the record and the collections the page declares with
   * `load_tree`, hands the root's values to DataForm, and writes everything back
   * with `save_tree` in one transaction. Without collections the tree is one
   * node: one way to read and write a form, and the one the `$` keys of the tree
   * hooks travel on (a version, say). `db` is left to what is not a form page:
   * a descriptor built by the caller, a row handed in as data.
   *
   * Props:
   *   formId      string              e.g. 'book_form' — also the page id of the aggregate
   *   descriptor  FormDescriptor      a descriptor the caller built, instead of an id
   *   recordId    string|number|null  null = new record
   *   draft       DraftNode           a new aggregate with values and rows already in it
   *   title       string              shown in header bar
   *   onSaved     (savedData, {model}) => void  called after successful save with merged record (before pop); `model` is the form's table, none for a form saved by an endpoint
   */
  import { getContext, onDestroy } from 'svelte';
  import { _ } from '../i18n';
  import { stack as globalStack } from '$kitebase/stack/stack.svelte';
  import type { StackInstance } from '$kitebase/stack/stack.svelte';
  import { api } from '$kitebase/api/client';
  import { errorText } from '$kitebase/api/envelope';
  import DataForm from './DataForm.svelte';
  import PanelRenderer from './PanelRenderer.svelte';
  import PluginComponent from './PluginComponent.svelte';
  import { getPluginLoader } from '$kitebase/plugins/context';
  import { serverConfig } from '../api/serverConfig.svelte';
  import { callJudged, presentOutcome, FlowCancelled, FlowMerged, FlowRefused } from './flow';
  import { labelsOf, mergeMessage, resolveConflicts } from './conflict';
  import { applyResult } from './resultAction';
  import { resolveRecordTokens } from './record';
  import type { Flow } from '../api/types';
  import {
    collectionNodes, draftAggregate, loadedAggregate, mergeTrees, newAggregate, renumber, serialize,
    setValues,
    type Aggregate, type DraftNode, type TreeNode,
  } from './aggregate';
  import type { FormDescriptor, LayoutNode } from './dataform.types';
  import { formKey, lifecycle, type FormRef } from '../lifecycle';

  const stack = getContext<StackInstance>('kb:stack') ?? globalStack;

  let {
    formId = undefined,
    descriptor: givenDescriptor = undefined,
    recordId = null,
    data = undefined,
    defaults = undefined,
    draft = undefined,
    buffer = undefined,
    hideFields = undefined,
    title = '',
    onSaved,
    onCancel,
  }: {
    formId?: string;
    /**
     * A descriptor built by the caller instead of fetched by id — a frame that
     * shows one face of a form it already has (relations.md §19.1). Mutually
     * exclusive with `formId`.
     */
    descriptor?: FormDescriptor;
    recordId?: string | number | null;
    data?: Record<string, unknown>;       // Step A: computed row, no DB
    defaults?: Record<string, unknown>;   // caller's initial values (create mode)
    /**
     * A new document the server prepared (a sheet, a duplicate): header and
     * rows, nothing written. The form opens on it as on any new record; a form
     * without collections takes its values as defaults.
     */
    draft?: DraftNode;
    /**
     * A node of someone else's buffer — this frame edits a row of a collection
     * rather than owning an aggregate. It reads and writes nothing: confirming
     * leaves the values in the node, and the caller decides what to do with it.
     */
    buffer?: { agg: Aggregate; node: TreeNode };
    /** Fields the caller supplies, which this form must not draw (§17). */
    hideFields?: string[];
    title?: string;
    onSaved?: (savedData: Record<string, unknown>, meta: { model?: string }) => void;
    onCancel?: () => void;
  } = $props();

  let descriptor = $state<FormDescriptor | null>(null);
  /** The split areas the page declares beside its form: the record's history, say. */
  let panels = $state<SplitArea[]>([]);
  let loadError  = $state<string | null>(null);
  /** The buffer, when this page is read and written as a tree. */
  let aggregate  = $state<Aggregate | null>(null);
  /** Known before the tree arrives, so the form waits instead of flashing empty. */
  let isTree = $state(false);

  /**
   * The form as the lifecycle names it: the root of a tree, once it is shown.
   * A row of someone else's buffer, or a form that writes no table, is not
   * one: the frames it opens and closes are what tells of its activity.
   */
  const key = formKey();
  let opened = false;
  function formRef(): FormRef {
    const root = aggregate!.root;
    return { key, page: formId!, model: descriptor!.source!.model!,
             id: root.op === 'create' ? null : root.id };
  }
  let dirty = $state(false);
  function relay(name: string, data: unknown) {
    if (!opened) return;
    if (name === 'field_change') lifecycle.emit('form:change', formRef());
    else if (name === 'form_dirty') {
      dirty = (data as { dirty: boolean }).dirty;
      lifecycle.emit('form:dirty', { ...formRef(), dirty });
    }
  }

  /**
   * What the plugins mount on every form of a table (endpoint_db._plugin_areas),
   * on the root of a tree only. Each gets the form, the `$` keys the tree hooks
   * put on its root, and whether it is dirty; the rest it hears on `lifecycle`.
   */
  const pluginLoader = getPluginLoader();
  let topArea = $derived(isTree && aggregate && !buffer && pluginLoader
    ? serverConfig.formAreas.top ?? [] : []);
  let rootMeta = $derived(aggregate
    ? Object.fromEntries(Object.entries(aggregate.root).filter(([k]) => k.startsWith('$')))
    : {});
  onDestroy(() => { if (opened) lifecycle.emit('form:close', formRef()); });

  // Descriptor cache — shared across all DataFormView instances in the session.
  const _cache = new Map<string, FormDescriptor>();
  const _panels = new Map<string, SplitArea[]>();
  type SplitArea = { id: string; [key: string]: unknown };

  async function loadDescriptor() {
    if (givenDescriptor) {
      descriptor = givenDescriptor;
    } else if (!formId) {
      loadError = 'A form frame needs either a page id or a descriptor';
      return;
    } else if (_cache.has(formId)) {
      descriptor = _cache.get(formId)!;
      panels = _panels.get(formId) ?? [];
    } else {
      try {
        const res = await api.endpoint('get_page', { id: formId });
        if (res.status === 'success') {
          const page = res.data as Record<string, unknown>;
          const fd = (page.content ?? page) as FormDescriptor;
          _cache.set(formId, fd);
          _panels.set(formId, (page.panels ?? []) as SplitArea[]);
          descriptor = fd;
          panels = _panels.get(formId)!;
        } else {
          loadError = errorText(res, `Cannot load form ${formId}`);
          return;
        }
      } catch (e) {
        loadError = e instanceof Error ? e.message : String(e);
        return;
      }
    }
    await loadAggregate();
  }

  /** Read the tree, or open an empty one — when the page writes a table. */
  async function loadAggregate() {
    if (buffer || data !== undefined || !descriptor?.source?.model) {
      // A row frame (the node is the data, from the parent's buffer), a row
      // handed in, or a form saved by an endpoint: nothing to read as a tree.
      isTree = false;
      aggregate = null;
      return;
    }

    if (!formId) {
      // The page id *is* the write contract: it is what tells the server which
      // collections may be written (relations.md §7). A descriptor built by the
      // caller writes its record with `db`, and one with collections cannot.
      isTree = false;
      aggregate = null;
      const layout = (descriptor.layout ?? []) as LayoutNode[];
      if (collectionNodes(layout).length > 0)
        loadError = 'A descriptor with collections cannot be written without a page id';
      return;
    }
    isTree = true;

    if (recordId === null || recordId === undefined) {
      // A new aggregate: DataForm still computes the create defaults, and they
      // reach the buffer as the draft it hands back.
      aggregate = draft ? draftAggregate(formId, draft) : newAggregate(formId);
      opened = true;
      lifecycle.emit('form:open', formRef());
      return;
    }

    try {
      const res = await api.endpoint('load_tree', { page: formId, id: recordId });
      if (res.status === 'success') {
        aggregate = loadedAggregate(formId, res.data as TreeNode);
        opened = true;
        lifecycle.emit('form:open', formRef());
      } else {
        loadError = errorText(res, `Cannot load record ${recordId}`);
      }
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  }

  // Keyed on what it fetches, like every other fetching effect: re-running is
  // harmless here only because of the cache above, and relying on that is
  // relying on an accident.
  let loadedKey: string | null = null;
  $effect(() => {
    const key = formId ?? '\0inline';
    if (key === loadedKey) return;
    loadedKey = key;
    loadDescriptor();
  });

  /**
   * Write the aggregate. Throws on refusal, which keeps the form dirty and shows
   * the reason — a tree that did not reach the database must not look saved.
   */
  async function saveAggregate(draft: Record<string, unknown>):
      Promise<{ values: Record<string, unknown>; flow?: Flow }> {
    const agg = aggregate!;
    setValues(agg.root, draft);
    const page = formId!;
    // A collection with a sequence is numbered as it stands: rows added,
    // removed, sorted by a command or moved by hand all end up 1, 2, 3
    for (const spec of collectionNodes((descriptor?.layout ?? []) as LayoutNode[])) {
      if (typeof spec.sequence === 'string') renumber(agg.root, spec.id, spec.sequence);
    }

    // Judged: the rules of the root's table may ask before anything is written
    const res = await callJudged('save_tree', serialize(agg), title);
    if (res.cancelled) throw new FlowCancelled();
    if (res.status !== 'success') {
      // Someone saved first: the answer is the tree as it stands now
      const data = res.data as { root?: TreeNode | null; errors?: Record<string, string> } | undefined;
      if (res.error_type === 'Conflict' && data && 'root' in data) {
        if (!data.root) throw new FlowRefused(_('Someone else deleted this document meanwhile: it cannot be saved'));
        const merge = mergeTrees(agg.root, data.root);
        const labels = labelsOf(descriptor);
        await resolveConflicts(merge, labels);
        aggregate = { ...agg, root: merge.root };
        throw new FlowMerged(mergeMessage(merge, labels), { ...data.root.values }, { ...merge.root.values });
      }
      const errors = data?.errors;
      throw new FlowRefused(errorText(res, _('Error saving')), res.flow?.patch, errors);
    }

    // Re-read from the answer: the database holds defaults and stamps the buffer
    // never saw, and the temporary ids are keys now.
    const saved = res.data as { root: TreeNode };
    aggregate = loadedAggregate(page, saved.root);
    lifecycle.emit('form:saved', formRef());
    return { values: { ...aggregate.root.values }, flow: res.flow };
  }

  async function handleSave(savedData: Record<string, unknown>, flow?: Flow) {
    if (buffer) {
      // A confirm, not a save: the values stay in the node, and the row reaches
      // the database when the root of the aggregate is saved.
      setValues(buffer.node, savedData);
      onSaved?.(savedData, { model: descriptor?.source?.model });
      stack.pop();
      return;
    }
    const mode = (aggregate ? aggregate.root.op === 'create' : recordId == null) ? 'insert' : 'update';
    let saved = savedData;
    if (aggregate) ({ values: saved, flow } = await saveAggregate(savedData));
    onSaved?.(saved, { model: descriptor?.source?.model });
    stack.pop();
    // What the rules answered once the record was saved, lines then actions;
    // then what this form does after a save of this mode
    const ctx = { stack, title };
    await presentOutcome(flow, ctx);
    const reaction = descriptor?.on_saved?.[mode];
    if (reaction) {
      const params = resolveRecordTokens(reaction.params as Record<string, unknown> | undefined, saved);
      await applyResult({ status: 'success', data: { ...reaction, params } }, ctx);
    }
  }

  function handleCancel() {
    onCancel?.();
    stack.pop();
  }
</script>

<div class="kb-form-view">
  <!-- Header bar -->
  <div class="kb-form-view-header">
    <button
      class="kb-form-view-back"
      onclick={handleCancel}
      title={_('Back to list')}
      aria-label={_('Back')}
    >
      ←
    </button>
    {#if title}
      <h2 class="kb-form-view-title">{title}</h2>
    {/if}
  </div>

  {#if topArea.length}
    <div class="kb-form-view-area">
      {#each topArea as item (item.component)}
        <PluginComponent
          loader={pluginLoader!}
          componentId={item.component}
          {...item.props}
          form={formRef()}
          meta={rootMeta}
          {dirty}
        />
      {/each}
    </div>
  {/if}

  <!-- Body -->
  <div class="kb-form-view-body">
    {#if loadError}
      <div class="kb-form-view-error">{loadError}</div>
    {:else if descriptor && (!isTree || aggregate)}
      {#snippet form(onEvent?: (name: string, data: unknown) => void)}
        <DataForm
          view={descriptor!}
          recordId={buffer ? (buffer.node.op === 'create' ? null : buffer.node.id) : recordId}
          data={data ?? (buffer ? buffer.node.values : (aggregate ? aggregate.root.values : undefined))}
          persist={!aggregate && !buffer}
          buffer={aggregate ? { agg: aggregate, node: aggregate.root } : buffer}
          hideFields={hideFields ?? []}
          groupLabel={title || undefined}
          submit={buffer ? 'confirm' : 'save'}
          trapFocus
          defaults={draft && !aggregate ? { ...(defaults ?? {}), ...(draft.values ?? {}) } : defaults}
          onSave={handleSave}
          onCancel={handleCancel}
          onEvent={(name, data) => { relay(name, data); onEvent?.(name, data); }}
        />
      {/snippet}
      <!-- A row of someone else's buffer is a form alone: the areas are the page's -->
      {#if panels.length && !buffer}
        <PanelRenderer panel={{ panels }} storageKey={formId} main={form} />
      {:else}
        {@render form()}
      {/if}
    {:else}
      <div class="kb-form-view-loading">
        <div class="kb-form-view-spinner" aria-hidden="true"></div>
        {_('Loading…')}
      </div>
    {/if}
  </div>
</div>

<style>
  .kb-form-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--kb-bg);
  }

  .kb-form-view-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.75rem;
    border-bottom: 1px solid var(--kb-border);
    background: var(--kb-surface);
    flex-shrink: 0;
  }

  .kb-form-view-back {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border: none;
    background: none;
    border-radius: 0.25rem;
    color: var(--kb-text-subtle);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    transition: background 0.1s, color 0.1s;
  }

  .kb-form-view-back:hover {
    background: var(--kb-surface-hover);
    color: var(--kb-text);
  }

  .kb-form-view-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--kb-text);
    margin: 0;
  }

  .kb-form-view-area {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .kb-form-view-area:empty {
    display: none;
  }

  .kb-form-view-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 1rem;
  }

  .kb-form-view-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    height: 100%;
    color: var(--kb-text-subtle);
    font-size: 0.85rem;
  }

  .kb-form-view-spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--kb-border);
    border-top-color: var(--kb-accent);
    border-radius: 50%;
    animation: kb-spin 0.6s linear infinite;
  }

  @keyframes kb-spin { to { transform: rotate(360deg); } }

  .kb-form-view-error {
    padding: 0.75rem;
    background: color-mix(in srgb, var(--kb-danger, #ef4444) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--kb-danger, #ef4444) 30%, transparent);
    border-radius: 0.375rem;
    color: var(--kb-danger, #ef4444);
    font-size: 0.8rem;
  }
</style>
