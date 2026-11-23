<script lang="ts">
  import { setContext, type Snippet } from 'svelte';
  import { blueprints } from './blueprints';
  import { registry } from './registry';
  import { serverConfig } from '$kitebase/api/serverConfig.svelte';
  import { getPluginLoader } from '$kitebase/plugins/context';
  import PluginComponent from '$kitebase/components/PluginComponent.svelte';
  import type { AreaContent, BarContent, CompItem, Composition } from './types';

  interface Props {
    /** Blueprint id; ignored if `composition.blueprint` is set. Default 'classic'. */
    blueprint?: string;
    /** Full composition; falls back to the blueprint's default composition. */
    composition?: Composition;
    /** Route content — rendered by the `work-area` component. */
    children?: Snippet;
  }

  let { blueprint = 'classic', composition, children }: Props = $props();

  // The work-area (Desktop host) pulls the route content from here. Exposed as
  // a getter so it stays reactive across route changes under the Chrome.
  setContext('kb:chrome-content', {
    get content(): Snippet | undefined {
      return children;
    },
  });

  const bp = $derived(blueprints[composition?.blueprint ?? blueprint] ?? blueprints.classic);
  const areas = $derived(composition?.areas ?? bp.defaults.areas);
  const BlueprintComponent = $derived(bp.component);

  // What the plugins put beside the status line (`chrome_areas.status` in
  // their YAML): it follows the `status-area`, wherever the composition puts it.
  const pluginLoader = getPluginLoader();
  const statusExtras = $derived(pluginLoader ? serverConfig.chromeAreas.status ?? [] : []);

  function isBar(c: AreaContent): c is BarContent {
    return !Array.isArray(c);
  }
</script>

{#snippet renderItem(item: CompItem)}
  {@const Comp = registry[item.component]}
  {#if Comp}
    <Comp {...(item.props ?? {})} />
    {#if item.component === 'status-area'}
      {#each statusExtras as extra (extra.component)}
        <PluginComponent loader={pluginLoader!} componentId={extra.component} {...extra.props} />
      {/each}
    {/if}
  {:else}
    <span class="kb-chrome-missing">?{item.component}</span>
  {/if}
{/snippet}

{#snippet group(items: CompItem[] | undefined)}
  {#if items?.length}
    <div class="kb-bar-group">
      {#each items as item (item.component)}{@render renderItem(item)}{/each}
    </div>
  {/if}
{/snippet}

{#snippet renderArea(id: string)}
  {@const content = areas[id]}
  {#if content}
    {#if isBar(content)}
      <div class="kb-bar">
        {@render group(content.start)}
        {@render group(content.center)}
        {@render group(content.end)}
      </div>
    {:else}
      {#each content as item (item.component)}{@render renderItem(item)}{/each}
    {/if}
  {/if}
{/snippet}

<BlueprintComponent area={renderArea} />

<style>
  .kb-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    height: 100%;
    padding: 0.5rem 1rem;
  }
  .kb-bar-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .kb-chrome-missing {
    font-size: 0.7rem;
    color: var(--kb-danger);
  }
</style>
