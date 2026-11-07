<script lang="ts">
  import { CircleHelp } from '@lucide/svelte';
  import { _ } from '$kitebase/i18n';
  import { openGuide } from '$kitebase/components/guide.svelte';

  // The guide of where the user is, read from the stack when clicked: the same
  // as F1 outside a field. Only a way in: the guide works without it.
</script>

<button type="button" class="kb-help" onclick={() => openGuide()}
        aria-label={_('Guide')} title={_('Guide (F1)')}>
  <CircleHelp class="h-4 w-4" />
</button>

<style>
  .kb-help {
    display: inline-flex;
    border: 0;
    background: none;
    padding: 0.25rem;
    color: var(--kb-text-muted);
    cursor: pointer;
  }
  .kb-help:hover {
    color: var(--kb-text);
  }
</style>
