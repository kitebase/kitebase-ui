/**
 * Auth store — Svelte 5 runes.
 *
 * Usage:
 *   import { authStore } from '$kitebase/auth/store.svelte';
 *
 *   await authStore.start()         // in onMount of a guard: true = signed in
 *   authStore.toLogin()             // to the login page: the client's or the host's
 *   authStore.leave()               // sign out, through the host's logout if any
 *   authStore.checkAuth()           // restore the saved token only (playground)
 *   await authStore.login(creds)    // returns true on success
 *   authStore.logout()              // forget the token, stay here
 *   await authStore.updateContext({ tenant_prefix: 'test' })
 *
 *   authStore.user                  // UserContext | null
 *   authStore.isAuthenticated       // boolean (derived)
 *   authStore.isLoading             // boolean
 *   authStore.error                 // string | null
 */

import { jwtDecode } from 'jwt-decode';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { api } from '../api/client';
import { config } from '../config';
import { hostPage, nextOf, startToken, type ClientInfo } from './host';
import type { UserContext, LoginCredentials, ContextUpdate } from '../api/types';

/** Today as local YYYY-MM-DD (not UTC), like the server's default op_date. */
export const localToday = () => new Date().toLocaleDateString('sv-SE');

class AuthStore {
  user = $state<UserContext | null>(null);
  isAuthenticated = $derived(this.user !== null);
  isLoading = $state(false);
  error = $state<string | null>(null);
  // The `client` section of /info, read once by start(): who logs people in.
  client = $state<ClientInfo | null>(null);
  hostLogin = $derived(this.client?.login ?? null);

  constructor() {
    if (typeof window !== 'undefined') {
      // A 401 the host's session could not cure (see api.setRenewer).
      api.setRenewer(() => (this.hostLogin ? api.hostToken() : Promise.resolve(null)));

      // 401 — session expired or token rejected by server
      window.addEventListener('kitebase:unauthorized', () => {
        // Clear the now-invalid token: leaving it in localStorage lets the
        // landing route re-apply it and bounce back to an apparently
        // logged-in state.
        api.logout();
        this.user = null;
        this.error = 'Session expired. Please sign in again.';
        if (this.hostLogin) this.toLogin();
        else goto(resolve('/'));
      });
    }
  }

  /**
   * Find out who is signed in, at startup. With a host login (client.login)
   * the host's session decides through auth/token, whatever token is saved;
   * otherwise the saved token, as checkAuth(). Call from onMount in a guard.
   */
  async start(): Promise<boolean> {
    this.client ??= await api.clientInfo();
    const token = await startToken(this.client, {
      hostToken: () => api.hostToken(),
      savedToken: () => api.getToken()
    });
    if (token) {
      this._applyToken(token);
    } else {
      api.logout();
      this.user = null;
    }
    return this.isAuthenticated;
  }

  /** To the login page: the host's, coming back here after, or the client's. */
  toLogin(): void {
    if (this.hostLogin) {
      const origin = config.api.hostOrigin;
      window.location.replace(hostPage(this.hostLogin, origin, nextOf(window.location, origin)));
    } else {
      goto(resolve('/login'), { replace: true });
    }
  }

  /**
   * Sign out. With a host login the host's session has to end too, or
   * auth/token would hand a token straight back: through client.logout.
   */
  leave(): void {
    this.logout();
    const page = this.client?.logout;
    if (page) window.location.assign(hostPage(page, config.api.hostOrigin));
    else this.toLogin();
  }

  // Decode JWT and update user state (client-side only — no signature check).
  // Expiry (`exp`) IS enforced: a stale token must not re-authenticate the
  // user after the server has already rejected the session with a 401.
  private _applyToken(token: string): void {
    try {
      type JwtPayload = UserContext & { exp?: number; iat?: number };
      const { exp, iat: _iat, ...user } = jwtDecode<JwtPayload>(token);
      if (exp && exp * 1000 <= Date.now()) {
        api.logout();
        this.user = null;
        return;
      }
      this.user = user as UserContext;
    } catch {
      api.logout();
      this.user = null;
    }
  }

  /**
   * Restore session from localStorage on app startup.
   * Call from onMount in the root layout.
   */
  checkAuth(): void {
    const token = api.getToken();
    if (token) {
      this._applyToken(token);
    } else {
      this.user = null;
    }
  }

  async login(credentials: LoginCredentials): Promise<boolean> {
    this.isLoading = true;
    this.error = null;
    try {
      const res = await api.login(credentials);
      if (res.status === 'success' && res.token) {
        this._applyToken(res.token);
        return true;
      }
      this.error = res.message ?? 'Login failed';
      return false;
    } catch (err: any) {
      this.error = err.message ?? 'Network error';
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  /** Operational date: the one the user chose, otherwise today. */
  get opDate(): string {
    return this.user?.op_date ?? localToday();
  }

  /** The user chose the operational date: it stays until reset to today. */
  get opDateChosen(): boolean {
    return this.user?.op_date != null;
  }

  logout(): void {
    api.logout();
    this.user = null;
    this.error = null;
  }

  /**
   * Switch context (e.g. change tenant).
   * Requests a new JWT from the server with the updated payload.
   */
  async updateContext(context: ContextUpdate): Promise<boolean> {
    try {
      const res = await api.updateContext(context);
      if (res.status === 'success' && res.token) {
        this._applyToken(res.token);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

export const authStore = new AuthStore();
