<script lang="ts">
  /**
   * FormDialog.svelte — the host of `formDialog`, mounted once beside MessageBox.
   *
   * The form is a DataForm on local data: Confirm answers with its values,
   * Cancel (or Escape, which DataForm handles, asking first when something was
   * typed) with null. Clicking outside does nothing: half a form is not an answer.
   * There is no stack in here, so the widgets are told they cannot push.
   * It sits one layer below MessageBox (40 against 50): a message raised from
   * inside the form, "discard the changes?", answers about it and goes on top.
   */
  import { Dialog } from 'bits-ui';
  import { setContext } from 'svelte';
  import DataForm from './DataForm.svelte';
  import { formDialog } from './formDialog.svelte';

  setContext('kb:can-push', false);

  let active = $derived(formDialog.active);
  let open = $derived(!!active);
</script>

{#if active}
  <Dialog.Root {open} onOpenChange={(o) => { if (!o) formDialog.respond(null); }}>
    <Dialog.Portal>
      <Dialog.Overlay class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
      <Dialog.Content
        class="kb-form-dialog"
        interactOutsideBehavior="ignore"
        onEscapeKeydown={(e) => e.preventDefault()}
      >
        {#if active.title}
          <Dialog.Title class="kb-form-dialog-title">{active.title}</Dialog.Title>
        {/if}
        <div class="kb-form-dialog-body">
          <DataForm
            view={active.view}
            data={active.values}
            persist={false}
            submit="confirm"
            onSave={(values) => formDialog.respond(values)}
            onCancel={() => formDialog.respond(null)}
          />
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
{/if}

<style>
  :global(.kb-form-dialog) {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 40;
    display: flex;
    flex-direction: column;
    width: min(36rem, calc(100vw - 2rem));
    max-height: calc(100vh - 4rem);
    transform: translate(-50%, -50%);
    border: 1px solid var(--kb-border);
    border-radius: 0.75rem;
    background: var(--kb-bg);
    color: var(--kb-text);
    box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
  }
  :global(.kb-form-dialog:focus) { outline: none; }
  :global(.kb-form-dialog-title) {
    padding: 1rem 1.25rem 0;
    font-size: 1rem;
    font-weight: 600;
  }
  .kb-form-dialog-body {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
</style>
