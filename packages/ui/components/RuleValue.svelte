<script lang="ts">
  /**
   * RuleValue.svelte — the value of one rule.
   *
   * The operator decides *how many* values are needed; the field's primitive
   * decides *how they are chosen*. Kept as a component of its own rather than
   * markup inside the editor grid, because the chip strip opens the same widget
   * in a popover: a second, reduced implementation would diverge at the first
   * new type.
   *
   * Widths are by primitive rather than by stretching. A range over dates or
   * numbers is two short values and must not be what decides the width of the
   * value column; a range over a foreign key is two lookups, which is the case
   * that needs the room.
   */
  import { X } from '@lucide/svelte';
  import { _ } from '../i18n';
  import WidgetFKCombobox from './widgets/WidgetFKCombobox.svelte';
  import WidgetCodeSet from './widgets/WidgetCodeSet.svelte';
  import WidgetRefSet from './widgets/WidgetRefSet.svelte';
  import { refsetName } from '../formatters/refset';
  import type { FormField } from './dataform.types';
  import type { FilterField } from './dataview.fields';
  import { OPERATOR_ARITY, type RuleOperator } from './dataview.rules';

  interface Props {
    field: FilterField;
    op: RuleOperator;
    value: unknown;
    onchange: (v: unknown) => void;
    /** Labels captured beside record ids at the moment of choosing (§6.2). */
    labels?: string[];
    onlabels?: (l: string[]) => void;
  }

  let { field, op, value, onchange, labels = [], onlabels }: Props = $props();

  const arity = $derived(OPERATOR_ARITY[op] ?? 'one');
  const isFk = $derived(field.primitive === 'fk');

  // Native input type per primitive. A dense grid wants the browser's own
  // editors here: they are one line high and know the locale's date format.
  const inputType = $derived(
    field.primitive === 'number' ? 'number'
    : field.primitive === 'date' ? 'date'
    : field.primitive === 'time' ? 'time'
    : 'text',
  );

  // A datetime is a date plus an optional time, never one datetime-local box:
  // that box is empty until the time is filled too, and a value counts for its
  // precision on the server: a date alone is the whole day, a time narrows it
  // to the minute. Composed as an ISO string, '2026-09-29' or '2026-09-29T08:10'.
  const isDateTime = $derived(field.primitive === 'datetime');

  function splitDateTime(v: unknown): [string, string] {
    const [d = '', t = ''] = typeof v === 'string' ? v.split('T') : [];
    return [d, t.slice(0, 5)];
  }

  function joinDateTime(d: string, t: string): string {
    return d === '' ? '' : t === '' ? d : `${d}T${t}`;
  }

  const inputClass = $derived(
    field.primitive === 'number' ? 'kb-rv-input kb-rv-num'
    : field.primitive === 'string' ? 'kb-rv-input kb-rv-text'
    : 'kb-rv-input kb-rv-short',
  );

  /** Numbers stay numbers: comparisons and contradiction checks depend on it. */
  function coerce(raw: string): unknown {
    if (raw === '') return '';
    return field.primitive === 'number' ? Number(raw) : raw;
  }

  function setOne(e: Event) {
    onchange(coerce((e.target as HTMLInputElement).value));
  }

  const bounds = $derived(Array.isArray(value) ? value : []);

  function setBound(i: 0 | 1, v: unknown) {
    const next = [bounds[0], bounds[1]];
    next[i] = v;
    onchange(next);
  }

  // ── Many: free values typed one at a time ────────────────────────────────
  // Enter turns what was typed into a chip. Backspace on an empty box removes
  // the last one, which is what every chip input does and nobody has to be told.

  const chips = $derived(Array.isArray(value) ? value : []);
  let draft = $state('');

  function addChip() {
    const v = coerce(draft.trim());
    if (v === '' || (typeof v === 'number' && Number.isNaN(v))) return;
    onchange([...chips, v]);
    draft = '';
  }

  function removeChip(i: number) {
    onchange(chips.filter((_v, k) => k !== i));
    if (labels.length) onlabels?.(labels.filter((_l, k) => k !== i));
  }

  function handleChipKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      addChip();
    } else if (e.key === 'Backspace' && draft === '' && chips.length > 0) {
      removeChip(chips.length - 1);
    }
  }

  // A foreign key has no values, it has records: the widget is the form's own
  // FK combobox, which sends the typed text as the query's `search` key. What
  // it writes is the stored key, which is why a range over it is well defined.
  // A set of codes is picked from its vocabulary, with the form's own popup.
  const codesField = $derived({
    name: field.name,
    label: field.label,
    choices_endpoint: field.choicesEndpoint,
  } as unknown as FormField);

  // The entries of a RefSet are records of its vocabulary: the form's badge
  // widget, without adding new ones, since a filter only names what exists.
  const refsetField = $derived({
    name: field.name,
    label: field.label,
    ref_set: { ...field.refSet, create: false },
  } as unknown as FormField);

  function setRefs(keys: unknown[]) {
    onchange(keys);
    const target = field.refSet?.target;
    if (target) onlabels?.(keys.map((k) => refsetName(target, k) ?? String(k)));
  }

  const fkField = $derived({
    name: field.name,
    label: field.label,
    foreign_key: { target: field.fkTarget ?? '', field: 'id' },
  } as unknown as FormField);
