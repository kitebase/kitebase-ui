<script lang="ts">
  /**
   * A number, typed and shown as a person expects (widgets/number.ts).
   *
   * While the field has the focus the number is bare, and the point and the
   * comma both mean decimals; when it leaves, the number is rounded to the
   * column's scale and shown in the browser's language, grouped, on the right.
   * The draft gets the number as it is typed, so a save from the keyboard
   * never misses the last digits. `currency` shows the cents, `percent` a `%`.
   */
  import type { FormField } from '../dataform.types';
  import { dispatchEnter } from './widget.svelte.ts';
  import { numberShape, parseNumber, typeable, roundTo, formatNumber, editText } from './number';

  interface Props {
    value: unknown;
    onchange: (v: number | null) => void;
    onblur?: () => void;
    readonly?: boolean;
    field: FormField;
  }

  let { value, onchange, onblur, readonly = false, field }: Props = $props();

  const shape = $derived(numberShape(field));
  const numeric = $derived(
    value == null || value === '' ? null : typeof value === 'number' ? value : Number(value)
  );

  let prefix = $derived((field.widget_props?.prefix as string | undefined) ?? '');
  let suffix = $derived(
    (field.widget_props?.suffix as string | undefined) ?? (field.widget === 'percent' ? '%' : '')
  );

  // What the box holds while typing; outside the field, the formatted value
  let focused = $state(false);
  let typed = $state('');
  const shown = $derived(focused ? typed : formatNumber(numeric, shape));

  function handleFocus() {
    typed = editText(numeric, shape);
    focused = true;
  }

  // Only a value that changed is handed on: passing through an empty field
  // must not turn "never set" into null and make the form look edited
  function hand(n: number | null) {
    if (n !== numeric) onchange(n);
  }

  function handleInput(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const clean = typeable(input.value, shape.scale === 0);
    if (clean !== input.value) input.value = clean;   // what cannot make a number is refused
    typed = clean;
    const n = parseNumber(clean);
    if (n === null || !Number.isNaN(n)) hand(n);
  }

  function handleBlur() {
    const n = parseNumber(typed);
    // Not a number after all ("1,2,3", a lone "-"): back to what it was
    if (n === null) hand(null);
    else if (!Number.isNaN(n)) hand(roundTo(n, shape.scale));
    focused = false;
    onblur?.();
  }
</script>

{#if readonly}
  <span class="kb-widget-ro kb-number-ro">{prefix ? `${prefix} ` : ''}{formatNumber(numeric, shape)}{suffix ? ` ${suffix}` : ''}</span>
{:else}
  <div class="relative flex items-center">
    {#if prefix}
      <span class="absolute left-3 select-none text-sm text-gray-400">{prefix}</span>
    {/if}
    <input
      type="text"
      inputmode={shape.scale === 0 ? 'numeric' : 'decimal'}
      autocomplete="off"
      class="input kb-number {field.error ? 'input-error' : ''} {prefix ? 'pl-8' : ''} {suffix ? 'pr-8' : ''}"
      value={shown}
      onfocus={handleFocus}
      oninput={handleInput}
      onblur={handleBlur}
      onkeydown={dispatchEnter}
      placeholder={field.placeholder as string | undefined}
      aria-label={field.label ?? field.name}
    />
    {#if suffix}
      <span class="absolute right-3 select-none text-sm text-gray-400">{suffix}</span>
    {/if}
  </div>
{/if}

<style>
  .kb-widget-ro {
    display: block;
    padding: 0.4rem 0;
    font-size: 0.875rem;
    color: var(--kb-text);
    min-height: 2rem;
    line-height: 1.5;
  }

  .kb-number-ro,
  .kb-number {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
