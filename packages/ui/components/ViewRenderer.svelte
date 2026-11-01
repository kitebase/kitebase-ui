<script lang="ts">
  import PluginComponent from './PluginComponent.svelte';
  import DataView from './DataView.svelte';
  import DataForm from './DataForm.svelte';
  import TabView from './TabView.svelte';
  import type { ViewDescriptor } from './dataview.types';
  import type { FormDescriptor } from './dataform.types';
  import { getPluginLoader } from '$kitebase/plugins/context';
  const pluginLoader = getPluginLoader();

  interface Props {
    view: Record<string, unknown>;
    trigger?: Record<string, unknown>;
    collapsed?: boolean;
    focusRowId?: unknown;
    onEvent?: (name: string, data: unknown) => void;
  }

  let { view, trigger, collapsed, focusRowId, onEvent }: Props = $props();
</script>

{#if view.type === 'form'}
  <DataForm
    view={view as unknown as FormDescriptor}
    trigger={trigger}
    onEvent={onEvent}
  />

{:else if view.type === 'plugin'}
  {#if pluginLoader}
    <PluginComponent
      loader={pluginLoader}
      componentId={view.component as string}
      {...(view.props as Record<string, unknown> ?? {})}
    />
  {:else}
    <!-- No loader in context: say so rather than fail on it. -->
    <div class="flex h-full items-center justify-center text-sm text-gray-400">
      no plugin loader for <code class="mx-1 rounded bg-gray-100 px-1">{view.component}</code>
    </div>
  {/if}

{:else if view.type === 'table' || view.type === 'tree' || view.type === 'cards'}
  <DataView
    view={view as ViewDescriptor}
    trigger={trigger}
    collapsed={collapsed}
    {focusRowId}
    onEvent={onEvent}
  />

{:else if view.type === 'tabs'}
  <TabView
    tabs={view.tabs as Array<{ id: string; label?: string; [key: string]: unknown }>}
    {trigger}
    {collapsed}
    {onEvent}
  />

{:else}
  <div class="flex h-full items-center justify-center text-sm text-gray-400">
    view type <code class="mx-1 rounded bg-gray-100 px-1">{view.type}</code> not yet implemented
  </div>
{/if}
