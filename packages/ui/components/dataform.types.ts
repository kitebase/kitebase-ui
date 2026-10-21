/**
 * dataform.types.ts — type definitions for DataForm and widget components.
 *
 * Step A: flat field list, local binding (source.data).
 * Step B: endpoint-driven (source.endpoint).
 * Step C: DB CRUD (source.model / source.id).
 */

export interface FormFieldChoice {
  value: unknown;
  label: string;
}

// ── Field descriptor ───────────────────────────────────────────────────────

export interface FormField {
  name: string;
  label?: string;
  help?: string;
  widget?: string;           // explicit widget override
  type?: string;             // data type (for widget auto-resolution)
  required?: boolean;
  readonly?: boolean;
  placeholder?: string;
  choices?: FormFieldChoice[]; // for combobox with local data (Step A) or enum
  widget_props?: Record<string, unknown>;
  // Layout
  same_row?: boolean;        // true → joins the previous field's row (inline)
  width?: number | string;   // px (number) or "30%" (string); absent → flex-1
  [key: string]: unknown;
}

// Row grouping: fields on the same line (Phase 2)
export interface FormFieldRow {
  row: FormField[];
}

// Group: collapsible section with header (Phase 2)
export interface FormFieldGroup {
  group: string;
  collapsible?: boolean;
  fields: Array<FormField | FormFieldRow | FormFieldGroup>;
}

export type FormFieldEntry = FormField | FormFieldRow | FormFieldGroup;

// ── Source ─────────────────────────────────────────────────────────────────

export interface FormSource {
  // Mode 4: local binding — resolved by parent before passing to DataForm
  data?: Record<string, unknown>;
  // Mode 1: edit existing record
  // Mode 2: new record (id: null)
  model?: string;
  id?: unknown;
  defaults?: Record<string, unknown>;
  autofocus?: string;         // field name to focus on mount
  // Mode 3: endpoint-driven
  endpoint?: string;
  pass?: Record<string, unknown>;
  save_endpoint?: string;
}

// ── Actions ────────────────────────────────────────────────────────────────

export interface FormToolbarAction {
  id: string;
  label?: string;
  icon?: string;
  action?: string;
  confirm?: string;
  [key: string]: unknown;
}

export interface FormActions {
  toolbar?: Array<string | FormToolbarAction>;
}

// ── Policy ─────────────────────────────────────────────────────────────────

export interface FormPolicy {
  editable?: boolean;
  toolbar_position?: 'top' | 'bottom';
  button_align?: 'left' | 'right';
  button_style?: 'label' | 'icon' | 'icon-label';
}

// ── Layout engine node types ───────────────────────────────────────────────

/**
 * A field inside a column — width can be '30%', '80px', a number of px, or
 * omitted (fills what is left). A percentage is a share of the line with the
 * gap already taken out of it, so shares that add up to 100% fit on one line.
 */
export interface SectionField extends FormField {
  width?: string | number;
}

/** Zero-height flex item that forces the next field to a new row. YAML: `- filler:` */
export interface FillerField {
  filler: null;
}

export interface ColumnDef {
  /** Identity for the merge — without it a derived plugin can only append a column. */
  id?: string;
  fields: (SectionField | FillerField)[];
}

export interface SectionNode {
  type: 'section';
  id?: string;
  label?: string;
  border?: boolean;
  /** number → legacy uniform grid; ColumnDef[] → explicit column-first layout */
  columns?: number | ColumnDef[];
}

export interface HrNode {
  type: 'hr';
}

export interface LabelNode {
  type: 'label';
  text: string;
  style?: 'heading' | 'subheading' | 'normal';
}

export interface TabPage {
  /** Identity for the merge: a derived plugin refines *this* page by naming it. */
  id?: string;
  label: string;
  /** Collection id whose buffered row count is shown beside the label. */
  count?: string;
  layout: LayoutNode[];
}

export interface TabsNode {
  type: 'tabs';
  id?: string;
  pages: TabPage[];
}

/**
 * A collection edited inside its parent's form, buffered in the parent's
 * transaction. `model` and `fk` are facts of persistence — the table written and
 * the column that points back at the parent — while `view` only says how the rows
 * look. The row form defaults to `{model}_form`.
 */
export interface CollectionNode {
  type: 'collection';
  id: string;
  label?: string;
  model: string;
  fk: string;
  form?: string;
  domain?: unknown;
  defaults?: Record<string, unknown>;
  /** Initial values of a new row, `$record.x` read from the parent's draft; editable. */
  prefill?: Record<string, unknown>;
  view?: Record<string, unknown>;
  /** Grid height: a CSS length, or `fill` to take what the container gives. */
  height?: string;
}

/**
 * A button in a form: it opens a **face of this buffer**, or it *does* something.
 *
 * Both faces are the same gesture at two depths of the buffer — `opens.type:
 * collection` opens a subtree, `opens.type: form` opens the record itself with
 * fewer fields — so both write where the form writes and the save stays at the
 * root. Reaching *another* record is deliberately not here: the FK widget already
 * carries that gesture (relations.md §19.1).
 */
export interface ButtonOpensCollection extends CollectionNode {}

export interface ButtonOpensForm {
  type: 'form';
  /** Page id of a form descriptor over the same record. */
  page: string;
}

export interface ButtonNode {
  type: 'button';
  id?: string;
  label: string;
  icon?: string;
  /** `true` → the collection this button opens; a string → that collection id. */
  count?: boolean | string;
  opens?: ButtonOpensCollection | ButtonOpensForm;
  /** The other family: an endpoint, with `$record.x` resolved against the draft. */
  endpoint?: string;
  pass?: Record<string, unknown>;
}

export interface ColNode {
  type: 'col';
  id?: string;
  weight?: number;
  layout: LayoutNode[];
}

export interface RowNode {
  type: 'row';
  id?: string;
  children: ColNode[];
}

export type LayoutNode =
  FormField | SectionNode | HrNode | LabelNode | TabsNode | RowNode | CollectionNode | ButtonNode;

// ── Top-level descriptor ────────────────────────────────────────────────────

export interface FormDescriptor {
  type: 'form';
  title?: string;
  /**
   * Where a form asked for by an operation opens (the `form` step of
   * `applyResult`): a page on the stack, the default, or a dialog. A dialog
   * has no stack, so its lookups keep the list and lose "Search more…".
   */
  presentation?: 'page' | 'dialog';
  source?: FormSource;
  fields?: FormFieldEntry[];   // legacy flat list (backward compat)
  layout?: LayoutNode[];       // new layout engine — takes precedence over fields
  actions?: FormActions;
  policy?: FormPolicy;
  data_schema?: string;        // schema ID from plugin schemas: section
  [key: string]: unknown;
}

// ── Toolbar status ──────────────────────────────────────────────────────────

export type FormStatusType = 'info' | 'warning' | 'error' | 'success';

export interface FormStatus {
  message: string;
  type?: FormStatusType;
}

// ── Widget contract ─────────────────────────────────────────────────────────
// Implemented by every WidgetXxx.svelte.

export interface WidgetProps {
  value: unknown;
  onchange: (v: unknown) => void;
  onblur?: () => void;    // optional: called on blur for validation trigger
  readonly?: boolean;
  field: FormField;
}
