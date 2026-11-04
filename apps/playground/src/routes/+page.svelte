<script lang="ts">
  // Entry router: same app-only flow as the shell (auth -> /app, else -> /login).
  // The playground stays reachable directly at /playground for dev work.
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authStore } from '$kitebase/auth/store.svelte';

  onMount(async () => {
    if (await authStore.start()) goto('/app', { replace: true });
    else authStore.toLogin();
  });
</script>
