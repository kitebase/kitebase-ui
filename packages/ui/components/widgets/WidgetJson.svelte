<script lang="ts">
  /**
   * A JSON value written as text: the widget of the `Json` type, and the way a
   * power user writes a value another widget also edits (the codes of a
   * checklist). The draft holds the parsed value, so both stay in step.
   *
   * Text that does not parse is not a value: it stays on screen, the draft keeps
   * the last good one, and `oninvalid` tells the form, which refuses to save
   * until it is corrected.
   */
  import { untrack } from 'svelte';
  import { _ } from '../../i18n';
  import type { FormField } from '../dataform.types';

  interface Props {
    value: unknown;
    onchange: (v: unknown) => void;
    onblur?: () => void;
    oninvalid?: (message: string | null) => void;
    readonly?: boolean;
    field: FormField;
  }

  let { value, onchange, onblur, oninvalid, readonly = false, field }: Props = $props();

  function format(v: unknown): string {
    return v === null || v === undefined ? '' : JSON.stringify(v);
  }

  /** The text as the value it stands for, formatted; null when it does not parse. */
  function normalized(text: string): string | null {
    if (text.trim() === '') return '';
    try {
      return JSON.stringify(JSON.parse(text));
    } catch {
      return null;
    }
  }

  let text = $state(untrack(() => format(value)));

  // A change from elsewhere (another widget, a reload) rewrites the text; the
  // text the user is typing is left alone while it says the same thing.
  $effect(() => {
    const incoming = format(value);
    if (incoming !== untrack(() => normalized(text))) {
      text = incoming;
      oninvalid?.(null);
    }
  });

  function handleInput(e: Event) {
    text = (e.target as HTMLTextAreaElement).value;
    if (text.trim() === '') {
      oninvalid?.(null);
      onchange(null);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      oninvalid?.(null);
      onchange(parsed);
    } catch {
      oninvalid?.(_('Not valid JSON'));
    }
  }
</script>

<textarea
  class="input resize-y font-mono text-sm {readonly ? 'read-only:bg-gray-50 read-only:cursor-default read-only:text-gray-600' : ''}"
  rows={field.rows as number | undefined ?? 2}
  value={text}
  oninput={handleInput}
  onblur={() => onblur?.()}
  spellcheck="false"
  {readonly}
  placeholder={field.placeholder as string | undefined}
  aria-label={field.label ?? field.name}
></textarea>
