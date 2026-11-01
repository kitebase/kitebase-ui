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

export interface APIResponse<T = unknown> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
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
