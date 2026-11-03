/**
 * Core API types for Kitebase backend.
 * UserContext mirrors the JWT payload configured in config.yaml → authentication.context_fields
 */

export interface UserContext {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  is_admin: boolean;
  // Operational ("working") date (YYYY-MM-DD), present only when the user chose
  // one via updateContext; absent = today (authStore.opDate).
  op_date?: string;
  // Multi-tenancy (optional — only present when multi_tenant.enabled)
  tenant_id?: number;
  tenant_prefix?: string | null;
  // Arbitrary extra context — the backend merges any fields sent via update_context
  // into the JWT payload, so wizard state, UI preferences, etc. can be stored here.
  [key: string]: unknown;
}

/** Fields sent to update_context; null removes the field from the context. */
export type ContextUpdate = { [K in keyof UserContext]?: UserContext[K] | null };

export interface LoginCredentials {
  username: string;
  password: string;
}

/**
 * What the rules of a write had to say (kitebase.flow on the server). A
 * question arrives on a refusal (a caller that does not know the protocol
 * never takes it for a save), and `callJudged` turns it into the dialog and
 * the call sent again with the answer.
 */
export interface FlowQuestion {
  key: string;
  kind: 'confirm' | 'choose' | 'form' | 'file';
  text?: string;
  /** The labels of a confirm: they say what each answer does. */
  yes?: string;
  no?: string;
  /** The options of a choose. */
  options?: Array<{ value: unknown; label: string }>;
  /** The view of a form, and its first values: the answer is what was typed. */
  view?: Record<string, unknown>;
  values?: Record<string, unknown>;
  /** The extensions the picker of a file offers. */
  accept?: string[];
}

export interface Flow {
  ask?: FlowQuestion;
  /** Lines for the person, shown with the outcome. */
  info?: string[];
  /** On a refusal, the values the form takes all the same. */
  patch?: Record<string, unknown>;
  /** Once saved: what the client does next, in the `resultAction` vocabulary. */
  actions?: Array<Record<string, unknown>>;
}

export interface APIResponse<T = unknown> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
  flow?: Flow;
  /** The person dismissed a question: nothing was written, nothing failed. */
  cancelled?: boolean;
  /** Exception class name from Python (e.g. "ValueError", "ScannerError") */
  error_type?: string;
  /** Full Python traceback — always present on server-side errors */
  traceback?: string;
  /** The id of the request in the server's log, on an error */
  request_id?: string;
}

export interface AuthResponse {
  status: 'success' | 'error';
  token?: string;
  user?: UserContext;
  message?: string;
}
