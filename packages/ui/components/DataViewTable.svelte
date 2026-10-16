<script lang="ts">
  /**
   * DataViewTable.svelte — Tabulator-based renderer for DataView.
   *
   * Handles both 'table' and 'tree' view types (both are Tabulator-backed).
   * Exposes the same imperative API as DataTable via export functions so
   * DataView can drive state restore, sort, filters and selections.
   *
   * Extension point: when kanban/cards renderers are added, DataView will
   * mount them alongside this component (class:hidden pattern) and switch
   * activeViewType. A redraw(true) call will be needed here on un-hide.
   */
  import DataTable from './DataTable.svelte';
  import type { ColumnDef } from '$kitebase/tabulator/KitebaseTable';

  let {
    rows = [] as unknown[],
    columnDefs = [] as ColumnDef[],
    selectable = false,
    filterMode = false,
    isTreeMode = false,
    treeChildField = 'children',
    treeStartExpanded = false,
    onRowClick = undefined as ((row: unknown) => void) | undefined,
    onRowDblClick = undefined as ((row: unknown) => void) | undefined,
    onSelectionChange = undefined as ((rows: unknown[]) => void) | undefined,
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
    rows?: unknown[];
    columnDefs?: ColumnDef[];
    selectable?: boolean;
    filterMode?: boolean;
    isTreeMode?: boolean;
    treeChildField?: string;
    treeStartExpanded?: boolean;
    onRowClick?: (row: unknown) => void;
    onRowDblClick?: (row: unknown) => void;
    onSelectionChange?: (rows: unknown[]) => void;
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

  let tableRef: DataTable | null = $state(null);

  // ── Public API (forwarded from DataTable via bind:this) ───────────────────

  export function getHeaderFilters(): any[]                                    { return tableRef?.getHeaderFilters() ?? []; }
  export function getSorters(): Array<{ field: string; dir: string }>          { return tableRef?.getSorters() ?? []; }
  export function getSelectedData(): any[]                                     { return tableRef?.getSelectedData() ?? []; }
  export function getActiveData(ticked = false): any[]                         { return tableRef?.getActiveData(ticked) ?? []; }
  export function getVisibleColumns(): Array<{ field: string; title: string }> { return tableRef?.getVisibleColumns() ?? []; }
  export function clearHeaderFilter()                                          { tableRef?.clearHeaderFilter(); }
  export function setHeaderFilter(field: string, value: unknown)               { tableRef?.setHeaderFilter(field, value); }
  export function setSort(sorters: Array<{ field: string; dir: string }>)      { tableRef?.setSort(sorters); }
  export function clearSort()                                                  { tableRef?.clearSort(); }
  export function selectRowsByIds(ids: unknown[])                              { tableRef?.selectRowsByIds(ids); }
  export function clearSelection()                                             { tableRef?.clearSelection(); }
  export function download(format: 'csv' | 'json', filename: string)          { tableRef?.download(format, filename); }
  export async function addRows(newRows: any[]): Promise<number>               { return tableRef?.addRows(newRows) ?? 0; }
  export function focusRowById(id: unknown)                                    { tableRef?.focusRowById(id); }
  export function focus()                                                      { tableRef?.focus(); }
  export function getAdjacentRowId(id: unknown): unknown                       { return tableRef?.getAdjacentRowId(id) ?? null; }
  export async function deleteRow(id: unknown): Promise<void>                  { return tableRef?.deleteRow(id); }
  export function updateRow(id: unknown, data: Record<string, unknown>)        { tableRef?.updateRow(id, data); }
  export function hasRow(id: unknown): boolean                                 { return tableRef?.hasRow(id) ?? false; }
</script>

<DataTable
  bind:this={tableRef}
  data={rows as any[]}
  columns={columnDefs}
  {selectable}
  {filterMode}
  treeMode={isTreeMode}
  {treeChildField}
  {treeStartExpanded}
  {onRowClick}
  {onRowDblClick}
  {onSelectionChange}
  {onDataLoaded}
  {onFiltered}
  {onSorted}
  {onReady}
  {onNavAdd}
  {onNavEdit}
  {onNavDelete}
  {onNavCommands}
  {onNavRefresh}
  {onNavExport}
  {onNavPrint}
  {onNavCancel}
/>