</script>

{#snippet dateTime(v: unknown, set: (next: string) => void, label: string)}
  {@const [d, t] = splitDateTime(v)}
  <input
    type="date" class="kb-rv-input kb-rv-date"
    value={d} oninput={(e) => set(joinDateTime((e.target as HTMLInputElement).value, t))}
    aria-label={label}
  />
  <input
    type="time" class="kb-rv-input kb-rv-time"
    value={t} disabled={d === ''}
    oninput={(e) => set(joinDateTime(d, (e.target as HTMLInputElement).value))}
    aria-label={`${label} (${_('time')})`} title={_('Optional: without a time the whole day counts')}
  />
{/snippet}

{#if arity === 'none'}
  <span class="kb-rv-none">—</span>

{:else if arity === 'two'}
  <!-- Two bounds. Filling one only is an open interval, not an unfinished row,
       so neither side carries a required mark. -->
  {#if isFk}
    <div class="kb-rv-fk kb-rv-fk-half">
      <WidgetFKCombobox value={bounds[0] ?? null} field={fkField} onchange={(v) => setBound(0, v)} />
    </div>
    <span class="kb-rv-sep">…</span>
    <div class="kb-rv-fk kb-rv-fk-half">
      <WidgetFKCombobox value={bounds[1] ?? null} field={fkField} onchange={(v) => setBound(1, v)} />
    </div>
  {:else if isDateTime}
    {@render dateTime(bounds[0], (v) => setBound(0, v), _('From'))}
    <span class="kb-rv-sep">…</span>
    {@render dateTime(bounds[1], (v) => setBound(1, v), _('To'))}
  {:else}
    <input
      type={inputType} class={inputClass}
      value={bounds[0] ?? ''} oninput={(e) => setBound(0, coerce((e.target as HTMLInputElement).value))}
      aria-label={_('From')} placeholder={_('From')}
    />
    <span class="kb-rv-sep">…</span>
    <input
      type={inputType} class={inputClass}
      value={bounds[1] ?? ''} oninput={(e) => setBound(1, coerce((e.target as HTMLInputElement).value))}
      aria-label={_('To')} placeholder={_('To')}
    />
  {/if}

{:else if field.primitive === 'refset'}
  <div class="kb-rv-fk">
    <WidgetRefSet value={value ?? []} field={refsetField} onchange={setRefs} />
  </div>

{:else if field.primitive === 'codes'}
  <div class="kb-rv-fk">
    <WidgetCodeSet value={value ?? []} field={codesField} onchange={(v) => onchange(v)} />
  </div>

{:else if arity === 'many'}
  <div class="kb-rv-chips">
    {#each chips as chip, i (i)}
      <span class="kb-rv-chip">
        <span class="kb-rv-chip-label">{labels[i] ?? String(chip)}</span>
        <button class="kb-rv-chip-x" onclick={() => removeChip(i)} title={_('Remove')}>
          <X size={10} />
        </button>
      </span>
    {/each}
    <input
      type="text" class="kb-rv-chip-input"
      bind:value={draft}
      onkeydown={handleChipKey}
      onblur={addChip}
      placeholder={chips.length === 0 ? _('Type a value, then Enter') : ''}
      aria-label={_('Add a value')}
    />
  </div>

{:else if isFk}
  <div class="kb-rv-fk">
    <WidgetFKCombobox value={value ?? null} field={fkField} onchange={(v) => onchange(v)} />
  </div>

{:else if field.primitive === 'boolean'}
  <!-- Three answers, one control: true, false, and not asking. The blank entry
       is the row switched off — the same meaning an empty text box carries. -->
  <select
    class="kb-rv-input kb-rv-short"
    value={value === true ? 'true' : value === false ? 'false' : ''}
    onchange={(e) => {
      const v = (e.target as HTMLSelectElement).value;
      onchange(v === '' ? undefined : v === 'true');
    }}
    aria-label={_('Value')}
  >
    <option value="">{_('all')}</option>
    <option value="true">{_('yes')}</option>
    <option value="false">{_('no')}</option>
  </select>

{:else if isDateTime}
  {@render dateTime(value, (v) => onchange(v), _('Value'))}

{:else}
  <input
    type={inputType} class={inputClass}
    value={(value as string | number | undefined) ?? ''} oninput={setOne}
    aria-label={_('Value')}
  />
{/if}

<style>
  .kb-rv-none {
    color: var(--kb-text-subtle);
    font-size: 0.72rem;
  }

  .kb-rv-input {
    height: 1.5rem;
    padding: 0 0.35rem;
    border: 1px solid var(--kb-border-input);
    border-radius: 0.25rem;
    background: var(--kb-bg);
    color: var(--kb-text);
    font-size: 0.75rem;
    line-height: 1.2;
  }

  .kb-rv-input:focus {
    outline: none;
    border-color: var(--kb-accent, #3b82f6);
  }

  /* Widths by primitive: a range of dates or numbers must not be what widens
     the value column, which a lookup needs whole. */
  .kb-rv-num   { width: 7rem; text-align: right; }
  .kb-rv-short { width: 9.5rem; }
  .kb-rv-date  { width: 8.5rem; }
  .kb-rv-time  { width: 5.5rem; margin-left: 0.15rem; }
  .kb-rv-text  { width: 100%; max-width: 24rem; }

  .kb-rv-sep {
    color: var(--kb-text-subtle);
    font-size: 0.8rem;
    padding: 0 0.15rem;
  }

  .kb-rv-fk {
    flex: 1 1 auto;
    min-width: 10rem;
    max-width: 24rem;
  }

  /* Two lookups side by side: the case that decides the column width. */
  .kb-rv-fk-half {
    min-width: 8rem;
    max-width: 14rem;
  }

  /* ── Chips ─────────────────────────────────────────────────────────────
     One line high, like every other row of the grid: what does not fit
     scrolls sideways rather than pushing the rows apart. */

  .kb-rv-chips {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    flex: 1 1 auto;
    min-width: 8rem;
    max-width: 30rem;
    height: 1.5rem;
    padding: 0 0.25rem;
    border: 1px solid var(--kb-border-input);
    border-radius: 0.25rem;
    background: var(--kb-bg);
    overflow-x: auto;
    overflow-y: hidden;
  }

  .kb-rv-chips:focus-within {
    border-color: var(--kb-accent, #3b82f6);
  }

  .kb-rv-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    flex: 0 0 auto;
    max-width: 10rem;
    padding: 0 0.15rem 0 0.35rem;
    border-radius: 0.75rem;
    background: var(--kb-surface-hover);
    color: var(--kb-text);
    font-size: 0.7rem;
    line-height: 1.15rem;
  }

  .kb-rv-chip-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kb-rv-chip-x {
    display: inline-flex;
    align-items: center;
    border: none;
    background: none;
    padding: 0;
    color: var(--kb-text-subtle);
    cursor: pointer;
  }

  .kb-rv-chip-x:hover { color: var(--kb-danger, #ef4444); }

  .kb-rv-chip-input {
    flex: 1 0 6rem;
    min-width: 4rem;
    border: none;
    outline: none;
    background: none;
    color: var(--kb-text);
    font-size: 0.75rem;
  }
</style>
