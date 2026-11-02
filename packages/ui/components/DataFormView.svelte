<script lang="ts">
  /**
   * DataFormView.svelte — stack page that wraps DataForm for Add/Edit.
   *
   * Loads the form descriptor lazily from `get_page` (cached per formId),
   * then renders DataForm. Intended to be pushed onto the stack by DataView.
   *
   * When the descriptor declares collection nodes the page is an **aggregate**, and
   * this frame owns its buffer: it reads the whole tree with `load_tree`, hands the
   * root's values to DataForm, and writes everything back with `save_tree` in one
   * transaction. Nothing declares that mode — the nodes do (relations.md §16.2).
   *
   * Props:
   *   formId      string              e.g. 'book_form' — also the page id of the aggregate
   *   descriptor  FormDescriptor      a descriptor the caller built, instead of an id
   *   recordId    string|number|null  null = new record
   *   title       string              shown in header bar
   *   onSaved     (savedData) => void  called after successful save with merged record (before pop)
   */
  import { getContext } from 'svelte';
  import { _ } from '../i18n';
  import { stack as globalStack } from '$kitebase/stack/stack.svelte';
  import type { StackInstance } from '$kitebase/stack/stack.svelte';
  import { api } from '$kitebase/api/client';
  import DataForm from './DataForm.svelte';
  import { callJudged, presentOutcome, FlowCancelled, FlowRefused } from './flow';
  import { applyResult } from './resultAction';
  import { resolveRecordTokens } from './record';
  import type { Flow } from '../api/types';
  import {
    collectionNodes, loadedAggregate, newAggregate, serialize, setValues,
    type Aggregate, type TreeNode,
  } from './aggregate';
  import type { FormDescriptor, LayoutNode } from './dataform.types';

  const stack = getContext<StackInstance>('kb:stack') ?? globalStack;

  let {
    formId = undefined,
    descriptor: givenDescriptor = undefined,
    recordId = null,
    data = undefined,
    defaults = undefined,
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
     * A node of someone else's buffer — this frame edits a row of a collection
     * rather than owning an aggregate. It reads and writes nothing: confirming
     * leaves the values in the node, and the caller decides what to do with it.
     */
    buffer?: { agg: Aggregate; node: TreeNode };
    /** Fields the caller supplies, which this form must not draw (§17). */
    hideFields?: string[];
    title?: string;
    onSaved?: (savedData: Record<string, unknown>) => void;
    onCancel?: () => void;
  } = $props();

  let descriptor = $state<FormDescriptor | null>(null);
  let loadError  = $state<string | null>(null);
  /** The buffer, when this page is an aggregate. Null on a plain record form. */
  let aggregate  = $state<Aggregate | null>(null);
  /** Known before the tree arrives, so the form waits instead of flashing empty. */
  let isAggregate = $state(false);

  // Descriptor cache — shared across all DataFormView instances in the session.
  const _cache = new Map<string, FormDescriptor>();

  async function loadDescriptor() {
    if (givenDescriptor) {
      descriptor = givenDescriptor;
    } else if (!formId) {
      loadError = 'A form frame needs either a page id or a descriptor';
      return;
    } else if (_cache.has(formId)) {
      descriptor = _cache.get(formId)!;
    } else {
      try {
        const res = await api.endpoint('get_page', { id: formId });
        if (res.status === 'success') {
          const page = res.data as Record<string, unknown>;
          const fd = (page.content ?? page) as FormDescriptor;
          _cache.set(formId, fd);
          descriptor = fd;
        } else {
          loadError = res.message ?? `Cannot load form ${formId}`;
          return;
        }
      } catch (e) {
        loadError = e instanceof Error ? e.message : String(e);
        return;
      }
    }
    await loadAggregate();
  }

  /** Read the whole tree, or open an empty one — only if the page declares nodes. */
  async function loadAggregate() {
    if (buffer) {
      // A row frame: the node is the data, and it came from the parent's buffer.
      // Nothing to read, nothing to write — confirming hands the node back.
      isAggregate = false;
      aggregate = null;
      return;
    }

    const layout = (descriptor?.layout ?? []) as LayoutNode[];
    isAggregate = collectionNodes(layout).length > 0;
    if (!isAggregate) {
      aggregate = null;
      return;
    }

    if (!formId) {
      // The page id *is* the write contract: it is what tells the server which
      // collections may be written (relations.md §7).
      loadError = 'A descriptor with collections cannot be written without a page id';
      return;
    }

    if (recordId === null || recordId === undefined) {
      // A new aggregate: DataForm still computes the create defaults, and they
      // reach the buffer as the draft it hands back.
      aggregate = newAggregate(formId);
      return;
    }

    try {
      const res = await api.endpoint('load_tree', { page: formId, id: recordId });
      if (res.status === 'success') {
        aggregate = loadedAggregate(formId, res.data as TreeNode);
      } else {
        loadError = res.message ?? `Cannot load record ${recordId}`;
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

    // Judged: the rules of the root's table may ask before anything is written
    const res = await callJudged('save_tree', serialize(agg), title);
    if (res.cancelled) throw new FlowCancelled();
    if (res.status !== 'success') throw new FlowRefused(res.message ?? _('Error saving'), res.flow?.patch);

    // Re-read from the answer: the database holds defaults and stamps the buffer
    // never saw, and the temporary ids are keys now.
    const saved = res.data as { root: TreeNode };
    aggregate = loadedAggregate(page, saved.root);
    return { values: { ...aggregate.root.values }, flow: res.flow };
  }

  async function handleSave(savedData: Record<string, unknown>, flow?: Flow) {
    if (buffer) {
      // A confirm, not a save: the values stay in the node, and the row reaches
      // the database when the root of the aggregate is saved.
      setValues(buffer.node, savedData);
      onSaved?.(savedData);
      stack.pop();
      return;
    }
    const mode = (aggregate ? aggregate.root.op === 'create' : recordId == null) ? 'insert' : 'update';
    let saved = savedData;
    if (aggregate) ({ values: saved, flow } = await saveAggregate(savedData));
    onSaved?.(saved);
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

  <!-- Body -->
  <div class="kb-form-view-body">
    {#if loadError}
      <div class="kb-form-view-error">{loadError}</div>
    {:else if descriptor && (!isAggregate || aggregate)}
      <DataForm
        view={descriptor}
        recordId={buffer ? (buffer.node.op === 'create' ? null : buffer.node.id) : recordId}
        data={data ?? (buffer ? buffer.node.values : (aggregate ? aggregate.root.values : undefined))}
        persist={!aggregate && !buffer}
        buffer={aggregate ? { agg: aggregate, node: aggregate.root } : buffer}
        hideFields={hideFields ?? []}
        groupLabel={title || undefined}
        submit={buffer ? 'confirm' : 'save'}
        {defaults}
        onSave={handleSave}
        onCancel={handleCancel}
      />
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
