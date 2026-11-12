<script lang="ts">
  /**
   * A markdown field written as rich text: the toolbar formats, the source
   * button shows the markdown itself, and the value is always markdown. With
   * `placeholders` it offers the fields of a template, inserted as `[[name]]`.
   *
   * The same props as a form widget, so the type registry can use it for a
   * `Markdown` column.
   */
  import { onDestroy, onMount, untrack } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import { Markdown } from '@tiptap/markdown';
  import { Bold, Braces, FileCode, Heading2 as Heading, Italic, Link as LinkIcon, List,
           ListOrdered } from '@lucide/svelte';
  import { _ } from '../../i18n';
  import { Placeholders } from './placeholder';

  interface Placeholder {
    name: string;
    label?: string;
  }

  interface Props {
    value: unknown;
    onchange: (v: string | null) => void;
    onblur?: () => void;
    readonly?: boolean;
    field?: { name?: string; label?: string; error?: unknown };
    placeholders?: Placeholder[];
  }

  let { value, onchange, onblur, readonly = false, field, placeholders = [] }: Props = $props();

  let element: HTMLDivElement;
  let editor: Editor | undefined = $state();
  // Bumped on every transaction: what the toolbar reads to show the active marks
  let revision = $state(0);
  let source = $state(false);
  let sourceText = $state('');
  let linkOpen = $state(false);
  let linkHref = $state('');
  let pickerOpen = $state(false);
  // The markdown last sent out, so a value coming back is not set again
  let emitted: string | null = null;

  const text = (v: unknown) => (typeof v === 'string' ? v : '');

  // Never tracked: the parent's handler reads and writes its own state, which
  // must not become a dependency of the effect that happened to cause the change
  function emit(markdown: string) {
    emitted = markdown;
    untrack(() => onchange(markdown === '' ? null : markdown));
  }

  onMount(() => {
    editor = new Editor({
      element,
      editable: !readonly,
      extensions: [
        StarterKit.configure({ underline: false, link: { openOnClick: false } }),
        Markdown,
        Placeholders
      ],
      content: text(value),
      contentType: 'markdown',
      onTransaction: () => revision++,
      onUpdate: ({ editor }) => emit(editor.getMarkdown()),
      onBlur: () => onblur?.()
    });
    emitted = text(value);
  });

  onDestroy(() => editor?.destroy());

  // A value from outside (another record loaded) replaces the content
  $effect(() => {
    const incoming = text(value);
    if (!editor || incoming === (emitted ?? '')) return;
    emitted = incoming;
    if (source) sourceText = incoming;
    else editor.commands.setContent(incoming, { contentType: 'markdown', emitUpdate: false });
  });

  // No update event: becoming read-only does not change the value
  $effect(() => editor?.setEditable(!readonly, false));

  const active = (name: string, attrs?: Record<string, unknown>) =>
    revision >= 0 && !!editor?.isActive(name, attrs);

  function run(command: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) {
    if (editor) command(editor.chain().focus()).run();
  }

  function toggleSource() {
    if (!editor) return;
    if (source) {
      editor.commands.setContent(sourceText, { contentType: 'markdown', emitUpdate: false });
      emit(editor.getMarkdown());
    } else {
      sourceText = editor.getMarkdown();
    }
    source = !source;
  }

  function openLink() {
    linkHref = (editor?.getAttributes('link').href as string | undefined) ?? '';
    linkOpen = !linkOpen;
  }

  function applyLink() {
    run((c) => (linkHref.trim()
      ? c.extendMarkRange('link').setLink({ href: linkHref.trim() })
      : c.extendMarkRange('link').unsetLink()));
    linkOpen = false;
  }

  function insert(name: string) {
    if (source) {
      sourceText += `[[${name}]]`;
      emit(sourceText);
    } else {
      run((c) => c.insertPlaceholder(name));
    }
    pickerOpen = false;
  }
</script>

