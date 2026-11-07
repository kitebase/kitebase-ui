<script lang="ts">
  /**
   * SheetDialog.svelte — inspired by shadcn-svelte (MIT)
   *
   * Uses bits-ui Dialog as base (focus trap, Esc, ARIA, Portal)
   * with no additional dependencies (no tailwind-variants, no lucide).
   */
  import { Dialog } from 'bits-ui';
  import type { Snippet } from 'svelte';

  type Side = 'top' | 'right' | 'bottom' | 'left';

  let {
    open = $bindable(false),
    side = 'right',
    title,
    description,
    width,
    children
  }: {
    open?: boolean;
    side?: Side;
    title?: string;
    description?: string;
    /** The width of a sheet at the left or the right, as CSS (default 20rem). */
    width?: string;
    children: Snippet;
  } = $props();

  // Inline styles: avoids the static class detection problem with Tailwind 4
  // (classes built at runtime are not picked up by the scanner).
  const panelStyle: Record<Side, string> = {
    top:    'left:0;right:0;top:0;height:20rem;border-bottom:1px solid #e5e7eb;border-radius:0 0 1rem 1rem',
    right:  'top:0;bottom:0;right:0;width:20rem;border-left:1px solid #e5e7eb;border-radius:1rem 0 0 1rem',
    bottom: 'left:0;right:0;bottom:0;height:20rem;border-top:1px solid #e5e7eb;border-radius:1rem 1rem 0 0',
    left:   'top:0;bottom:0;left:0;width:20rem;border-right:1px solid #e5e7eb;border-radius:0 1rem 1rem 0',
  };
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />

    <Dialog.Content
      class="fixed z-50 flex flex-col bg-white shadow-xl focus:outline-none"
      style={panelStyle[side] + (width && (side === 'left' || side === 'right') ? `;width:${width}` : '')}
    >
      <div class="flex shrink-0 items-center justify-between border-b border-gray-200 p-4">
        <div>
          {#if title}
            <Dialog.Title class="text-lg font-semibold text-gray-800">{title}</Dialog.Title>
          {/if}
          {#if description}
            <Dialog.Description class="text-sm text-gray-500">{description}</Dialog.Description>
          {/if}
        </div>
        <Dialog.Close
          class="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close"
        >
          ✕
        </Dialog.Close>
      </div>

      <div class="grow overflow-y-auto p-4">
        {@render children()}
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
