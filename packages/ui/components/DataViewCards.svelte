<script lang="ts">
  /**
   * DataViewCards.svelte: the `cards` renderer of DataView.
   *
   * A grid of tiles over the same rows the table shows: no query of its own,
   * no state of its own beyond the drop target. A card names columns of the
   * view by key (`card: {image, title, subtitle, details}`), so it shows what
   * the query brought; an image arrives in the variant its column names.
   *
   * The ribbon shows the value of `card.ribbon` in that column's tone; a
   * column that declares a tone shows no ribbon for a value it gives none
   * (a rating of 0 is not a grey badge). A value muted on any toned column
   * greys the whole card out.
   *
   * Gestures mirror the table's: a click makes the row active, a double click
   * or Enter opens it. A file dropped on a card's image goes to `onImageDrop`,
   * when the view allows it: the card is where the photo is seen, so it is
   * where it is replaced.
   */
  import type { CardConfig } from './dataview.types';
  import { rowTones, toneOf, type ColumnTone } from './tone';
  import { mediaUrl } from '../api/media';
  import { _ } from '../i18n';
  import { ImageOff } from '@lucide/svelte';

  interface Props {
    rows: unknown[];
    card: CardConfig;
    /** The title of a column, by key: the label of a card field. */
    titles: Record<string, string>;
    pkField: string;
    activeId: unknown;
    onRowClick: (row: Record<string, unknown>) => void;
    onRowDblClick: (row: Record<string, unknown>) => void;
    onImageDrop?: (row: Record<string, unknown>, file: File) => void;
    /** The toned columns of the view, by key. */
    tones?: Record<string, ColumnTone>;
  }

  let { rows, card, titles, pkField, activeId, onRowClick, onRowDblClick, onImageDrop, tones = {} }: Props = $props();

  let dropTarget = $state<unknown>(null);
  let broken = $state<Set<string>>(new Set());

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

  /** The details of a card that have a value: on a card a bare label is noise. */
  function filled(row: Record<string, unknown>): Array<[string, string]> {
    return (card.details ?? []).map((key): [string, string] => [key, text(row[key])])
      .filter(([, value]) => value !== '');
  }

    function rec(row: unknown): Record<string, unknown> {
    return row as Record<string, unknown>;
  }

  function dropped(e: DragEvent, row: Record<string, unknown>) {
    e.preventDefault();
    dropTarget = null;
    const file = e.dataTransfer?.files?.[0];
    if (file && onImageDrop) onImageDrop(row, file);
  }
</script>

