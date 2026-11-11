<script lang="ts">
  /**
   * A set of references to a vocabulary, shown as badges: the widget of a
   * RefSet field (a junction the record reads as a value, such as its tags).
   *
   * The value is the list of the vocabulary's keys, in the order they were
   * added. Typing searches the vocabulary as a foreign key does (the `search`
   * of the query, answered by the table); Enter or a comma takes the
   * highlighted match, or the text as a new entry when the vocabulary accepts
   * one (`ref_set.create`): it goes into the list as the name itself, and the
   * server turns it into a key on save. Backspace in the empty box takes the
   * last badge away.
   *
   * field.ref_set: { target, field, create }   from the table schema
   */
  import { untrack } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { _, _t } from '../../i18n';
  import { api } from '$kitebase/api/client';
  import { errorText } from '$kitebase/api/envelope';
  import { serverConfig } from '$kitebase/api/serverConfig.svelte';
  import { refsetName, rememberNames } from '../../formatters/refset';
  import type { FormField } from '../dataform.types';

  interface Props {
    value: unknown;
    onchange: (v: unknown[]) => void;
    onblur?: () => void;
    readonly?: boolean;
    field: FormField;
  }

  let { value, onchange, onblur, readonly = false, field }: Props = $props();

  type RefSetInfo = { target?: string; field?: string; create?: boolean };
  const ref = $derived((field.ref_set ?? {}) as RefSetInfo);
  const target = $derived(ref.target);
  const keyField = $derived(ref.field ?? 'id');
  const displayField = $derived(target ? serverConfig.tables[target]?.display_field : undefined);

  const items = $derived<unknown[]>(Array.isArray(value) ? value : []);

  // The labels of the keys met so far; a key is shown as itself until its label arrives
  const labels = new SvelteMap<string, string>();
  // Names typed here that the vocabulary did not have: new until the save
  const added = new SvelteSet<string>();

  let query = $state('');
  let options = $state<Array<{ key: unknown; label: string }>>([]);
  let open = $state(false);
  let searching = $state(false);
  // A search the server refused: said in the list, never read as "no results"
  let searchError = $state<string | null>(null);
  let highlighted = $state(-1);
  let inputEl = $state<HTMLInputElement | undefined>();

  const keyOf = (v: unknown) => String(v);
  const isNew = (v: unknown) => typeof v === 'string' && added.has(v);
  const labelOf = (v: unknown) =>
    labels.get(keyOf(v)) ?? (target ? refsetName(target, v) : undefined) ?? String(v);

  // Labels for the keys the value brings that are not known yet: one query for all
  $effect(() => {
    const missing = items.filter((v) => !isNew(v) && !labels.has(keyOf(v)));
    const tbl = target;
    const df = displayField;
    const pk = keyField;
    if (!missing.length || !tbl || !df) return;
    untrack(() => loadLabels(missing, tbl, pk, df));
  });

  // `resolve: true`: these keys are already stored, and an entry archived since
  // must still show its name.
  async function loadLabels(keys: unknown[], table: string, pk: string, df: string) {
    try {
      const res = await api.endpoint('query', {
        format: 'records',
        query: {
          table,
          select: [pk, df],
          filters: { conditions: { column: pk, op: 'in', value: keys } },
          resolve: true,
        },
      });
      if (res.status === 'success' && Array.isArray(res.data)) {
        for (const r of res.data as Record<string, unknown>[]) {
          labels.set(keyOf(r[pk]), String(r[df] ?? ''));
        }
        rememberNames(table, (res.data as Record<string, unknown>[]).map((r) => [r[pk], String(r[df] ?? '')]));
      }
    } catch (_) {}
  }

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function handleInput(e: Event) {
    query = (e.target as HTMLInputElement).value;
    // A comma closes an entry: what precedes it is taken (a pasted "a, b, c"
    // takes all but the last), the rest stays typed
    if (query.includes(',')) {
      const parts = query.split(',');
      const rest = parts.pop() ?? '';
      for (const part of parts) commitText(part);
      query = rest;
      if (!query.trim()) return;
    }
    open = true;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => search(query), 250);
  }

  async function search(q: string) {
    const tbl = target;
    const df = displayField;
    const pk = keyField;
    if (!tbl || !df) return;
    searching = true;
    searchError = null;
    try {
      const res = await api.endpoint('query', {
        format: 'records',
        query: {
          table: tbl,
          select: [pk, df],
          ...(q.trim() ? { search: q.trim() } : {}),
          order_by: [df],
          limit: 10,
        },
      });
      if (res.status === 'success' && Array.isArray(res.data)) {
        const chosen = new Set(items.map(keyOf));
        options = (res.data as Record<string, unknown>[])
          .map((r) => ({ key: r[pk], label: String(r[df] ?? '') }))
          .filter((o) => !chosen.has(keyOf(o.key)));
        highlighted = options.length ? 0 : -1;
        for (const o of options) labels.set(keyOf(o.key), o.label);
        rememberNames(tbl, options.map((o) => [o.key, o.label]));
      } else {
        searchError = errorText(res, _('The search failed'));
        options = [];
        highlighted = -1;
      }
    } finally {
      searching = false;
    }
  }

  const fold = (s: string) => s.trim().toLowerCase();

  // The text as a new entry: offered when the vocabulary takes one and nothing
  // listed, chosen or found already has that name.
  const offerNew = $derived.by(() => {
    const q = fold(query);
    // What could not be read may exist: adding it would make a duplicate
    if (!ref.create || !q || searchError) return false;
    if (options.some((o) => fold(o.label) === q)) return false;
    return !items.some((v) => fold(labelOf(v)) === q);
  });

  const total = $derived(options.length + (offerNew ? 1 : 0));

  function add(v: unknown) {
    if (items.some((x) => keyOf(x) === keyOf(v))) return;
    onchange([...items, v]);
  }

  function take(opt: { key: unknown; label: string }) {
    add(opt.key);
    reset();
  }

  function takeNew(text: string) {
    const name = text.trim();
    if (!name) return;
    added.add(name);
    add(name);
    reset();
  }

  /** Enter or comma on typed text: its exact match, else a new entry. */
  function commitText(text: string) {
    const q = fold(text);
    if (!q) return;
    const match = options.find((o) => fold(o.label) === q);
    if (match) take(match);
    else if (ref.create) takeNew(text);
  }

  function remove(v: unknown) {
    onchange(items.filter((x) => keyOf(x) !== keyOf(v)));
    onblur?.();
  }

  function reset() {
    query = '';
    options = [];
    open = false;
    highlighted = -1;
  }

  function openList() {
    open = true;
    clearTimeout(debounceTimer);
    search(query);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (open || query) {
        // An open list takes the key: closing it is not cancelling the form
        e.preventDefault();
        e.stopPropagation();
        reset();
      }
      return;
    }
    if (e.key === 'Backspace' && !query && items.length) {
      e.preventDefault();
      remove(items[items.length - 1]);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { openList(); return; }
      if (!total) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      highlighted = (highlighted + step + total) % total;
      return;
    }
    if (e.key === 'Enter') {
      // Nothing typed: Enter moves on, as on every field (the form does it)
      if (!query.trim() && !open) return;
      // Otherwise it adds, and the focus stays for the next one
      e.preventDefault();
      e.stopPropagation();
      if (highlighted >= 0 && highlighted < options.length) take(options[highlighted]);
      else if (highlighted === options.length && offerNew) takeNew(query);
      else commitText(query);
    }
  }

  function handleBlur() {
    setTimeout(() => {
      reset();
      onblur?.();
    }, 150);
  }
