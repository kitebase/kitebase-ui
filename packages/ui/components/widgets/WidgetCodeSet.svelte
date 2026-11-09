<script lang="ts">
  /**
   * A set of codes picked from a popup with a check per choice: the field shows
   * the codes alone ("C, S"), the popup each code with its label, filtered by
   * what is typed in either. The widget of a CodeSet column, at any length of
   * vocabulary; a short one may ask for `checklist` instead, all on show.
   *
   * The value is the array of the codes checked, in the order of the choices.
   * A code no choice offers stays in the value and in the popup, marked
   * unknown, so it can be seen and taken away rather than kept unseen.
   */
  import { untrack } from 'svelte';
  import { Combobox } from 'bits-ui';
  import { _ } from '../../i18n';
  import type { FormField } from '../dataform.types';
  import { popupKeys } from './widget.svelte';
  import { type CodeChoice, codesOf, fetchChoices, inVocabularyOrder } from './choices';

  interface Props {
    value: unknown;
    onchange: (v: string[]) => void;
    onblur?: () => void;
    readonly?: boolean;
    field: FormField;
  }

  let { value, onchange, onblur, readonly = false, field }: Props = $props();

  let fetched = $state<CodeChoice[] | null>(null);
  let loadError = $state<string | null>(null);
  let open = $state(false);
  let query = $state('');

  const endpoint = $derived(field.choices_endpoint as string | undefined);

  $effect(() => {
    const name = endpoint;
    if (!name) return;
    untrack(async () => {
      try {
        fetched = await fetchChoices(name);
      } catch (e) {
        loadError = e instanceof Error ? e.message : String(e);
      }
    });
  });

  const choices = $derived<CodeChoice[]>(
    endpoint ? (fetched ?? []) : ((field.choices ?? []) as unknown as CodeChoice[]),
  );
  const codes = $derived(codesOf(value));
  const shown = $derived(codes.join(', '));

  // Unknown only once the vocabulary is there: before, every code would be.
  const unknown = $derived(
    endpoint && fetched === null ? [] : codes.filter((c) => !choices.some((ch) => ch.value === c)),
  );

  const filtered = $derived.by(() => {
    const all: CodeChoice[] = [...choices, ...unknown.map((c) => ({ value: c, label: '' }))];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) => c.value.toLowerCase().includes(q) || c.label.toLowerCase().includes(q));
  });

  function handleValueChange(next: string[]) {
    onchange(inVocabularyOrder(next, choices));
  }

  function handleKeydown(e: KeyboardEvent) {
    // An open popup takes the key: closing it is not cancelling the form.
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      open = false;
      return;
    }
    popupKeys(e, { open: () => (open = true) });
  }

  function handleOpenChange(isOpen: boolean) {
    query = '';
    if (!isOpen) onblur?.();
  }
</script>

{#if readonly}
  <span class="kb-codes-readonly">{shown || '—'}</span>
{:else}
  <Combobox.Root
    type="multiple"
    value={codes}
    onValueChange={handleValueChange}
    inputValue={open ? query : shown}
    bind:open
    onOpenChange={handleOpenChange}
  >
    <div class="kb-codes">
      <Combobox.Input
        class="input kb-codes-input {field.error ? 'input-error' : ''}"
        placeholder={open ? _('Search…') : (field.placeholder as string | undefined ?? _('Select…'))}
        oninput={(e) => (query = (e.target as HTMLInputElement).value)}
        onkeydown={handleKeydown}
        onclick={() => (open = true)}
        aria-label={field.label ?? field.name}
      />
      <Combobox.Trigger tabindex={-1} class="kb-codes-trigger" aria-label={_('Select')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </Combobox.Trigger>
    </div>

    <Combobox.Portal>
      <Combobox.Content class="kb-codes-popup" sideOffset={4}>
        <Combobox.Viewport class="kb-codes-viewport">
          {#if loadError}
            <div class="kb-codes-note">{loadError}</div>
          {:else if filtered.length === 0}
            <div class="kb-codes-note">{_('No results')}</div>
          {:else}
            {#each filtered as choice (choice.value)}
              <Combobox.Item value={choice.value} label={choice.value} class="kb-codes-item">
                {#snippet children({ selected })}
                  <span class="kb-codes-check" aria-hidden="true">{selected ? '✓' : ''}</span>
                  <code class={{ 'kb-codes-unknown': !choice.label }}>{choice.value}</code>
                  <span class="kb-codes-label">{choice.label || _('Unknown')}</span>
                {/snippet}
              </Combobox.Item>
            {/each}
          {/if}
        </Combobox.Viewport>
      </Combobox.Content>
    </Combobox.Portal>
  </Combobox.Root>
{/if}

<style>
  .kb-codes {
    position: relative;
  }
  :global(.kb-codes-input) {
    padding-right: 2rem;
  }
  :global(.kb-codes-trigger) {
    position: absolute;
    right: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    width: 1rem;
    height: 1rem;
    color: var(--kb-text-subtle);
  }
  :global(.kb-codes-trigger:hover) {
    color: var(--kb-text);
  }
  :global(.kb-codes-popup) {
    z-index: 50;
    min-width: var(--bits-combobox-anchor-width);
    max-width: 24rem;
    overflow: hidden;
    border: 1px solid var(--kb-border);
    border-radius: 0.375rem;
    background: var(--kb-surface);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
  }
  :global(.kb-codes-viewport) {
    max-height: 16rem;
    overflow: auto;
    padding: 0.25rem 0;
  }
  :global(.kb-codes-item) {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
    color: var(--kb-text);
    cursor: pointer;
  }
  :global(.kb-codes-item[data-highlighted]) {
    background: var(--kb-surface-hover);
  }
  .kb-codes-check {
    width: 1rem;
    flex: none;
    color: var(--kb-accent);
    font-weight: 600;
  }
  .kb-codes-unknown {
    color: var(--kb-danger);
  }
  .kb-codes-label {
    color: var(--kb-text-muted);
  }
  .kb-codes-note {
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    color: var(--kb-text-subtle);
  }
  .kb-codes-readonly {
    display: block;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--kb-border);
    border-radius: 0.375rem;
    background: var(--kb-bg);
    font-size: 0.875rem;
    color: var(--kb-text);
  }
</style>
