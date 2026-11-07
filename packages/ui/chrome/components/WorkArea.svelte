<script lang="ts">
  import { getContext, type Snippet } from 'svelte';
  import StackContainer from '$kitebase/stack/StackContainer.svelte';
  import HelpGuide from '$kitebase/components/HelpGuide.svelte';
  import { stack } from '$kitebase/stack/stack.svelte';

  // The Desktop work-area. Renders the route content (provided by Chrome via
  // context) and overlays the navigation stack when it has pages.
  //
  // Single work-area for now (browser tabs cover multitasking). A tab container
  // is a future variant of this component, each tab owning its own stack.
  // Invariant: opening work from the sidebar is always a fresh mount
  // (stack.clear()+push in MenuSidebar) — no state is restored.
  const host = getContext<{ content?: Snippet }>('kb:chrome-content');
</script>

<div class="kb-workarea">
  <div class="kb-workarea-content">
    {@render host?.content?.()}
  </div>
  {#if $stack.length > 0}
    <div class="kb-workarea-stack">
      <StackContainer />
    </div>
  {/if}
  <!-- One guide for the whole work area, whatever chrome is around it -->
  <HelpGuide />
</div>

<style>
  /* §2.4: the ancestors are height-defined + overflow-hidden; this is the
     single scroller. */
  .kb-workarea {
    position: absolute;
    inset: 0;
  }
  .kb-workarea-content {
    height: 100%;
    overflow: auto;
    padding: 1.5rem;
  }
  .kb-workarea-stack {
    position: absolute;
    inset: 0;
    background: var(--kb-bg);
  }
</style>
