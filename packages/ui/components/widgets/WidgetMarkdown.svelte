<script lang="ts">
  /**
   * The widget of a `Markdown` column: rich text over a markdown value, with
   * the source a button away. The editor is loaded the first time a form
   * shows one, so a client that never does is not made heavier by it.
   *
   * `field.placeholders` (a list of {name, label}) offers the fields of a
   * template, inserted as `[[name]]`.
   */
  import type { FormField } from '../dataform.types';

  interface Props {
    value: unknown;
    onchange: (v: string | null) => void;
    onblur?: () => void;
    readonly?: boolean;
    field: FormField;
  }

  let { value, onchange, onblur, readonly = false, field }: Props = $props();

  const editor = import('../editor/MarkdownEditor.svelte');
  const placeholders = $derived(
    (field.placeholders as { name: string; label?: string }[] | undefined) ?? []);
</script>

{#await editor}
  <div class="input min-h-32 text-[var(--kb-text-subtle)]">{typeof value === 'string' ? value : ''}</div>
{:then { default: MarkdownEditor }}
  <MarkdownEditor {value} {onchange} {onblur} {readonly} {field} {placeholders} />
{/await}
