/// <reference path="../tabulator.d.ts" />
/**
 * KitebaseTable — Tabulator wrapper with row-level metadata (_meta).
 *
 * Encapsulates all Tabulator-specific logic: column building, option assembly,
 * event registration, keyboard navigation, ResizeObserver, and the _meta system.
 *
 * DataTable.svelte is the thin Svelte layer on top; all non-reactive logic lives here.
 *
 * _meta system
 * ─────────────
 * Every row automatically gets a `_meta: {}` field injected before Tabulator sees
 * the data (via injectMeta). The field is stored in a hidden, non-exportable column.
 * Subsystems (selection, dirty tracking, server-loaded permissions, …) write to
 * different keys inside `_meta` and never interfere with each other or with the
 * display columns.
 *
 * Usage:
 *   const ct = await KitebaseTable.create(element, config);
 *   ct.setRowMeta(rowId, { selected: true });
 *   const meta = ct.getRowMeta(rowId);   // { selected: true }
 *   ct.destroy();
 */

import type { ColumnDef, SortDef, CellInfo, KitebaseTableConfig } from './types';

export type { ColumnDef, SortDef, CellInfo, KitebaseTableConfig };

export class KitebaseTable {
  // config is a plain mutable object; event handlers close over `this.config`
  // so updating properties here (e.g. in updateColumns) is immediately visible
  // to all registered handlers without re-registering them.
  readonly config: KitebaseTableConfig;

  private table: any;
  private _container: HTMLElement;
  _tableReady = false;
  private _activeRow: any = null;
  private _activeRowId: unknown = null;
  private _observer: ResizeObserver | null = null;
  private _keyHandler: (e: KeyboardEvent) => void;
  // Selection state — prevents selection feedback loop on plain row clicks
  private _savedSel: any[] = [];
  private _restoringsel = false;

  private constructor(table: any, container: HTMLElement, config: KitebaseTableConfig) {
    this.table = table;
    this._container = container;
    this.config = config;
    this._keyHandler = this._handleKeyNav.bind(this);
    this._registerEvents();
    this._setupObserver();
    container.addEventListener('keydown', this._keyHandler);
  }

  // ── Factory ────────────────────────────────────────────────────────────────

  /**
   * Async factory: dynamically imports Tabulator, forces a layout reflow so
   * flex/height chains are computed before Tabulator reads dimensions, then
   * builds the table and returns a ready KitebaseTable instance.
   */
  static async create(element: HTMLElement, config: KitebaseTableConfig): Promise<KitebaseTable> {
    const { TabulatorFull } = await import('tabulator-tables');
    // Force synchronous reflow: ensures the browser has computed offsetHeight
    // before Tabulator reads container dimensions during initialization.
    // Without this, nested flex layouts report offsetHeight=0 in the microtask
    // after the dynamic import, causing Tabulator to set tableholder height to 0.
    void element.offsetHeight;
    const table = new TabulatorFull(element, KitebaseTable._buildOptions(config));
    const ct = new KitebaseTable(table, element, config);
    // Tabulator defers _create() via setTimeout, so headersElement is null until
    // tableBuilt fires. Wait here so callers always receive a fully ready instance.
    if (!ct._tableReady) {
      await new Promise<void>((resolve) => table.on('tableBuilt', resolve));
    }
    return ct;
  }

  // ── Column building ────────────────────────────────────────────────────────

  /**
   * Injects `_meta: {}` into every row object before handing data to Tabulator.
   * Uses spread-with-default so existing _meta (e.g. from a previous session
   * state restore) is preserved: `{ _meta: {}, ...row }` lets row._meta win.
   */
  static injectMeta(data: any[]): any[] {
    return data.map((row) => (row && typeof row === 'object' ? { _meta: {}, ...row } : row));
  }

