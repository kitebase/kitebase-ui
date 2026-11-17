<script lang="ts">
  /**
   * WidgetFKCombobox.svelte — FK field widget with server-side search.
   *
   * Keyboard: ↑↓ navigate options, Enter selects, Escape closes/restores,
   * Tab closes. "Search more…" is the last navigable item (opens picker).
   *
   * Enter or Tab on typed text, with no row highlighted, looks the text up as
   * the table's key (`search_key`: the declared code, else the id) and takes
   * the record that has it. Only an exact key is taken without a choice: a
   * match by content is picked from the list. Enter that finds nothing leaves
   * the list open on the content search; Tab has already moved on, so the
   * field goes back to its value and says what was not found.
   *
   * Where the table declares a code (`code_field`), it is shown beside the
   * name, in the list and as a badge on the field: seen while choosing, it is
   * typed the next time. Never inside the text, which is what a search edits.
   *
   * field.foreign_key: { target: string; field: string }  — from auto-form
   * serverConfig.tables[target].display_field             — label column
   * The lookup sends the typed text as the query's `search` key: which columns
   * it matches is the target table's own answer, resolved server-side.
   */
  import { untrack, getContext } from 'svelte';
  import { _, _t } from '../../i18n';
  import { api } from '$kitebase/api/client';
  import { errorText } from '$kitebase/api/envelope';
  import { serverConfig } from '$kitebase/api/serverConfig.svelte';
  import { stack as globalStack } from '$kitebase/stack/stack.svelte';
  import type { StackInstance } from '$kitebase/stack/stack.svelte';
  import FKPickerView from '../FKPickerView.svelte';
  import type { FormField } from '../dataform.types';
  import { popupKeys } from './widget.svelte';
  import { lookupPageId, filterConditions, filterRules } from '../lookup';

  const stack = getContext<StackInstance>('kb:stack') ?? globalStack;
  // A dialog has no stack to open the picker on: there the list is the only way.
  const canPush = getContext<boolean | undefined>('kb:can-push') !== false;

  interface Props {
    value: unknown;
    onchange: (v: unknown) => void;
    onblur?: () => void;
    readonly?: boolean;
    field: FormField;
    /** The search's initial filter, already read from the draft (`lookupFilters`). */
    filters?: Record<string, unknown>;
  }

  let { value, onchange, onblur, readonly = false, field, filters = {} }: Props = $props();

  let fkTarget  = $derived((field.foreign_key as { target?: string; field?: string } | undefined)?.target);
  // The picker's page; null when there is none for this user (`lookup.page: false`)
  let pickerPage = $derived(fkTarget ? lookupPageId(field, fkTarget) : null);
  let canSearchMore = $derived(canPush && pickerPage !== null);
  let fkPkField = $derived((field.foreign_key as { target?: string; field?: string } | undefined)?.field ?? 'id');

  let displayField = $derived(fkTarget ? serverConfig.tables[fkTarget]?.display_field : undefined);
  // Whether the target can be searched at all; *what* is searched is the
  // server's answer, sent back through the `search` key of the query.
  let searchable = $derived.by(() => {
    const table = fkTarget ? serverConfig.tables[fkTarget] : undefined;
    return !!table && ((table.search_fields?.length ?? 0) > 0 || !!table.search_key);
  });
  // Whether a typed text can name a record exactly (DATA_MODEL.md §4.4)
  let hasKey = $derived(!!(fkTarget && serverConfig.tables[fkTarget]?.search_key));

  // The target's declared code, shown beside the label; none without one
  let codeField = $derived(fkTarget ? serverConfig.tables[fkTarget]?.code_field : undefined);

  type Option = { id: unknown; label: string; code: string };

  /** The columns an option is built from: the key, the label, the code. */
  function optionColumns(pk: string, df: string, code: string | undefined): string[] {
    return [...new Set([pk, df, ...(code ? [code] : [])])];
  }

  function toOption(row: Record<string, unknown>, pk: string, df: string,
                    code: string | undefined): Option {
    const c = code ? row[code] : null;
    return { id: row[pk], label: String(row[df] ?? ''), code: c == null ? '' : String(c) };
  }

  let currentLabel = $state(untrack(() => ''));
  let currentCode  = $state(untrack(() => ''));
  let query        = $state(untrack(() => ''));
  let options      = $state<Option[]>([]);
  let open         = $state(false);
  let searching    = $state(false);
  // A search the server refused: said in the list, never read as "no results"
  let searchError  = $state<string | null>(null);
  // -1 = none; 0..options.length-1 = option; options.length = "Search more…"
  let highlighted  = $state(-1);
  // A code typed and confirmed with Tab that found nothing: said under the
  // field, since the focus has already left it and the list with it.
  let missedCode   = $state<string | null>(null);
  let tabPending   = false;
  // While the user types, the text is a search and the badge would name the
  // old value: it is shown on the label only.
  let showBadge    = $derived(!!currentCode && query === currentLabel);
  let inputEl      = $state<HTMLInputElement | undefined>();
  let listEl       = $state<HTMLUListElement | undefined>();

  // Reset highlight when options list changes
  $effect(() => {
    void options;
    highlighted = -1;
  });

  // Load the label whenever value changes from outside
  $effect(() => {
    const v = value;
    const df = displayField;
    const tbl = fkTarget;
    const pk = fkPkField;
    const code = codeField;
    if (v == null || v === '') {
      currentLabel = '';
      currentCode = '';
      query = '';
      return;
    }
    if (!tbl || !df) return;
    _loadLabel(v, tbl, pk, df, code);
  });

  // All parameters explicit — no outer-scope $derived access inside async body.
  // `resolve: true` — this reads a value that is already stored, so it must not
  // go through the server's visibility filters: a record archived (or no longer
  // matching the picklist's domain) after the document was saved must still
  // render its label. Only the search below is filtered.
  async function _loadLabel(v: unknown, table: string, pkField: string, df: string,
                            code: string | undefined) {
    try {
      const res = await api.endpoint('query', {
        format: 'records',
        query: {
          table,
          // `select`, not `columns`: the latter is a key of a *view* descriptor,
          // and the querybuilder silently ignored it — which meant the whole row
          // came back instead, so a display field that only exists as an
          // expression (a hybrid property) was never in the answer.
          select: optionColumns(pkField, df, code),
          filters: { conditions: { column: pkField, op: 'eq', value: v } },
          limit: 1,
          resolve: true,
        },
      });
      if (res.status === 'success' && Array.isArray(res.data) && res.data.length > 0) {
        const opt = toOption(res.data[0] as Record<string, unknown>, pkField, df, code);
        currentLabel = opt.label;
        currentCode = opt.code;
        query = opt.label;
      }
    } catch (_) {}
  }

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function handleInput(e: Event) {
    const q = (e.target as HTMLInputElement).value;
    query = q;
    missedCode = null;
    if (!q.trim()) {
      options = [];
      open = false;
      clearTimeout(debounceTimer);
      return;
    }
    open = true;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => _search(q), 300);
  }

  // `search` sends the text and nothing else: which columns it looks at, and
  // whether the text can also be a key matched exactly, is the table's own
  // answer (DATA_MODEL.md §4.4) and the same one the quick search on a list
  // gets. Building the OR here made this combobox single-field and left it
  // unable to find a record by its number.
  async function _search(q: string) {
    const df = displayField;
    if (!fkTarget || !df || !searchable) return;

    searching = true;
    searchError = null;
    try {
      const res = await api.endpoint('query', {
        format: 'records',
        query: {
          table: fkTarget,
          select: optionColumns(fkPkField, df, codeField),
          search: q,
          ...(Object.keys(filters).length ? { filters: { conditions: filterConditions(filters) } } : {}),
          // In the order the user reads: by the label, not by the key.
          order_by: [df],
          limit: 10,
        },
      });
      if (res.status === 'success' && Array.isArray(res.data)) {
        options = res.data.map((r) => toOption(r as Record<string, unknown>, fkPkField, df, codeField));
      } else {
        searchError = errorText(res, _('The search failed'));
        options = [];
      }
    } finally {
      searching = false;
    }
  }

  /**
   * The record whose key is exactly this text, or null. The domain applies as
   * it does to the search: a code outside it is not one the field accepts.
   */
  async function _lookupKey(q: string): Promise<Option | null> {
    const df = displayField;
    if (!fkTarget || !df || !hasKey) return null;
    const res = await api.endpoint('query', {
      format: 'records',
      query: {
        table: fkTarget,
        select: optionColumns(fkPkField, df, codeField),
        code: q,
        ...(Object.keys(filters).length ? { filters: { conditions: filterConditions(filters) } } : {}),
        limit: 2,
      },
    });
    if (res.status !== 'success' || !Array.isArray(res.data) || res.data.length !== 1) return null;
    return toOption(res.data[0] as Record<string, unknown>, fkPkField, df, codeField);
  }

  /** Text the user typed that is not the label of the current value. */
  function typedText(): string {
    const q = query.trim();
    return q && query !== currentLabel ? q : '';
  }

  // Enter with nothing highlighted: the key if it matches, else the list now,
  // without waiting for the debounce. A match moves on as Enter does on a
  // closed list: the key is sent again, and the form takes it.
  async function enterTyped(q: string, el: HTMLElement | undefined) {
    clearTimeout(debounceTimer);
    const hit = await _lookupKey(q);
    if (query.trim() !== q) return;            // typed on meanwhile: that wins
    if (hit) {
      selectOption(hit);
      el?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    } else {
      open = true;
      _search(q);
    }
  }

  // Tab: the focus moves on at once, and the key is resolved behind it.
  async function tabTyped(q: string) {
    clearTimeout(debounceTimer);
    tabPending = true;
    let hit: Option | null = null;
    try {
      hit = await _lookupKey(q);
    } finally {
      tabPending = false;
    }
    if (hit) {
      selectOption(hit);
    } else {
      query = currentLabel;
      missedCode = q;
    }
  }

  function selectOption(opt: Option) {
    missedCode = null;
    currentLabel = opt.label;
    currentCode = opt.code;
    query = opt.label;
    options = [];
    open = false;
    highlighted = -1;
    onchange(opt.id);
    onblur?.();
  }

  function clearValue() {
    missedCode = null;
    currentLabel = '';
    currentCode = '';
    query = '';
    options = [];
    open = false;
    highlighted = -1;
    onchange(null);
    onblur?.();
  }

  // Total navigable items: options + "Search more…", where it can open
  function totalItems() { return options.length + (canSearchMore ? 1 : 0); }

  function scrollHighlightedIntoView() {
    if (!listEl || highlighted < 0) return;
    const items = listEl.querySelectorAll<HTMLElement>('[role="option"]');
    items[highlighted]?.scrollIntoView({ block: 'nearest' });
  }

  /**
   * Open the list from the keyboard or the chevron, with or without text. What
   * the field shows is the current label, not a search: it lists from the start.
   */
  function openList() {
    open = true;
    highlighted = -1;
    inputEl?.focus();
    const q = query.trim() && query !== currentLabel ? query : '';
    clearTimeout(debounceTimer);
    _search(q);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (popupKeys(e, { open: openList, search: openPicker })) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      // An open list takes the key: closing it is not cancelling the form.
      if (open) e.stopPropagation();
      open = false;
      highlighted = -1;
      query = currentLabel;
      onblur?.();
      return;
    }

    if (e.key === 'Tab') {
      const q = highlighted < 0 ? typedText() : '';
      open = false;
      if (q && hasKey) {
        tabTyped(q);
      } else if (highlighted >= 0 && highlighted < options.length) {
        selectOption(options[highlighted]);
      } else {
        query = currentLabel;
      }
      highlighted = -1;
      // let Tab propagate for focus advance
      return;
    }

    if (!open) {
      // Open on ArrowDown/Up when closed, empty field included
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openList();
      }
      // Enter on closed dropdown with no selection: dispatch df:enter for form focus advance
      if (e.key === 'Enter') {
        e.preventDefault();
        (e.currentTarget as HTMLElement).dispatchEvent(
          new CustomEvent('df:enter', { bubbles: true })
        );
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlighted = highlighted < totalItems() - 1 ? highlighted + 1 : 0;
      scrollHighlightedIntoView();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlighted = highlighted > 0 ? highlighted - 1 : totalItems() - 1;
      scrollHighlightedIntoView();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (canSearchMore && highlighted === options.length) {
        // "Search more…" is highlighted
        openPicker();
      } else if (highlighted >= 0 && highlighted < options.length) {
        selectOption(options[highlighted]);
      } else if (typedText() && hasKey) {
        // The answer decides whether the form moves on: not yet.
        e.stopPropagation();
        enterTyped(typedText(), inputEl);
      }
      return;
    }
  }

  function handleBlur() {
    setTimeout(() => {
      open = false;
      highlighted = -1;
      // A Tab lookup still running owns the text: it sets it when it answers.
      if (!tabPending) query = currentLabel;
      onblur?.();
    }, 150);
  }

  function openPicker() {
    open = false;
    if (!fkTarget || !pickerPage || !canSearchMore) return;
    // Snapshot derived values at push time — closures must not access $derived inside async.
    const _table   = fkTarget;
    const _page    = pickerPage;
    const _pkField = fkPkField;
    const _df      = displayField;
    const _code    = codeField;
    stack.push(
      FKPickerView,
      { table: _table, page: _page, rules: filterRules(filters),
        current: value, title: field.label ?? _table },
      (row: unknown) => {
        if (!row || typeof row !== 'object') return;
        const r = row as Record<string, unknown>;
        const id = r[_pkField];
        if (id == null) return;
        // Show id immediately so the field is never visually empty on return.
        currentLabel = String(id);
        currentCode = '';
        query = String(id);
        onchange(id);
        // As a choice from the list does: the field is validated again.
        onblur?.();
        // Then replace with the real label (row may lack virtual display fields).
        if (_df) _loadLabel(id, _table, _pkField, _df, _code);
      }
    );
  }
