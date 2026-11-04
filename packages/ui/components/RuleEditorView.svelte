<script lang="ts">
  /**
   * RuleEditorView.svelte — the rule editor, as a stack page.
   *
   * A dense grid in the shape of iDempiere's Advanced Find: uniform rows,
   * aligned columns, nothing spent on decoration. The user edits one flat list
   * of conditions; the boxes are *derived* by splitting on OR, because with the
   * standard precedence — AND binds tighter — a flat list already is an OR of
   * AND groups. The box is the parenthesis, and nobody opens or closes one.
   *
   * Two columns of parentheses are what a general boolean tree would need. This
   * editor gives up that expressiveness (§5) and gets in exchange an interface
   * that cannot reach a state it does not know how to draw.
   *
   * Edits are local until Apply: opening the editor is a deliberate act, and so
   * is changing the set one is looking at.
   */
  import { getContext } from 'svelte';
  import { ArrowLeft, Check, Plus, CopyPlus, X, Search, ArrowUpDown, Eraser } from '@lucide/svelte';
  import { _, _t } from '../i18n';
  import { stack as globalStack } from '$kitebase/stack/stack.svelte';
  import type { StackInstance } from '$kitebase/stack/stack.svelte';
  import { serverConfig } from '$kitebase/api/serverConfig.svelte';
  import RuleValue from './RuleValue.svelte';
  import type { OrderSpec } from './dataview.query';
  import { filterFields, orderFields, splitByRank, type FilterField } from './dataview.fields';
  import {
    OPERATOR_ARITY, OPERATOR_WORD, operatorsFor, blockConflicts, blockRowIndices, isComplete,
    type RuleRow, type RuleOperator, type ConflictReason,
  } from './dataview.rules';

  const stack = getContext<StackInstance>('kb:stack') ?? globalStack;

  interface Props {
    /** Table the rules speak about. */
    model: string;
    rules?: RuleRow[];
    /** The order asked of the server, when the user has chosen one. */
    order?: OrderSpec[];
    /** The order the view opens with, from the descriptor. */
    defaultOrder?: OrderSpec[];
    /** The quick search in force — shown, never edited here (see below). */
    search?: string;
    title?: string;
    onApply: (r: { rules: RuleRow[]; order?: OrderSpec[]; search: string }) => void;
    onCancel?: () => void;
  }

  let {
    model, rules = [], order = [], defaultOrder = [], search = '',
    title = '', onApply, onCancel,
  }: Props = $props();

  // ── Local copy ─────────────────────────────────────────────────────────────

  const fields = $derived(filterFields(serverConfig.tables[model], serverConfig.types));
  const orderChoices = $derived(orderFields(fields));

  // `query_rank: more` waits behind "Show more…", an entry of the dropdown
  // itself: a native select has nothing else to click. Once asked, the rest
  // opens for every row of the editor. A field already chosen always shows in
  // its own row, whatever its rank — hiding the value in force would lie.
  const SHOW_MORE = '\u0000more';
  let showMore = $state(false);
  const fieldSplit = $derived(splitByRank(fields));
  const orderSplit = $derived(splitByRank(orderChoices));

  /** A dropdown's change: "Show more…" opens the rest, anything else is a choice. */
  function pick(e: Event, choose: (value: string) => void, current: string) {
    const el = e.target as HTMLSelectElement;
    if (el.value === SHOW_MORE) {
      showMore = true;
      el.value = current;
      return;
    }
    choose(el.value);
  }

  function cloneRows(src: RuleRow[]): RuleRow[] {
    return src.map(r => ({ join: r.join, rule: { ...r.rule } }));
  }

  let rows = $state<RuleRow[]>(cloneRows(rules));
  let orderField = $state(order[0]?.field ?? '');
  let orderDir = $state<'asc' | 'desc'>(order[0]?.dir ?? 'asc');
  let searchText = $state(search);

  // An editor that opens empty offers a row to fill: an empty row is a switched
  // off condition, which is the selection mask every gestionale has — ten fields
  // presented, two filled, the rest not taking part.
  $effect(() => {
    if (rows.length === 0 && fields.length > 0) rows = [newRow('and')];
  });

  const defaultOrderLabel = $derived.by(() => {
    const d = defaultOrder[0];
    if (!d) return _('as the view opens');
    const f = fields.find(x => x.name === d.field);
    const name = f?.label ?? d.field;
    return d.dir === 'desc' ? `${name} ↓` : name;
  });

  // ── Fields and operators ───────────────────────────────────────────────────

  function fieldOf(name: string): FilterField | undefined {
    return fields.find(f => f.name === name);
  }

  /**
   * The operators offered for a field. `is one of` on a foreign key waits for
   * the multi-value lookup: offering it now would open a cell where the only
   * way in is typing record ids, which is not an interface.
   */
  function opsFor(field: FilterField | undefined): RuleOperator[] {
    if (!field) return [];
    const ops = operatorsFor(field.primitive);
    return field.primitive === 'fk' ? ops.filter(o => o !== 'in') : ops;
  }

  /**
   * A new row opens on the field one would most likely fill: the one the table
   * shows itself by, then the first that is not the key. The key is rarely what
   * a filter starts from, and a row that opens on it is a row to change before
   * it can be used.
   */
  function defaultField(): FilterField | undefined {
    const display = serverConfig.tables[model]?.display_field;
    return fields.find(f => f.name === display)
      ?? fields.find(f => !f.pk)
      ?? fields[0];
  }

  function newRow(join: 'and' | 'or'): RuleRow {
    const field = defaultField();
    return {
      join,
      rule: { field: field?.name ?? '', op: opsFor(field)[0] ?? 'eq' },
    };
  }

  function setField(i: number, name: string) {
    const field = fieldOf(name);
    const ops = opsFor(field);
    const rule = rows[i].rule;
    rule.field = name;
    // A value belongs to the field it was typed for, and an operator to the
    // type that offers it: changing the field drops both rather than carrying
    // over a date into a number.
    if (!ops.includes(rule.op)) rule.op = ops[0] ?? 'eq';
    rule.value = undefined;
    rule.labels = undefined;
  }

  function setOp(i: number, op: RuleOperator) {
    const rule = rows[i].rule;
    const before = OPERATOR_ARITY[rule.op];
    rule.op = op;
    if (OPERATOR_ARITY[op] !== before) {
      rule.value = undefined;
      rule.labels = undefined;
    }
  }

  function addRow() {
    rows = [...rows, newRow('and')];
  }

  /**
   * A new alternative duplicates the current block. This is what makes the
   * normal form bearable: `A AND (B OR C)` means repeating A, and repeating it
   * must be one click rather than retyping.
   */
  function addAlternative() {
    const blocks = blockRowIndices(rows);
    const last = blocks[blocks.length - 1];
    if (!last) { rows = [...rows, newRow('or')]; return; }
    const copy = last.map((idx, k) => ({
      join: (k === 0 ? 'or' : 'and') as 'and' | 'or',
      rule: { ...rows[idx].rule },
    }));
    rows = [...rows, ...copy];
  }

  function removeRow(i: number) {
    const next = rows.filter((_r, k) => k !== i);
    // The first row of the list has no one above it to be joined to.
    if (next.length > 0) next[0] = { ...next[0], join: 'and' };
    rows = next;
  }

  /**
   * Everything back to the view as it opens, in the draft: no conditions, no
   * quick search, the view's own order. Apply makes it so, Escape keeps what was.
   */
  function clearAll() {
    rows = [];
    searchText = '';
    orderField = '';
  }

  function toggleJoin(i: number) {
    rows[i].join = rows[i].join === 'or' ? 'and' : 'or';
  }

  // ── Blocks and contradictions ──────────────────────────────────────────────

  const blocks = $derived(blockRowIndices(rows));

  const CONFLICT_TEXT: Record<ConflictReason, string> = {
    'distinct-values': 'A field holds one value: no row can satisfy both.',
    'value-outside-bounds': 'That value falls outside the range asked for above.',
    'disjoint-bounds': 'These bounds leave no value in between.',
    'null-and-value': 'An empty field satisfies no comparison.',
  };

  /** Reported on the second row of the pair, where the fix belongs. */
  const conflicts = $derived.by(() => {
    const found = new Map<number, { other: number; reason: ConflictReason }>();
    for (const block of blocks) {
      for (const c of blockConflicts(block.map(i => rows[i].rule))) {
        found.set(block[c.b], { other: block[c.a], reason: c.reason });
      }
    }
    return found;
  });

  // ── Exit ───────────────────────────────────────────────────────────────────

  function apply() {
    // Only complete conditions leave: the query ignores the others anyway, and
    // carried back they would keep the view looking filtered — the row the
    // editor offers to fill is not a condition until it has a value.
    const kept = rows.filter(r => r.rule.field && isComplete(r.rule));
    if (kept.length > 0) kept[0] = { ...kept[0], join: 'and' };
    onApply({
      rules: kept,
      order: orderField ? [{ field: orderField, dir: orderDir }] : undefined,
      search: searchText,
    });
    stack.pop();
  }

  function cancel() {
    onCancel?.();
    stack.pop();
  }

  /**
   * Escape leaves the editor — unless something inside has already answered it.
   * A combobox closing its dropdown calls preventDefault, and that is the signal
   * that the key was for it: without the check, closing a lookup would throw
   * away the rules being written behind it.
   */
  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.stopPropagation();
      cancel();
    }
  }
