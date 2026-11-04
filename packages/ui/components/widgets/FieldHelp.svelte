<script lang="ts">
  import { Popover } from 'bits-ui';
  import { CircleHelp } from '@lucide/svelte';
  import { _ } from '../../i18n';

  // A field's `help`, on request: a "?" beside the label that opens it, and F1
  // on the field (DataForm). Not always on screen, because a form whose every
  // field carries a grey line underneath is mostly grey lines; and opened by a
  // click, not on hover, which tablets do not have and which closes while one
  // is reading. Out of the Tab order, like the calendar button: Tab goes from
  // field to field. The focus stays on the field, so typing goes on.

  interface Props {
    text: string;
    label?: string;
    open?: boolean;
  }

  let { text, label = '', open = $bindable(false) }: Props = $props();
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    tabindex={-1}
    class="ml-1 inline-flex align-middle text-gray-400 hover:text-brand focus:outline-none"
    aria-label={_('Help')}
    title={_('Help (F1)')}
  >
    <CircleHelp class="h-3.5 w-3.5" />
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      side="bottom"
      align="start"
      sideOffset={4}
      trapFocus={false}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onCloseAutoFocus={(e) => e.preventDefault()}
      class="z-50 max-w-sm rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs
             font-normal text-gray-600 shadow-lg"
    >
      {#if label}<p class="mb-1 font-medium text-gray-800">{label}</p>{/if}
      <p class="whitespace-pre-line">{text}</p>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
