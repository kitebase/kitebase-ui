<script lang="ts">
  /**
   * DataViewNavigator.svelte — icon-only CRUD toolbar for DataView.
   *
   * Derives button visibility from:
   *   1. Mode defaults (browser / lookup / readonly)
   *   2. + show: [...] from NavigatorConfig
   *   3. - hide: [...] from NavigatorConfig
   *
   * Toolbar command buttons (scope: row/selection/global) are injected
   * between the CRUD group and the filter group.
   *
   * Auto-items (load_more, commands) obey their own condition AND hide list.
   */

  import {
    Plus, Pencil, Trash2, Check, X,
    Funnel, Search,
    Group, Download, Printer,
    RefreshCw, Ellipsis,
    ChevronDown, SquareCheckBig, Zap,
  } from 'lucide-svelte';
  import type { NavigatorConfig, CommandItem } from './dataview.types';
  import { commandLabel } from './dataview.types';
  import { visibleButtons } from './navigator.visibility';
  import { resolveIcon } from './icons';
  import { _, _t } from '../i18n';

  const LOAD_MORE_OPTIONS = [50, 100, 500];

  // ── Props ──────────────────────────────────────────────────────────────────

  let {
    config = undefined as NavigatorConfig | undefined,
    // Data state
    filterMode = false,
    loading = false,
    loadingMore = false,
    hasMore = false,
    rowCount = 0,
    filteredCount = null as number | null,
    totalCount = null as number | null,
    selectedCount = 0,
    activeRowId = null as unknown,
    // Actions
    onAdd = undefined as (() => void) | undefined,
    onEdit = undefined as (() => void) | undefined,
    onDelete = undefined as (() => void) | undefined,
    onAccept = undefined as (() => void) | undefined,
    onCancel = undefined as (() => void) | undefined,
    selectMode = false,
    onToggleFilter = undefined as (() => void) | undefined,
    onToggleSelect = undefined as (() => void) | undefined,
    onExport = undefined as (() => void) | undefined,
    onRefresh = undefined as (() => void) | undefined,
    onLoadMore = undefined as ((n: number) => void) | undefined,
    // Back to the view as declared; `canReset` says there is something to undo.
    canReset = false,
    onReset = undefined as (() => void) | undefined,
    onCommand = undefined as ((cmd: CommandItem) => void) | undefined,
    // Quick search — the everyday gesture, so it lives in the row that already
    // exists rather than in one of its own (querybuilder.md §7).
    searchable = false,
    searchValue = '',
    onSearch = undefined as ((text: string) => void) | undefined,
    // The rule editor: a deliberate act, so a button rather than a gesture.
    rulesActive = false,
    onOpenRules = undefined as (() => void) | undefined,
  }: {
    config?: NavigatorConfig;
    filterMode?: boolean;
    loading?: boolean;
    loadingMore?: boolean;
    hasMore?: boolean;
    rowCount?: number;
    filteredCount?: number | null;
    totalCount?: number | null;
    selectedCount?: number;
    activeRowId?: unknown;
    onAdd?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    onAccept?: () => void;
    onCancel?: () => void;
    selectMode?: boolean;
    onToggleFilter?: () => void;
    onToggleSelect?: () => void;
    onExport?: () => void;
    onRefresh?: () => void;
    onLoadMore?: (n: number) => void;
    canReset?: boolean;
    onReset?: () => void;
    onCommand?: (cmd: CommandItem) => void;
    searchable?: boolean;
    searchValue?: string;
    onSearch?: (text: string) => void;
    rulesActive?: boolean;
    onOpenRules?: () => void;
  } = $props();

  // ── Visibility resolution ──────────────────────────────────────────────────

  const mode = $derived(config?.mode ?? 'browser');

  const visibleSet = $derived(visibleButtons(config));

  function isVisible(id: string): boolean {
    return visibleSet.has(id);
  }

  // ── Commands ───────────────────────────────────────────────────────────────
  // All of them sit in the [⚡] menu, one place the user learns once; a
  // command with `toolbar: true` is also a button of its own. The scope only
  // says when a command can run: what it does is the server's.

  const commands = $derived(config?.commands ?? []);
  const toolbarCmds = $derived(commands.filter(c => c.toolbar));
  let commandsOpen = $state(false);

  function cmdDisabled(cmd: CommandItem): boolean {
    return cmd.scope === 'row' ? !hasRow : cmd.scope === 'selection' ? !hasSel : false;
  }

  /** The label with its key, the way the menu teaches it: "Archive (A)". */
  function cmdLabel(cmd: CommandItem): string {
    const name = commandLabel(cmd);
    return cmd.key ? `${name} (${String(cmd.key).toUpperCase()})` : name;
  }

  // ── Row-active state ───────────────────────────────────────────────────────

  const hasRow = $derived(activeRowId != null);
  const hasSel = $derived(selectedCount > 0);

  // ── Load more dropdown ─────────────────────────────────────────────────────
  // Also the home of "Reset view", so it stays where a queried view is even
  // when every row is loaded. A buffered view holds no query to reset.

  let loadMoreOpen = $state(false);
  const showReset = $derived(!!onReset && mode !== 'buffered');
  const showPaging = $derived(
    (hasMore || loadingMore || showReset) && !(config?.hide ?? []).includes('load_more'),
  );

  // ── Quick search ───────────────────────────────────────────────────────────
  // Typing is local: the query leaves on Enter, never while typing. Every
  // emission is an ILIKE over several columns of a table that may hold a
  // million rows, and running one at each pause spends it on text the user has
  // not finished thinking. It also makes the box editable — clear it, retype,
  // correct a letter — without a set changing underneath.
  //
  // Escape and the × clear it and ask for the whole set back: one query, meant.

  let searchText = $state(searchValue);
  let emitted = searchValue;

  // Follow the value from outside (a restored view, a reset) without undoing
  // what the user is typing: only a value we did not send ourselves wins.
  $effect(() => {
    if (searchValue !== emitted) {
      emitted = searchValue;
      searchText = searchValue;
    }
  });

  function emitSearch(text: string) {
    emitted = text;
    onSearch?.(text);
  }

  function handleSearchInput(e: Event) {
    searchText = (e.target as HTMLInputElement).value;
  }

  function handleSearchKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      if (searchText !== emitted) emitSearch(searchText);
    } else if (e.key === 'Escape' && searchText) {
      e.stopPropagation();   // the stack listens for Escape: clearing is not leaving
      searchText = '';
      emitSearch('');
    }
  }

  function clearSearch() {
    searchText = '';
    if (emitted !== '') emitSearch('');
  }
