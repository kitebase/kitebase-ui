<script lang="ts">
  /**
   * PanelPage.svelte — generic bridge for `stack.push(PanelPage, { panelId })`.
   *
   * Resolves a page id via `get_page` and renders it with PanelRenderer. This is
   * the missing link between a menu leaf's `action: stack_push, panel: <id>` and
   * the Stack, which only knows how to push resolved components (kitebase PLUGIN_MODEL.md §9.4).
   */
  import { getContext, setContext } from 'svelte';
  import { api } from '$kitebase/api/client';
  import { stack as globalStack, type StackInstance } from '$kitebase/stack/stack.svelte';
  import PanelRenderer from './PanelRenderer.svelte';

  interface Props {
    panelId: string;
  }

  let { panelId }: Props = $props();

  // What the views inside know about where they are: their remembered state
  // is per page, not per table (DataView, getStateKey). A page component lives
  // for one id: the stack and the home key it by the id they show.
  // svelte-ignore state_referenced_locally
  setContext('kb:page', panelId);

  // A page opened over another one has a way back to it, as a form has; one a
  // menu opens is the bottom of its stack, and has nowhere to go back to.
  const stack = getContext<StackInstance>('kb:stack') ?? globalStack;
  const overAnother = stack.length > 1;

  let panel = $state<Record<string, unknown> | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);

  async function load(id: string) {
    panel = null;
    error = null;
    loading = true;
    try {
      const res = await api.endpoint('get_page', { id });
      if (res.status === 'success') {
        panel = res.data as Record<string, unknown>;
      } else {
        error = res.message ?? 'Unknown error';
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  // Fetch when the id changes, and only then. Without the guard the effect
  // re-runs whenever the parent re-renders — which the stack does on every push
  // and pop — and `load` starts by clearing `panel`, so the whole subtree is
  // destroyed and rebuilt. Everything the view was holding goes with it: the
  // rules being applied, the quick search, the loaded pages, the selection. It
  // looked like a reload; it was a different component each time.
  let loadedId: string | null = null;
  $effect(() => {
    if (panelId === loadedId) return;
    loadedId = panelId;
    load(panelId);
  });
</script>

<div class="h-full w-full overflow-hidden">
  {#if loading}
    <div class="flex h-full items-center justify-center gap-2 text-sm text-gray-500">
      <div
        class="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"
      ></div>
      Loading…
    </div>
  {:else if error}
    <div class="flex h-full items-center justify-center p-4">
      <div class="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <strong>Error:</strong>
        {error}
      </div>
    </div>
  {:else if panel}
    <PanelRenderer {panel} onBack={overAnother ? () => stack.pop() : undefined} />
  {/if}
</div>
