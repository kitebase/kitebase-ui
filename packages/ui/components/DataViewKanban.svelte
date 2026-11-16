<script lang="ts">
  /**
   * DataViewKanban.svelte: the `kanban` renderer of DataView, the board.
   *
   * The rows the table loaded, under the values of the table's state column
   * (kanban.ts): one column per value, an empty one included, each headed by
   * its count and, when the view names one, the total of a column. A card
   * shows what the view's `card` names, as on the cards.
   *
   * Dragging a card onto another column is `onMove`, which writes the state
   * through the db port: the table's rules may refuse, and then the card stays
   * where it was, with the message. A folded column is a narrow strip, which a
   * click opens; it still takes a card.
   *
   * When the values are rows of a table `within` something (the stages of a
   * pipeline), the board shows one of those at a time, picked above it.
   */
  import type { CardConfig } from './dataview.types';
  import { boardColumns, valueKey, type BoardValue } from './kanban';
  import { rowTones, toneOf, type ColumnTone } from './tone';
  import { _ } from '../i18n';

  export interface BoardContext {
    label: string;
    options: Array<{ value: unknown; label: string }>;
    value: unknown;
    onChange: (value: unknown) => void;
  }

  interface Props {
    rows: unknown[];
    values: BoardValue[];
    stateField: string;
    card: CardConfig;
    /** The title of a column, by key: the label of a card field. */
    titles: Record<string, string>;
    /** The labels of a column's choices, by key then value: shown for the value. */
    labels?: Record<string, Record<string, string>>;
    pkField: string;
    activeId: unknown;
    sumField?: string;
    /** How the total reads: the column's own number format. */
    formatSum?: (n: number) => string;
    context?: BoardContext | null;
    tones?: Record<string, ColumnTone>;
    onRowClick: (row: Record<string, unknown>) => void;
    onRowDblClick: (row: Record<string, unknown>) => void;
    onMove: (row: Record<string, unknown>, value: unknown) => void;
  }

  let { rows, values, stateField, card, titles, labels = {}, pkField, activeId, sumField,
        formatSum = (n) => n.toLocaleString(), context = null, tones = {},
        onRowClick, onRowDblClick, onMove }: Props = $props();

  const columns = $derived(boardColumns(values, rows as Record<string, unknown>[],
                                        stateField, sumField, _('Other')));

  // Folded as the values say, until the user opens or closes one
  let toggled = $state<Set<string>>(new Set());
  function isFolded(key: string, folded: boolean | undefined): boolean {
    return toggled.has(key) ? !folded : !!folded;
  }
  function toggle(key: string) {
    const next = new Set(toggled);
    if (next.has(key)) next.delete(key); else next.add(key);
    toggled = next;
  }

  let dragged = $state<Record<string, unknown> | null>(null);
  let dropKey = $state<string | null>(null);

  function canDrop(key: string, droppable: boolean): boolean {
    return droppable && dragged !== null && valueKey(dragged[stateField]) !== key;
  }

  function dropped(e: DragEvent, value: unknown, key: string, droppable: boolean) {
    e.preventDefault();
    const row = dragged;
    const ok = canDrop(key, droppable);
    dropKey = null;
    dragged = null;
    if (row && ok) onMove(row, value);
  }

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|$)/;

  function text(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? _('Yes') : _('No');
    if (typeof value === 'string' && ISO_DATE.test(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return value.length > 10 ? d.toLocaleString() : d.toLocaleDateString();
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  /** The value of a column on a card: its choice's label, else as text(). */
  function shown(row: Record<string, unknown>, key: string): string {
    const value = row[key];
    return (value !== null && value !== undefined ? labels[key]?.[String(value)] : undefined) ?? text(value);
  }

  function details(row: Record<string, unknown>): Array<[string, string]> {
    return (card.details ?? []).map((key): [string, string] => [key, shown(row, key)])
      .filter(([, value]) => value !== '');
  }

  function optionIndex(): number {
    return context ? context.options.findIndex((o) => valueKey(o.value) === valueKey(context!.value)) : -1;
  }
</script>

<div class="kb-board-wrap">
  {#if context}
    <div class="kb-board-context">
      <label>
        <span>{context.label}</span>
        <select
          value={optionIndex()}
          onchange={(e) => {
            const o = context!.options[Number((e.currentTarget as HTMLSelectElement).value)];
            if (o) context!.onChange(o.value);
          }}
        >
          {#each context.options as option, i (valueKey(option.value))}
            <option value={i}>{option.label}</option>
          {/each}
        </select>
      </label>
    </div>
  {/if}

  <div class="kb-board" role="list" aria-label={_('Board')}>
    {#each columns as column (column.key)}
      {@const folded = isFolded(column.key, column.folded)}
      <section
        class="kb-board-column"
        class:kb-board-folded={folded}
        class:kb-board-drop={dropKey === column.key}
        role="listitem"
        aria-label={column.label}
        ondragover={(e) => { if (canDrop(column.key, column.droppable)) { e.preventDefault(); dropKey = column.key; } }}
        ondragleave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) dropKey = null; }}
        ondrop={(e) => dropped(e, column.value, column.key, column.droppable)}
      >
        <button type="button" class="kb-board-head" onclick={() => toggle(column.key)}
                title={folded ? _('Unfold') : _('Fold')}>
          <span class="kb-board-label">{column.label}</span>
          <span class="kb-board-count">{column.rows.length}</span>
          {#if column.sum !== null && !folded}
            <span class="kb-board-sum">{formatSum(column.sum)}</span>
          {/if}
        </button>

        {#if !folded}
          <div class="kb-board-cards">
            {#each column.rows as row (row[pkField] ?? row)}
              {@const id = row[pkField]}
              {@const tone = card.ribbon ? toneOf(tones[card.ribbon], row[card.ribbon]) : null}
              {@const ribbon = card.ribbon && (tone || !tones[card.ribbon]) ? shown(row, card.ribbon) : ''}
              <div
                class="kb-board-card"
                class:kb-board-card-active={id !== undefined && id === activeId}
                class:kb-board-card-muted={rowTones(tones, row).muted}
                class:kb-board-card-dragged={dragged === row}
                role="button"
                tabindex="0"
                draggable="true"
                ondragstart={(e) => { dragged = row; e.dataTransfer?.setData('text/plain', String(id ?? '')); }}
                ondragend={() => { dragged = null; dropKey = null; }}
                onclick={() => onRowClick(row)}
                ondblclick={() => onRowDblClick(row)}
                onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onRowDblClick(row); } }}
              >
                <div class="kb-board-card-head">
                  <div class="kb-board-card-title">{card.title ? shown(row, card.title) : ''}</div>
                  {#if ribbon}
                    <span class="kb-board-ribbon" data-tone={tone}>{ribbon}</span>
                  {/if}
                </div>
                {#if card.subtitle}
                  <div class="kb-board-card-subtitle">{shown(row, card.subtitle)}</div>
                {/if}
                {#if details(row).length > 0}
                  <dl class="kb-board-card-fields">
                    {#each details(row) as [key, value] (key)}
                      <dt>{titles[key] ?? key}</dt>
                      <dd>{value}</dd>
                    {/each}
                  </dl>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  </div>
</div>

<style>
  .kb-board-wrap {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .kb-board-context {
    padding: 0.5rem 0.75rem 0;
    font-size: 0.8125rem;
    color: var(--kb-text-muted);
  }
  .kb-board-context label {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .kb-board-context select {
    padding: 0.2rem 0.4rem;
    border: 1px solid var(--kb-border-input);
    border-radius: 4px;
    background: var(--kb-bg);
    color: var(--kb-text);
    font-size: 0.8125rem;
  }
  .kb-board {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem;
    overflow-x: auto;
    align-items: stretch;
  }
  .kb-board-column {
    flex: 0 0 16rem;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-radius: 6px;
    background: var(--kb-surface);
    border: 1px solid var(--kb-border);
  }
  .kb-board-folded {
    flex: 0 0 2.5rem;
  }
  .kb-board-drop {
    border-color: var(--kb-accent);
    background: var(--kb-accent-subtle);
  }
  .kb-board-head {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.5rem 0.6rem;
    border: none;
    background: none;
    color: var(--kb-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .kb-board-folded .kb-board-head {
    flex-direction: column;
    align-items: center;
    padding: 0.5rem 0;
  }
  .kb-board-folded .kb-board-label {
    writing-mode: vertical-rl;
  }
  .kb-board-label {
    font-size: 0.8125rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .kb-board-count {
    font-size: 0.75rem;
    color: var(--kb-text-muted);
  }
  .kb-board-sum {
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--kb-text-muted);
    white-space: nowrap;
  }
  .kb-board-cards {
    flex: 1;
    min-height: 2rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0 0.5rem 0.5rem;
    overflow-y: auto;
  }
  .kb-board-card {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--kb-border);
    border-radius: 6px;
    background: var(--kb-bg);
    cursor: grab;
    outline: none;
  }
  .kb-board-card:hover {
    border-color: var(--kb-border-input);
  }
  .kb-board-card:focus-visible,
  .kb-board-card-active {
    border-color: var(--kb-accent);
    box-shadow: 0 0 0 1px var(--kb-accent);
  }
  .kb-board-card-dragged {
    opacity: 0.5;
  }
  .kb-board-card-muted {
    opacity: 0.6;
  }
  .kb-board-card-head {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    min-width: 0;
  }
  .kb-board-card-title {
    flex: 1;
    min-width: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--kb-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .kb-board-card-subtitle {
    font-size: 0.75rem;
    color: var(--kb-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Tones: names drawn with the theme's tokens (components/tone.ts). */
  .kb-board-ribbon                      { --kb-tone: var(--kb-text-muted); }
  .kb-board-ribbon[data-tone='accent']  { --kb-tone: var(--kb-accent); }
  .kb-board-ribbon[data-tone='success'] { --kb-tone: var(--kb-success); }
  .kb-board-ribbon[data-tone='warning'] { --kb-tone: var(--kb-warning); }
  .kb-board-ribbon[data-tone='danger']  { --kb-tone: var(--kb-danger); }
  .kb-board-ribbon[data-tone='neutral'] { --kb-tone: var(--kb-text-muted); }
  .kb-board-ribbon {
    flex: none;
    max-width: 50%;
    padding: 0.1rem 0.45rem;
    border-radius: 3px;
    background: var(--kb-tone);
    color: #fff;
    font-size: 0.75rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .kb-board-card-fields {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.05rem 0.5rem;
    margin: 0.3rem 0 0;
    font-size: 0.75rem;
  }
  .kb-board-card-fields dt {
    color: var(--kb-text-subtle);
  }
  .kb-board-card-fields dd {
    margin: 0;
    color: var(--kb-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