<div class="kb-cards" role="listbox" aria-label={_('Cards')}>
  {#each rows as raw (rec(raw)[pkField] ?? raw)}
    {@const row = rec(raw)}
    {@const id = row[pkField]}
    {@const src = card.image ? mediaUrl(row[card.image]) : null}
    {@const muted = rowTones(tones, row).muted}
    {@const tone = card.ribbon ? toneOf(tones[card.ribbon], row[card.ribbon]) : null}
    {@const ribbon = card.ribbon && (tone || !tones[card.ribbon]) ? text(row[card.ribbon]) : ''}
    <div
      class="kb-card"
      class:kb-card-active={id !== undefined && id === activeId}
      class:kb-card-muted={muted}
      role="option"
      aria-selected={id !== undefined && id === activeId}
      tabindex="0"
      onclick={() => onRowClick(row)}
      ondblclick={() => onRowDblClick(row)}
      onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onRowDblClick(row); } }}
    >
      {#if ribbon && card.image}
        <span class="kb-card-ribbon kb-card-ribbon-over" data-tone={tone}>{ribbon}</span>
      {/if}
      {#if card.image}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="kb-card-image"
          class:kb-card-drop={onImageDrop && dropTarget === id}
          ondragover={(e) => { if (onImageDrop) { e.preventDefault(); dropTarget = id; } }}
          ondragleave={() => (dropTarget = null)}
          ondrop={(e) => dropped(e, row)}
        >
          {#if src && !broken.has(src)}
            <img {src} alt="" loading="lazy" onerror={() => (broken = new Set(broken).add(src))} />
          {:else}
            <ImageOff size={28} />
          {/if}
        </div>
      {/if}
      <div class="kb-card-body">
        {#if card.title || (ribbon && !card.image)}
          <!-- Without an image the ribbon sits beside the title, never over it. -->
          <div class="kb-card-head">
            <div class="kb-card-title">{card.title ? text(row[card.title]) : ''}</div>
            {#if ribbon && !card.image}
              <span class="kb-card-ribbon" data-tone={tone}>{ribbon}</span>
            {/if}
          </div>
        {/if}
        {#if card.subtitle}
          <div class="kb-card-subtitle">{text(row[card.subtitle])}</div>
        {/if}
        {#if filled(row).length > 0}
          <dl class="kb-card-fields">
            {#each filled(row) as [key, value] (key)}
              <dt>{titles[key] ?? key}</dt>
              <dd>{value}</dd>
            {/each}
          </dl>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .kb-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    /* Content-sized rows: in a container of fixed height, auto rows would
       shrink a card, which clips its overflow, down to nothing. */
    grid-auto-rows: max-content;
    gap: 0.75rem;
    padding: 0.75rem;
    height: 100%;
    overflow-y: auto;
    align-content: start;
  }
  .kb-card {
    position: relative;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--kb-border);
    border-radius: 6px;
    background: var(--kb-bg);
    overflow: hidden;
    cursor: pointer;
    outline: none;
  }
  .kb-card:hover {
    border-color: var(--kb-border-input);
    background: var(--kb-surface-hover);
  }
  .kb-card:focus-visible,
  .kb-card-active {
    border-color: var(--kb-accent);
    box-shadow: 0 0 0 1px var(--kb-accent);
  }
  /* Tones: names drawn with the theme's tokens (components/tone.ts). */
  .kb-card-ribbon                      { --kb-tone: var(--kb-text-muted); }
  .kb-card-ribbon[data-tone='accent']  { --kb-tone: var(--kb-accent); }
  .kb-card-ribbon[data-tone='success'] { --kb-tone: var(--kb-success); }
  .kb-card-ribbon[data-tone='warning'] { --kb-tone: var(--kb-warning); }
  .kb-card-ribbon[data-tone='danger']  { --kb-tone: var(--kb-danger); }
  .kb-card-muted {
    opacity: 0.6;
  }
  .kb-card-muted img {
    filter: grayscale(1);
  }
  .kb-card-ribbon {
    flex: none;
    max-width: 50%;
    padding: 0.1rem 0.45rem;
    border-radius: 3px;
    background: var(--kb-tone, var(--kb-text-muted));
    color: #fff;
    font-size: 0.75rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Over the image: a band leaning on the right edge. */
  .kb-card-ribbon-over {
    position: absolute;
    top: 0.5rem;
    right: 0;
    z-index: 1;
    max-width: 70%;
    padding-right: 0.6rem;
    border-radius: 3px 0 0 3px;
  }
  .kb-card-head {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    min-width: 0;
  }
  .kb-card-head .kb-card-title {
    flex: 1;
    min-width: 0;
  }

  .kb-card-image {
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 4 / 3;
    /* Without it a tall image sets the height and the ratio is lost. */
    overflow: hidden;
    background: var(--kb-surface);
    color: var(--kb-text-subtle);
    border-bottom: 1px solid var(--kb-border);
  }
  .kb-card-image img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .kb-card-drop {
    outline: 2px dashed var(--kb-accent);
    outline-offset: -4px;
    background: var(--kb-accent-subtle);
  }
  .kb-card-body {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.5rem 0.6rem 0.6rem;
    min-width: 0;
  }
  .kb-card-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--kb-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .kb-card-subtitle {
    font-size: 0.75rem;
    color: var(--kb-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .kb-card-fields {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.05rem 0.5rem;
    margin: 0.3rem 0 0;
    font-size: 0.75rem;
  }
  .kb-card-fields dt {
    color: var(--kb-text-subtle);
  }
  .kb-card-fields dd {
    margin: 0;
    color: var(--kb-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
