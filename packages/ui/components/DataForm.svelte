<script lang="ts">
  /**
   * DataForm.svelte — descriptor-driven form.
   *
   * Step A — mode 4: local binding (source.data resolved by parent, passed as `data` prop).
   * Step B — mode 3: endpoint-driven (source.endpoint / save_endpoint).
   * Step C — modes 1+2: DB CRUD (source.model / source.id).
   *
   * Props:
   *   view          FormDescriptor     resolved form descriptor
   *   data          object             initial data (mode 4) or undefined (modes 1–3)
   *   trigger       object             trigger payload from PanelRenderer
   *   status        FormStatus         message shown in toolbar (parent-controlled)
   *   toolbarExtra  Snippet            custom content injected in the toolbar right area
   *   onEvent       fn                 unified event emitter (form_load, form_save, …)
   *   onSave        fn                 called after save in mode 4 (no backend call)
   *   onCancel      fn                 called after cancel / discard
   */
  import { onMount, tick, untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import { Check, X, Loader } from 'lucide-svelte';
  import { getConfig } from '../config';
  import { api } from '../api/client';
  import WidgetText from './widgets/WidgetText.svelte';
  import WidgetTextarea from './widgets/WidgetTextarea.svelte';
  import WidgetNumber from './widgets/WidgetNumber.svelte';
  import WidgetDate from './widgets/WidgetDate.svelte';
  import WidgetBoolean from './widgets/WidgetBoolean.svelte';
  import WidgetCombobox from './widgets/WidgetCombobox.svelte';
  import WidgetFKCombobox from './widgets/WidgetFKCombobox.svelte';
  import WidgetJson from './widgets/WidgetJson.svelte';
  import WidgetChecklist from './widgets/WidgetChecklist.svelte';
  import PluginComponent from './PluginComponent.svelte';
  import { getPluginLoader } from '$kitebase/plugins/context';
  import FieldHelp from './widgets/FieldHelp.svelte';
  import { _ } from '../i18n';
  import { serverConfig } from '../api/serverConfig.svelte';
  import { authStore } from '../auth/store.svelte';
  import type { SchemaFieldInfo } from '../api/serverConfig.svelte';
  import CollectionView from './CollectionView.svelte';
  import DataFormView from './DataFormView.svelte';
  import { msgbox } from './msgbox.svelte';
  import { resolveIcon } from './icons';
  import { stack as globalStack } from '$kitebase/stack/stack.svelte';
  import type { StackInstance } from '$kitebase/stack/stack.svelte';
  import { getContext } from 'svelte';
  import { isDirty, liveRows, type Aggregate, type TreeNode } from './aggregate';
  import { resolveRecordTokens } from './record';
  import { lookupFilters } from './lookup';
  import { isDateOnly, withTimeNow, plausibleYear } from './datetime';
  import type {
    FormDescriptor, FormField, FormStatus,
    LayoutNode, SectionNode, SectionField, FillerField, ColumnDef,
    LabelNode, TabsNode, RowNode, CollectionNode, ButtonNode,
  } from './dataform.types';

  // ── Props ──────────────────────────────────────────────────────────────────

  interface Props {
    view: FormDescriptor;
    data?: Record<string, unknown>;        // Step A: local data
    /**
     * false → the record is not this form's to write: whoever owns the aggregate
     * holds it in a buffer and saves the whole tree in one transaction. The form
     * reads its values from `data` and hands the draft back through `onSave`.
     * Everything else — create defaults, validation, events — is unchanged.
     */
    persist?: boolean;
    /**
     * The aggregate this form edits: the tree (for its id counter) and the node
     * the form's own fields belong to. Present whenever the page declares
     * collection nodes — they are drawn against `node`.
     */
    buffer?: { agg: Aggregate; node: TreeNode };
    /** Fields the caller supplies and the form must not draw (§17). */
    hideFields?: string[];
    /**
     * What encloses this form — the title of its frame. A collection whose label
     * moved onto a tab, or onto the button that opened it, names its row frames
     * with it instead of with the table.
     */
    groupLabel?: string;
    /** `confirm` on an intermediate frame, `save` only at the root (§12). */
    submit?: 'save' | 'confirm';
    recordId?: number | string | null;     // Step C: DB record id (null = new record)
    defaults?: Record<string, unknown>;    // caller's initial values, create mode only
    trigger?: Record<string, unknown>;
    status?: FormStatus;
    toolbarExtra?: Snippet;
    onEvent?: (name: string, data: unknown) => void;
    onSave?: (draft: Record<string, unknown>) => Promise<void> | void;
    onCancel?: () => void;
  }

  let {
    view,
    data = {},
    persist = true,
    buffer = undefined,
    hideFields = [],
    groupLabel = undefined,
    submit = 'save',
    recordId,
    defaults,
    trigger,
    status,
    toolbarExtra,
    onEvent,
    onSave,
    onCancel
  }: Props = $props();

  // Where a plugin widget (`widget: acl.access`) is found.
  const pluginLoader = getPluginLoader();

  // ── Schema resolution ─────────────────────────────────────────────────────

  const resolvedSchema = $derived.by((): Record<string, SchemaFieldInfo> | null => {
    const ds = view.data_schema;
    if (!ds) return null;
    return serverConfig.schemas[ds] ?? null;
  });

  // ── Layout engine helpers ──────────────────────────────────────────────────

  // Active tab index per tabs node (keyed by node.id or page labels joined).
  let tabStates = $state<Record<string, number>>({});

  // Recursively extract all FormFields from a layout tree (for validation + save).
  function extractLayoutFields(nodes: LayoutNode[]): FormField[] {
    const result: FormField[] = [];
    for (const node of nodes) {
      if ('name' in node) {
        result.push(node as FormField);
      } else if (node.type === 'section') {
        const sec = node as SectionNode;
        if (Array.isArray(sec.columns)) {
          for (const col of sec.columns as ColumnDef[]) {
            result.push(...col.fields.filter((f): f is SectionField => 'name' in f));
          }
        } else {
          result.push(...((sec as any).fields ?? []).filter((f: any) => 'name' in f));
        }
      } else if (node.type === 'row') {
        for (const col of (node as RowNode).children) {
          result.push(...extractLayoutFields(col.layout));
        }
      } else if (node.type === 'tabs') {
        for (const page of (node as TabsNode).pages) {
          result.push(...extractLayoutFields(page.layout));
        }
      }
      // hr, label, filler: no fields
    }
    return result;
  }

  // ── Mode detection (static — source config fixed at mount) ─────────────────
  // untrack: intentional — view.source is fixed at mount, not reactive.

  const isModelMode    = untrack(() => !!view.source?.model);
  const isEndpointMode = untrack(() => !isModelMode && !!view.source?.endpoint);
  const isAsyncMode    = isModelMode || isEndpointMode;

  // Does the form need to wait for a trigger before loading?
  const hasTriggerDeps = untrack(() => {
    if (isEndpointMode) {
      return Object.values(view.source?.pass ?? {}).some(
        (v) => typeof v === 'string' && (v as string).startsWith('$trigger.')
      );
    }
    // Model mode: trigger-driven if source.id references $trigger.*
    if (isModelMode) {
      const sid = view.source?.id;
      return typeof sid === 'string' && sid.startsWith('$trigger.');
    }
    return false;
  });

  // ── Internal state ─────────────────────────────────────────────────────────

  // Guard for the loadData $effect — plain (non-reactive) vars to detect genuine changes.
  // Svelte 5 sometimes re-runs $effects when parent components re-render even with
  // same prop values (e.g. via spread props in a keyed #each). This guard prevents
  // spurious loadData() calls when trigger/recordId haven't actually changed.
  let _seenTrigger: typeof trigger = undefined as any;
  let _seenRecordId: typeof recordId = undefined as any;
  let _neverLoaded = true;

  // Local mode (Step A): capture data at mount via untrack.
  // Async modes (B/C): start empty — loadData() fills original/draft.
  let original = $state<Record<string, unknown>>(
    isAsyncMode ? {} : untrack(() => ({ ...data }))
  );
  let draft = $state<Record<string, unknown>>(
    isAsyncMode ? {} : untrack(() => ({ ...data }))
  );
  let errors = $state<Record<string, string>>({});
  let saving = $state(false);
  let loading = $state(false);
  let internalStatus = $state<FormStatus | undefined>(undefined);

  // ── Derived ────────────────────────────────────────────────────────────────

  let policy = $derived(view.policy ?? {});
  // A form is drawn to be filled in: the read-only one — a detail split beside a
  // list — is the rarer case, and it is the one that deserves the word. Saying
  // nothing used to mean a page with no buttons and no editable field, which is
  // indistinguishable from a broken one.
  let isEditable = $derived(policy.editable !== false);

  // Columns the model declares `editable: false`. The model says what can be
  // edited at all; a descriptor can only restrict that, never widen it.
  let lockedColumns = $derived.by(() => {
    const model = view.source?.model;
    const table = model ? serverConfig.tables[model] : undefined;
    return new Set((table?.columns ?? []).filter((c) => c.editable === false).map((c) => c.name));
  });

  // Columns the server never sends back (a password): what was typed must not
  // stay on screen after saving, nor go out again with the next save.
  let secretColumns = $derived.by(() => {
    const model = view.source?.model;
    const table = model ? serverConfig.tables[model] : undefined;
    return (table?.columns ?? []).filter((c) => c.secret).map((c) => c.name);
  });

  // All leaf FormFields — from layout tree or legacy flat list.
  // A hidden field is not merely invisible: it is not the form's business at all,
  // so it is out of validation and out of the payload too.
  let flatFields = $derived(
    (view.layout
      ? extractLayoutFields(view.layout as LayoutNode[])
      : (view.fields ?? []).filter((f): f is FormField => 'name' in f)
    ).filter((f) => !hideFields.includes(f.name))
  );

  const isFieldHidden = (name: string) => hideFields.includes(name);

  // Group fields by same_row: a field with same_row:true joins the previous group.
  let fieldGroups = $derived(groupFields(flatFields));

  // dirty: JSON comparison — $state proxy reads all props correctly.
  // The buffer counts too: confirming a grandchild must leave the root dirty, or
  // one closes the whole thing convinced nothing was changed (§12).
  let dirty = $derived(
    JSON.stringify(draft) !== JSON.stringify(original)
    || (buffer ? isDirty(buffer.node) : false)
  );

  // Trigger not yet arrived for a trigger-dependent async form
  let waitingForTrigger = $derived(isAsyncMode && hasTriggerDeps && trigger === undefined);

  // Show toolbar when editable or when there's any status/extra content
  let showToolbar = $derived(isEditable || !!status || !!internalStatus || !!toolbarExtra);

  // ── Field grouping ─────────────────────────────────────────────────────────

  function groupFields(fields: FormField[]): FormField[][] {
    const groups: FormField[][] = [];
    for (const field of fields) {
      if (field.same_row && groups.length > 0) {
        groups[groups.length - 1].push(field);
      } else {
        groups.push([field]);
      }
    }
    return groups;
  }

  // CSS style for a field in a multi-field row
  function fieldWidthStyle(field: FormField): string {
    const w = field.width;
    if (w == null) return 'flex: 1 1 0; min-width: 0';
    if (typeof w === 'number') return `width: ${w}px; flex: none`;
    return `width: ${w}; flex: none`;
  }

  /**
   * CSS style for a field inside a layout column, where fields flow and wrap.
   *
   * No width takes an equal share of what is left on the line. A percentage is a
   * share of the line, and the line also carries the gaps between the fields:
   * one gap is taken out of each share, so widths that add up to 100% stay on
   * one line instead of dropping the last field onto the next one — the author
   * does the arithmetic that reads right, and the engine does not undo it.
   * An absolute width is left alone: it was asked for exactly.
   */
  function columnFieldFlex(w: string | number | undefined): string {
    if (w == null) return 'flex: 1 1 0';
    const width = typeof w === 'number' ? `${w}px` : String(w).trim();
    return width.endsWith('%')
      ? `flex: 0 0 calc(${width} - var(--kb-form-gap, 1rem))`
      : `flex: 0 0 ${width}`;
  }

  // ── Widget resolution ──────────────────────────────────────────────────────

  function resolveWidget(field: FormField): string {
    if (field.widget) return field.widget as string;
    if (field.foreign_key) return 'fk';
    // Declared choices are a pick list whatever the type: a String with choices
    // is not free text.
    if (field.choices && field.choices.length > 0) return 'combobox';

    const schemaField = resolvedSchema?.[field.name];
    const effectiveType = (schemaField?.type ?? field.type) as string | undefined;

    if (effectiveType) {
      const w = serverConfig.resolveWidget(effectiveType);
      if (w) return w;
    }

    // Legacy fallback for inline type strings not in the registry
    const t = (effectiveType ?? '').toLowerCase();
    if (t === 'bool' || t === 'boolean') return 'boolean';
    if (t === 'date') return 'date';
    if (t === 'datetime') return 'datetime';
    if (t === 'time') return 'time';
    if (t === 'longstr' || t === 'text') return 'textarea';
    if (t === 'int' || t === 'float' || t === 'decimal' || t === 'number') return 'number';
    return 'text';
  }

  // ── Field help ─────────────────────────────────────────────────────────────
  // One open at a time, by field name. F1 on a field opens its help, as in
  // every desktop program; the keys of whatever widget the field has bubble
  // up to its container, so no widget needs to know.

  let helpOpen = $state<string | null>(null);

  function fieldKeys(e: KeyboardEvent, field: FormField) {
    if (e.key === 'F1' && field.help) {
      e.preventDefault();
      helpOpen = helpOpen === field.name ? null : field.name;
    } else if (e.key === 'Escape' && helpOpen === field.name) {
      // An open help takes the key, as an open drop-down does: closing it is
      // not cancelling the form.
      e.preventDefault();
      e.stopPropagation();
      helpOpen = null;
    }
  }

  // ── Patch + validation ─────────────────────────────────────────────────────

  function patch(name: string, value: unknown) {
    draft[name] = value;
  }

  // What a widget holds that is not a value yet (JSON that does not parse):
  // the widget says so, and the field stays in error until it is corrected.
  let widgetErrors = $state<Record<string, string>>({});

  function widgetInvalid(name: string, message: string | null) {
    if (message) widgetErrors[name] = message;
    else if (name in widgetErrors) {
      const { [name]: _dropped, ...rest } = widgetErrors;
      widgetErrors = rest;
    }
  }

  function validateField(name: string): boolean {
    const field = flatFields.find((f) => f.name === name);
    if (!field) return true;

    if (widgetErrors[name]) {
      errors[name] = widgetErrors[name];
      return false;
    }

    const value = draft[name];
    const isEmpty = value === null || value === undefined || value === '';

    if (field.required && isEmpty) {
      errors[name] = `${field.label ?? field.name} ${_('is required')}`;
      return false;
    }

    const wt = resolveWidget(field);
    if (wt === 'number' && !isEmpty && isNaN(Number(value))) {
      errors[name] = _('Invalid numeric value');
      return false;
    }
    if ((wt === 'date' || wt === 'datetime') && !isEmpty && !plausibleYear(value)) {
      errors[name] = _('Implausible year');
      return false;
    }

    const { [name]: _dropped, ...rest } = errors;
    errors = rest;
    return true;
  }

  function validateAll(): boolean {
    let valid = true;
    for (const field of flatFields) {
      if (!validateField(field.name)) valid = false;
    }
    return valid;
  }

  // ── Async load/save (Step B: endpoint, Step C: model) ─────────────────────

  function resolvePass(pass: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(pass).map(([k, v]) => {
        if (typeof v === 'string' && v.startsWith('$trigger.')) {
          return [k, trigger?.[v.slice('$trigger.'.length)]];
        }
        return [k, v];
      })
    );
  }

  // Resolve the record ID for Step C (prop, trigger, or descriptor literal)
  function resolveRecordId(): number | string | null | undefined {
    if (recordId !== undefined) return recordId; // explicit prop wins
    const sid = view.source?.id;
    if (typeof sid === 'string' && sid.startsWith('$trigger.')) {
      return trigger?.[sid.slice('$trigger.'.length)] as number | string | undefined;
    }
    return sid as number | string | null | undefined;
  }

  // ── Create-mode defaults (init event → set-value) ──────────────────────────
  //
  // Field defaults come from the table schema (per-column default/deferred),
  // overlaid by the descriptor's explicit source.defaults (author wins).
  // Per the form model, three cases per field:
  //   • deferred     → not prefilled (server fills at save; e.g. timestamps)
  //   • "$token"     → resolved from the local context registry (e.g. $op_date)
  //   • direct value → used as-is
  // An unknown "$token" on a non-deferred field is a config error: log + leave
  // empty (never guess, never call an endpoint here).

  // Tokens the client can resolve from context. Anything else is server
  // territory and must be `deferred`.
  const CONTEXT_TOKENS: Record<string, () => unknown> = {
    op_date: () => authStore.opDate,
  };

  function resolveToken(raw: string): { set: boolean; value?: unknown } {
    const getter = CONTEXT_TOKENS[raw.slice(1)];
    if (!getter) {
      console.error(`[DataForm] Unknown context default "${raw}" on a non-deferred field — leaving empty. Mark it deferred or register the token.`);
      return { set: false };
    }
    const v = getter();
    return v == null ? { set: false } : { set: true, value: v };
  }

  function computeCreateDefaults(src: FormDescriptor['source']): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    // 1) schema column defaults (model mode)
    const table = src?.model ? serverConfig.tables[src.model] : undefined;
    for (const col of table?.columns ?? []) {
      if (col.deferred) continue;                         // filled at save
      const raw = col.default;
      if (typeof raw === 'string') {
        if (raw.startsWith('$')) {
          const r = resolveToken(raw);
          if (r.set) out[col.name] = r.value;
        }
        // Non-$ string defaults are still codegen expressions ("'A'",
        // "datetime.now"), not clean values — skip until value/select handling.
      } else if (raw != null) {
        out[col.name] = raw;                              // scalar (bool/number)
      }
    }
    // 2) descriptor defaults, then 3) the caller's — from the least to the most
    // aware of the context: the column knows nothing about it, the form knows
    // the record, the view that opened the form knows why it is being added.
    applyDefaults(out, src?.defaults as Record<string, unknown> | undefined);
    applyDefaults(out, defaults);

    // A date given to a datetime (`$op_date` on `inizio`) is the day: the time
    // is the one it is now, so the user corrects minutes instead of typing hours.
    for (const [k, v] of Object.entries(out)) {
      if (!isDateOnly(v)) continue;
      const field = flatFields.find((f) => f.name === k);
      if (field && resolveWidget(field) === 'datetime') out[k] = withTimeNow(v);
    }
    return out;
  }

  // Author values: resolve $-tokens, keep literals as they are.
  function applyDefaults(out: Record<string, unknown>, map: Record<string, unknown> | undefined) {
    for (const [k, v] of Object.entries(map ?? {})) {
      if (typeof v === 'string' && v.startsWith('$')) {
        const r = resolveToken(v);
        if (r.set) out[k] = r.value;
      } else {
        out[k] = v;
      }
    }
  }

  async function loadData() {
    const src = view.source;
    loading = true;
    internalStatus = undefined;
    try {
      let res;
      if (isModelMode) {
        const id = resolveRecordId();
        if (id === null || id === undefined) {
          // Create mode: initialize with defaults, no load. A form that does not
          // own the record starts from the values it was handed — whoever owns it
          // computed the defaults already, and recomputing over them would undo
          // what the user has typed.
          const computed = computeCreateDefaults(src);
          const initial = persist ? computed : { ...computed, ...data };
          original = { ...initial };
          draft = { ...initial };
          errors = {};
          onEvent?.('form_new', { ...initial });
          return;
        }
        if (!persist) {
          // The frame above owns the record and has already read it — as part of
          // a tree, in one query per collection. Asking again would be a second
          // read of the same row, and a second answer to the same question.
          original = { ...data };
          draft = { ...original };
          errors = {};
          onEvent?.('form_load', { ...original });
          return;
        }
        res = await api.endpoint('db', { table: src!.model, method: 'get', id });
      } else {
        // Step B: endpoint-driven
        res = await api.endpoint(src!.endpoint!, resolvePass(src?.pass ?? {}));
      }
      if (res.status === 'success') {
        original = { ...(res.data as Record<string, unknown>) };
        draft = { ...original };
        errors = {};
        onEvent?.('form_load', { ...original });
      } else {
        internalStatus = { message: res.message ?? _('Error loading data'), type: 'error' };
      }
    } finally {
      loading = false;
      await tick();
      focusFirstField();
    }
  }

  // Reload when trigger or recordId genuinely changes.
  // - untrack(loadData): prevents accidental tracking of view.source etc.
  // - plain-var guard: prevents spurious re-runs when Svelte 5 re-sets props to same value
  //   (happens when parent StackContainer re-renders via spread {…page.props})
  $effect(() => {
    const _trigger = trigger;   // track trigger
    const _rid = recordId;      // track recordId
    void _rid;
    if (!isAsyncMode) return;
    if (hasTriggerDeps && _trigger === undefined) return;
    if (!_neverLoaded && _trigger === _seenTrigger && _rid === _seenRecordId) return;
    _seenTrigger = _trigger;
    _seenRecordId = _rid;
    _neverLoaded = false;
    untrack(() => loadData());
  });

  // ── Buttons: a face of this buffer, or an endpoint ─────────────────────────
  //
  // A button never reaches another record: what it opens belongs to the record
  // this form is editing, so the frame writes where this form writes and the save
  // stays at the root (relations.md §19.1). Two shapes of the same gesture —
  // a collection node inline, or a form descriptor by id — and a third that is
  // not a gesture on data at all: an endpoint.

  const stack = getContext<StackInstance>('kb:stack') ?? globalStack;

  /** Keys a button frame changed: they are part of the record, so they must ship. */
  let frameFields = $state<string[]>([]);

  /** Which button is waiting for its endpoint — the click is not repeatable. */
  let busyButton = $state<string | null>(null);

  const buttonKey = (node: ButtonNode) => node.id ?? node.label;

  /**
   * The count beside a label. Free: the rows are in the buffer already, which is
   * also its limit — a collection that is not buffered would need a query, and
   * that is a different decision (relations.md §15).
   */
  function countOf(count: boolean | string | undefined, fallback?: string): number | null {
    if (!count || !buffer) return null;
    const cid = count === true ? fallback : String(count);
    if (!cid) return null;
    return liveRows(buffer.node, cid).length;
  }

  function buttonCount(node: ButtonNode): number | null {
    const opens = node.opens;
    const cid = opens && opens.type === 'collection' ? (opens as CollectionNode).id : undefined;
    return countOf(node.count, cid);
  }

  /**
   * The descriptor of a frame that shows one collection and nothing else.
   *
   * No `source`: the frame edits no record of its own, which puts DataForm in its
   * local mode and keeps it from asking the database for something it was handed.
   * The grid takes the whole frame — inline it is a band in a form, here it is the
   * page.
   */
  function collectionFrame(node: CollectionNode): FormDescriptor {
    return {
      type: 'form',
      layout: [{ ...node, height: 'fill' } as CollectionNode],
      policy: { editable: isEditable, button_style: 'label' },
      actions: { toolbar: ['save', 'cancel'] },
    };
  }

  function openButton(node: ButtonNode) {
    if (node.endpoint) {
      runEndpoint(node);
      return;
    }
    const opens = node.opens;
    if (!opens) {
      console.error(`[DataForm] Button "${node.label}" neither opens anything nor names an endpoint.`);
      return;
    }
    if (opens.type === 'collection' && !buffer) {
      console.error(`[DataForm] Button "${node.label}" opens a collection, but this form holds no buffer.`);
      return;
    }

    // What the frame edits is the *draft*, not the loaded record: a value typed
    // here and not yet saved is what the other face must show.
    const before = { ...draft };

    stack.push(DataFormView, {
      formId: opens.type === 'form' ? (opens.page as string) : undefined,
      descriptor: opens.type === 'collection' ? collectionFrame(opens as CollectionNode) : undefined,
      title: node.label,
      data: { ...draft },
      buffer,
      onSaved: (values: Record<string, unknown>) => {
        // Only what moved: the frame hands back the whole record it was given,
        // and merging all of it would make every key look edited.
        for (const [key, value] of Object.entries(values)) {
          if (value === before[key]) continue;
          draft[key] = value;
          if (!frameFields.includes(key)) frameFields.push(key);
        }
      },
    });
  }

  async function runEndpoint(node: ButtonNode) {
    const key = buttonKey(node);
    if (busyButton) return;
    busyButton = key;
    internalStatus = undefined;
    try {
      const res = await api.endpoint(node.endpoint!, resolveRecordTokens(node.pass, draft));
      if (res.status === 'success') {
        internalStatus = { message: res.message ?? _('Done'), type: 'success' };
      } else {
        await msgbox.error(res.message ?? _('Error'));
      }
    } catch (e) {
      await msgbox.error(e instanceof Error ? e.message : String(e));
    } finally {
      busyButton = null;
    }
  }

  // ── Save / Cancel ──────────────────────────────────────────────────────────

  async function handleSave() {
    if (!validateAll()) {
      focusFirstError();
      return;
    }
    saving = true;
    internalStatus = undefined;
    try {
      const src = view.source;
      let res;

      if (isModelMode && persist) {
        // Step C: DB CRUD via standard endpoint — only send declared form fields,
        // plus what a button frame edited: those are fields of this record too,
        // declared in another descriptor, and dropping them would lose an edit
        // the user made through a button this form put on screen.
        const fieldNames = new Set([...flatFields.map(f => f.name), ...frameFields]);
        const payload = Object.fromEntries(Object.entries(draft).filter(([k]) => fieldNames.has(k)));
        const id = resolveRecordId();
        if (id === null || id === undefined) {
          res = await api.endpoint('db', { table: src!.model, method: 'create', data: payload });
        } else {
          res = await api.endpoint('db', { table: src!.model, method: 'update', id, data: payload });
        }
      } else if (src?.save_endpoint && persist) {
        // Step B: custom save endpoint
        res = await api.endpoint(src.save_endpoint, {
          ...resolvePass(src.pass ?? {}),
          data: { ...draft },
        });
      } else {
        // Step A: the record is someone else's to write — a caller holding local
        // data, or the frame that owns the aggregate. If it refuses, the form
        // stays dirty and says why, rather than looking saved.
        try {
          await onSave?.({ ...draft });
        } catch (e) {
          internalStatus = { message: e instanceof Error ? e.message : String(e), type: 'error' };
          return;
        }
        original = { ...draft };
        onEvent?.('form_save', { ...draft });
        return;
      }

      if (res.status !== 'success') {
        const errData = res.data as Record<string, unknown> | undefined;
        if (errData?.errors) {
          errors = errData.errors as Record<string, string>;
          focusFirstError();
        } else {
          internalStatus = { message: res.message ?? _('Error saving'), type: 'error' };
        }
        return;
      }

      // Merge saved data back if returned (e.g. server-assigned fields)
      if (res.data && typeof res.data === 'object') {
        original = { ...draft, ...(res.data as Record<string, unknown>) };
        draft = { ...original };
      } else {
        original = { ...draft };
      }
      for (const name of secretColumns) {
        delete original[name];
        delete draft[name];
      }
      internalStatus = { message: _('Saved'), type: 'success' };
      setTimeout(() => { if (internalStatus?.type === 'success') internalStatus = undefined; }, 3000);
      onEvent?.('form_save', { ...original });
      await onSave?.({ ...original });
    } finally {
      saving = false;
    }
  }

  // Esc reaches here too, and a key held down would otherwise stack dialogs: the
  // second `show()` takes the resolver of the first, and the first `await` never
  // returns — a form that quietly refuses to close.
  let confirming = $state(false);

  async function handleCancel() {
    if (confirming) return;
    if (dirty) {
      confirming = true;
      try {
        if (!(await msgbox.confirm(_('You have unsaved changes. Discard them?')))) return;
      } finally {
        confirming = false;
      }
    }
    draft = { ...original };
    errors = {};
    onCancel?.();
    onEvent?.('form_discard', { ...original });
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────

  function handleContainerKeydown(e: KeyboardEvent) {
    if (!isEditable) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      handleCancel();
    } else if (e.key === 'F12' || (e.key === 'Enter' && e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  }

  // Enter in a plain text/number input → advance to next focusable in field area
  function handleFieldAreaKeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (
      target instanceof HTMLInputElement &&
      target.type !== 'submit' &&
      target.type !== 'button'
    ) {
      e.preventDefault();
      advanceFocus(target);
    }
  }

  function advanceFocus(from: HTMLElement) {
    if (!fieldAreaEl) return;
    const focusables = Array.from(fieldAreaEl.querySelectorAll<HTMLElement>(FOCUSABLE_SEL));
    const idx = focusables.indexOf(from);
    if (idx >= 0 && idx < focusables.length - 1) {
      focusables[idx + 1].focus();
    }
  }

  // ── Focus management ───────────────────────────────────────────────────────

  let fieldAreaEl: HTMLDivElement;

  // Includes bits-ui DatePicker segments ([data-segment]) in addition to native inputs.
  const FOCUSABLE_SEL =
    'input:not([disabled]):not([readonly]):not([type="hidden"]), ' +
    'textarea:not([disabled]):not([readonly]), ' +
    '[data-segment]:not([data-segment="literal"])';

  function focusFirstField() {
    if (!isEditable || !fieldAreaEl) return;
    const autofocusName = view.source?.autofocus;
    if (autofocusName) {
      const el = fieldAreaEl.querySelector<HTMLElement>(`[data-field="${autofocusName}"] ${FOCUSABLE_SEL}`);
      el?.focus();
    } else {
      fieldAreaEl.querySelector<HTMLElement>(FOCUSABLE_SEL)?.focus();
    }
  }

  function focusFirstError() {
    if (!fieldAreaEl) return;
    const firstName = Object.keys(errors)[0];
    if (!firstName) return;
    fieldAreaEl.querySelector<HTMLElement>(`[data-field="${firstName}"] ${FOCUSABLE_SEL}`)?.focus();
  }

  // Local mode: focus at mount. Async modes: focus after loadData() completes.
  onMount(() => {
    if (!isAsyncMode) focusFirstField();
  });

  // ── Toolbar layout (policy overrides global defaults) ─────────────────────

  const formCfg = getConfig().form;
  let toolbarPosition = $derived(policy.toolbar_position ?? formCfg.toolbar_position);
  let buttonAlign = $derived(policy.button_align ?? formCfg.button_align);
  let buttonStyle = $derived(policy.button_style ?? formCfg.button_style);

  // ── Toolbar ────────────────────────────────────────────────────────────────

  let toolbarActions = $derived(
    (() => {
      const items = view.actions?.toolbar ?? (isEditable ? ['save', 'cancel'] : []);
      return items.map((item) => (typeof item === 'string' ? { id: item } : item));
    })()
  );

  const STATUS_ICON: Record<string, string> = {
    info: 'ℹ',
    warning: '⚠',
    error: '✕',
    success: '✓'
  };
  const STATUS_COLOR: Record<string, string> = {
    info: 'text-blue-600',
    warning: 'text-amber-600',
    error: 'text-danger',
    success: 'text-green-600'
  };
</script>

<!-- Container: F12 / Ctrl+Enter / Escape handled here -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="flex h-full flex-col overflow-hidden"
  onkeydown={handleContainerKeydown}
  role="region"
  aria-label={view.title ?? 'Form'}
>
  {#if showToolbar && toolbarPosition === 'top'}
    {@render toolbar('bottom')}
  {/if}

  <!-- ── Field area ──────────────────────────────────────────────────────── -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={fieldAreaEl}
    class="relative min-h-0 flex-1 overflow-y-auto p-4"
    onkeydown={handleFieldAreaKeydown}
    role="form"
  >
    {#if waitingForTrigger}
      <!-- Placeholder: trigger not yet arrived -->
      <div class="flex h-full items-center justify-center">
        <p style="color: var(--kb-text-subtle)" class="text-sm">
          {_('Select an item to view the detail.')}
        </p>
      </div>

    {:else if loading}
      <!-- Loading overlay -->
      <div class="flex h-full items-center justify-center gap-2"
           style="color: var(--kb-text-subtle)">
        <Loader size={16} class="animate-spin" />
        <span class="text-sm">{_('Loading…')}</span>
      </div>

    {:else if view.layout}
      {@render renderLayout(view.layout as LayoutNode[], groupLabel)}

    {:else}
      {#if fieldGroups.length === 0}
        <p class="text-sm" style="color: var(--kb-text-subtle)">
          {_('No fields configured.')}
        </p>
      {/if}

      {#each fieldGroups as group (group[0].name)}
        {#if group.length === 1}
          <div class="mb-4" data-field={group[0].name}>
            {@render fieldContent(group[0])}
          </div>
        {:else}
          <div class="mb-4 flex gap-4">
            {#each group as field (field.name)}
              <div style={fieldWidthStyle(field)} data-field={field.name}>
                {@render fieldContent(field)}
              </div>
            {/each}
          </div>
        {/if}
      {/each}
    {/if}
  </div>

  {#if showToolbar && toolbarPosition === 'bottom'}
    {@render toolbar('top')}
  {/if}
</div>

<!-- ── Toolbar snippet ───────────────────────────────────────────────────── -->
{#snippet toolbar(borderSide: 'top' | 'bottom')}
  <div
    class="flex flex-shrink-0 items-center gap-2 bg-gray-50 px-4 py-2
    {borderSide === 'top' ? 'border-t' : 'border-b'} border-gray-200"
  >
    {#if buttonAlign === 'right'}
      <!-- Status on LEFT (flex-1 absorbs space), buttons pinned RIGHT -->
      <div class="flex flex-1 items-center gap-2">
        {@render statusArea()}
        {#if toolbarExtra}{@render toolbarExtra()}{/if}
      </div>
      <div class="flex items-center gap-2">
        {@render actionButtons()}
      </div>
    {:else}
      <!-- Buttons on LEFT, status on RIGHT (flex-1 absorbs space) -->
      {@render actionButtons()}
      <div class="flex flex-1 items-center justify-end gap-3">
        {@render statusArea()}
        {#if toolbarExtra}{@render toolbarExtra()}{/if}
      </div>
    {/if}
  </div>
{/snippet}

<!-- ── Action buttons snippet ───────────────────────────────────────────── -->
{#snippet actionButtons()}
  {#if isEditable}
    {#each toolbarActions as action (action.id)}
      {#if action.id === 'save'}
        <button
          class="btn btn-primary py-1.5 text-xs"
          disabled={saving}
          onclick={handleSave}
          title={submit === 'confirm' ? _('Confirm (F12 or Ctrl+Enter)') : _('Save (F12 or Ctrl+Enter)')}
        >
          {#if buttonStyle === 'icon' || buttonStyle === 'icon-label'}
            <Check size={14} />
          {/if}
          {#if buttonStyle !== 'icon'}
            <!-- An intermediate frame confirms; only the root saves. Said the same
                 everywhere, the user at the third level believes it reached the
                 database (§12). -->
            {saving ? _('Saving…') : (action.label ?? (submit === 'confirm' ? _('Confirm') : _('Save')))}
          {/if}
        </button>
      {:else if action.id === 'cancel'}
        <button
          class="btn btn-secondary py-1.5 text-xs"
          disabled={saving}
          onclick={handleCancel}
          title={_('Cancel (Esc)')}
        >
          {#if buttonStyle === 'icon' || buttonStyle === 'icon-label'}
            <X size={14} />
          {/if}
          {#if buttonStyle !== 'icon'}
            {action.label ?? _('Cancel')}
          {/if}
        </button>
      {:else if action.id === 'separator'}
        <span class="mx-1 h-5 border-l border-gray-200"></span>
      {:else}
        <!-- Custom action — extended in Step B/C -->
        <button class="btn btn-secondary py-1.5 text-xs" disabled>
          {action.label ?? action.id}
        </button>
      {/if}
    {/each}
  {/if}
{/snippet}

<!-- ── Status area snippet ───────────────────────────────────────────────── -->
{#snippet statusArea()}
  {@const activeStatus = internalStatus ?? status}
  {#if activeStatus}
    <span class="flex items-center gap-1 text-xs {STATUS_COLOR[activeStatus.type ?? 'info']}">
      <span aria-hidden="true">{STATUS_ICON[activeStatus.type ?? 'info']}</span>
      {activeStatus.message}
    </span>
  {:else if dirty && isEditable}
    <span class="text-xs" style="color: var(--kb-text-subtle)">{_('Unsaved changes')}</span>
  {/if}
{/snippet}

<!-- ── Field content snippet ────────────────────────────────────────────── -->
{#snippet fieldContent(field: FormField)}
  {@const fieldReadonly = !isEditable || field.readonly === true || lockedColumns.has(field.name)}
  {@const error = errors[field.name]}
  {@const widgetType = resolveWidget(field)}

  <!-- The field's keys: F1 and Escape for its help, whatever widget it has.
       `contents`, so the wrapper changes nothing in the layout. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="contents" onkeydown={(e) => fieldKeys(e, field)}>

  <!-- Label (not for boolean — boolean has its own inline label) -->
  {#if widgetType !== 'boolean'}
    <label for="field-{field.name}" class="mb-1 block text-sm font-medium text-gray-700">
      {field.label ?? field.name}
      {#if field.required && isEditable}
        <span class="ml-0.5 text-danger">*</span>
      {/if}
      {@render help(field)}
    </label>
  {/if}

  <!-- Widget -->
  <div id="field-{field.name}">
    {#if widgetType === 'text' || widgetType === 'password'}
      <WidgetText
        value={draft[field.name]}
        onchange={(v) => patch(field.name, v)}
        onblur={() => validateField(field.name)}
        readonly={fieldReadonly}
        type={widgetType}
        {field}
      />
    {:else if widgetType === 'textarea'}
      <WidgetTextarea
        value={draft[field.name]}
        onchange={(v) => patch(field.name, v)}
        onblur={() => validateField(field.name)}
        readonly={fieldReadonly}
        {field}
      />
    {:else if widgetType === 'number'}
      <WidgetNumber
        value={draft[field.name]}
        onchange={(v) => patch(field.name, v)}
        onblur={() => validateField(field.name)}
        readonly={fieldReadonly}
        {field}
      />
    {:else if widgetType === 'date' || widgetType === 'datetime'}
      <WidgetDate
        value={draft[field.name]}
        onchange={(v) => patch(field.name, v)}
        onblur={() => validateField(field.name)}
        readonly={fieldReadonly}
        granularity={widgetType === 'datetime'
          ? ((field.granularity as 'hour' | 'minute' | 'second' | undefined) ?? 'minute')
          : 'day'}
        {field}
      />
    {:else if widgetType === 'time'}
      <WidgetText
        value={draft[field.name]}
        onchange={(v) => patch(field.name, v)}
        onblur={() => validateField(field.name)}
        readonly={fieldReadonly}
        type="time"
        {field}
      />
    {:else if widgetType === 'boolean'}
      <div class="flex items-center gap-3">
        <WidgetBoolean
          value={draft[field.name]}
          onchange={(v) => patch(field.name, v)}
          onblur={() => validateField(field.name)}
          readonly={fieldReadonly}
          {field}
        />
        <span class="text-sm font-medium text-gray-700">
          {field.label ?? field.name}
          {#if field.required && isEditable}
            <span class="ml-0.5 text-danger">*</span>
          {/if}
          {@render help(field)}
        </span>
      </div>
    {:else if widgetType === 'combobox'}
      <WidgetCombobox
        value={draft[field.name]}
        onchange={(v) => patch(field.name, v)}
        onblur={() => validateField(field.name)}
        readonly={fieldReadonly}
        {field}
      />
    {:else if widgetType === 'fk'}
      <WidgetFKCombobox
        value={draft[field.name]}
        onchange={(v) => patch(field.name, v)}
        onblur={() => validateField(field.name)}
        readonly={fieldReadonly}
        {field}
        filters={lookupFilters(field, draft)}
      />
    {:else if widgetType === 'json'}
      <WidgetJson
        value={draft[field.name]}
        onchange={(v) => patch(field.name, v)}
        onblur={() => validateField(field.name)}
        oninvalid={(m) => widgetInvalid(field.name, m)}
        readonly={fieldReadonly}
        {field}
      />
    {:else if widgetType.includes('.') && pluginLoader}
      <!-- A widget with a dot is a plugin's (`acl.access`), found as the
           components of `type: plugin` pages are. It gets the whole draft too:
           a plugin widget may show what other fields make of this one. -->
      <PluginComponent
        loader={pluginLoader}
        componentId={widgetType}
        value={draft[field.name]}
        onchange={(v: unknown) => patch(field.name, v)}
        onblur={() => validateField(field.name)}
        readonly={fieldReadonly}
        record={draft}
        {field}
      />
    {:else if widgetType === 'checklist'}
      <WidgetChecklist
        value={draft[field.name]}
        onchange={(v) => patch(field.name, v)}
        onblur={() => validateField(field.name)}
        readonly={fieldReadonly}
        {field}
      />
    {:else}
      <WidgetText
        value={draft[field.name]}
        onchange={(v) => patch(field.name, v)}
        onblur={() => validateField(field.name)}
        readonly={fieldReadonly}
        {field}
      />
    {/if}
  </div>

  <!-- Under the field only the error: the help is on request (FieldHelp) -->
  {#if error}
    <p class="mt-1 text-xs text-danger">{error}</p>
  {/if}
  </div>
{/snippet}

{#snippet help(field: FormField)}
  {#if field.help}
    <FieldHelp
      text={field.help as string}
      label={field.label ?? field.name}
      bind:open={() => helpOpen === field.name, (v) => (helpOpen = v ? field.name : null)}
    />
  {/if}
{/snippet}

<!-- ── Layout engine snippets ─────────────────────────────────────────────── -->

<!-- `groupLabel` is the name of what encloses these nodes — a tab — so a grid
     whose label moved onto the tab can still name the frame it opens. -->
{#snippet renderLayout(nodes: LayoutNode[], groupLabel: string | undefined)}
  {#each nodes as node}
    {#if 'name' in node}
      {#if !isFieldHidden((node as FormField).name)}
        <div class="mb-4" data-field={(node as FormField).name}>
          {@render fieldContent(node as FormField)}
        </div>
      {/if}
    {:else if node.type === 'collection'}
      {#if buffer}
        <CollectionView
          node={node as CollectionNode}
          agg={buffer.agg}
          parent={buffer.node}
          record={draft}
          readonly={!isEditable}
          fallbackLabel={groupLabel}
        />
      {/if}
    {:else if node.type === 'button'}
      {@render buttonNode(node as ButtonNode)}
    {:else if node.type === 'section'}
      {@render sectionNode(node as SectionNode)}
    {:else if node.type === 'hr'}
      <hr class="my-4" style="border-color: var(--kb-border)" />
    {:else if node.type === 'label'}
      {@render labelNode(node as LabelNode)}
    {:else if node.type === 'tabs'}
      {@render tabsNode(node as TabsNode)}
    {:else if node.type === 'row'}
      {@render rowNode(node as RowNode)}
    {/if}
  {/each}
{/snippet}

{#snippet columnFields(fields: (SectionField | FillerField)[])}
  <div class="flex flex-wrap" style="column-gap: var(--kb-form-gap, 1rem)">
    {#each fields.filter((i) => 'filler' in i || !isFieldHidden((i as SectionField).name)) as item}
      {#if 'filler' in item}
        <div style="flex: 0 0 100%; height: 0"></div>
      {:else}
        {@const f = item as SectionField}
        <div
          class="mb-4 min-w-0"
          style={columnFieldFlex(f.width)}
          data-field={f.name}
        >
          {@render fieldContent(f)}
        </div>
      {/if}
    {/each}
  </div>
{/snippet}

{#snippet sectionGrid(node: SectionNode)}
  {#if Array.isArray(node.columns)}
    {@const colDefs = node.columns as ColumnDef[]}
    <div class="flex gap-6" style="flex-wrap: wrap">
      {#each colDefs as col}
        <div style="flex: 1 1 var(--kb-form-col-min, 15rem); min-width: 0">
          {@render columnFields(col.fields)}
        </div>
      {/each}
    </div>
  {:else}
    {@const cols = (node.columns as number | undefined) ?? 1}
    <div
      class="grid gap-x-4 gap-y-0"
      style={cols === 1
        ? 'grid-template-columns: 1fr'
        : `grid-template-columns: repeat(auto-fit, minmax(max(calc(100% / ${cols} - 1rem), var(--kb-form-col-min, 15rem)), 1fr))`}
    >
      {#each ((node as any).fields ?? []) as field (field.name)}
        <div class="mb-4" data-field={field.name}>
          {@render fieldContent(field as FormField)}
        </div>
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet sectionNode(node: SectionNode)}
  {#if node.border}
    <fieldset
      class="mb-4 rounded px-4 pb-2 pt-1"
      style="border: 1px solid var(--kb-border)"
    >
      {#if node.label}
        <legend class="px-2 text-sm font-semibold" style="color: var(--kb-text)">
          {node.label}
        </legend>
      {/if}
      {@render sectionGrid(node)}
    </fieldset>
  {:else}
    <div class="mb-2">
      {#if node.label}
        <p class="mb-2 text-sm font-semibold" style="color: var(--kb-text)">{node.label}</p>
      {/if}
      {@render sectionGrid(node)}
    </div>
  {/if}
{/snippet}

{#snippet labelNode(node: LabelNode)}
  {#if node.style === 'heading'}
    <h3 class="mb-3 mt-1 text-base font-semibold" style="color: var(--kb-text)">{node.text}</h3>
  {:else if node.style === 'subheading'}
    <h4 class="mb-2 mt-1 text-sm font-semibold" style="color: var(--kb-text)">{node.text}</h4>
  {:else}
    <p class="mb-2 text-sm" style="color: var(--kb-text-subtle)">{node.text}</p>
  {/if}
{/snippet}

{#snippet tabsNode(node: TabsNode)}
  {@const tabKey = node.id ?? node.pages.map((p) => p.label).join('|')}
  {@const activeIdx = tabStates[tabKey] ?? 0}
  <div class="mb-4">
    {#if node.pages.length === 1}
      <!-- A strip with one tab reads as a mistake, and the container is there for
           a reason that has nothing to do with the reader: a collection lives in
           a `tabs` even alone, so a derived plugin can put a sibling next to it.
           So it wears the label of a band until a second page arrives — the same
           decision `TabView` already takes for a panel area. -->
      {@const only = node.pages[0]}
      {@const count = countOf(only.count)}
      <p class="mb-2 text-sm font-semibold" style="color: var(--kb-text)">
        {only.label}{#if count !== null}&nbsp;({count}){/if}
      </p>
      {@render renderLayout(only.layout, only.label)}
    {:else}
    <div class="flex border-b" style="border-color: var(--kb-border)">
      {#each node.pages as page, i}
        {@const count = countOf(page.count)}
        <button
          type="button"
          class="-mb-px border-b-2 px-4 py-2 text-sm transition-colors"
          style={i === activeIdx
            ? 'border-color: var(--kb-brand, #3b82f6); color: var(--kb-brand, #3b82f6); font-weight: 500'
            : 'border-color: transparent; color: var(--kb-text-subtle)'}
          onclick={() => { tabStates[tabKey] = i; }}
        >
          <!-- The count answers what an empty tab costs to discover: a click. -->
          {page.label}{#if count !== null}&nbsp;({count}){/if}
        </button>
      {/each}
    </div>
    {#each node.pages as page, i}
      <div class={i === activeIdx ? 'pt-4' : 'hidden'}>
        {@render renderLayout(page.layout, page.label)}
      </div>
    {/each}
    {/if}
  </div>
{/snippet}

{#snippet buttonNode(node: ButtonNode)}
  {@const count = buttonCount(node)}
  {@const Icon = resolveIcon(node.icon)}
  <div class="mb-4">
    <button
      type="button"
      class="btn btn-secondary py-1.5 text-xs"
      disabled={busyButton !== null}
      onclick={() => openButton(node)}
    >
      {#if Icon}<Icon size={14} />{/if}
      {node.label}{#if count !== null}&nbsp;({count}){/if}
    </button>
  </div>
{/snippet}

{#snippet rowNode(node: RowNode)}
  <div class="mb-4 flex gap-4">
    {#each node.children as col}
      <div style="flex: {col.weight ?? 1} 1 0; min-width: 0">
        {@render renderLayout(col.layout, groupLabel)}
      </div>
    {/each}
  </div>
{/snippet}
