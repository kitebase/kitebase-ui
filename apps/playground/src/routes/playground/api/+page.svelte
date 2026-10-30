<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$kitebase/auth/store.svelte';
  import { api } from '$kitebase/api/client';

  let username = $state('admin');
  let password = $state('admin');
  let loginLoading = $state(false);
  let loginError = $state<string | null>(null);

  interface Result {
    title: string;
    status: string;
    data?: unknown;
    ts: string;
  }
  let results = $state<Result[]>([]);

  function add(title: string, status: string, data?: unknown) {
    results = [{ title, status, data, ts: new Date().toLocaleTimeString() }, ...results];
  }

  async function handleLogin() {
    loginLoading = true;
    loginError = null;
    try {
      const ok = await authStore.login({ username, password });
      if (ok) {
        add('Login', 'success', { user: authStore.user });
      } else {
        loginError = authStore.error ?? 'Login failed';
        add('Login', 'error', { error: loginError });
      }
    } finally {
      loginLoading = false;
    }
  }

  function handleLogout() {
    authStore.logout();
    add('Logout', 'success');
  }

  async function testListUsers() {
    const res = await api.endpoint('db', { table: 'User', method: 'get' });
    add('List Users (POST /endpoint/db)', res.status, res.data ?? res.message);
  }

  async function testQuery() {
    const res = await api.endpoint('query', {
      format: 'dict',
      query: {
        table: 'User',
        fields: ['id', 'username', 'email'],
        filters: [{ field: 'is_active', operator: '=', value: true }],
        limit: 5
      }
    });
    add('Query — Active Users (POST /endpoint/query)', res.status, res.data ?? res.message);
  }

  async function testCRUD() {
    const username_test = `test_${Date.now()}`;
    interface UserRecord { id: number; username: string; password?: string; email: string; is_active: boolean; is_admin: boolean; }

    // Create
    const created = await api.endpoint<UserRecord>('db', {
      table: 'User', method: 'create',
      data: { name: username_test, username: username_test, password: 'test123', email: `${username_test}@example.com`, is_active: true, is_admin: false }
    });
    add('CRUD — Create User', created.status, created.data ?? created.message);
    if (created.status !== 'success' || !(created.data as UserRecord | undefined)?.id) return;

    const id = (created.data as UserRecord).id;

    // Read
    const read = await api.endpoint<UserRecord>('db', { table: 'User', method: 'get', id });
    add('CRUD — Read User', read.status, read.data ?? read.message);

    // Update
    const updated = await api.endpoint('db', { table: 'User', method: 'update', id, data: { email: `updated_${username_test}@example.com` } });
    add('CRUD — Update User', updated.status, updated.data ?? updated.message);

    // Delete
    const deleted = await api.endpoint('db', { table: 'User', method: 'delete', id });
    add('CRUD — Delete User', deleted.status, deleted.message ?? 'deleted');
  }

  onMount(() => {
    authStore.checkAuth();
    (window as any).apiTest = { api, authStore, handleLogin, handleLogout };
    console.log('API test utilities → window.apiTest');
  });
</script>

<h1 class="mb-6 text-2xl font-semibold">API & Auth Test</h1>

<!-- Auth status -->
<section class="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
  <h2 class="mb-3 text-lg font-medium">Authentication Status</h2>
  <div class="space-y-1 text-sm">
    <div class="flex gap-2">
      <span class="font-medium">Authenticated:</span>
      <span class={authStore.isAuthenticated ? 'text-green-600' : 'text-red-500'}>
        {authStore.isAuthenticated ? '✓ Yes' : '✗ No'}
      </span>
    </div>
    {#if authStore.user}
      <div class="flex gap-2">
        <span class="font-medium">User:</span>
        <span class="text-blue-600">{authStore.user.username}</span>
      </div>
      <div class="flex gap-2">
        <span class="font-medium">Email:</span>
        <span>{authStore.user.email ?? 'N/A'}</span>
      </div>
      <div class="flex gap-2">
        <span class="font-medium">Admin:</span>
        <span>{authStore.user.is_admin ? 'Yes' : 'No'}</span>
      </div>
    {/if}
    <div class="flex gap-2">
      <span class="font-medium">Token:</span>
      <span class="font-mono text-xs text-gray-500">
        {api.getToken()?.substring(0, 24) ?? 'None'}…
      </span>
    </div>
  </div>
</section>

<!-- Login form (shown only when not authenticated) -->
{#if !authStore.isAuthenticated}
  <section class="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
    <h2 class="mb-3 text-lg font-medium">Login</h2>
    <div class="max-w-xs space-y-3">
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700" for="pg-user">Username</label>
        <input
          id="pg-user"
          type="text"
          bind:value={username}
          class="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700" for="pg-pw">Password</label>
        <input
          id="pg-pw"
          type="password"
          bind:value={password}
          class="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      {#if loginError}
        <p class="text-sm text-red-600">{loginError}</p>
      {/if}
      <button
        onclick={handleLogin}
        disabled={loginLoading}
        class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loginLoading ? 'Logging in…' : 'Login'}
      </button>
    </div>
  </section>
{/if}

<!-- Test actions -->
<section class="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
  <h2 class="mb-3 text-lg font-medium">Test Actions</h2>
  <div class="flex flex-wrap gap-2">
    <button
      onclick={testListUsers}
      disabled={!authStore.isAuthenticated}
      class="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-40"
    >
      List Users
    </button>
    <button
      onclick={testQuery}
      disabled={!authStore.isAuthenticated}
      class="rounded bg-cyan-600 px-3 py-1.5 text-sm text-white hover:bg-cyan-700 disabled:opacity-40"
    >
      Query Active Users
    </button>
    <button
      onclick={testCRUD}
      disabled={!authStore.isAuthenticated}
      class="rounded bg-orange-600 px-3 py-1.5 text-sm text-white hover:bg-orange-700 disabled:opacity-40"
    >
      CRUD Test
    </button>
    {#if authStore.isAuthenticated}
      <button
        onclick={handleLogout}
        class="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
      >
        Logout
      </button>
    {/if}
    <button
      onclick={() => (results = [])}
      class="rounded bg-gray-500 px-3 py-1.5 text-sm text-white hover:bg-gray-600"
    >
      Clear
    </button>
  </div>
</section>

<!-- Results -->
<section class="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
  <h2 class="mb-3 text-lg font-medium">Results</h2>
  {#if results.length === 0}
    <p class="text-sm italic text-gray-400">No tests run yet.</p>
  {:else}
    <div class="space-y-3">
      {#each results as r}
        <div
          class="rounded border p-3 {r.status === 'success'
            ? 'border-green-200 bg-green-50'
            : 'border-red-200 bg-red-50'}"
        >
          <div class="mb-1 flex items-center justify-between">
            <span class="text-sm font-medium">{r.title}</span>
            <span class="flex items-center gap-2 text-xs">
              <span class={r.status === 'success' ? 'text-green-600' : 'text-red-600'}>
                {r.status === 'success' ? '✓' : '✗'}
                {r.status}
              </span>
              <span class="text-gray-400">{r.ts}</span>
            </span>
          </div>
          {#if r.data !== undefined}
            <pre class="overflow-x-auto rounded border bg-white p-2 text-xs">{JSON.stringify(
                r.data,
                null,
                2
              )}</pre>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<p class="text-xs text-gray-400">
  Console: <code>window.apiTest</code> — direct access to api, authStore, helpers
</p>

<a href="/playground" class="mt-4 block text-sm text-blue-600 hover:underline">← Playground</a>
