/**
 * Kitebase API client — Axios-based, JWT-aware.
 *
 * Design:
 * - Two dedicated routes handle JWT generation (login, update_context).
 * - All other operations go through POST /{endpointPrefix}/{op}.
 * - Auto-injects Bearer token from localStorage on every request.
 * - Handles X-New-Token header: server silently refreshes token every ~20 min.
 * - Dispatches 'kitebase:unauthorized' on 401 (token expired/invalid).
 */

import axios from 'axios';
import type { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { config } from '../config';
import { statusBar } from '../status/statusBar.svelte';
import type { LoginCredentials, AuthResponse, APIResponse, ContextUpdate } from './types';
import type { ClientInfo } from '../auth/host';
import { filenameOf } from './disposition';
import { errorOf } from './envelope';

const TOKEN_KEY = 'kitebase_token';
const TIMEOUT = 10000;
// A file is built while the request waits: an export at its ceiling takes
// seconds, not the fraction of a second a query does.
const DOWNLOAD_TIMEOUT = 120000;
// auth/token is asked by the host's cookie, and answers 401 when there is no
// session: that is an answer for whoever asked, not an expired session.
const HOST_TOKEN_ROUTE = '/auth/token';
const AUTH_ROUTES = ['/auth/login', HOST_TOKEN_ROUTE];

class KitebaseAPI {
  private client: AxiosInstance;
  // Renews the token on a 401 (from the host's session); null = no renewal.
  private renewer: (() => Promise<string | null>) | null = null;
  private renewing: Promise<string | null> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: config.api.root,
      timeout: TIMEOUT,
      headers: { 'Content-Type': 'application/json' }
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request: inject Bearer token
    this.client.interceptors.request.use((req) => {
      const token = this.getToken();
      if (token && req.headers) {
        req.headers.Authorization = `Bearer ${token}`;
      }
      return req;
    });

    // Response: handle token refresh + 401
    this.client.interceptors.response.use(
      (res) => {
        const newToken = res.headers['x-new-token'];
        if (newToken) {
          this.setToken(newToken);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('kitebase:token-refreshed', { detail: newToken }));
          }
        }
        return res;
      },
      async (err: AxiosError) => {
        const req = err.config as (InternalAxiosRequestConfig & { _kitebaseRenewed?: boolean }) | undefined;
        if (err.response?.status === 401 && req && !req._kitebaseRenewed
            && this.renewer && !AUTH_ROUTES.includes(req.url ?? '')) {
          // One more try with a token renewed from the host's session: its
          // cookie may outlive the JWT, and then nobody needs to log in again.
          // Requests failing together share one renewal.
          req._kitebaseRenewed = true;
          this.renewing ??= this.renewer().finally(() => (this.renewing = null));
          const token = await this.renewing;
          if (token) {
            req.headers.Authorization = `Bearer ${token}`;
            return this.client(req);
          }
        }
        if (err.response?.status === 401 && req?.url !== HOST_TOKEN_ROUTE) {
          this.clearToken();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('kitebase:unauthorized'));
          }
        }
        return Promise.reject(err);
      }
    );
  }

  // ── Token management ──────────────────────────────────────────────────────

  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  }

  setToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TOKEN_KEY, token);
  }

  clearToken(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
  }

  setRenewer(renewer: (() => Promise<string | null>) | null): void {
    this.renewer = renewer;
  }

  // ── Authentication — dedicated routes (server needs SECRET_KEY for JWT) ──

  /** The `client` section of /info: who logs people in. null when unreadable. */
  async clientInfo(): Promise<ClientInfo | null> {
    try {
      const res = await this.client.get<any>('/info');
      return res.data?.data?.client ?? null;
    } catch {
      return null;
    }
  }

  /** A token for the user of the host's session, saved; null without one. */
  async hostToken(): Promise<string | null> {
    try {
      const res = await this.client.post<any>(HOST_TOKEN_ROUTE, {});
      const token: string | undefined = res.data?.data?.token;
      if (!token) return null;
      this.setToken(token);
      return token;
    } catch {
      return null;
    }
  }

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const res = await this.client.post<any>('/auth/login', credentials);
      const d = res.data;
      if (d?.status === 'success' && d?.data?.token) {
        this.setToken(d.data.token);
        return { status: 'success', token: d.data.token, user: d.data.user };
      }
      return { status: 'error', message: d?.message ?? 'Login failed' };
    } catch (err: any) {
      return { status: 'error', message: err.response?.data?.message ?? 'Login failed' };
    }
  }

  /**
   * Switch context (e.g. change tenant).
   * The server validates the request and returns a new JWT with updated payload.
   */
  async updateContext(context: ContextUpdate): Promise<AuthResponse> {
    try {
      const res = await this.client.post<any>('/auth/update_context', context);
      const d = res.data;
      if (d?.status === 'success' && d?.data?.token) {
        this.setToken(d.data.token);
        return { status: 'success', token: d.data.token, user: d.data.user };
      }
      return { status: 'error', message: d?.message ?? 'Context update failed' };
    } catch (err: any) {
      return { status: 'error', message: err.response?.data?.message ?? 'Context update failed' };
    }
  }

  logout() {
    this.clearToken();
  }

  // ── Generic endpoint dispatcher — all data operations ─────────────────────
  //
  // All Kitebase operations (db CRUD, query, get_type_schema, ...)
  // go through POST /{endpointPrefix}/{operation}.
  //
  // Examples:
  //   api.endpoint('db', { table: 'User', method: 'get' })
  //   api.endpoint('db', { table: 'User', method: 'get', id: 1 })
  //   api.endpoint('db', { table: 'User', method: 'create', data: {...} })
  //   api.endpoint('db', { table: 'User', method: 'update', id: 1, data: {...} })
  //   api.endpoint('db', { table: 'User', method: 'delete', id: 1 })
  //   api.endpoint('query', { format: 'dict', query: { table: 'User', ... } })
  //   api.endpoint('get_type_schema', { include_builtin: false })

  async endpoint<T>(operation: string, data: unknown = {}): Promise<APIResponse<T>> {
    try {
      const res = await this.client.post<any>(
        `/${config.api.endpointPrefix}/${operation}`,
        data
      );
      const d = res.data;
      // Ambient status line: the server may carry a standard `$message`; when it
      // doesn't, a prior server message is stale and gets dropped. Client
      // messages persist across endpoint calls (statusBar owns that rule).
      const sm = d?.['$message'];
      if (sm?.text) statusBar.fromServer(sm);
      else statusBar.clearServer();
      if (d?.status === 'success') {
        // A success may carry a line of its own — an endpoint called from a
        // button reports what it did. Distinct from `$message`, which is the
        // framework's ambient status line and belongs to no caller.
        return { status: 'success', data: d.data, message: d.message, flow: d['$flow'] };
      }
      return errorOf<T>(d);
    } catch (err: any) {
      // A refusal is a 4xx or a 5xx, so it lands here: its body is the same
      // envelope, field errors and request id included.
      return errorOf<T>(err.response?.data, 'Request failed');
    }
  }

  // ── Files — POST /download/{operation} ────────────────────────────────────
  //
  // An operation whose answer is a file. Same endpoints and token as the
  // dispatcher; the bytes arrive as a blob and the browser saves them, or
  // opens them in a tab when the server says `inline` (a PDF to preview).
  // Nothing is kept: the blob URL is released once the browser has it.
  //
  //   api.download('export_file', { query, ids, columns, format: 'xlsx' })

  async download(operation: string, data: unknown = {}): Promise<APIResponse<null>> {
    try {
      const res = await this.client.post<Blob>(`/download/${operation}`, data, {
        responseType: 'blob',
        timeout: DOWNLOAD_TIMEOUT,
      });
      const header = String(res.headers['content-disposition'] ?? '');
      deliver(res.data, filenameOf(header) ?? operation, header.startsWith('inline'));
      return { status: 'success', data: null };
    } catch (err: any) {
      // A refusal comes back as JSON, read here as a blob like the file would be.
      return errorOf<null>(await jsonOf(err.response?.data), 'Request failed');
    }
  }

  // ── Media — POST /upload ──────────────────────────────────────────────────
  //
  // A file for a media column, multipart. The server checks the bytes,
  // allocates the path and answers `{ref, url}` for an Image or File column:
  // the form saves `ref` like any value, the upload writes nothing in the row.
  // `id` is absent for a record not saved yet.

  async upload<T = { ref: string; url: string }>(
    table: string, field: string, id: number | string | null | undefined, file: Blob, filename: string,
  ): Promise<APIResponse<T>> {
    const form = new FormData();
    form.append('table', table);
    form.append('field', field);
    if (id !== null && id !== undefined) form.append('id', String(id));
    form.append('file', file, filename);
    try {
      // The browser writes the multipart boundary itself, once the JSON
      // default is out of the way.
      const res = await this.client.post<any>('/upload', form, {
        headers: { 'Content-Type': undefined },
        timeout: DOWNLOAD_TIMEOUT,
      });
      const d = res.data;
      if (d?.status === 'success') return { status: 'success', data: d.data };
      return errorOf<T>(d);
    } catch (err: any) {
      return errorOf<T>(err.response?.data, 'Upload failed');
    }
  }
}

function deliver(blob: Blob, filename: string, inline: boolean): void {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(blob);
  if (inline) {
    window.open(url, '_blank');
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  // Released later rather than at once: the browser reads the URL after the
  // click returns, and an opened tab needs it to load.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function jsonOf(body: unknown): Promise<any> {
  try {
    return body instanceof Blob ? JSON.parse(await body.text()) : body;
  } catch {
    return null;
  }
}

export const api = new KitebaseAPI();