</script>

{#snippet moreOptions(more: FilterField[], current: string, marked: boolean)}
  {#if more.length > 0}
    {#if showMore}
      <optgroup label={_('More fields')}>
        {#each more as f (f.name)}
          <option value={f.name}>{f.label}{marked && f.indexed ? ' ·' : ''}</option>
        {/each}
      </optgroup>
    {:else}
      {#each more.filter(f => f.name === current) as f (f.name)}
        <option value={f.name}>{f.label}{marked && f.indexed ? ' ·' : ''}</option>
      {/each}
      <option value={SHOW_MORE}>{_('Show more…')}</option>
    {/if}
  {/if}
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="kb-re" onkeydown={handleKey} role="region" aria-label={_('Filter editor')}>

  <div class="kb-re-header">
    <button class="kb-re-back" onclick={cancel} title={_('Cancel (Esc)')} aria-label={_('Cancel (Esc)')}>
      <ArrowLeft size={16} />
    </button>
    <h2 class="kb-re-title">{title || _t('Filter — {model}', { model })}</h2>
    <button class="kb-re-apply" onclick={apply} title={_('Apply')}>
      <Check size={14} /> {_('Apply')}
    </button>
  </div>

  <div class="kb-re-body">

    <!-- ── What holds for the whole query, above every box ────────────────
         The quick search is in AND over everything, which is exactly why it
         cannot be one of the rows: a flat list in disjunctive form has no
         place above its own OR. It is shown so that opening the editor tells
         the whole truth about the set, and can be cleared from here. -->
    <div class="kb-re-context">
      {#if searchText}
        <div class="kb-re-ctx-row">
          <span class="kb-re-ctx-join">{_('AND')}</span>
          <Search size={13} />
          <span class="kb-re-ctx-label">{_('Quick search')}</span>
          <span class="kb-re-ctx-value">“{searchText}”</span>
          <button class="kb-re-icon" onclick={() => (searchText = '')} title={_('Clear search')}>
            <X size={12} />
          </button>
        </div>
      {/if}

      <div class="kb-re-ctx-row">
        <span class="kb-re-ctx-join"><ArrowUpDown size={13} /></span>
        <span class="kb-re-ctx-label">{_('Order by')}</span>
        <select
          class="kb-re-select"
          value={orderField}
          onchange={(e) => pick(e, (v) => (orderField = v), orderField)}
          aria-label={_('Order by')}
        >
          <option value="">{_t('Default ({order})', { order: defaultOrderLabel })}</option>
          {#each orderSplit.main as f (f.name)}
            <option value={f.name}>{f.label}{f.indexed ? ' ·' : ''}</option>
          {/each}
          {@render moreOptions(orderSplit.more, orderField, true)}
        </select>
        {#if orderField}
          <button
            class="kb-re-dir"
            onclick={() => (orderDir = orderDir === 'asc' ? 'desc' : 'asc')}
            title={orderDir === 'asc' ? _('Ascending') : _('Descending')}
          >
            {orderDir === 'asc' ? '↑' : '↓'}
          </button>
          <button class="kb-re-icon" onclick={() => (orderField = '')} title={_('Back to the view order')}>
            <X size={12} />
          </button>
        {/if}
        <span class="kb-re-hint">{_('· can be sorted cheaply')}</span>
      </div>
    </div>

    <!-- ── The conditions ─────────────────────────────────────────────── -->
    {#each blocks as block, b (b)}
      {#if b > 0}
        <div class="kb-re-or"><span>{_('OR')}</span></div>
      {/if}

      <div class="kb-re-block">
        {#each block as i (i)}
          {@const rule = rows[i].rule}
          {@const field = fieldOf(rule.field)}
          {@const conflict = conflicts.get(i)}
          <div class="kb-re-row">
            <div class="kb-re-join">
              {#if i > 0}
                <button
                  class="kb-re-join-btn"
                  class:kb-re-join-or={rows[i].join === 'or'}
                  onclick={() => toggleJoin(i)}
                  title={rows[i].join === 'or' ? _('OR — starts an alternative') : _('AND — binds tighter')}
                >{rows[i].join === 'or' ? _('OR') : _('AND')}</button>
              {/if}
            </div>

            <select
              class="kb-re-select kb-re-field"
              value={rule.field}
              onchange={(e) => pick(e, (v) => setField(i, v), rule.field)}
              aria-label={_('Field')}
            >
              {#each fieldSplit.main as f (f.name)}
                <option value={f.name}>{f.label}</option>
              {/each}
              {@render moreOptions(fieldSplit.more, rule.field, false)}
            </select>

            <select
              class="kb-re-select kb-re-op"
              value={rule.op}
              onchange={(e) => setOp(i, (e.target as HTMLSelectElement).value as RuleOperator)}
              aria-label={_('Operator')}
            >
              {#each opsFor(field) as op (op)}
                <option value={op}>{_(OPERATOR_WORD[op])}</option>
              {/each}
            </select>

            <div class="kb-re-value">
              {#if field}
                <RuleValue
                  {field}
                  op={rule.op}
                  value={rule.value}
                  labels={rule.labels}
                  onchange={(v) => (rows[i].rule.value = v)}
                  onlabels={(l) => (rows[i].rule.labels = l)}
                />
              {/if}
            </div>

            <button class="kb-re-icon" onclick={() => removeRow(i)} title={_('Remove condition')}>
              <X size={13} />
            </button>
          </div>

          {#if conflict}
            <!-- Said on the row, never executed quietly: the block is not
                 switched off, because silently reducing a query the user wrote
                 is changing the question without saying so. Other blocks in OR
                 may well return rows. -->
            <div class="kb-re-conflict">
              <span>{_(CONFLICT_TEXT[conflict.reason])}</span>
              <button class="kb-re-fix" onclick={() => toggleJoin(i)}>{_('Did you mean OR?')}</button>
            </div>
          {/if}
        {/each}
      </div>
    {/each}

    <div class="kb-re-actions">
      <button class="kb-re-btn" onclick={addRow}>
        <Plus size={13} /> {_('Add condition')}
      </button>
      <button class="kb-re-btn" onclick={addAlternative} title={_('Duplicates this block as an alternative')}>
        <CopyPlus size={13} /> {_('Add alternative')}
      </button>
      <button class="kb-re-btn" onclick={clearAll} title={_('Conditions, search and order back to the view (Apply to confirm)')}>
        <Eraser size={13} /> {_('Clear all')}
      </button>
    </div>

  </div>
</div>

<style>
  .kb-re {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--kb-bg);
    color: var(--kb-text);
  }

  /* ── Header ──────────────────────────────────────────────────────────── */

  .kb-re-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.6rem;
    border-bottom: 1px solid var(--kb-border);
    background: var(--kb-surface);
    flex-shrink: 0;
  }

  .kb-re-title {
    flex: 1 1 auto;
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .kb-re-back {
    display: inline-flex;
    align-items: center;
    border: none;
    background: none;
    color: var(--kb-text);
    cursor: pointer;
    padding: 0.15rem;
  }

  .kb-re-apply {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.6rem;
    border: 1px solid var(--kb-accent, #3b82f6);
    border-radius: 0.25rem;
    background: color-mix(in srgb, var(--kb-accent, #3b82f6) 12%, transparent);
    color: var(--kb-accent, #3b82f6);
    font-size: 0.75rem;
    cursor: pointer;
  }

  .kb-re-body {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 0.6rem;
  }

  /* ── Context: what holds for the whole query ─────────────────────────── */

  .kb-re-context {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-bottom: 0.5rem;
    margin-bottom: 0.5rem;
    border-bottom: 1px solid var(--kb-border);
  }

  .kb-re-ctx-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.75rem;
    color: var(--kb-text-subtle);
  }

  .kb-re-ctx-join {
    display: inline-flex;
    justify-content: center;
    width: 2rem;
    flex-shrink: 0;
    font-size: 0.68rem;
    font-weight: 600;
  }

  .kb-re-ctx-label { color: var(--kb-text); }
  .kb-re-ctx-value { color: var(--kb-text); font-style: italic; }

  .kb-re-hint {
    font-size: 0.65rem;
    color: var(--kb-text-subtle);
  }

  /* ── Rows ────────────────────────────────────────────────────────────── */

  .kb-re-block {
    border: 1px solid var(--kb-border);
    border-radius: 0.3rem;
    padding: 0.3rem 0.4rem;
    background: var(--kb-surface);
  }

  .kb-re-or {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.35rem 0;
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--kb-text-subtle);
  }

  .kb-re-or::after {
    content: '';
    flex: 1 1 auto;
    height: 1px;
    background: var(--kb-border);
  }

  .kb-re-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.12rem 0;
  }

  .kb-re-join {
    width: 2rem;
    flex-shrink: 0;
    display: flex;
    justify-content: center;
  }

  .kb-re-join-btn {
    width: 1.5rem;
    height: 1.4rem;
    border: 1px solid var(--kb-border);
    border-radius: 0.25rem;
    background: var(--kb-bg);
    color: var(--kb-text-subtle);
    font-size: 0.68rem;
    font-weight: 700;
    cursor: pointer;
  }

  .kb-re-join-or {
    border-color: color-mix(in srgb, var(--kb-accent, #3b82f6) 40%, transparent);
    color: var(--kb-accent, #3b82f6);
  }

  .kb-re-select {
    height: 1.5rem;
    padding: 0 0.25rem;
    border: 1px solid var(--kb-border-input);
    border-radius: 0.25rem;
    background: var(--kb-bg);
    color: var(--kb-text);
    font-size: 0.75rem;
  }

  .kb-re-field { width: 11rem; flex-shrink: 0; }
  .kb-re-op    { width: 9rem;  flex-shrink: 0; }

  .kb-re-value {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    flex: 1 1 auto;
    min-width: 0;
  }

  .kb-re-icon {
    display: inline-flex;
    align-items: center;
    border: none;
    background: none;
    padding: 0.1rem;
    color: var(--kb-text-subtle);
    cursor: pointer;
    flex-shrink: 0;
  }

  .kb-re-icon:hover { color: var(--kb-danger, #ef4444); }

  .kb-re-dir {
    width: 1.5rem;
    height: 1.5rem;
    border: 1px solid var(--kb-border-input);
    border-radius: 0.25rem;
    background: var(--kb-bg);
    color: var(--kb-text);
    cursor: pointer;
  }

  /* ── Contradiction ───────────────────────────────────────────────────── */

  .kb-re-conflict {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-left: 2.3rem;
    padding: 0.1rem 0 0.25rem;
    font-size: 0.68rem;
    color: var(--kb-warning, #b45309);
  }

  .kb-re-fix {
    border: none;
    background: none;
    padding: 0;
    color: var(--kb-accent, #3b82f6);
    font-size: 0.68rem;
    text-decoration: underline;
    cursor: pointer;
  }

  /* ── Actions ─────────────────────────────────────────────────────────── */

  .kb-re-actions {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.5rem;
    margin-left: 2.3rem;
  }

  .kb-re-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--kb-border);
    border-radius: 0.25rem;
    background: var(--kb-bg);
    color: var(--kb-text);
    font-size: 0.72rem;
    cursor: pointer;
  }

  .kb-re-btn:hover { background: var(--kb-surface-hover); }
</style>