<div class="kb-md" class:kb-md-error={!!field?.error} class:kb-md-readonly={readonly}>
  {#if !readonly}
    <div class="kb-md-toolbar" role="toolbar" aria-label={field?.label ?? field?.name}>
      <button type="button" title={_('Bold')} disabled={source} class:on={active('bold')}
              onclick={() => run((c) => c.toggleBold())}><Bold size={16} /></button>
      <button type="button" title={_('Italic')} disabled={source} class:on={active('italic')}
              onclick={() => run((c) => c.toggleItalic())}><Italic size={16} /></button>
      <button type="button" title={_('Heading')} disabled={source} class:on={active('heading', { level: 2 })}
              onclick={() => run((c) => c.toggleHeading({ level: 2 }))}><Heading size={16} /></button>
      <button type="button" title={_('List')} disabled={source} class:on={active('bulletList')}
              onclick={() => run((c) => c.toggleBulletList())}><List size={16} /></button>
      <button type="button" title={_('Numbered list')} disabled={source} class:on={active('orderedList')}
              onclick={() => run((c) => c.toggleOrderedList())}><ListOrdered size={16} /></button>
      <button type="button" title={_('Link')} disabled={source} class:on={active('link')}
              onclick={openLink}><LinkIcon size={16} /></button>
      {#if placeholders.length}
        <button type="button" title={_('Insert field')} class:on={pickerOpen}
                onclick={() => (pickerOpen = !pickerOpen)}><Braces size={16} /></button>
      {/if}
      <span class="kb-md-spacer"></span>
      <button type="button" title={_('Markdown source')} class:on={source}
              onclick={toggleSource}><FileCode size={16} /></button>
    </div>
    {#if linkOpen}
      <form class="kb-md-bar" onsubmit={(e) => { e.preventDefault(); applyLink(); }}>
        <input class="input" placeholder="https://..." bind:value={linkHref} />
        <button type="submit" class="kb-md-ok">OK</button>
      </form>
    {/if}
    {#if pickerOpen}
      <div class="kb-md-bar kb-md-fields">
        {#each placeholders as p (p.name)}
          <button type="button" class="kb-placeholder" onclick={() => insert(p.name)}>
            {p.label ?? p.name}
          </button>
        {/each}
      </div>
    {/if}
  {/if}

  <div class="kb-md-body" class:hidden={source} bind:this={element}></div>
  {#if source}
    <textarea class="kb-md-source" bind:value={sourceText} oninput={() => emit(sourceText)}
              onblur={() => onblur?.()} {readonly}></textarea>
  {/if}
</div>

<style>
  .kb-md {
    border: 1px solid var(--kb-border-input);
    border-radius: 0.375rem;
    background: var(--kb-surface);
    color: var(--kb-text);
  }
  .kb-md-error { border-color: var(--kb-danger); }
  .kb-md-toolbar {
    display: flex;
    gap: 0.125rem;
    padding: 0.25rem;
    border-bottom: 1px solid var(--kb-border);
  }
  .kb-md-toolbar button {
    display: inline-flex;
    padding: 0.3rem;
    border-radius: 0.25rem;
    color: var(--kb-text-subtle);
  }
  .kb-md-toolbar button:hover:not(:disabled) { background: var(--kb-surface-hover); }
  .kb-md-toolbar button.on { background: var(--kb-accent-subtle); color: var(--kb-accent); }
  .kb-md-toolbar button:disabled { opacity: 0.35; }
  .kb-md-spacer { flex: 1; }
  .kb-md-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    padding: 0.375rem;
    border-bottom: 1px solid var(--kb-border);
  }
  .kb-md-ok {
    padding: 0 0.75rem;
    border-radius: 0.25rem;
    background: var(--kb-accent);
    color: var(--kb-surface);
  }
  .kb-md-body :global(.ProseMirror) {
    min-height: 8rem;
    padding: 0.5rem 0.75rem;
    outline: none;
  }
  .kb-md-body :global(.ProseMirror p) { margin: 0.4em 0; }
  .kb-md-body :global(.ProseMirror h2) { font-size: 1.2em; font-weight: 600; margin: 0.6em 0 0.3em; }
  .kb-md-body :global(.ProseMirror ul) { list-style: disc; padding-left: 1.5em; }
  .kb-md-body :global(.ProseMirror ol) { list-style: decimal; padding-left: 1.5em; }
  .kb-md-body :global(.ProseMirror a) { color: var(--kb-accent); text-decoration: underline; }
  .kb-md-source {
    display: block;
    width: 100%;
    min-height: 8rem;
    field-sizing: content;
    padding: 0.5rem 0.75rem;
    border: 0;
    background: transparent;
    font-family: ui-monospace, monospace;
    font-size: 0.85em;
    resize: vertical;
    outline: none;
  }
  .kb-md :global(.kb-placeholder) {
    padding: 0 0.1em;
    border-radius: 0.25rem;
    background: var(--kb-accent-subtle);
    color: var(--kb-accent);
    font-size: 0.95em;
  }
  .hidden { display: none; }
</style>
