<script lang="ts">
  /**
   * DataTable.svelte — thin Svelte 5 wrapper around KitebaseTable.
   *
   * Responsibilities:
   *   - Initialises KitebaseTable via @attach (setup + teardown colocated)
   *   - Translates reactive Svelte props into KitebaseTable method calls via $effects
   *   - Re-exports shared types so consumers import from one place
   *
   * All Tabulator logic (column building, event wiring, keyboard nav,
   * ResizeObserver, _meta system) lives in KitebaseTable.ts.
   */
  import { untrack } from 'svelte';
  import 'tabulator-tables/dist/css/tabulator.min.css';
  import { KitebaseTable } from '../tabulator/KitebaseTable';
  import type { ColumnDef, SortDef, CellInfo } from '../tabulator/KitebaseTable';

  // ── Props ──────────────────────────────────────────────────────────────────

  let {
    data = [] as any[],
    columns = [] as ColumnDef[],
    selectable = false,
    mode = 'virtual' as 'virtual' | 'page',
    pageSize = 20,
    rowHeight = undefined as number | undefined,
    initialSort = [] as SortDef[],
    treeMode = false,
    treeChildField = 'children',
    treeStartExpanded = false,
    filterMode = false,
    onRowClick = undefined as ((row: any) => void) | undefined,
    onRowDblClick = undefined as ((row: any) => void) | undefined,
    onCellClick = undefined as ((cell: CellInfo) => void) | undefined,
    onSelectionChange = undefined as ((rows: any[]) => void) | undefined,
    onDataLoaded = undefined as ((count: number) => void) | undefined,
    onFiltered = undefined as ((count: number) => void) | undefined,
    onSorted = undefined as (() => void) | undefined,
    onReady = undefined as (() => void) | undefined,
    onNavAdd = undefined as (() => void) | undefined,
    onNavEdit = undefined as (() => void) | undefined,
    onNavDelete = undefined as (() => void) | undefined,
    onNavCommands = undefined as (() => void) | undefined,
    onNavRefresh = undefined as (() => void) | undefined,
    onNavExport = undefined as (() => void) | undefined,
    onNavPrint = undefined as (() => void) | undefined,
    onNavCancel = undefined as (() => void) | undefined,
  }: {
    data?: any[];
    columns?: ColumnDef[];
    selectable?: boolean;
    filterMode?: boolean;
    mode?: 'virtual' | 'page';
    pageSize?: number;
    rowHeight?: number;
    initialSort?: SortDef[];
    treeMode?: boolean;
    treeChildField?: string;
    treeStartExpanded?: boolean;
    onRowClick?: (row: any) => void;
    onRowDblClick?: (row: any) => void;
    onCellClick?: (cell: CellInfo) => void;
    onSelectionChange?: (rows: any[]) => void;
    onDataLoaded?: (count: number) => void;
    onFiltered?: (count: number) => void;
    onSorted?: () => void;
    onReady?: () => void;
    onNavAdd?: () => void;
    onNavEdit?: () => void;
    onNavDelete?: () => void;
    onNavCommands?: () => void;
    onNavRefresh?: () => void;
    onNavExport?: () => void;
    onNavPrint?: () => void;
    onNavCancel?: () => void;
  } = $props();

  // ── Internal state ─────────────────────────────────────────────────────────

  let kbTable: KitebaseTable | null = null;

  // ── Reactive prop → KitebaseTable ───────────────────────────────────────────
  // `kbTable` is a plain `let` (not $state) so it is not tracked by $effects.
  // Each effect reads only the props it cares about; the first run is a no-op
  // (kbTable is null until the @attach promise resolves).

  $effect(() => {
    // Track `data` unconditionally before the null guard so Svelte registers
    // the dependency even when kbTable is not yet initialised.
    const _data = data;
    // The rows are handed over, not watched: setData copies every field of
    // every row, and inside the effect those reads would make each of them a
    // dependency — any later touch to a row would replace the table with the
    // array it was first given, throwing away what "Load more" had appended.
    untrack(() => kbTable?.setData(_data));
  });

  $effect(() => {
    const _cols = columns; // track unconditionally before kbTable null-guard
    void selectable;       // re-run when checkbox column toggled
    void filterMode;       // re-run when filter inputs added/removed
    kbTable?.updateColumns(_cols, selectable, filterMode);
  });

  // ── Public API (exposed to callers via bind:this) ─────────────────────────

  export function download(format: 'csv' | 'json', filename = `export.${format}`, options?: any, range?: string) {
    kbTable?.download(format, filename, options, range);
  }

  export function setData(newData: any[])          { kbTable?.setData(newData); }
  export function clearSelection()                 { kbTable?.clearSelection(); }
  export function clearHeaderFilter()              { kbTable?.clearHeaderFilter(); }
  export function clearSort()                      { kbTable?.clearSort(); }
  export function getSelectedData(): any[]         { return kbTable?.getSelectedData() ?? []; }
  export function getActiveData(ticked = false): any[] { return kbTable?.getActiveData(ticked) ?? []; }
  export function getVisibleColumns(): Array<{ field: string; title: string }> { return kbTable?.getVisibleColumns() ?? []; }
  export function getHeaderFilters(): any[]        { return kbTable?.getHeaderFilters() ?? []; }
  export function setHeaderFilter(field: string, value: unknown) { kbTable?.setHeaderFilter(field, value); }
  export function getSorters(): Array<{ field: string; dir: string }> { return kbTable?.getSorters() ?? []; }
  export function setSort(sorters: Array<{ field: string; dir: string }>) { kbTable?.setSort(sorters); }
  export function selectRowsByIds(ids: unknown[])  { kbTable?.selectRowsByIds(ids); }
  export function getRowMeta(id: unknown): Record<string, unknown> { return kbTable?.getRowMeta(id) ?? {}; }
  export function setRowMeta(id: unknown, updates: Record<string, unknown>) { kbTable?.setRowMeta(id, updates); }

  export async function addRows(newRows: any[]): Promise<number> {
    return kbTable?.addRows(newRows) ?? 0;
  }

  export function focusRowById(id: unknown)                                    { kbTable?.focusRowById(id); }
  export function focus()                                                      { kbTable?.focus(); }
  export function getAdjacentRowId(id: unknown): unknown                       { return kbTable?.getAdjacentRowId(id) ?? null; }
  export async function deleteRow(id: unknown): Promise<void>                  { return kbTable?.deleteRow(id); }
  export function updateRow(id: unknown, data: Record<string, unknown>)        { kbTable?.updateRow(id, data); }
  export function hasRow(id: unknown): boolean                                 { return kbTable?.hasRow(id) ?? false; }
