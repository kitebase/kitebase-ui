<script lang="ts">
  import { onMount } from 'svelte';
  import { serverConfig } from '$kitebase/api/serverConfig.svelte';
  import { loadLocale } from '$kitebase/i18n';
  import { setPluginLoader } from '$kitebase/plugins/context';
  import { pluginLoader } from '$app-plugins/registry';
  import MessageBox from '$kitebase/components/MessageBox.svelte';
  import FormDialog from '$kitebase/components/FormDialog.svelte';
  import '$app-plugins/formatters';

  setPluginLoader(pluginLoader);

  let { children } = $props();
  let ready = $state(false);

  onMount(async () => {
    await serverConfig.load();
    const locale = serverConfig.config?.locale ?? 'en';
    await loadLocale(locale);
    ready = true;
  });
</script>

<!-- h-screen flex-col: content area fills the remaining viewport so that child
     pages can use h-full to get a stable, non-scrolling height for panels/tables. -->
{#if ready}
<div class="flex h-screen flex-col bg-gray-50">
  <header class="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-3">
    <span class="text-sm font-medium text-gray-500">🧪 Playground</span>
    <span class="ml-2 text-xs text-gray-300">(dev only — not linked from the app)</span>
  </header>
  <!-- overflow-auto: pages that need scrolling (api, form, datatable…) work as before;
       pages that use h-full (panels) fill this area without the page scrolling. -->
  <div class="flex-1 min-h-0 overflow-auto p-6">
    {@render children()}
  </div>
</div>
<!-- The lab asks the same questions the app does — a dialog with nobody to render
     it would leave the caller waiting for an answer that never comes. -->
<FormDialog />
<MessageBox />
{/if}
