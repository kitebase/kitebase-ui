<script lang="ts">
  import { untrack } from 'svelte';
  import { _ } from '../../i18n';
  import { Combobox } from 'bits-ui';
  import type { FormField, FormFieldChoice } from '../dataform.types';
  import { popupKeys } from './widget.svelte';
  import { fetchChoices } from './choices';

  interface Props {
    value: unknown;                      // raw stored value (e.g. FK id, choice value)
    onchange: (v: unknown) => void;
    onblur?: () => void;
    readonly?: boolean;
    field: FormField;
  }

  let { value, onchange, onblur, readonly = false, field }: Props = $props();

  let open = $state(false);

  // Given with the field, or served by `choices_endpoint`, fetched once per form
  const endpoint = $derived(field.choices_endpoint as string | undefined);
  let fetched = $state<FormFieldChoice[] | null>(null);

  $effect(() => {
    const name = endpoint;
    if (!name) return;
    untrack(async () => {
      try {
        fetched = (await fetchChoices(name)) as FormFieldChoice[];
      } catch {
        fetched = [];
      }
    });
  });

  let choices = $derived(
    (endpoint ? (fetched ?? []) : (field.choices ?? [])) as FormFieldChoice[]);

  // Label matching the current value
  let selectedLabel = $derived(
    choices.find((c) => String(c.value) === String(value))?.label ?? ''
  );

  // query: text shown in the input; initialized from selectedLabel, synced via $effect
  let query = $state(untrack(() => selectedLabel));

  $effect(() => {
    // Sync display when external value changes (e.g. on_change patch)
    query = selectedLabel;
  });

  let filtered = $derived(
    // If query matches the current label (just selected), show all; else filter
    query === '' || query === selectedLabel
      ? choices.slice(0, 10)
      : choices.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())).slice(0, 10)
  );

  function handleValueChange(v: string) {
    const choice = choices.find((c) => String(c.value) === v);
    if (choice) {
      onchange(choice.value);
      onblur?.();
    }
  }

  function handleInputBlur() {
    // Restore label if user blurred without selecting a valid choice
    query = selectedLabel;
    onblur?.();
  }
</script>

{#if readonly}
  <span class="block rounded-btn border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
    {selectedLabel || '—'}
  </span>

{:else}
  <Combobox.Root
    type="single"
    value={value != null ? String(value) : ''}
    onValueChange={handleValueChange}
    inputValue={query}
    bind:open
  >
    <div class="relative">
      <Combobox.Input
        class="input pr-8 {field.error ? 'input-error' : ''}"
        placeholder={field.placeholder as string | undefined ?? _('Select…')}
        oninput={(e) => (query = (e.target as HTMLInputElement).value)}
        onblur={handleInputBlur}
        onkeydown={(e) => popupKeys(e, { open: () => (open = true) })}
        aria-label={field.label ?? field.name}
      />
      <Combobox.Trigger
        tabindex={-1}
        class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        aria-label={_('Select')}
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </Combobox.Trigger>
    </div>

    <Combobox.Portal>
      <Combobox.Content
        class="z-50 mt-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg"
        sideOffset={4}
      >
        <Combobox.Viewport class="max-h-48 overflow-auto py-1">
          {#if filtered.length === 0}
            <div class="px-3 py-2 text-sm text-gray-400">{_('No results')}</div>
          {:else}
            {#each filtered as choice (choice.value)}
              <Combobox.Item
                value={String(choice.value)}
                label={choice.label}
                class="flex cursor-pointer items-center px-3 py-2 text-sm
                       hover:bg-blue-50 data-[highlighted]:bg-blue-50
                       data-[selected]:font-semibold data-[selected]:text-brand"
              >
                {choice.label}
              </Combobox.Item>
            {/each}
          {/if}
        </Combobox.Viewport>
      </Combobox.Content>
    </Combobox.Portal>
  </Combobox.Root>
{/if}