  private static _buildCols(columns: ColumnDef[], selectable: boolean, filterMode: boolean): any[] {
    const cols: any[] = [];

    if (selectable) {
      cols.push({
        // rowSelection formatter: Tabulator handles checkbox rendering and
        // toggleSelect() internally with e.stopPropagation(), so row clicks
        // don't propagate. No custom cellClick needed (avoids double-toggle).
        formatter: 'rowSelection',
        titleFormatter: 'rowSelection',
        hozAlign: 'center',
        headerHozAlign: 'center',
        headerSort: false,
        width: 44,
        minWidth: 44,
        maxWidth: 44,
        frozen: true,
        cssClass: 'kb-col-select',
        download: false
      });
    }

    for (const c of columns) {
      const col: any = {
        field: c.field,
        title: c.title ?? c.field,
        hozAlign: c.hozAlign ?? 'left',
        headerSort: c.headerSort !== false,
        visible: c.visible !== false
      };
      if (filterMode) {
        col.headerFilter = 'input';
        col.headerFilterPlaceholder = ' ';
      }
      if (c.width !== undefined) col.width = c.width;
      if (c.minWidth !== undefined) col.minWidth = c.minWidth;
      if (c.maxWidth !== undefined) col.maxWidth = c.maxWidth;
      if (c.frozen) col.frozen = true;
      if (c.formatter) col.formatter = c.formatter;
      if (c.formatterParams) col.formatterParams = c.formatterParams;
      if (c.sorter) col.sorter = c.sorter;
      if (c.cssClass) col.cssClass = c.cssClass;
      cols.push(col);
    }

    // Hidden metadata column — always present, never displayed or exported.
    // Subsystems write to different keys inside _meta without interfering.
    cols.push({ field: '_meta', visible: false, download: false, headerSort: false });

    return cols;
  }

