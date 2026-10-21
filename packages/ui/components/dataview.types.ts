/**
 * dataview.types.ts — shared type definitions for DataView and related components.
 *
 * Centralised here to avoid circular imports between DataView.svelte,
 * DataViewNavigator.svelte, DataViewTable.svelte, and dataview.query.ts.
 */

export interface ViewSource {
  model?: string;
  endpoint?: string;
  joins?: Array<string | Record<string, unknown>>;
  where?: unknown[];
  filters?: unknown;
  /**
   * Permanent WHERE of the view, always ANDed with `filters`. Same syntax as
   * `filters`. What separates the two is who may change them: `filters` is the
   * starting point of a query the user can rework, `domain` is what the view
   * *is* — the customers list shows customers, and there is no "show all".
   */
  domain?: unknown;
  /** Initial values for records created from this view (see DataForm). */
  defaults?: Record<string, unknown>;
  order_by?: string[];
  group_by?: string[];
  limit?: number;
  [key: string]: unknown;
}

/**
 * A list column as the YAML writes it: lowercase with underscores, like every
 * other key. DataView turns it into Tabulator's names (minWidth, hozAlign,
 * formatterParams), which stay inside the grid.
 */
export interface ViewColumn {
  field: string;           // QB select expression or plain field name
  title?: string;
  width?: number | string;
  min_width?: number;
  max_width?: number;
  align?: 'left' | 'center' | 'right';
  formatter?: 'date' | 'datetime' | 'time' | string;
  formatter_params?: Record<string, unknown>;
  visible?: boolean;
  frozen?: boolean;
  [key: string]: unknown;
}

export interface ViewActions {
  toolbar?: string[];
  row?: Array<Record<string, unknown>>;
  commands?: Array<Record<string, unknown>>;
}

export interface ViewPolicy {
  selection?: boolean;
  editable?: boolean;
  user_customizable?: boolean;
}

export interface ViewTreeConfig {
  parent_field?: string;
  child_field?: string;
  start_expanded?: boolean;
}

export interface CommandItem {
  id: string;
  /** What the command is called; default its id as words: `print_balance` is "Print balance". */
  label?: string;
  icon?: string;       // lucide name, for a promoted button
  scope?: 'row' | 'selection' | 'global';
  /**
   * Every command lives in the navigator's [⚡] menu; `toolbar: true` also
   * promotes it to a button of its own, for the gesture a view is used for.
   */
  toolbar?: boolean;
  /** One key that runs it while the grid has the focus — shown as "(A)". */
  key?: string;
  endpoint?: string;   // endpoint to call when activated
  /** `view`: the call also carries the rows on screen, in order, as `view_ids`. */
  rows?: 'view';
  params?: Record<string, unknown>;  // sent along with the view's context
  [key: string]: unknown;
}

export interface NavigatorConfig {
  form_id?: string;    // default: {model.lower()}_form
  handler?: string;    // view_handler chain name
  show?: string[];     // add to defaults
  hide?: string[];     // remove from defaults
  commands?: CommandItem[];
  /**
   * Internal only — set programmatically, never from YAML.
   *   lookup   — picking a record for a caller (FK picker)
   *   batch    — accept/cancel over computed rows (wizard steps)
   *   buffered — the rows belong to an aggregate: the gestures are emitted as
   *              events and whoever owns the buffer performs them
   */
  mode?: 'browser' | 'lookup' | 'readonly' | 'batch' | 'buffered';
}

export interface ViewDescriptor {
  type: 'table' | 'tree' | 'kanban' | 'cards' | string;
  title?: string;
  source?: ViewSource;
  columns?: ViewColumn[];
  actions?: ViewActions;
  policy?: ViewPolicy;
  tree?: ViewTreeConfig;
  navigator?: boolean | NavigatorConfig;
  /**
   * Rules the view opens with, which the user sees in the filter panel and can
   * change or remove: unlike `source.filters`, a starting point and not a
   * limit. `[{field: returned_on, op: empty}]`; joined by AND.
   */
  rules?: Array<{ field: string; op: string; value?: unknown }>;
  /** List of available view types for the toolbar switcher (e.g. ['table','kanban']). */
  allow_views?: string[];
  data_schema?: string;  // schema ID from plugin schemas: section
  [key: string]: unknown;
}

/** The name of a command: its label, or its id as words, capitalised. */
export function commandLabel(cmd: CommandItem): string {
  if (cmd.label) return cmd.label;
  const words = cmd.id.replace(/_+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
