<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { authStore } from '$kitebase/auth/store.svelte';

  // The app's name and texts, from /info: readable before signing in.
  const title = $derived(authStore.client?.title || 'Kitebase');
  const signin = $derived(authStore.client?.signin ?? {});

  let username = $state('');
  let password = $state('');

  // With a host login (client.login) the form is never shown: the host's
  // login page is the only one.
  let showForm = $state(false);

  onMount(async () => {
    if (await authStore.start()) goto(`${base}/`);
    else if (authStore.hostLogin) authStore.toLogin();
    else showForm = true;
  });

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const ok = await authStore.login({ username, password });
    if (ok) goto(`${base}/`);
  }
</script>

{#if showForm}
  <div class="flex min-h-screen items-center justify-center bg-gray-50">
    <div class="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
      <h1 class="text-2xl font-semibold text-gray-900" class:mb-6={!signin.subtitle}>{title}</h1>
      {#if signin.subtitle}
        <p class="mb-6 text-sm text-gray-500">{signin.subtitle}</p>
      {/if}

      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <label for="username" class="mb-1 block text-sm font-medium text-gray-700">Username</label>
          <input
            id="username"
            type="text"
            bind:value={username}
            required
            autocomplete="username"
            class="input"
          />
        </div>

        <div>
          <label for="password" class="mb-1 block text-sm font-medium text-gray-700">Password</label>
          <input
            id="password"
            type="password"
            bind:value={password}
            required
            autocomplete="current-password"
            class="input"
          />
        </div>

        {#if authStore.error}
          <p class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{authStore.error}</p>
        {/if}

        <button
          type="submit"
          disabled={authStore.isLoading}
          class="btn btn-primary w-full"
        >
          {authStore.isLoading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {#if signin.hint}
        <p class="mt-6 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">{signin.hint}</p>
      {/if}
    </div>
  </div>
{/if}