</script>

{#if readonly}
  <span
    class="block rounded-btn border px-3 py-2 text-sm"
    style="border-color: var(--kb-border); background: var(--kb-surface-subtle); color: var(--kb-text)"
  >
    {currentLabel || '—'}
    {#if currentCode}
      <span class="float-right text-xs" style="color: var(--kb-text-subtle)">{currentCode}</span>
    {/if}
  </span>

{:else}
  <div class="relative">
    <input
      bind:this={inputEl}
      type="text"
      class="input w-full {showBadge ? 'pr-28' : 'pr-16'} {field.error ? 'input-error' : ''}"
      placeholder={field.placeholder as string | undefined ?? _('Search…')}
      value={query}
      oninput={handleInput}
      onkeydown={handleKeydown}
      onblur={handleBlur}
      aria-label={field.label ?? field.name}
      aria-autocomplete="list"
    />

    <!-- The code of the chosen record: beside the text, never in it -->
    {#if showBadge}
      <span
        class="pointer-events-none absolute right-14 top-1/2 -translate-y-1/2 rounded px-1.5 text-xs"
        style="color: var(--kb-text-subtle); background: var(--kb-surface-subtle)"
      >{currentCode}</span>
    {/if}

    <!-- Clear (×) — shown when a value is selected -->
    {#if currentLabel}
      <button
        type="button"
        tabindex="-1"
        class="absolute right-8 top-1/2 -translate-y-1/2 p-1"
        style="color: var(--kb-text-subtle)"
        onmousedown={(e) => { e.preventDefault(); clearValue(); }}
        aria-label={_('Clear selection')}
      >
        <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    {/if}

    <!-- Chevron: the mouse's way to the list; the keyboard has F4, so Tab skips it -->
    <button
      type="button"
      tabindex="-1"
      class="absolute right-2 top-1/2 -translate-y-1/2 p-1"
      style="color: var(--kb-text-subtle)"
      onmousedown={(e) => e.preventDefault()}
      onclick={() => { if (open) open = false; else openList(); }}
      aria-label={_('Select')}
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>

    <!-- Dropdown -->
    {#if open}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-md shadow-lg"
        style="top: 100%; border: 1px solid var(--kb-border); background: var(--kb-surface)"
        onmousedown={(e) => e.preventDefault()}
      >
        <ul bind:this={listEl} class="max-h-48 overflow-auto py-1" role="listbox">
          {#if searching}
            <li class="px-3 py-2 text-sm" style="color: var(--kb-text-subtle)">{_('Searching…')}</li>
          {:else if searchError}
            <li class="px-3 py-2 text-sm text-danger">{searchError}</li>
          {:else if options.length === 0 && query.trim()}
            <li class="px-3 py-2 text-sm" style="color: var(--kb-text-subtle)">{_('No results')}</li>
          {:else}
            {#each options as opt, i (opt.id)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <li
                role="option"
                aria-selected={String(value) === String(opt.id)}
                class="cursor-pointer px-3 py-2 text-sm
                       {highlighted === i ? 'bg-blue-50' : 'hover:bg-blue-50'}
                       {String(value) === String(opt.id) ? 'font-semibold text-brand' : ''}"
                onclick={() => selectOption(opt)}
              >
                <span class="flex items-baseline justify-between gap-3">
                  <span>{opt.label}</span>
                  {#if opt.code}
                    <span class="shrink-0 text-xs font-normal" style="color: var(--kb-text-subtle)">{opt.code}</span>
                  {/if}
                </span>
              </li>
            {/each}
          {/if}
        </ul>

        <!-- Search more… -->
        {#if canSearchMore}
        <div style="border-top: 1px solid var(--kb-border-subtle, var(--kb-border))">
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            role="option"
            aria-selected="false"
            tabindex="-1"
            class="cursor-pointer px-3 py-2 text-xs
                   {highlighted === options.length ? 'bg-blue-50' : 'hover:bg-gray-50'}"
            style="color: var(--kb-text-subtle)"
            onclick={openPicker}
          >
            {_('Search more…')}
          </div>
        </div>
        {/if}
      </div>
    {/if}
  </div>
  {#if missedCode}
    <p class="mt-1 text-xs text-danger" role="alert">{_t('Nothing with the code {code}', { code: missedCode })}</p>
  {/if}
{/if}
