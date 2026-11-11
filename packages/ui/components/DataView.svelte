<script lang="ts">
  /**
   * DataView.svelte — descriptor-driven data view (table / tree / cards).
   *
   * Orchestrates data loading, state persistence, column mapping and
   * event routing. Rendering is delegated to DataViewTable (table/tree)
   * and toolbar to DataViewNavigator.
   *
   * The cards renderer is mounted beside DataViewTable, which stays mounted
   * and hidden: Tabulator keeps owning the loaded rows (counts, selection,
   * load more, restore), and the cards show its active rows.
   *
   * Props:
   *   view     ViewDescriptor            resolved view descriptor
   *   trigger  Record<string,unknown>    trigger payload from PanelRenderer
   *   data     any[]                     static data (source: prop)
   *   onEvent  (name, data) => void      unified event emitter (row_click, data_load, …)
   */
  import { untrack, getContext } from 'svelte';
  import { _, _t } from '../i18n';
  import { visibleButtons } from './navigator.visibility';
  import DataViewNavigator from './DataViewNavigator.svelte';
  import DataViewTable from './DataViewTable.svelte';
  import DataViewCards from './DataViewCards.svelte';
  import { rowTones } from './tone';
  import { prepareImage, sizeText } from './widgets/media';
  import DataFormView from './DataFormView.svelte';
  import { callJudged, presentOutcome } from './flow';
  import type { ColumnDef } from '$kitebase/tabulator/KitebaseTable';
  import { api } from '$kitebase/api/client';
  import { errorText } from '$kitebase/api/envelope';
  import { serverConfig, resolveFormatter as resolveFormatterByType, resolveAlign } from '$kitebase/api/serverConfig.svelte';
  import type { SchemaFieldInfo } from '$kitebase/api/serverConfig.svelte';
  import { resolveFormatter } from '$kitebase/formatters/registry';
  import { msgbox } from './msgbox.svelte';
  import { applyResult } from './resultAction';
  import { stack as globalStack } from '$kitebase/stack/stack.svelte';
  import type { StackInstance } from '$kitebase/stack/stack.svelte';
  import {
    extractFieldKey,
    applyTriggerVars,
    hasTriggerVars,
    buildQuery,
  } from './dataview.query';
  import type { QueryExtras, OrderSpec } from './dataview.query';
  import { declaredRules, type RuleRow } from './dataview.rules';
  import { takeRestorable, remember } from './dataview.session';
  import RuleEditorView from './RuleEditorView.svelte';

  // ── Types (re-exported for consumers) ─────────────────────────────────────
  export type {
    ViewSource,
    ViewColumn,
    ViewActions,
    ViewPolicy,
    ViewTreeConfig,
    ViewDescriptor,
    NavigatorConfig,
    CommandItem,
  } from './dataview.types';

  import type { ViewDescriptor, NavigatorConfig, CommandItem, CardConfig } from './dataview.types';
  import { commandLabel } from './dataview.types';

  // ── Constants ──────────────────────────────────────────────────────────────

  // Last-resort fallback if serverConfig hasn't loaded yet or config.yaml has no dataview section.
  const DEFAULT_PAGE_SIZE = 100;

  // ── View state persistence ─────────────────────────────────────────────────

  interface SavedViewState {
    filterMode: boolean;
    filters: Array<{ field: string; type: string; value: unknown }>;
    sorters: Array<{ field: string; dir: string }>;
    rowCount: number;
    selectMode: boolean;
    selectedIds: unknown[];
    // The chosen set: restored before the first fetch, so a reload asks the
    // server the same question rather than showing a wider list for a moment.
    search?: string;
    rules?: RuleRow[];
    /** The order asked of the server, when the user chose one over the view's. */
    order?: OrderSpec[];
    /** Keys a command asked the view to carry on every query (opaque). */
    params?: Record<string, unknown>;
    /** The renderer the user switched to, among `allow_views`. */
    viewType?: string;
  }

  // ── Props ──────────────────────────────────────────────────────────────────

  let {
    view,
    trigger = undefined as Record<string, unknown> | undefined,
    collapsed = false,
    data: propData = undefined as unknown[] | undefined,
    focusRowId = undefined as unknown,
    initialRules = undefined as RuleRow[] | undefined,
    autofocus = false,
    movableRows = false,
    onEvent = undefined as ((name: string, data: unknown) => void) | undefined,
  }: {
    view: ViewDescriptor;
    trigger?: Record<string, unknown>;
    collapsed?: boolean;
    data?: unknown[];
    focusRowId?: unknown;
    /** Rules the view opens with, which the user can change or reset. */
    initialRules?: RuleRow[];
    /** Take the keyboard when the data arrives, on `focusRowId` if loaded. */
    autofocus?: boolean;
    /**
     * Rows the reader orders by hand (a collection with a sequence): moved by
     * the handle or Alt+Up / Alt+Down, they are announced as `rows_moved` with
     * the new order of the keys, or `row_move` with a key and a step, and the
     * owner of the rows moves them.
     */
    movableRows?: boolean;
    onEvent?: (name: string, data: unknown) => void;
  } = $props();

  /** A row moved from the keyboard: the owner moves it, the cursor stays on it. */
  function handleRowMoveKey(id: unknown, delta: -1 | 1) {
    onEvent?.('row_move', { id, delta });
    // The rows come back in their new order: then the cursor goes where the row went
    setTimeout(() => tableRef?.focusRowById(id), 0);
  }

  // ── View state persistence (key + initial load) ────────────────────────────
  // A view opens from its descriptor. The one exception is the view the user
  // was on when the page reloaded, which comes back as it was — once, in this
  // window only (dataview.session.ts).

  // The page is part of the key: two pages on the same table (the home on the
  // records still to send, the full list) are two views, and one must not
  // come back with the other's rules after a reload.
  const pageId = getContext<string | undefined>('kb:page');

  function getStateKey(): string {
    const source = String(view.source?.model ?? (view.source as any)?.endpoint ?? 'custom');
    return pageId ? `${pageId}:${source}` : source;
  }

  const savedState = takeRestorable<SavedViewState>(getStateKey());

  // ── Internal state ─────────────────────────────────────────────────────────

  let tableRef: DataViewTable | null = $state(null);
  let rows: unknown[] = $state([]);
  let rowCount = $state(0);
  let inferredAligns    = $state<Record<string, 'left' | 'right' | 'center'>>({});
  let inferredFormatters = $state<Record<string, string>>({});
  let alignsInferred    = $state(false);
  let totalCount = $state<number | null>(null);
  let loading = $state(false);
  let loadingMore = $state(false);
  let error = $state<string | null>(null);
  let initialized = $state(false);
  let waitingForTrigger = $state(false);
  let filterMode = $state(savedState?.filterMode ?? false);
  let selectMode = $state(savedState?.selectMode ?? false);
  // ── The chosen set ─────────────────────────────────────────────────────────
  // What the user adds to the view's own conditions. Both decide *which* rows,
  // so changing either restarts the fetch from offset 0, recomputes the counts
  // and drops the selection: a tick means "this row among the ones I am looking
  // at", and that meaning does not survive a different set.
  let quickSearch = $state(savedState?.search ?? '');
  let ruleRows = $state<RuleRow[]>(
    savedState?.rules ?? untrack(() => initialRules ?? declaredRules(view)) ?? []);
  // Empty means "the order the view opens with": an absolute absence of order
  // is not a state worth expressing, since the server ends every paginated
  // query with the key anyway.
  let userOrder = $state<OrderSpec[]>(savedState?.order ?? []);
  // What a command answered with `set_query_params`: carried on every query,
  // never read here. Part of the chosen set, so it restarts the fetch like a
  // rule does, and goes fresh on open like everything else.
  let queryParams = $state<Record<string, unknown>>(savedState?.params ?? {});
  // A header click sorts what is loaded, locally; Tabulator keeps it, so it is
  // followed here only to know whether there is something to reset.
  let gridSorted = $state(false);
  let filteredCount = $state<number | null>(null);
  let selectedCount = $state(0);
  let tabulatorReady = $state(false);
  let restoreComplete = $state(false);
  let bannerRowCount = $state<number | null>(null);
  let _activeRowData = $state<Record<string, unknown> | null>(null);
  let _internalFocusId = $state<unknown>(null);

  // Active view type — initialized from descriptor, switchable in future.
  // untrack: intentionally captures only the initial value (user can switch at runtime).
  let activeViewType = $state(untrack(() =>
    savedState?.viewType && view.allow_views?.includes(savedState.viewType)
      ? savedState.viewType : view.type ?? 'table'));

  // ── Derived ────────────────────────────────────────────────────────────────

  const hasMore = $derived(
    view.type !== 'tree' && totalCount !== null && rowCount < totalCount,
  );

  // PK field name — derived from serverConfig.tables using the view's source model.
  // Falls back to 'id' if the table schema is not loaded yet or has no declared PK.
  const pkField = $derived(
    serverConfig.tables[view.source?.model ?? '']?.pk_fields?.[0] ?? 'id'
  );
  const queryExtras = $derived<QueryExtras>({
    rules: ruleRows,
    search: quickSearch,
    order: userOrder.length > 0 ? userOrder : undefined,
    params: Object.keys(queryParams).length > 0 ? queryParams : undefined,
  });

  // The descriptor's own order, in the shape the editor's order row shows: it
  // opens filled with what is actually in force, never with a dash under a list
  // that is visibly sorted.
  const descriptorOrder = $derived.by<OrderSpec[]>(() =>
    (view.source?.order_by ?? []).map(f =>
      typeof f === 'string' && f.startsWith('-')
        ? { field: f.slice(1), dir: 'desc' as const }
        : { field: String(f), dir: 'asc' as const },
    ),
  );

  // The box appears only where it can answer: the search is expanded from what
  // the table declares searchable, and a table that declares nothing refuses it
  // rather than returning everything. Rows loaded from a prop or an endpoint
  // have no table behind them at all.
  const quickSearchAvailable = $derived.by(() => {
    if (propData !== undefined || !view.source?.model) return false;
    if ((view.navigator as NavigatorConfig | undefined)?.hide?.includes('quick_search')) return false;
    const table = serverConfig.tables[view.source.model as string];
    return !!table && ((table.search_fields?.length ?? 0) > 0 || !!table.search_pk);
  });
  const allowViews = $derived(view.allow_views ?? []);
  const selectable = $derived(selectMode || view.policy?.selection === true);
  const isTreeMode = $derived(activeViewType === 'tree');
  const treeChildField = $derived(view.tree?.child_field ?? 'children');
  const treeStartExpanded = $derived(view.tree?.start_expanded ?? false);

  // ── Stack ──────────────────────────────────────────────────────────────────

  // Stack is provided by the parent Panel via context.
  // Falls back to the global singleton only when DataView is used outside a Panel.
  const stack: StackInstance = getContext<StackInstance>('kb:stack') ?? globalStack;

  // navigator: true (default) | false | NavigatorConfig object
  const showNavigator = $derived(view.navigator !== false);
  const navigatorConfig = $derived(
    typeof view.navigator === 'object' && view.navigator !== null
      ? view.navigator as NavigatorConfig
      : undefined
  );
  const navigatorMode = $derived(navigatorConfig?.mode ?? 'browser');

  // Derive form_id: explicit in config, or auto from model name
  const formId = $derived(
    navigatorConfig?.form_id ??
    (view.source?.model ? `${(view.source.model as string).toLowerCase()}_form` : null)
  );

  // The effective focus id: internal (post-edit) wins over external prop
  const _effectiveFocusId = $derived(_internalFocusId ?? focusRowId);

  // ── State persistence ──────────────────────────────────────────────────────

  // ── Cards ──────────────────────────────────────────────────────────────────

  const isCards = $derived(activeViewType === 'cards');
  // The toned columns, by key: a cell's tone in the grid, a ribbon's on a card,
  // and a muted row from any of them.
  const columnTones = $derived(Object.fromEntries((view.columns ?? [])
    .filter((c) => c.tone).map((c) => [extractFieldKey(c.field), c.tone!])));
  const tonesOfRow = $derived(Object.keys(columnTones).length > 0
    ? (row: Record<string, unknown>) => rowTones(columnTones, row) : undefined);
  // The rows the cards show: the table's active ones, filtered and sorted as
  // the table has them, read again whenever they change there.
  let cardRows = $state<unknown[]>([]);
  function syncCards() {
    if (isCards && tableRef) cardRows = tableRef.getActiveData();
  }

  const card = $derived(view.card ?? defaultCard());

  /**
   * The card of a view that declares none, from its columns: the table's
   * display field as the title (else the first column that is not the key),
   * the first image column as the image, three more visible columns as details.
   */
  function defaultCard(): CardConfig {
    const model = view.source?.model;
    const table = model ? serverConfig.tables[model] : undefined;
    const media = new Map((table?.columns ?? []).map((c) => [c.name, c.media]));
    const cols = (view.columns ?? []).map((c) => ({
      key: extractFieldKey(c.field),
      own: c.field.includes('.') ? null : c.field.replace(/\s+as\s+.*$/i, '').trim(),
      visible: c.visible !== false,
    }));
    const image = cols.find((c) => c.own && media.get(c.own) === 'image')?.key;
    const text = cols.filter((c) => c.visible && c.key !== pkField && (!c.own || !media.get(c.own)));
    const title = (text.find((c) => c.own === table?.display_field) ?? text[0])?.key;
    return {
      image,
      title,
      details: text.filter((c) => c.key !== title).slice(0, 3).map((c) => c.key),
    };
  }
  const cardTitles = $derived(Object.fromEntries((view.columns ?? []).map((c) =>
    [extractFieldKey(c.field), c.title ?? extractFieldKey(c.field)])));

  // The stored image column behind the card's image, when it is one of this
  // table's own: a file dropped on the card replaces it.
  const cardImage = $derived.by(() => {
    const model = view.source?.model;
    const col = (view.columns ?? []).find((c) => card.image && extractFieldKey(c.field) === card.image);
    if (!model || !col || navigatorMode !== 'browser') return null;
    const field = col.field.replace(/\s+as\s+.*$/i, '').trim();
    if (field.includes('.')) return null;
    const info = serverConfig.tables[model]?.columns.find((c) => c.name === field);
    return info?.media === 'image' ? { model, field, info } : null;
  });

  async function handleCardImageDrop(row: Record<string, unknown>, file: File) {
    const target = cardImage;
    const id = row[pkField];
    if (!target || id === null || id === undefined) return;
    const ready = await prepareImage(file, target.info);
    if (!ready) return;
    const max = target.info.max_size;
    if (max && ready.size > max) {
      await msgbox.error(_t('{name} is {size}: this field takes up to {max}',
                            { name: file.name, size: sizeText(ready.size), max: sizeText(max) }));
      return;
    }
    const up = await api.upload(target.model, target.field, id as string | number, ready, file.name);
    if (up.status !== 'success' || !up.data) {
      await msgbox.error(errorText(up, _('Upload failed')));
      return;
    }
    const res = await api.endpoint('db', { table: target.model, method: 'update', id,
                                           data: { [target.field]: up.data.ref } });
    if (res.status !== 'success') {
      await msgbox.error(errorText(res, _('Error saving')));
      return;
    }
    await refreshRows([id]);
  }

  function switchView(type: string) {
    if (type === activeViewType) return;
    activeViewType = type;
    if (type === 'cards') syncCards();
    // Tabulator measured nothing while it was hidden.
    else setTimeout(() => tableRef?.redraw(), 0);
    saveViewState();
  }

  function saveViewState() {
    if (!tabulatorReady || !tableRef) return;
    const state: SavedViewState = {
      filterMode,
      filters: tableRef.getHeaderFilters(),
      sorters: tableRef.getSorters(),
      rowCount,
      selectMode,
      selectedIds: tableRef.getSelectedData().map((r: any) => r[pkField]).filter((id: any) => id != null),
      search: quickSearch,
      rules: ruleRows,
      order: userOrder,
      params: queryParams,
      viewType: activeViewType,
    };
    remember(getStateKey(), state);
  }

  // Restore effect — runs once as soon as tabulatorReady.
  $effect(() => {
    if (!tabulatorReady || restoreComplete) return;
    restoreComplete = true;
    if (!savedState) return;

    for (const f of savedState.filters ?? []) {
      tableRef?.setHeaderFilter(f.field, f.value);
    }
    if (savedState.sorters?.length) {
      tableRef?.setSort(savedState.sorters);
    }
    if (savedState.selectedIds?.length) {
      tableRef?.selectRowsByIds(savedState.selectedIds);
    }

    const threshold = serverConfig.config?.reload_all_threshold as number | undefined;
    const savedCount = savedState.rowCount ?? 0;
    if (savedCount > rowCount) {
      if (threshold === undefined || savedCount <= threshold) {
        loadMore(savedCount - rowCount);
      } else {
        bannerRowCount = savedCount;
      }
    }
  });

  // ── Auto-infer column props from first data row ────────────────────────────

  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;
  function _inferColumnTypes(data: unknown[]) {
    if (alignsInferred || data.length === 0) return;
    const first = data[0] as Record<string, unknown>;
    const aligns: Record<string, 'left' | 'right'> = {};
    const formatters: Record<string, string> = {};
    for (const [k, v] of Object.entries(first)) {
      if (k === '_meta') continue;
      if (typeof v === 'number') {
        aligns[k] = 'right';
      } else if (typeof v === 'string' && ISO_DATE_RE.test(v)) {
        const hasTime = v.includes('T') || /\d{2}:\d{2}/.test(v.slice(10));
        formatters[k] = hasTime ? 'datetime' : 'date';
      }
    }
    inferredAligns    = aligns;
    inferredFormatters = formatters;
    alignsInferred    = true;
  }

  function _applySchemaHints(schema: Record<string, SchemaFieldInfo>) {
    const aligns: Record<string, 'left' | 'right' | 'center'> = {};
    const fmts: Record<string, string> = {};
    for (const [field, info] of Object.entries(schema)) {
      const typeName = info.type as string | undefined;
      if (typeName) {
        const a = resolveAlign(typeName, serverConfig.types);
        if (a) aligns[field] = a;
        const f = resolveFormatterByType(typeName, serverConfig.types);
        if (f) fmts[field] = f;
      }
      if (info.align) aligns[field] = info.align as 'left' | 'right' | 'center';
      if (info.formatter) fmts[field] = info.formatter as string;
    }
    inferredAligns     = aligns;
    inferredFormatters = fmts;
    alignsInferred     = true;
  }

  // Apply data_schema declared in the view descriptor when schema registry is ready.
  $effect(() => {
    const ds = view.data_schema as string | undefined;
    if (!ds) return;
    const schema = serverConfig.schemas[ds];
    if (schema) _applySchemaHints(schema);
  });

  // ── Hints from the declared types ──────────────────────────────────────────
  // What a column IS comes from the schema, not from the values: guessing from
  // the first row leaves a column raw whenever that row has it empty (a date
  // nobody filled yet), and then every row below is raw too. A view column is
  // a column of the main table, or `Table.col as alias` through a join; either
  // way it names a real column with a declared type. Only the date formats and
  // the codes of a set are taken from the type: the other type formatters
  // (`fk_label`, `integer`) are not all registered, and a number reads fine
  // unformatted.

  const TYPE_FORMATS = new Set(['date', 'datetime', 'codes']);

  // The variants the view columns name (`variant: thumb`), sent with every
  // query: the server signs the URL of that rendition, never the original.
  const mediaVariants = $derived.by(() => {
    const variants: Record<string, string> = {};
    for (const c of view.columns ?? []) {
      if (typeof c.variant === 'string' && c.variant) variants[extractFieldKey(c.field)] = c.variant;
    }
    return Object.keys(variants).length > 0 ? { variants } : {};
  });

  const schemaHints = $derived.by(() => {
    const aligns: Record<string, 'left' | 'right' | 'center'> = {};
    const formatters: Record<string, string> = {};
    const model = view.source?.model;
    for (const c of view.columns ?? []) {
      const expr = c.field.replace(/\s+as\s+.*$/i, '').trim();
      const dot = expr.lastIndexOf('.');
      const table = dot === -1 ? model : expr.slice(0, dot);
      const name = dot === -1 ? expr : expr.slice(dot + 1);
      const column = table
        ? serverConfig.tables[table]?.columns.find((col) => col.name === name)
        : undefined;
      const key = extractFieldKey(c.field);
      // A media column shows its file whatever its type is called.
      if (column?.media === 'image' || column?.media === 'file') {
        formatters[key] = column.media === 'image' ? 'media_image' : 'media_file';
      }
      // A RefSet's badges need its vocabulary, which only the column knows
      if (column?.type === 'RefSet' && column.ref_set) {
        const { target, field } = column.ref_set;
        formatters[key] = `refset,${target},${field},${serverConfig.tables[target]?.display_field ?? field}`;
        continue;
      }
      const type = column?.type;
      if (!type) continue;
      const align = resolveAlign(type, serverConfig.types);
      if (align) aligns[key] = align;
      const fmt = resolveFormatterByType(type, serverConfig.types);
      if (fmt && TYPE_FORMATS.has(fmt)) {
        formatters[key] = fmt === 'datetime' && column?.granularity === 'second' ? 'datetime,second' : fmt;
      }
    }
    return { aligns, formatters };
  });

  // ── Column mapping ─────────────────────────────────────────────────────────

  const columnDefs = $derived.by((): ColumnDef[] => {
    if (!view.columns || view.columns.length === 0) return [];
    return view.columns.map(c => {
      const fieldKey = extractFieldKey(c.field);
      const def: ColumnDef = {
        field: fieldKey,
        title: c.title ?? fieldKey,
      };
      if (c.width !== undefined)    def.width = c.width as number | string;
      if (c.min_width !== undefined) def.minWidth = c.min_width;
      if (c.max_width !== undefined) def.maxWidth = c.max_width;
      const align = c.align
        ?? schemaHints.aligns[fieldKey]
        ?? inferredAligns[fieldKey];
      if (align) def.hozAlign = align;
      const rawFmt = c.formatter ?? schemaHints.formatters[fieldKey] ?? inferredFormatters[fieldKey];
      if (rawFmt) {
        const resolved = resolveFormatter(rawFmt, c.formatter_params);
        def.formatter = resolved.formatter;
        if (resolved.formatterParams) def.formatterParams = resolved.formatterParams;
      } else if (c.formatter_params) {
        def.formatterParams = c.formatter_params;
      }
      if (c.visible === false) def.visible = false;
      if (c.frozen)            def.frozen = true;
      return def;
    });
  });

  // ── Flat → nested tree conversion ─────────────────────────────────────────

  function buildTree(flat: unknown[], parentField: string, childField = 'children'): unknown[] {
    const map = new Map<unknown, Record<string, unknown>>();
    const roots: Record<string, unknown>[] = [];
    for (const item of flat) {
      const row = { ...(item as Record<string, unknown>), [childField]: [] };
      map.set(row[pkField], row);
    }
    for (const row of map.values()) {
      const parentId = row[parentField];
      if (parentId != null && map.has(parentId)) {
        (map.get(parentId)![childField] as unknown[]).push(row);
      } else {
        roots.push(row);
      }
    }
    return roots;
  }

  // ── Data loading ───────────────────────────────────────────────────────────

  async function loadData() {
    const src = view.source;
    void view.columns;
    const pd = propData;
    const trig = trigger ?? {};
    // Read here, before any await: this is what makes a new rule or a new
    // search reload the view.
    const extras = queryExtras;
    const isCollapsed = collapsed;
    const viewType = view.type;
    const treeCfg = view.tree;
    const _viewLimit = view.source?.limit;
    const _ps = _viewLimit !== undefined
      ? Number(_viewLimit)
      : untrack(() => Number(serverConfig.config?.page_size ?? DEFAULT_PAGE_SIZE));

    totalCount = null;

    if (pd !== undefined) {
      waitingForTrigger = false;
      rows = pd;
      _inferColumnTypes(pd);
      initialized = true;
      return;
    }

    if (isCollapsed) return;

    if (hasTriggerVars(src) && Object.keys(trig).length === 0) {
      waitingForTrigger = true;
      rows = [];
      return;
    }

    if (waitingForTrigger) { initialized = false; tabulatorReady = false; }
    waitingForTrigger = false;

    if (src?.model) {
      const q = buildQuery(src, view.columns, trig, { ...extras, pk: pkField });

      loading = true;
      error = null;
      try {
        if (viewType === 'tree') {
          const res = await api.endpoint('query', { format: 'records', query: q, ...mediaVariants });
          if (res.status === 'success') {
            let data = Array.isArray(res.data) ? res.data : [];
            if (treeCfg?.parent_field) {
              data = buildTree(data, treeCfg.parent_field, treeCfg.child_field ?? 'children');
            }
            rows = data;
            _inferColumnTypes(rows);
          } else {
            error = errorText(res, 'Query failed');
            rows = [];
          }
        } else {
          q.limit = _ps;
          q.offset = 0;
          const res = await api.endpoint('query', { format: 'records', query: q, ...mediaVariants, count: true });
          if (res.status === 'success') {
            const d = res.data as { records: unknown[]; total: number };
            rows = Array.isArray(d.records) ? d.records : [];
            _inferColumnTypes(rows);
            totalCount = d.total ?? null;
          } else {
            error = errorText(res, 'Query failed');
            rows = [];
          }
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        rows = [];
      } finally {
        loading = false;
        initialized = true;
      }
      return;
    }

    if (src?.endpoint) {
      loading = true;
      error = null;
      try {
        const rawParams = (src.params as Record<string, unknown>) ?? {};
        const params = applyTriggerVars(rawParams, trig) as Record<string, unknown>;
        const res = await api.endpoint(src.endpoint, params);
        if (res.status === 'success') {
          rows = Array.isArray(res.data) ? res.data : [];
          const payloadSchema = (res as unknown as Record<string, unknown>).schema as Record<string, SchemaFieldInfo> | undefined;
          if (payloadSchema) {
            _applySchemaHints(payloadSchema);
          } else {
            _inferColumnTypes(rows);
          }
        } else {
          error = errorText(res, 'Endpoint call failed');
          rows = [];
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        rows = [];
      } finally {
        loading = false;
        initialized = true;
      }
      return;
    }

    rows = [];
    initialized = true;
  }

  async function loadMore(n: number) {
    if (!tableRef || loadingMore || !hasMore) return;
    const src = view.source;
    if (!src?.model) return;

    const q = buildQuery(src, view.columns, trigger ?? {}, { ...queryExtras, pk: pkField });
    q.offset = rowCount;
    if (n > 0) q.limit = n;

    loadingMore = true;
    try {
      const res = await api.endpoint('query', { format: 'records', query: q, ...mediaVariants });
      if (res.status === 'success') {
        const newData = Array.isArray(res.data) ? res.data : [];
        if (newData.length > 0) {
          await tableRef.addRows(newData);
          syncCards();
        }
      } else {
        // The rows already loaded stay, but a "Load all" that does nothing
        // must say why: it was asked for
        await applyResult(res, { title: _('Load more'), stack });
      }
    } finally {
      loadingMore = false;
      saveViewState();
    }
  }

  $effect(() => { loadData(); });

  // Clear active row selection when trigger changes (e.g. parent row switches).
  // Without this, edit/delete buttons stay enabled for the previously selected row.
  $effect(() => {
    void trigger;
    _activeRowData = null;
  });

  // ── Export ─────────────────────────────────────────────────────────────────
  // F7 runs it only where the button is there to be seen.
  const exportShown = $derived(visibleButtons(navigatorConfig).has('export'));

  /**
   * The rows an operation on "what you see" works on, as ids in the order on
   * screen: the ticked ones, or with none ticked the rows past the column
   * filters. A list not fully loaded asks first whether the loaded rows will
   * do; "all" goes through Load all, so the column filters and the order apply
   * to the rows that arrive. null when the person cancels.
   */
  async function collectViewIds(title: string): Promise<unknown[] | null> {
    const ticked = tableRef?.getActiveData(true) ?? [];
    if (ticked.length > 0) return ticked.map((r) => r[pkField]);

    if (hasMore && totalCount !== null) {
      const total = totalCount;
      const choice = await msgbox.choose([
        { label: _t('The {n} loaded', { n: rowCount }), value: 'loaded' },
        { label: _t('All {n}', { n: total }), value: 'all' },
      ], title, _t('The list shows {n} of {total} rows.', { n: rowCount, total }));
      if (choice === undefined) return null;
      if (choice === 'all') {
        // Refused before loading: the server would refuse after.
        const limit = serverConfig.config?.export_max_rows as number | undefined;
        if (limit !== undefined && total > limit) {
          await msgbox.alert(_t('{n} rows are more than the {limit} an export can hold: narrow the selection',
                                { n: total, limit }), title);
          return null;
        }
        await loadMore(0);
      }
    }
    return (tableRef?.getActiveData() ?? []).map((r) => r[pkField]);
  }

  /**
   * The server builds the file: the rows are re-read with the view's query,
   * and the columns are the grid's as they are on screen — order, titles, the
   * ones the person hid left out. A view with no table behind it (an endpoint,
   * a buffer) has nothing to re-read, and exports what the grid holds.
   */
  async function handleExport() {
    if (!exportShown) return;
    const title = _('Export');
    const src = view.source;
    if (!src?.model || view.type === 'tree') {
      const name = (src?.model ?? view.title ?? 'export').toLowerCase();
      tableRef?.download('csv', `${name}.csv`);
      return;
    }

    const ids = await collectViewIds(title);
    if (ids === null) return;
    if (ids.length === 0) { await msgbox.alert(_('No rows to export'), title); return; }

    const byKey = new Map((view.columns ?? []).map((c) => [extractFieldKey(c.field), c.field]));
    const columns = (tableRef?.getVisibleColumns() ?? [])
      .filter((c) => byKey.has(c.field))
      .map((c) => ({ field: byKey.get(c.field)!, title: c.title }));

    const query = buildQuery(src, view.columns, trigger ?? {}, { ...queryExtras, pk: pkField });
    try {
      const res = await api.endpoint('export', { query, ids, columns });
      await applyResult(res, { title, stack, setQueryParams, refreshRows, reload: reloadData });
    } catch (e) {
      await msgbox.error(e instanceof Error ? e.message : String(e), undefined, title);
    }
  }

  /** Whether the view differs from how it opens — what "Reset view" would undo. */
  const viewChanged = $derived(
    ruleRows.length > 0 || quickSearch !== '' || userOrder.length > 0
    || Object.keys(queryParams).length > 0 || filterMode || gridSorted || selectMode,
  );

  /**
   * Back to the view as declared: the chosen set, the order, the command's
   * parameters (an archive view goes back to the active rows), and what was done
   * on the grid itself — column filters, header sort, the tick column.
   */
  function resetView() {
    tableRef?.clearHeaderFilter();
    filterMode = false;
    tableRef?.clearSort();
    gridSorted = false;
    selectMode = false;
    changeSet(() => {
      ruleRows = [];
      quickSearch = '';
      userOrder = [];
      queryParams = {};
    });
  }

  // Reorder mode, on rows ordered by hand: the handle shows, the columns stop
  // sorting and filtering, so a row moved always lands where it is seen
  let reorderMode = $state(false);

  function toggleFilter() {
    if (filterMode) tableRef?.clearHeaderFilter();
    // Filtered rows cannot be reordered: the hidden ones would have no place
    else reorderMode = false;
    filterMode = !filterMode;
    saveViewState();
  }

  function toggleSelect() {
    selectMode = !selectMode;
    saveViewState();
  }

  // Turned on, the grid shows the rows' own order again: a column sort is a way
  // of looking, and only a row moved by hand changes the order
  function toggleReorder() {
    if (reorderMode) { reorderMode = false; return; }
    if (filterMode) toggleFilter();
    gridSorted = false;
    reorderMode = true;
  }

  // ── Changing the set ───────────────────────────────────────────────────────

  /**
   * Apply a change of set. The reload itself is the effect on loadData; what
   * has to happen here is dropping the selection, because keeping it would
   * leave ids selected that no longer appear — a command about to be applied
   * to rows nobody can see.
   *
   * Sorting does *not* go through here: it changes the order, not the
   * membership, and losing the ticks would be a pointless nuisance.
   */
  function changeSet(apply: () => void) {
    apply();
    tableRef?.clearSelection();
    selectedCount = 0;
    _activeRowData = null;
    saveViewState();
  }

  function handleSearch(text: string) {
    if (text === quickSearch) return;
    changeSet(() => { quickSearch = text; });
  }

  /**
   * A click on a badge of a RefSet column (formatters/refset.ts) narrows the
   * list to the rows holding it: a rule added beside the others, never twice.
   */
  function handleBadgeClick(e: MouseEvent) {
    const badge = (e.target as HTMLElement).closest<HTMLElement>('[data-refset-key]');
    if (!badge?.dataset.refsetField || badge.dataset.refsetKey === undefined) return;
    e.stopPropagation();
    const field = badge.dataset.refsetField;
    const key = JSON.parse(badge.dataset.refsetKey);
    const same = ruleRows.some((r) => r.rule.field === field && r.rule.op === 'any_of'
      && Array.isArray(r.rule.value) && r.rule.value.length === 1 && r.rule.value[0] === key);
    if (same) return;
    setRules([...ruleRows, { rule: { field, op: 'any_of', value: [key],
                                     labels: [badge.textContent ?? String(key)] }, join: 'and' }]);
  }

  /** The rule editor's way in — its stack page returns here (querybuilder.md §7). */
  export function setRules(rows: RuleRow[]) {
    changeSet(() => { ruleRows = rows; });
  }

  export function getRules(): RuleRow[] {
    return ruleRows;
  }

  /**
   * Open the editor. It is a deliberate act and takes the whole screen, unlike
   * the quick search, which is the everyday gesture and cannot cost even a click.
   *
   * What comes back is the whole set at once — conditions, order, and the quick
   * search, which the editor shows because a filter the user cannot see is a
   * wrong answer given with confidence. Only the order alone leaves the ticks
   * alive: it changes the sequence, not the membership.
   */
  function openRuleEditor() {
    if (!view.source?.model) return;
    stack.push(RuleEditorView, {
      model: view.source.model as string,
      rules: ruleRows,
      order: userOrder,
      defaultOrder: descriptorOrder,
      search: quickSearch,
      title: view.title,
      onApply: (r: { rules: RuleRow[]; order?: OrderSpec[]; search: string }) => {
        const orderOnly =
          JSON.stringify(r.rules) === JSON.stringify(ruleRows) && r.search === quickSearch;
        const applyAll = () => {
          ruleRows = r.rules;
          userOrder = r.order ?? [];
          quickSearch = r.search;
        };
        // The fetch itself is the effect's business: it reads queryExtras.
        if (orderOnly) {
          applyAll();
          saveViewState();
        } else {
          changeSet(applyAll);
        }
      },
    });
  }

  // ── Navigator CRUD ─────────────────────────────────────────────────────────

  function openForm(recordId: unknown, isNew: boolean) {
    if (!formId) return;
    const model = (view.source?.model as string | undefined) ?? '';

    // Batch mode: computed rows — pass data directly, no DB roundtrip
    if (navigatorMode === 'batch' && _activeRowData) {
      const rowSnapshot = { ..._activeRowData };
      const rowId = rowSnapshot[pkField];
      stack.push(DataFormView, {
        formId,
        data: rowSnapshot,
        title: 'Edit',
        onSaved: (savedData: Record<string, unknown>) => {
          const merged = { ...rowSnapshot, ...savedData };
          const idx = (rows as Record<string, unknown>[]).findIndex((r) => r[pkField] === rowId);
          if (idx >= 0) (rows as Record<string, unknown>[])[idx] = merged;
          tableRef?.updateRow(rowId, merged);
          queueMicrotask(() => tableRef?.focusRowById(rowId));
        },
        onCancel: () => { queueMicrotask(() => tableRef?.focusRowById(rowId)); },
      });
      return;
    }

    // Normal DB-backed form
    const label = isNew ? `${_('New')} ${model}` : `${_('Edit')} ${model}`;
    stack.push(DataFormView, {
      formId,
      recordId: recordId ?? null,
      // The view's own defaults: a record added from "Customers" is born one.
      defaults: isNew ? view.source?.defaults : undefined,
      title: label,
      onSaved: (savedData: Record<string, unknown>) => {
        const id = isNew ? savedData[pkField] : recordId;
        if (id != null) refreshRows([id]);
      },
      onCancel: () => {
        if (recordId != null) queueMicrotask(() => tableRef?.focusRowById(recordId));
      },
    });
  }

  function reloadData() {
    // Reset initialization to force a full reload
    initialized = false;
    tabulatorReady = false;
    alignsInferred = false;
    restoreComplete = false;
    loadData();
  }

  // ── Rows that were touched ─────────────────────────────────────────────────
  // After a record is saved, deleted or changed by a command, the view asks
  // the server for those keys with its own query — same columns and joins,
  // same filters, rules, params and behaviors. A row that comes back is
  // updated in place (joined fields included), one that does not is dropped,
  // one that was not there is added: whether the record still belongs to the
  // list is decided where the filters actually run, not by comparing fields
  // here. Pagination, scroll and focus stay where they are. A row whose new
  // values would sort it elsewhere stays put until the next load — moving it
  // under the user's eyes is worse than a list one step behind its order.

  async function refreshRows(ids: unknown[]) {
    const src = view.source;
    if (!src?.model || !tableRef || ids.length === 0) return;
    if (view.type === 'tree') { reloadData(); return; }

    const q = buildQuery(src, view.columns, trigger ?? {}, { ...queryExtras, pk: pkField, only: ids });
    let fresh: Record<string, unknown>[] = [];
    try {
      const res = await api.endpoint('query', { format: 'records', query: q, ...mediaVariants });
      if (res.status !== 'success') { reloadData(); return; }
      fresh = (res.data ?? []) as Record<string, unknown>[];
    } catch { reloadData(); return; }

    const byId = new Map(fresh.map(r => [r[pkField], r]));
    const activeId = _activeRowData ? (_activeRowData as any)[pkField] : null;
    let focusId: unknown = activeId;
    let delta = 0;

    for (const id of ids) {
      const row = byId.get(id);
      const loaded = tableRef.hasRow(id);
      if (row && loaded) {
        tableRef.updateRow(id, row);
      } else if (row) {
        await tableRef.addRows([row]);
        focusId = id;
        delta++;
      } else if (loaded) {
        if (id === activeId) { focusId = tableRef.getAdjacentRowId(id); _activeRowData = null; }
        await tableRef.deleteRow(id);
        delta--;
      }
    }
    if (totalCount !== null) totalCount += delta;
    syncCards();
    if (focusId != null) queueMicrotask(() => tableRef?.focusRowById(focusId));
  }

  function handleNavAccept() {
    if (navigatorMode === 'batch') {
      // Batch mode: emit all rows + selected subset.
      // For DB models emit only PKs; for computed arrays emit full row objects.
      const selectedRows = (tableRef?.getSelectedData() ?? []) as Record<string, unknown>[];
      const hasModel = !!view.source?.model;
      const payload = hasModel
        ? {
            selected_ids: selectedRows.map((r) => r[pkField]),
            total_rows:   rows.length,
          }
        : {
            rows,
            selected:     selectedRows.length > 0 ? selectedRows : (rows as Record<string, unknown>[]),
          };
      onEvent?.('batch_accept', payload);
    } else {
      if (_activeRowData) onEvent?.('row_accept', _activeRowData);
    }
  }

  function handleNavLookupCancel() {
    onEvent?.('row_cancel', null);
  }

  function handleNavAdd() {
    // Buffered: the rows are someone else's — say what was asked, do nothing.
    // The owner holds the buffer and knows what a new row costs there.
    if (navigatorMode === 'buffered') { onEvent?.('row_add', null); return; }
    openForm(null, true);
  }

  // ── Navigator commands ─────────────────────────────────────────────────────
  // A command declared in the view's YAML names an endpoint and nothing else.
  // The view sends the whole situation — the table, the active row, the ticked
  // rows, the params in force — whatever the scope: the scope decides when the
  // button is enabled, the server decides what to make of the rest. The answer
  // goes through `applyResult` like every other operation's.

  async function handleNavCommand(cmd: CommandItem) {
    if (!cmd.endpoint) {
      console.error(`[DataView] Command "${cmd.id}" names no endpoint.`);
      return;
    }
    const activeId = _activeRowData ? (_activeRowData as any)[pkField] : undefined;
    const selectedIds = tableRef?.getSelectedData().map((r: any) => r[pkField]) ?? [];
    // Rows in a buffer: the command works on the document, not on the
    // database, and the frame that holds the document runs it.
    if (navigatorMode === 'buffered') {
      // The rows the column filters leave, only when they leave out some:
      // a command given on a filtered grid means the rows on screen.
      const shown = tableRef?.getActiveData() ?? [];
      const filtered = shown.length < rows.length;
      onEvent?.('row_command', { command: cmd, label: commandLabel(cmd), current: activeId,
                                 checked: selectedIds,
                                 visible: filtered ? shown.map((r: any) => r[pkField]) : undefined });
      return;
    }
    const payload: Record<string, unknown> = {
      ...((cmd.params as Record<string, unknown> | undefined) ?? {}),
      table: view.source?.model,
      query_params: queryParams,
    };
    if (activeId != null) payload.id = activeId;
    if (selectedIds.length > 0) payload.ids = selectedIds;
    // The rows on screen, past the column filters and in the grid's order:
    // only for a command that declares it wants them (a print of "what you see").
    if (cmd.rows === 'view') payload.view_ids = (tableRef?.getActiveData() ?? []).map((r: any) => r[pkField]);

    try {
      const res = await api.endpoint(cmd.endpoint, payload);
      await applyResult(res, {
        title: commandLabel(cmd),
        stack,
        setQueryParams,
        refreshRows,
        reload: reloadData,
      });
    } catch (e) {
      await msgbox.error(e instanceof Error ? e.message : String(e), undefined, commandLabel(cmd));
    }
  }

  // A command's `key` runs it while this view has the focus — the menu shows
  // "(A)" and the hand learns it. Only a bare letter, and never while typing:
  // an input, a modifier, or another view on screen are all not this. The
  // scope still applies, as it does to the click.
  function handleCommandKey(e: KeyboardEvent) {
    if (e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    const commands = (navigatorConfig?.commands ?? []) as CommandItem[];
    const cmd = commands.find(c => c.key && String(c.key).toLowerCase() === e.key.toLowerCase());
    if (!cmd) return;
    if (cmd.scope === 'row' && _activeRowData == null) return;
    if (cmd.scope === 'selection' && selectedCount === 0) return;
    e.preventDefault();
    e.stopPropagation();
    handleNavCommand(cmd);
  }

  /** Merge what the server sent; a null value drops the key. */
  function setQueryParams(params: Record<string, unknown>) {
    const next = { ...queryParams };
    for (const [k, v] of Object.entries(params)) {
      if (v === null || v === undefined) delete next[k];
      else next[k] = v;
    }
    queryParams = next;
  }

  function handleNavEdit() {
    if (_activeRowData == null) return;
    if (navigatorMode === 'buffered') { onEvent?.('row_edit', _activeRowData); return; }
    const id = (_activeRowData as any)[pkField];
    openForm(id, false);
  }

  async function handleNavDelete() {
    if (_activeRowData == null) return;
    const row = _activeRowData;

    // One question for both paths. A buffered row does not reach the database
    // until the parent is saved, but that is no reason to ask less: leaving the
    // form would throw away every other change too, and a row just typed in has
    // no undo at all.
    if (!(await msgbox.confirm(_('Delete the selected record?'), undefined,
                               { confirm: _('Delete'), danger: true }))) return;

    if (navigatorMode === 'buffered') {
      onEvent?.('row_delete', row);
      _activeRowData = null;
      return;
    }
    const id = (row as any)[pkField];
    const model = view.source?.model as string | undefined;
    if (!model) return;
    try {
      // Judged: the table's rules may ask, or refuse, before the row goes
      const res = await callJudged('db', { table: model, method: 'delete', id });
      if (res.cancelled) return;
      if (res.status === 'success') {
        _internalFocusId = null;
        await refreshRows([id]);
        await presentOutcome(res.flow, { stack, title: _('Delete') });
      } else {
        msgbox.error(errorText(res, _('Error deleting record')));
      }
    } catch (e) {
      msgbox.error(e instanceof Error ? e.message : String(e));
    }
  }

  // row_dblclick → opens form when navigator present, otherwise emits event to parent
  function handleRowDblClick(row: unknown) {
    const rowData = row as Record<string, unknown>;
    _activeRowData = rowData;
    if (navigatorMode === 'buffered') {
      onEvent?.('row_edit', rowData);
      return;
    }
    if (showNavigator && (navigatorMode === 'browser' || navigatorMode === 'batch') && formId) {
      // Navigator owns the action — open form directly
      const id = rowData[pkField];
      openForm(id, false);
    } else {
      // No navigator or lookup mode — emit event for parent to handle
      onEvent?.('row_dblclick', row);
    }
  }

  // ── Internal callbacks ─────────────────────────────────────────────────────

  function handleDataLoaded(count: number) {
    rowCount = count;
    // A macrotask, as for the focus below: on the first load Tabulator is not
    // built yet when the data arrives.
    setTimeout(syncCards, 0);
    filteredCount = null;
    onEvent?.('data_load', { count });
    if (!loadingMore) {
      saveViewState();
      const fid = _effectiveFocusId;
      if (fid != null) {
        // setTimeout (not queueMicrotask): dataLoaded fires before tableBuilt, so
        // kbTable is null at microtask time. A macrotask runs after all microtasks
        // (including the .then that sets kbTable) have completed.
        setTimeout(() => tableRef?.focusRowById(fid), 0);
      }
      if (autofocus) {
        // After the row, if any: a row that is not among those loaded leaves the
        // grid with the keyboard anyway, and the first ArrowDown starts at the top.
        setTimeout(() => { if (!document.activeElement?.closest('.kb-dataview')) tableRef?.focus(); }, 0);
      }
    }
  }

  function handleFiltered(count: number) {
    filteredCount = count < rowCount ? count : null;
    syncCards();
    saveViewState();
  }

  function handleSorted() {
    gridSorted = (tableRef?.getSorters().length ?? 0) > 0;
    syncCards();
    saveViewState();
  }

  function handleSelectionChange(selectedRows: unknown[]) {
    selectedCount = (selectedRows as any[]).length;
    onEvent?.('selection_change', selectedRows);
    saveViewState();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="kb-dataview" onkeydown={handleCommandKey}>

  <!-- ── Navigator (shown when navigator config present or default browser mode) -->
  {#if showNavigator}
    <DataViewNavigator
      config={navigatorConfig}
      {filterMode}
      {selectMode}
      movable={movableRows}
      {reorderMode}
      onToggleReorder={toggleReorder}
      {loading}
      {loadingMore}
      {hasMore}
      {rowCount}
      {filteredCount}
      {totalCount}
      {selectedCount}
      activeRowId={_activeRowData ? (_activeRowData as any)[pkField] : null}
      onAccept={handleNavAccept}
      onCancel={handleNavLookupCancel}
      onAdd={handleNavAdd}
      onEdit={handleNavEdit}
      onDelete={handleNavDelete}
      onCommand={handleNavCommand}
      onToggleFilter={toggleFilter}
      onToggleSelect={toggleSelect}
      onExport={handleExport}
      onRefresh={reloadData}
      onLoadMore={loadMore}
      canReset={viewChanged}
      onReset={resetView}
      searchable={quickSearchAvailable}
      searchValue={quickSearch}
      onSearch={handleSearch}
      views={allowViews}
      activeView={activeViewType}
      onViewChange={switchView}
      rulesActive={ruleRows.length > 0 || userOrder.length > 0}
      onOpenRules={view.source?.model ? openRuleEditor : undefined}
    />
  {/if}

  <!-- ── Restore banner ─────────────────────────────────────────────────── -->
  {#if bannerRowCount !== null}
    <div class="kb-dv-restore-banner">
      <span>{bannerRowCount} rows were loaded.</span>
      <button class="kb-dv-btn" onclick={() => { const n = bannerRowCount! - rowCount; bannerRowCount = null; loadMore(n > 0 ? n : 0); }}>
        Reload {bannerRowCount}
      </button>
      <button class="kb-dv-btn" onclick={() => { bannerRowCount = null; saveViewState(); }}>
        Keep {rowCount}
      </button>
    </div>
  {/if}

  <!-- ── Data body ───────────────────────────────────────────────────────── -->
  <div class="kb-dv-body">
    {#if waitingForTrigger}
      <div class="kb-dv-placeholder">
        <svg viewBox="0 0 20 20" fill="currentColor" style="width:1.25rem;height:1.25rem;flex-shrink:0;opacity:0.4" aria-hidden="true">
          <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clip-rule="evenodd"/>
        </svg>
        {_('Select an item to view the detail.')}
      </div>
    {:else if error}
      <div class="kb-dv-error">
        <svg viewBox="0 0 20 20" fill="currentColor" style="width:1.25rem;height:1.25rem;flex-shrink:0" aria-hidden="true">
          <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/>
        </svg>
        {error}
      </div>
    {:else if initialized}
      {#if isCards}
        <DataViewCards
          rows={cardRows}
          {card}
          tones={columnTones}
          titles={cardTitles}
          {pkField}
          activeId={_activeRowData ? _activeRowData[pkField] : null}
          onRowClick={(row) => { _activeRowData = row; onEvent?.('row_click', row); }}
          onRowDblClick={handleRowDblClick}
          onImageDrop={cardImage ? handleCardImageDrop : undefined}
        />
      {/if}
      <!-- DataViewTable handles 'table' and 'tree', and stays mounted under
           the cards: it owns the loaded rows. -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="kb-dv-table" class:kb-dv-hidden={isCards} onclickcapture={handleBadgeClick}>
      <DataViewTable
        bind:this={tableRef}
        {rows}
        {columnDefs}
        {selectable}
        {filterMode}
        {isTreeMode}
        {treeChildField}
        {treeStartExpanded}
        rowTones={tonesOfRow}
        onRowClick={(row) => { _activeRowData = row as Record<string,unknown>; onEvent?.('row_click', row); }}
        onRowDblClick={handleRowDblClick}
        onSelectionChange={handleSelectionChange}
        onDataLoaded={handleDataLoaded}
        onFiltered={handleFiltered}
        onSorted={handleSorted}
        {movableRows}
        keepSelection={navigatorMode === 'buffered'}
        reorder={reorderMode}
        onRowsMoved={(ids) => onEvent?.('rows_moved', ids)}
        onRowMoveKey={handleRowMoveKey}
        onReady={() => { tabulatorReady = true; syncCards(); }}
        onNavAdd={handleNavAdd}
        onNavEdit={handleNavEdit}
        onNavDelete={handleNavDelete}
        onNavExport={handleExport}
        onNavRefresh={reloadData}
        onNavCancel={navigatorMode === 'lookup' ? handleNavLookupCancel : undefined}
      />
      </div>
    {/if}
  </div>


</div>

<style>
  /* The badges of a RefSet column: drawn by its formatter, outside this component */
  :global(.kb-refset-cell) {
    display: flex;
    flex-wrap: nowrap;
    gap: 0.25rem;
    overflow: hidden;
  }
  :global(.kb-refset-cell-badge) {
    padding: 0 0.4rem;
    border: 1px solid var(--kb-accent-border);
    border-radius: 9999px;
    background: var(--kb-accent-subtle);
    font-size: 0.75rem;
    line-height: 1.125rem;
    color: var(--kb-text);
    white-space: nowrap;
    cursor: pointer;
  }
  :global(.kb-refset-cell-badge:hover) {
    border-color: var(--kb-accent);
  }

  .kb-dataview {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  /* ── Restore banner ──────────────────────────────────────────────────── */

  .kb-dv-restore-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0.75rem;
    background: color-mix(in srgb, var(--kb-accent, #3b82f6) 8%, var(--kb-bg));
    border-bottom: 1px solid color-mix(in srgb, var(--kb-accent, #3b82f6) 25%, transparent);
    font-size: 0.72rem;
    flex-shrink: 0;
  }

  .kb-dv-restore-banner span {
    color: var(--kb-text-subtle);
    flex: 1;
  }

  /* Restore banner buttons. */
  .kb-dv-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.2rem 0.5rem;
    border: 1px solid var(--kb-border-input);
    border-radius: 0.3rem;
    background: var(--kb-bg);
    color: var(--kb-text);
    font-size: 0.72rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.1s, border-color 0.1s;
    appearance: none;
    line-height: 1.4;
  }

  .kb-dv-btn:hover:not(:disabled) {
    background: var(--kb-surface-hover);
    border-color: var(--kb-text-subtle);
  }

  /* ── Body ────────────────────────────────────────────────────────────── */

  .kb-dv-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .kb-dv-table {
    height: 100%;
  }
  .kb-dv-hidden {
    display: none;
  }

  .kb-dv-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    height: 100%;
    color: var(--kb-text-subtle);
    font-size: 0.8rem;
    padding: 1rem;
    text-align: center;
  }

  .kb-dv-error {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    height: 100%;
    color: var(--kb-danger);
    font-size: 0.8rem;
    padding: 1rem;
    text-align: center;
  }

</style>