</script>

{#if loadMoreOpen}
  <div class="kb-nav-overlay" role="presentation" onclick={() => (loadMoreOpen = false)}></div>
{/if}
{#if commandsOpen}
  <div class="kb-nav-overlay" role="presentation" onclick={() => (commandsOpen = false)}></div>
{/if}

<div class="kb-navigator">

  <!-- ── Left group ─────────────────────────────────────────────────────── -->
  <div class="kb-nav-left">

    <!-- CRUD group -->
    {#if isVisible('add')}
      <button class="kb-nav-btn" title={_('Add (Ins)')} onclick={onAdd}>
        <Plus size={14} />
      </button>
    {/if}

    {#if isVisible('edit')}
      <button class="kb-nav-btn" title={_('Edit (Enter)')} disabled={!hasRow} onclick={onEdit}>
        <Pencil size={14} />
      </button>
    {/if}

    {#if isVisible('delete')}
      <button class="kb-nav-btn kb-nav-btn-danger" title={_('Delete (Del)')} disabled={!hasRow} onclick={onDelete}>
        <Trash2 size={14} />
      </button>
    {/if}

    {#if isVisible('accept')}
      {@const acceptDisabled = mode === 'batch' ? false : !hasRow}
      <button class="kb-nav-btn kb-nav-btn-primary" title={_('Accept (Enter)')} disabled={acceptDisabled} onclick={onAccept}>
        <Check size={14} />
      </button>
    {/if}

    {#if isVisible('cancel')}
      <button class="kb-nav-btn" title={_('Cancel (Esc)')} onclick={onCancel}>
        <X size={14} />
      </button>
    {/if}

    <!-- Commands menu (auto — visible when the view declares any) -->
    {#if commands.length > 0}
      <div class="kb-nav-loadmore-wrap">
        <button
          class="kb-nav-btn"
          title={_('Commands')}
          onclick={() => (commandsOpen = !commandsOpen)}
        >
          <Zap size={14} />
        </button>
        {#if commandsOpen}
          <div class="kb-nav-loadmore-menu" role="menu">
            {#each commands as cmd (cmd.id)}
              <button class="kb-nav-menu-item" role="menuitem"
                disabled={cmdDisabled(cmd)}
                onclick={() => { commandsOpen = false; onCommand?.(cmd); }}>
                {cmdLabel(cmd)}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Promoted commands (toolbar: true): an icon alone, like the buttons
         beside it, named by the tooltip; the label shows only without one. -->
    {#each toolbarCmds as cmd (cmd.id)}
      {@const Icon = resolveIcon(cmd.icon)}
      <button
        class="kb-nav-btn"
        title={cmdLabel(cmd)}
        aria-label={commandLabel(cmd)}
        disabled={cmdDisabled(cmd)}
        onclick={() => onCommand?.(cmd)}
      >
        {#if Icon}
          <Icon size={14} />
        {:else}
          <Ellipsis size={14} />
          <span class="kb-nav-label">{commandLabel(cmd)}</span>
        {/if}
      </button>
    {/each}

    <!-- Separator before data tools -->
    {#if (isVisible('add') || isVisible('edit') || isVisible('delete') || commands.length > 0) && (isVisible('filter') || isVisible('search') || isVisible('export') || isVisible('refresh'))}
      <span class="kb-nav-sep" aria-hidden="true"></span>
    {/if}

    <!-- Select (multi-row checkboxes) -->
    {#if isVisible('select')}
      <button
        class="kb-nav-btn"
        class:kb-nav-btn-active={selectMode}
        title={_('Multiple selection')}
        onclick={onToggleSelect}
      >
        <SquareCheckBig size={14} />
      </button>
    {/if}

    <!-- Column filter: refines what is already loaded, no round trip. -->
    {#if isVisible('filter')}
      <button
        class="kb-nav-btn"
        class:kb-nav-btn-active={filterMode}
        title={_('Column filter')}
        onclick={onToggleFilter}
      >
        <Search size={14} />
      </button>
    {/if}

    <!-- The rule editor, and the funnel belongs to it: this is the filter that
         chooses which rows exist for the view at all, while the one beside it
         refines what is already loaded. It stays lit while a filter is in force. -->
    {#if onOpenRules && isVisible('search')}
      <button
        class="kb-nav-btn"
        class:kb-nav-btn-active={rulesActive}
        title={_('Advanced search')}
        onclick={onOpenRules}
      >
        <Funnel size={14} />
      </button>
    {/if}

    <!-- GroupBy (placeholder — Sprint 4) -->
    {#if isVisible('groupby')}
      <button class="kb-nav-btn" title={_('Group by')} disabled>
        <Group size={14} />
      </button>
    {/if}

    <!-- Export -->
    {#if isVisible('export')}
      <button class="kb-nav-btn" title={_('Export (F7)')} onclick={onExport}>
        <Download size={14} />
      </button>
    {/if}

    <!-- Print (placeholder) -->
    {#if isVisible('print')}
      <button class="kb-nav-btn" title={_('Print (F5)')} disabled>
        <Printer size={14} />
      </button>
    {/if}

    <!-- Refresh -->
    {#if isVisible('refresh')}
      <button class="kb-nav-btn" title={_('Refresh (F6)')} onclick={onRefresh}>
        <RefreshCw size={14} />
      </button>
    {/if}

    <!-- Paging menu (auto — load more when there is more, and Reset view) -->
    {#if showPaging}
      <div class="kb-nav-loadmore-wrap">
        <button
          class="kb-nav-btn kb-nav-loadmore-btn"
          class:kb-nav-btn-active={canReset}
          title={hasMore ? _('Load more') : _('View')}
          onclick={() => (loadMoreOpen = !loadMoreOpen)}
          disabled={loadingMore}
        >
          {#if loadingMore}
            <div class="kb-nav-spinner" aria-hidden="true"></div>
          {:else}
            <ChevronDown size={14} />
          {/if}
        </button>

        {#if loadMoreOpen}
          <div class="kb-nav-loadmore-menu" role="menu">
            {#if hasMore}
              {#each LOAD_MORE_OPTIONS as n (n)}
                <button class="kb-nav-menu-item" role="menuitem"
                  onclick={() => { loadMoreOpen = false; onLoadMore?.(n); }}>
                  {_t('Load {n} rows', { n })}
                </button>
              {/each}
              <div class="kb-nav-menu-sep" role="separator"></div>
              <button class="kb-nav-menu-item" role="menuitem"
                onclick={() => { loadMoreOpen = false; onLoadMore?.(0); }}>
                {_('Load all')}
              </button>
            {/if}
            {#if showReset}
              {#if hasMore}<div class="kb-nav-menu-sep" role="separator"></div>{/if}
              <button class="kb-nav-menu-item" role="menuitem"
                disabled={!canReset}
                onclick={() => { loadMoreOpen = false; onReset?.(); }}>
                {_('Reset view')}
              </button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

  </div>

  <!-- ── Quick search — elastic filler, no row of its own ───────────────── -->
  {#if searchable}
    <div class="kb-nav-search">
      <button
        class="kb-nav-search-go"
        title={_('Search (Enter)')}
        aria-label={_('Search (Enter)')}
        onclick={() => { if (searchText !== emitted) emitSearch(searchText); }}
      >
        <Search size={13} />
      </button>
      <input
        type="text"
        class="kb-nav-search-input"
        placeholder={_('Search…')}
        value={searchText}
        oninput={handleSearchInput}
        onkeydown={handleSearchKey}
        aria-label={_('Search…')}
      />
      {#if searchText}
        <button class="kb-nav-search-clear" title={_('Clear search')} onclick={clearSearch}>
          <X size={12} />
        </button>
      {/if}
    </div>
  {/if}

  <!-- ── Right group: count + spinner ──────────────────────────────────── -->
  <div class="kb-nav-right">
    {#if loading}
      <div class="kb-nav-spinner" aria-label="Loading"></div>
    {/if}
    <span class="kb-nav-count">
      {#if filteredCount !== null}{filteredCount} / {/if}{rowCount}{#if totalCount !== null} / {totalCount}{/if}
      {#if selectedCount > 0}<span class="kb-nav-sel"> · {selectedCount} sel.</span>{/if}
    </span>
  </div>

</div>

<style>
  .kb-navigator {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.2rem 0.5rem;
    border-bottom: 1px solid var(--kb-border);
    background: var(--kb-surface);
    flex-shrink: 0;
    gap: 0.25rem;
    min-height: 1.9rem;
  }

  .kb-nav-left {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    flex-wrap: nowrap;
  }

  .kb-nav-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  /* ── Quick search ────────────────────────────────────────────────────────
     Elastic filler between the buttons and the counts: it takes the width
     nobody else wants and no height at all, so a view without a search pays
     nothing for the possibility of one. */

  .kb-nav-search {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex: 1 1 auto;
    min-width: 4rem;
    max-width: 22rem;
    margin: 0 0.4rem;
    padding: 0 0.35rem;
    height: 1.45rem;
    border: 1px solid var(--kb-border-input);
    border-radius: 0.25rem;
    background: var(--kb-bg);
    color: var(--kb-text-subtle);
  }

  .kb-nav-search:focus-within {
    border-color: var(--kb-accent, #3b82f6);
  }

  .kb-nav-search-input {
    flex: 1 1 auto;
    min-width: 0;
    border: none;
    outline: none;
    background: none;
    color: var(--kb-text);
    font-size: 0.72rem;
    line-height: 1.2;
  }

  .kb-nav-search-clear,
  .kb-nav-search-go {
    display: inline-flex;
    align-items: center;
    border: none;
    background: none;
    padding: 0;
    color: var(--kb-text-subtle);
    cursor: pointer;
  }

  .kb-nav-search-clear:hover,
  .kb-nav-search-go:hover {
    color: var(--kb-text);
  }

  /* ── Buttons ─────────────────────────────────────────────────────────── */

  .kb-nav-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.2rem 0.35rem;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    background: none;
    color: var(--kb-text);
    cursor: pointer;
    transition: background 0.1s, border-color 0.1s, color 0.1s;
    line-height: 1;
  }

  .kb-nav-btn:hover:not(:disabled) {
    background: var(--kb-surface-hover);
    border-color: var(--kb-border);
  }

  .kb-nav-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .kb-nav-btn-active {
    background: color-mix(in srgb, var(--kb-accent, #3b82f6) 12%, transparent);
    border-color: color-mix(in srgb, var(--kb-accent, #3b82f6) 40%, transparent);
    color: var(--kb-accent, #3b82f6);
  }

  .kb-nav-btn-primary {
    color: var(--kb-accent, #3b82f6);
  }

  .kb-nav-btn-danger:not(:disabled) {
    color: var(--kb-danger, #ef4444);
  }

  .kb-nav-label {
    font-size: 0.7rem;
    font-weight: 500;
  }

  /* ── Separator ───────────────────────────────────────────────────────── */

  .kb-nav-sep {
    display: inline-block;
    width: 1px;
    height: 1rem;
    background: var(--kb-border);
    margin: 0 0.2rem;
    flex-shrink: 0;
    align-self: center;
  }

  /* ── Load more ───────────────────────────────────────────────────────── */

  .kb-nav-loadmore-wrap {
    position: relative;
  }

  .kb-nav-loadmore-btn {
    border-color: var(--kb-border-input);
    background: var(--kb-bg);
  }

  .kb-nav-overlay {
    position: fixed;
    inset: 0;
    z-index: 10;
  }

  .kb-nav-loadmore-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    background: var(--kb-bg);
    border: 1px solid var(--kb-border);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    min-width: 9rem;
    z-index: 11;
    overflow: hidden;
  }

  .kb-nav-menu-item {
    display: block;
    width: 100%;
    padding: 0.35rem 0.75rem;
    text-align: left;
    font-size: 0.75rem;
    color: var(--kb-text);
    background: none;
    border: none;
    cursor: pointer;
    transition: background 0.1s;
  }

  .kb-nav-menu-item:hover {
    background: var(--kb-surface-hover);
  }

  .kb-nav-menu-item:disabled {
    color: var(--kb-text-subtle);
    cursor: default;
    background: none;
  }

  .kb-nav-menu-sep {
    height: 1px;
    background: var(--kb-border);
    margin: 0.15rem 0;
  }

  /* ── Count & spinner ─────────────────────────────────────────────────── */

  .kb-nav-count {
    font-size: 0.68rem;
    color: var(--kb-text-subtle);
    white-space: nowrap;
  }

  .kb-nav-sel {
    color: var(--kb-accent, #3b82f6);
  }

  .kb-nav-spinner {
    width: 0.8rem;
    height: 0.8rem;
    border: 2px solid var(--kb-border);
    border-top-color: var(--kb-accent, #3b82f6);
    border-radius: 50%;
    animation: kb-spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  @keyframes kb-spin { to { transform: rotate(360deg); } }
</style>