</script>

<div
  class="kb-datatable"
  tabindex="-1"
  {@attach (el) => {
    // untrack: initial options captured once — reactive updates handled by $effects below.
    // Avoids re-creating the table on every prop change.
    const opts = untrack(() => ({
      data, columns, selectable, filterMode, mode, pageSize, rowHeight,
      initialSort, treeMode, treeChildField, treeStartExpanded,
      onRowClick, onRowDblClick, onCellClick, onSelectionChange,
      onDataLoaded, onFiltered, onSorted, onReady,
      onNavAdd, onNavEdit, onNavDelete, onNavCommands,
      onNavRefresh, onNavExport, onNavPrint, onNavCancel,
    }));

    let active = true;
    KitebaseTable.create(el, opts).then(table => {
      if (!active) { table.destroy(); return; }
      kbTable = table;
      // Re-apply columns: inferred alignments/formatters may have arrived
      // from DataView between create() start and resolve.
      kbTable.updateColumns(opts.columns, opts.selectable, opts.filterMode);
    });

    return () => {
      active = false;
      kbTable?.destroy();
      kbTable = null;
    };
  }}
></div>

<style>
  .kb-datatable {
    width: 100%;
    height: 100%;
    overflow: hidden;
    outline: none;
  }

  /* ── Tabulator reset → Kitebase design system ───────────────────────────── */

  :global(.tabulator) {
    border: 1px solid var(--kb-border);
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-family: inherit;
    background: var(--kb-bg);
    overflow: hidden;
  }

  /* Header */

  :global(.tabulator-header) {
    background: var(--kb-surface);
    border-bottom: 1px solid var(--kb-border);
  }

  :global(.tabulator-col) {
    background: var(--kb-surface);
    border-right: 1px solid var(--kb-border);
  }

  :global(.tabulator-col:last-child) {
    border-right: none;
  }

  :global(.tabulator-col-title) {
    font-weight: 600;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--kb-text-muted);
    padding: 0.15rem 0.75rem;
  }

  :global(.tabulator-col.tabulator-sortable .tabulator-col-title:hover) {
    color: var(--kb-text);
  }

  :global(.tabulator-col-sorter) {
    color: var(--kb-text-subtle);
  }

  /* Rows */

  :global(.tabulator-row) {
    border-bottom: 1px solid var(--kb-surface-hover);
    color: var(--kb-text);
    background: var(--kb-bg);
    cursor: pointer;
    transition: background 0.1s;
  }

  :global(.tabulator-row.tabulator-row-even) {
    background: var(--kb-surface);
  }

  :global(.tabulator-row:hover),
  :global(.tabulator-row.tabulator-row-even:hover) {
    background: var(--kb-accent-subtle) !important;
  }

  /* Selected rows — no background change, checkbox is the only indicator */
  :global(.tabulator-row.tabulator-selected),
  :global(.tabulator-row.tabulator-row-even.tabulator-selected),
  :global(.tabulator-row.tabulator-selected:hover),
  :global(.tabulator-row.tabulator-row-even.tabulator-selected:hover) {
    background: inherit !important;
  }

  /* Active row — keyboard navigation highlight */
  :global(.tabulator-row.kb-row-active),
  :global(.tabulator-row.tabulator-row-even.kb-row-active) {
    background: var(--kb-accent-light) !important;
  }

  :global(.tabulator-row.kb-row-active:hover),
  :global(.tabulator-row.tabulator-row-even.kb-row-active:hover) {
    background: var(--kb-accent-muted) !important;
  }

  /* Cells */

  :global(.tabulator-cell) {
    padding: 0.5rem 0.75rem;
    border-right: none;
    color: inherit;
  }

  /* Tailwind preflight sets svg { display: block } which stacks star-formatter SVGs
     vertically. Override so Tabulator's built-in formatters render correctly. */
  :global(.tabulator-cell svg) {
    display: inline;
    vertical-align: middle;
  }

  /* Header filter row — compact height, no extra Tabulator padding */
  :global(.tabulator-header-filter) {
    padding: 0.05rem 0.4rem !important;
  }
  :global(.tabulator-header-filter input) {
    width: 100%;
    padding: 0.1rem 0.3rem;
    font-size: 0.7rem;
    border: 1px solid var(--kb-border-input);
    border-radius: 0.25rem;
    background: var(--kb-bg);
    color: var(--kb-text);
    outline: none;
  }
  :global(.tabulator-header-filter input:focus) {
    border-color: var(--kb-accent-border);
    box-shadow: 0 0 0 2px var(--kb-accent-light);
  }

  /* Internal scrollbar */

  :global(.tabulator-tableholder) {
    overflow-y: auto;
    overflow-x: auto;
  }

  /* Footer / Pagination */

  :global(.tabulator-footer) {
    background: var(--kb-surface);
    border-top: 1px solid var(--kb-border);
    padding: 0.375rem 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  :global(.tabulator-page) {
    border: 1px solid var(--kb-border-input);
    border-radius: 0.25rem;
    padding: 0.2rem 0.5rem;
    background: var(--kb-bg);
    color: var(--kb-text);
    font-size: 0.75rem;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  :global(.tabulator-page:not([disabled]):hover) {
    background: var(--kb-accent-subtle);
    border-color: var(--kb-accent-border);
    color: var(--kb-accent-hover);
  }

  :global(.tabulator-page.active) {
    background: var(--kb-accent);
    border-color: var(--kb-accent);
    color: var(--kb-bg);
  }

  :global(.tabulator-page[disabled]) {
    opacity: 0.4;
    cursor: not-allowed;
  }

  :global(.tabulator-pages) {
    display: flex;
    gap: 0.125rem;
  }

  /* Empty data placeholder */

  :global(.tabulator-placeholder) {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
    font-size: 0.875rem;
    padding: 2rem;
  }
</style>
