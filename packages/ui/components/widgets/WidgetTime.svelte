<script lang="ts">
  /**
   * A time of day, typed as people type it (`930`, `9.30`, `9:30`, `9`): the
   * same box as the time half of a datetime (WidgetDate), so an hour is written
   * one way across the application. Text that is not a time keeps the last
   * good one, and `oninvalid` tells the form, which refuses to save until it is
   * corrected.
   *
   * On a `Time` column the draft gets "HH:MM". On a `DateTime` column
   * (`withDate`) the form asks the time alone and the draft gets an instant:
   * the day the value already had, or the operational date for a new one.
   * Where a time goes with a date, the date is usually there; the rules of the
   * table decide the day that holds (a date of the row, the next morning).
   */
  import { untrack } from 'svelte';
  import type { FormField } from '../dataform.types';
  import { _ } from '../../i18n';
  import { parseTime, splitDateTime } from '../datetime';
  import { authStore } from '../../auth/store.svelte';
  import { dispatchEnter } from './widget.svelte.ts';

  interface Props {
    value: unknown;
    onchange: (v: string | null) => void;
    onblur?: () => void;
    oninvalid?: (message: string | null) => void;
    readonly?: boolean;
    /** The column is a DateTime: the value is an instant, its time shown. */
    withDate?: boolean;
    field: FormField;
  }

  let { value, onchange, onblur, oninvalid, readonly = false, withDate = false,
        field }: Props = $props();

  /** The time of a value, as hh:mm: "22:00:00", or the time of an instant. */
  function shown(v: unknown): string {
    if (typeof v !== 'string') return '';
    const time = v.length > 10 && (v[10] === 'T' || v[10] === ' ') ? splitDateTime(v).time : v;
    return (time ?? '').slice(0, 5);
  }

  /** What the draft gets for a time typed: the time, or the instant. */
  function handed(time: string | null): string | null {
    if (!withDate || time === null) return time;
    const day = splitDateTime(value).date ?? authStore.opDate;
    return `${day}T${time}:00`;
  }

  let text = $state(untrack(() => shown(value)));
  let invalid = $state(false);

  // A value set from outside (a load, a recomputation) replaces the text,
  // unless it is the one this box just handed on
  $effect(() => {
    const v = shown(value);
    if (untrack(() => parseTime(text).time) === (v || null)) return;
    text = v;
    invalid = false;
  });

  function handleInput(e: Event) {
    text = (e.target as HTMLInputElement).value;
    const { time, valid } = parseTime(text);
    invalid = !valid;
    oninvalid?.(valid ? null : _('Invalid time: 930, 9.30, 9:30'));
    if (valid && time !== (shown(value) || null)) onchange(handed(time));
  }

  function handleBlur() {
    if (!invalid) text = shown(value);
    onblur?.();
  }
</script>

{#if readonly}
  <span class="kb-widget-ro tabular-nums">{shown(value)}</span>
{:else}
  <input
    type="text"
    inputmode="numeric"
    class="input w-24 tabular-nums {field.error || invalid ? 'input-error' : ''}"
    placeholder="hh:mm"
    value={text}
    oninput={handleInput}
    onblur={handleBlur}
    onkeydown={dispatchEnter}
    title={invalid ? _('Invalid time: 930, 9.30, 9:30') : undefined}
    aria-label={field.label ?? field.name}
    aria-invalid={invalid}
  />
{/if}
