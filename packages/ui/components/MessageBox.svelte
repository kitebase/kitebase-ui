<script lang="ts">
  import { Dialog } from 'bits-ui';
  import { msgbox } from './msgbox.svelte.ts';

  let active = $derived(msgbox.active);

  // Mirror active → open so bits-ui stays in sync when dialog.respond() clears active.
  let open = $state(false);
  $effect(() => { open = !!active; });

  // Variant → icon colour + title colour
  const variantStyle: Record<string, { icon: string; title: string }> = {
    info:    { icon: 'text-blue-500',  title: 'text-gray-900' },
    warning: { icon: 'text-amber-500', title: 'text-gray-900' },
    error:   { icon: 'text-red-500',   title: 'text-red-700'  },
    danger:  { icon: 'text-red-600',   title: 'text-red-700'  },
  };

  let vstyle = $derived(active ? variantStyle[active.variant] : variantStyle.info);

  // Copy-to-clipboard feedback
  let copied = $state(false);
  function copyDetail() {
    if (!active?.detail) return;
    navigator.clipboard.writeText(active.detail).then(() => {
      copied = true;
      setTimeout(() => (copied = false), 2000);
    });
  }

  function onOpenChange(o: boolean) {
    // For non-modal dialogs, closing via Esc or outside click resolves with undefined.
    // For modal dialogs we ignore the event — only explicit button clicks resolve.
    if (!o && active && !active.modal) msgbox.respond(undefined);
  }
</script>

{#if active}
  <Dialog.Root {open} {onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />

      <Dialog.Content
        class="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2
               rounded-xl bg-white shadow-xl focus:outline-none"
        interactOutsideBehavior={active.modal ? 'ignore' : 'close'}
        onEscapeKeydown={active.modal ? (e) => e.preventDefault() : undefined}
      >
        <!-- ── Header ──────────────────────────────────────────────────── -->
        <div class="flex items-start gap-3 p-5 pb-3">

          <!-- Variant icon -->
          <span class="mt-0.5 shrink-0 {vstyle.icon}">
            {#if active.variant === 'info'}
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="8" stroke-linecap="round" stroke-width="3"/>
                <line x1="12" y1="12" x2="12" y2="16"/>
              </svg>
            {:else if active.variant === 'warning' || active.variant === 'danger'}
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                      d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              </svg>
            {:else}
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15" stroke-linecap="round"/>
                <line x1="9" y1="9" x2="15" y2="15" stroke-linecap="round"/>
              </svg>
            {/if}
          </span>

          <div class="min-w-0 flex-1">
            {#if active.title}
              <Dialog.Title class="text-base font-semibold {vstyle.title}">
                {active.title}
              </Dialog.Title>
            {/if}
            {#if active.message}
              <!-- pre-line: a message of several lines (the outcome of an operation,
                   one line each) keeps its line breaks -->
              <Dialog.Description class="mt-0.5 whitespace-pre-line text-sm text-gray-600">
                {active.message}
              </Dialog.Description>
            {/if}
          </div>
        </div>

        <!-- ── Choices (one pick from a list) ─────────────────────────── -->
        {#if active.choices}
          <div class="kb-choices" role="menu">
            {#each active.choices as c (c.label)}
              <button
                type="button"
                role="menuitem"
                class="kb-choice"
                class:kb-choice-current={c.current}
                onclick={() => msgbox.respond(c.value)}
              >
                <span class="kb-choice-mark" aria-hidden="true">{c.current ? '●' : ''}</span>
                {c.label}
              </button>
            {/each}
          </div>
        {/if}

        <!-- ── Detail block (collapsible) ─────────────────────────────── -->
        {#if active.detail}
          <div class="px-5 pb-3">
            <details class="group">
              <summary class="flex cursor-pointer list-none items-center gap-1
                              text-xs text-gray-400 select-none hover:text-gray-600">
                <svg class="h-3 w-3 transition-transform group-open:rotate-90"
                     fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6 6l8 4-8 4V6z"/>
                </svg>
                {active.detailLabel ?? 'Vedi dettagli tecnici'}
              </summary>

              <div class="relative mt-2">
                <pre class="max-h-52 overflow-auto rounded-md bg-gray-900 p-3
                            font-mono text-xs leading-relaxed text-gray-100
                            whitespace-pre-wrap break-all">{active.detail}</pre>
                <button
                  type="button"
                  onclick={copyDetail}
                  class="absolute right-2 top-2 rounded px-2 py-0.5 text-xs
                         bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                >
                  {copied ? 'Copiato ✓' : 'Copia'}
                </button>
              </div>
            </details>
          </div>
        {/if}

        <!-- ── Buttons ─────────────────────────────────────────────────── -->
        <div class="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          {#each active.buttons as btn (btn.label)}
            <button
              type="button"
              class="btn {btn.variant === 'danger' ? 'btn-danger' : btn.variant === 'primary' ? 'btn-primary' : 'btn-secondary'}"
              onclick={() => msgbox.respond(btn.value)}
            >
              {btn.label}
            </button>
          {/each}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
{/if}

<style>
  .kb-choices {
    display: flex;
    flex-direction: column;
    padding: 0 1.25rem 0.75rem;
  }
  .kb-choice {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    text-align: left;
    font-size: 0.875rem;
    color: var(--kb-text);
    background: transparent;
    border: none;
    cursor: pointer;
  }
  .kb-choice:hover { background: var(--kb-surface-hover); }
  .kb-choice-current { font-weight: 600; }
  .kb-choice-mark {
    width: 0.75rem;
    font-size: 0.5rem;
    color: var(--kb-accent);
  }
</style>
