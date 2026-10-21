<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$kitebase/auth/store.svelte';
  import { serverConfig } from '$kitebase/api/serverConfig.svelte';
  import { loadLocale } from '$kitebase/i18n';
  import MessageBox from '$kitebase/components/MessageBox.svelte';
  import FormDialog from '$kitebase/components/FormDialog.svelte';
  import Chrome from '$kitebase/chrome/Chrome.svelte';
  import { setPluginLoader } from '$kitebase/plugins/context';
  import { pluginLoader } from '$app-plugins/registry';
  import '$app-plugins/formatters';

  setPluginLoader(pluginLoader);

  let { children } = $props();

  let ready = $state(false);

  onMount(async () => {
    if (!(await authStore.start())) {
      authStore.toLogin();
    } else {
      // Await server config so that reload_all_threshold and page_size are
      // available before any DataView renders. No-op if already loaded.
      await serverConfig.load();
      const locale = serverConfig.config?.locale ?? 'en';
      await loadLocale(locale);
      ready = true;
    }
  });
</script>

<FormDialog />
<MessageBox />

{#if ready}
  <Chrome blueprint="classic">
    {@render children()}
  </Chrome>
{/if}