</script>

{#snippet badge(v: unknown, removable: boolean)}
  <span class={['kb-refset-badge', { 'kb-refset-new': isNew(v) }]}
        title={isNew(v) ? _('New: created on save') : undefined}>
    {labelOf(v)}
    {#if removable}
      <button type="button" tabindex="-1" class="kb-refset-remove"
              onmousedown={(e) => e.preventDefault()}
              onclick={() => remove(v)}
              aria-label={_t('Remove {name}', { name: labelOf(v) })}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    {/if}
  </span>
{/snippet}

{#if readonly}
  <div class="kb-refset kb-refset-readonly">
    {#each items as v (keyOf(v))}{@render badge(v, false)}{:else}&mdash;{/each}
  </div>
{:else}
  <div class="relative">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="input kb-refset {field.error ? 'input-error' : ''}" onclick={() => inputEl?.focus()}>
      {#each items as v (keyOf(v))}{@render badge(v, true)}{/each}
      <input
        bind:this={inputEl}
        type="text"
        class="kb-refset-input"
        value={query}
        placeholder={items.length ? '' : (field.placeholder as string | undefined ?? _('Type to add…'))}
        oninput={handleInput}
        onkeydown={handleKeydown}
        onblur={handleBlur}
        aria-label={field.label ?? field.name}
        aria-autocomplete="list"
      />
    </div>

    {#if open && (searching || total > 0 || query.trim())}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="kb-refset-popup" onmousedown={(e) => e.preventDefault()}>
        <ul role="listbox" class="kb-refset-list">
          {#if searching && !options.length}
            <li class="kb-refset-note">{_('Searching…')}</li>
          {/if}
          {#each options as opt, i (keyOf(opt.key))}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <li role="option" aria-selected={highlighted === i}
                class={['kb-refset-option', { 'kb-refset-highlighted': highlighted === i }]}
                onclick={() => take(opt)}>
              {opt.label}
            </li>
          {/each}
          {#if offerNew}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <li role="option" aria-selected={highlighted === options.length}
                class={['kb-refset-option kb-refset-add',
                        { 'kb-refset-highlighted': highlighted === options.length }]}
                onclick={() => takeNew(query)}>
              {_t('Add "{name}"', { name: query.trim() })}
            </li>
          {:else if searchError}
            <li class="kb-refset-note" style="color: var(--kb-danger)">{searchError}</li>
          {:else if !searching && !options.length}
            <li class="kb-refset-note">{_('No results')}</li>
          {/if}
        </ul>
      </div>
    {/if}
  </div>
{/if}

<style>
  .kb-refset {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    min-height: 2.5rem;
    height: auto;
    cursor: text;
  }
  .kb-refset-readonly {
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--kb-border);
    border-radius: 0.375rem;
    background: var(--kb-bg);
    font-size: 0.875rem;
    color: var(--kb-text);
    cursor: default;
  }
  .kb-refset:focus-within {
    border-color: var(--kb-accent);
    box-shadow: 0 0 0 1px var(--kb-accent);
  }
  /* The box shows the focus: the input inside it is only where the text goes */
  .kb-refset-input,
  .kb-refset-input:focus {
    flex: 1;
    min-width: 6rem;
    padding: 0;
    border: none;
    outline: none;
    box-shadow: none;
    background: transparent;
    font-size: 0.875rem;
    color: var(--kb-text);
  }
  .kb-refset-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    border: 1px solid var(--kb-accent-border);
    border-radius: 9999px;
    background: var(--kb-accent-subtle);
    font-size: 0.8125rem;
    line-height: 1.25rem;
    color: var(--kb-text);
    white-space: nowrap;
  }
  .kb-refset-new {
    border-style: dashed;
    background: transparent;
  }
  .kb-refset-remove {
    display: inline-flex;
    width: 0.75rem;
    height: 0.75rem;
    color: var(--kb-text-subtle);
  }
  .kb-refset-remove:hover {
    color: var(--kb-text);
  }
  .kb-refset-popup {
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    z-index: 50;
    margin-top: 0.25rem;
    overflow: hidden;
    border: 1px solid var(--kb-border);
    border-radius: 0.375rem;
    background: var(--kb-surface);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
  }
  .kb-refset-list {
    max-height: 12rem;
    overflow: auto;
    padding: 0.25rem 0;
  }
  .kb-refset-option {
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
    color: var(--kb-text);
    cursor: pointer;
  }
  .kb-refset-option:hover,
  .kb-refset-highlighted {
    background: var(--kb-surface-hover);
  }
  .kb-refset-add {
    color: var(--kb-accent);
  }
  .kb-refset-note {
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    color: var(--kb-text-subtle);
  }
</style>