  private static _buildOptions(config: KitebaseTableConfig): any {
    const opts: any = {
      data: KitebaseTable.injectMeta(config.data),
      columns: KitebaseTable._buildCols(config.columns, config.selectable, config.filterMode),
      // "100%" → Tabulator owns the full root element height and computes
      // tableHolder = total - header - footer internally.
      // A numeric px value would control only tableHolder, causing overflow
      // that feeds back into ResizeObserver → blank screen loop.
      height: '100%',
      layout: 'fitDataStretch',
      headerSort: true,
      movableColumns: true,
      // Locale-aware default sorter: accented chars ('À') sort near their base
      // letter, and numeric strings ('1984') sort before alpha ('A').
      // Individual columns can override via col.sorter.
      columnDefaults: {
        sorter: (a: any, b: any) => {
          if (typeof a === 'number' && typeof b === 'number') return a - b;
          return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true });
        }
      },
      selectableRows: true,
      resizableColumnFit: false,
      placeholder: 'No data to display',
      scrollToRowPosition: 'nearest',
      scrollToRowIfVisible: false
    };

    if (config.mode === 'page') {
      opts.pagination = true;
      opts.paginationMode = 'local';
      opts.paginationSize = config.pageSize;
      opts.paginationSizeSelector = [10, 20, 50, 100];
    }

    if (config.rowHeight) opts.rowHeight = config.rowHeight;

    if (config.treeMode) {
      opts.dataTree = true;
      opts.dataTreeChildField = config.treeChildField;
      opts.dataTreeStartExpanded = config.treeStartExpanded;
    }

    if (config.initialSort.length > 0) {
      opts.initialSort = config.initialSort.map((s) => ({ column: s.field, dir: s.dir }));
    }

    return opts;
  }

  // ── Event registration ─────────────────────────────────────────────────────

  private _registerEvents() {
    const t = this.table;
    const cfg = this.config; // mutable reference — always reflects latest config

    t.on('cellClick', (_e: MouseEvent, cell: any) => {
      const field: string = cell.getField();
      if (!field) return; // rowSelection column has no field
      const rowComp = cell.getRow();
      cfg.onCellClick?.({ field, value: cell.getValue(), row: rowComp.getData() });
      this._setActiveRow(rowComp);
    });

    // Capture selection before a row click replaces it (Tabulator auto-selects on click).
    t.on('rowMouseDown', (_e: MouseEvent, _row: any) => {
      if (cfg.selectable) this._savedSel = t.getSelectedData();
    });

    t.on('rowDblClick', (_e: MouseEvent, row: any) => {
      this.config.onRowDblClick?.(row.getData());
    });

    // rowClick fires after Tabulator single-selected the row.
    // selectable=off: deselect immediately (no UI).
    // selectable=on: restore pre-click selection so only checkbox toggles affect it.
    t.on('rowClick', (e: MouseEvent, _row: any) => {
      if (!cfg.selectable) {
        t.deselectRow();
        return;
      }
      if ((e.target as HTMLElement)?.closest('.kb-col-select')) return;
      this._restoringsel = true;
      t.deselectRow();
      this._savedSel.forEach((d: any) => t.selectRow(d.id));
      this._restoringsel = false;
      // rowSelectionChanged was suppressed during restore; notify with the actual
      // (unchanged) selection so consumers (e.g. saveViewState) have the correct state.
      cfg.onSelectionChange?.(this._savedSel);
    });

    t.on('rowSelectionChanged', (selectedData: any[]) => {
      if (this._restoringsel) return;
      cfg.onSelectionChange?.(selectedData);
    });

    t.on('dataLoaded', (loadedData: any[]) => {
      this._activeRow = null;
      this._activeRowId = null;
      cfg.onDataLoaded?.(loadedData.length);
    });

    t.on('dataFiltered', (_filters: any[], rows: any[]) => {
      cfg.onFiltered?.(rows.length);
    });

    t.on('dataSorted', () => {
      cfg.onSorted?.();
    });

    // Re-apply active row CSS after virtual scroll element recycling.
    t.on('renderRow', (row: any) => {
      if (this._activeRowId === null) return;
      const el = row.getElement();
      if (row.getData()?.id === this._activeRowId) {
        el.classList.add('kb-row-active');
      } else {
        el.classList.remove('kb-row-active');
      }
    });

    // tableBuilt fires after all modules are initialized and the initial data
    // load is complete. Safe to call addData / setHeaderFilterValue after this.
    t.on('tableBuilt', () => {
      this._tableReady = true;
      cfg.onReady?.();
    });
  }

  private _setupObserver() {
    this._observer = new ResizeObserver(() => {
      if (this._tableReady) this.table?.redraw(true);
    });
    this._observer.observe(this._container);
  }

  // ── Keyboard navigation ────────────────────────────────────────────────────

  private _setActiveRow(row: any) {
    if (this._activeRow) {
      try {
        this._activeRow.getElement().classList.remove('kb-row-active');
      } catch (_) {}
    }
    this._activeRow = row;
    this._activeRowId = row.getData()?.id ?? null;
    try {
      row.getElement().classList.add('kb-row-active');
    } catch (_) {}
    this.config.onRowClick?.(row.getData());
  }

  private _handleKeyNav(e: KeyboardEvent) {
    if (!this.table) return;

    // Ignore shortcuts when focus is inside an input/textarea (e.g. header filters)
    const target = e.target as HTMLElement;
    const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    if (!inInput) {
      // Ins / + → Add
      if ((e.key === 'Insert' || e.key === '+') && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        this.config.onNavAdd?.();
        return;
      }

      // Del / - → Delete
      if ((e.key === 'Delete' || e.key === '-') && !e.ctrlKey && !e.altKey && this._activeRow) {
        e.preventDefault();
        this.config.onNavDelete?.();
        return;
      }

      // Ctrl+Enter → Edit (always, regardless of mode)
      if (e.key === 'Enter' && e.ctrlKey && this._activeRow) {
        e.preventDefault();
        this.config.onNavEdit?.();
        return;
      }

      // Enter — dblclick action (edit in browser, accept in lookup)
      if (e.key === 'Enter' && !e.ctrlKey && this._activeRow) {
        e.preventDefault();
        this.config.onRowDblClick?.(this._activeRow.getData());
        return;
      }

      // Space — toggle checkbox if selection mode, else open commands menu
      if (e.key === ' ') {
        e.preventDefault();
        if (this.config.selectable && this._activeRow) {
          this._activeRow.toggleSelect();
        } else {
          this.config.onNavCommands?.();
        }
        return;
      }

      // F5 → Print
      if (e.key === 'F5') {
        e.preventDefault();
        this.config.onNavPrint?.();
        return;
      }

      // F6 → Refresh
      if (e.key === 'F6') {
        e.preventDefault();
        this.config.onNavRefresh?.();
        return;
      }

      // F7 → Export
      if (e.key === 'F7') {
        e.preventDefault();
        this.config.onNavExport?.();
        return;
      }

      // Escape → Cancel / close
      if (e.key === 'Escape') {
        e.preventDefault();
        this.config.onNavCancel?.();
        return;
      }
    }

    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();

    const displayRows: any[] = this.table.getRows('active') ?? [];
    if (displayRows.length === 0) return;

    if (!this._activeRow) {
      this._setActiveRow(displayRows[0]);
      try {
        displayRows[0].scrollTo('top', false);
      } catch (_) {}
      return;
    }

    const currentIdx = displayRows.indexOf(this._activeRow);
    const fromIdx = currentIdx === -1 ? 0 : currentIdx;
    const nextIdx = e.key === 'ArrowDown' ? fromIdx + 1 : fromIdx - 1;
    if (nextIdx >= 0 && nextIdx < displayRows.length) {
      this._setActiveRow(displayRows[nextIdx]);
      const pos = e.key === 'ArrowDown' ? 'bottom' : 'top';
      try {
        displayRows[nextIdx].scrollTo(pos, false);
      } catch (_) {}
    }
  }

  // ── Public API — focus ────────────────────────────────────────────────────

  /** Give the grid the keyboard: ArrowDown then starts from the first row. */
  focus() {
    this._container.focus();
  }

  /**
   * Focus the row with the given id: set it as active, scroll into view,
   * focus the container (keyboard nav), emit row_click to update detail panels.
   */
  focusRowById(id: unknown) {
    if (!this.table) return;
    const rows: any[] = this.table.getRows() ?? [];
    const row = rows.find((r: any) => r.getData()?.id === id);
    if (!row) return;
    if (this._activeRow) {
      try { this._activeRow.getElement().classList.remove('kb-row-active'); } catch (_) {}
    }
    this._activeRow = row;
    this._activeRowId = id;
    try { row.getElement().classList.add('kb-row-active'); } catch (_) {}
    try { row.scrollTo('nearest', false); } catch (_) {}
    this._container.focus();
    this.config.onRowClick?.(row.getData());
  }

  /** Return the id of the next visible row (prev as fallback) for use before deletion. */
  getAdjacentRowId(id: unknown): unknown {
    const rows: any[] = this.table?.getRows('active') ?? [];
    const idx = rows.findIndex((r: any) => r.getData()?.id === id);
    if (idx === -1) return null;
    if (idx + 1 < rows.length) return rows[idx + 1].getData()?.id ?? null;
    if (idx - 1 >= 0) return rows[idx - 1].getData()?.id ?? null;
    return null;
  }

  /** Remove a row by id and fire onDataLoaded with the new count. */
  async deleteRow(id: unknown): Promise<void> {
    const rows: any[] = this.table?.getRows() ?? [];
    const row = rows.find((r: any) => r.getData()?.id === id);
    if (!row) return;
    if (this._activeRowId === id) {
      this._activeRow = null;
      this._activeRowId = null;
    }
    await row.delete();
    const count: number = this.table.getDataCount();
    this.config.onDataLoaded?.(count);
  }

  /** Whether a row with this id is loaded — the state array may lag behind. */
  hasRow(id: unknown): boolean {
    return (this.table?.getRows() ?? []).some((r: any) => r.getData()?.id === id);
  }

  /** Update a single row's fields in place, preserving _meta. */
  updateRow(id: unknown, data: Record<string, unknown>) {
    const rows: any[] = this.table?.getRows() ?? [];
    const row = rows.find((r: any) => r.getData()?.id === id);
    if (!row) return;
    const meta = row.getData()?._meta ?? {};
    row.update({ _meta: meta, ...data });
  }

  // ── Public API — column / data ─────────────────────────────────────────────

  /** Update column definitions and rebuild Tabulator columns. */
  updateColumns(columns: ColumnDef[], selectable: boolean, filterMode: boolean) {
    this.config.columns = columns;
    this.config.selectable = selectable;
    this.config.filterMode = filterMode;
    this.table?.setColumns(KitebaseTable._buildCols(columns, selectable, filterMode));
  }

  /** Replace all data (injects _meta into new rows). */
  setData(data: any[]) {
    this.table?.replaceData(KitebaseTable.injectMeta(data));
  }

  /** Append rows and return the new total count; fires onDataLoaded. */
  async addRows(newRows: any[]): Promise<number> {
    if (!this.table) return 0;
    await this.table.addData(KitebaseTable.injectMeta(newRows));
    const total: number = this.table.getDataCount();
    this.config.onDataLoaded?.(total);
    return total;
  }

  // ── Public API — selection / filters / sort ────────────────────────────────

  clearSelection() {
    this.table?.deselectRow();
  }
  clearHeaderFilter() {
    this.table?.clearHeaderFilter();
  }
  clearSort() {
    this.table?.clearSort();
  }
  getSelectedData(): any[] {
    return this.table?.getSelectedData() ?? [];
  }
  /**
   * The rows as the grid shows them: past the column filters, in the order on
   * screen. With `ticked`, only the ticked ones, still in that order (the
   * selection itself is kept in the order rows were ticked).
   */
  getActiveData(ticked = false): any[] {
    const rows: any[] = this.table?.getRows('active') ?? [];
    return (ticked ? rows.filter((r: any) => r.isSelected()) : rows).map((r: any) => r.getData());
  }
  /** The visible data columns, in the order on screen, with the title shown. */
  getVisibleColumns(): Array<{ field: string; title: string }> {
    const columns: any[] = this.table?.getColumns() ?? [];
    return columns
      .filter((c: any) => c.isVisible() && c.getField())
      .map((c: any) => ({ field: c.getField(), title: String(c.getDefinition().title ?? c.getField()) }));
  }
  redraw(force = false) {
    if (this._tableReady) this.table?.redraw(force);
  }

  download(format: 'csv' | 'json', filename: string, options?: any, range?: string) {
    if (range) this.table?.download(format, filename, options ?? {}, range);
    else this.table?.download(format, filename);
  }

  getHeaderFilters(): any[] {
    return this.table?.getHeaderFilters() ?? [];
  }

  setHeaderFilter(field: string, value: unknown) {
    this.table?.setHeaderFilterValue(field, value);
  }

  getSorters(): Array<{ field: string; dir: string }> {
    return (this.table?.getSorters() ?? []).map((s: any) => ({ field: s.field, dir: s.dir }));
  }

  setSort(sorters: Array<{ field: string; dir: string }>) {
    if (!this.table || !sorters.length) return;
    this.table.setSort(sorters.map((s) => ({ column: s.field, dir: s.dir })));
  }

  /** Select rows matching the given id values; silently skips missing IDs. */
  selectRowsByIds(ids: unknown[]) {
    if (!this.table || !ids.length) return;
    const rows = this.table.getRows().filter((r: any) => ids.includes(r.getData()?.id));
    if (rows.length) this.table.selectRow(rows);
  }

  // ── Row meta ──────────────────────────────────────────────────────────────

  /**
   * Return the _meta object for the row with the given id.
   * Returns {} if the row is not found or has no meta.
   */
  getRowMeta(id: unknown): Record<string, unknown> {
    const row = this.table?.getRows().find((r: any) => r.getData()?.id === id);
    return row?.getData()?._meta ?? {};
  }

  /**
   * Merge `updates` into the _meta of the row with the given id.
   * Other _meta keys are preserved; other row fields are untouched.
   */
  setRowMeta(id: unknown, updates: Record<string, unknown>) {
    const row = this.table?.getRows().find((r: any) => r.getData()?.id === id);
    if (!row) return;
    const current = row.getData()?._meta ?? {};
    row.update({ _meta: { ...current, ...updates } });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  destroy() {
    this._observer?.disconnect();
    this._container.removeEventListener('keydown', this._keyHandler);
    this.table?.destroy();
    this.table = null;
  }
}
