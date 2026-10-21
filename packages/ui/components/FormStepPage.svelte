<script lang="ts">
  /**
   * FormStepPage.svelte — a form asked for by an operation, as a stack page.
   *
   * The page form of the `form` step of applyResult: a DataForm on local data,
   * whose Confirm pops the stack with the values and whose Cancel (or ←) pops
   * with null. Being a page, its lookups can open their picker on top of it.
   */
  import { getContext } from 'svelte';
  import { _ } from '../i18n';
  import { stack as globalStack } from '$kitebase/stack/stack.svelte';
  import type { StackInstance } from '$kitebase/stack/stack.svelte';
  import DataForm from './DataForm.svelte';
  import type { FormDescriptor } from './dataform.types';

  const stack = getContext<StackInstance>('kb:stack') ?? globalStack;

  interface Props {
    view: FormDescriptor;
    values?: Record<string, unknown>;
    title?: string;
  }

  let { view, values = {}, title = '' }: Props = $props();
</script>

<div class="kb-form-step">
  <div class="kb-form-step-header">
    <button
      class="kb-form-step-back"
      onclick={() => stack.pop(null)}
      title={_('Cancel')}
      aria-label={_('Cancel')}
    >←</button>
    {#if title}
      <h2 class="kb-form-step-title">{title}</h2>
    {/if}
  </div>
  <div class="kb-form-step-body">
    <DataForm
      {view}
      data={values}
      persist={false}
      submit="confirm"
      onSave={(v) => stack.pop(v)}
      onCancel={() => stack.pop(null)}
    />
  </div>
</div>

<style>
  .kb-form-step {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--kb-bg);
  }
  .kb-form-step-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--kb-border);
  }
  .kb-form-step-back {
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
    color: var(--kb-text-subtle);
  }
  .kb-form-step-back:hover { background: var(--kb-surface-hover); color: var(--kb-text); }
  .kb-form-step-title { font-size: 0.95rem; font-weight: 600; color: var(--kb-text); }
  .kb-form-step-body { flex: 1; min-height: 0; }
</style>
