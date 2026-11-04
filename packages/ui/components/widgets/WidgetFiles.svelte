<script lang="ts">
  /**
   * The widget of a Files column: the files of the record's folder.
   *
   * It talks to a file source, never to the endpoints: the same widget will
   * list the documents a store links to the record. Every gesture acts at
   * once (upload, description, removal) and leaves the form unchanged: the
   * files are not a value of the row. Removing moves a file into the folder's
   * trash, so it asks nothing.
   *
   * The folder holds the record id: a new record has none until it is saved.
   */
  import type { FormField } from '../dataform.types';
  import type { TableColumnInfo } from '../../api/serverConfig.svelte';
  import type { FileEntry, FileSource } from '../../api/fileSource';
  import { filesSource } from '../../api/filesSource';
  import { mediaUrl } from '../../api/media';
  import { _, _t } from '../../i18n';
  import { acceptAttr, sizeText } from './media';
  import { viewerOf, type Viewer } from './viewers';
  import { File as FileIcon, FileArchive, FileImage, FileSpreadsheet, FileText, X } from '@lucide/svelte';

  interface Props {
    readonly?: boolean;
    field: FormField;
    table: string;
    column: TableColumnInfo;
    recordId: number | string | null | undefined;
  }

  let { readonly = false, field, table, column, recordId }: Props = $props();

  const ICONS = { image: FileImage, pdf: FileText, text: FileText, sheet: FileSpreadsheet,
                  archive: FileArchive, file: FileIcon } as const;

  const source = $derived<FileSource | null>(
    recordId === null || recordId === undefined ? null : filesSource(table, field.name, recordId));

  let entries = $state<FileEntry[]>([]);
  let loading = $state(false);
  let uploading = $state(0);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let dragging = $state(false);
  let viewing = $state<FileEntry | null>(null);
  let overlay: HTMLDivElement | undefined = $state();
  // The overlay takes the focus, so Escape reaches it before the form, which
  // would close itself on the same key.
  $effect(() => { overlay?.focus(); });
  let input: HTMLInputElement | undefined = $state();
  // What is being typed in a description, by key, until it is sent.
  let drafts = $state<Record<string, string>>({});

  const canWrite = $derived(!readonly && source !== null);

  $effect(() => {
    const s = source;
    entries = [];
    drafts = {};
    if (s) load(s);
  });

  async function load(s: FileSource) {
    loading = true;
    error = null;
    try {
      const res = await s.list();
      if (s !== source) return;               // the record changed meanwhile
      if (res.status === 'success') entries = res.data ?? [];
      else error = res.message ?? _('Error loading');
    } finally {
      loading = false;
    }
  }

  function byName(a: FileEntry, b: FileEntry) {
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  }

  async function send(files: File[]) {
    const s = source;
    if (!s) return;
    error = null;
    notice = null;
    const max = column.max_size;
    const refused: string[] = [];
    uploading += files.length;
    try {
      for (const file of files) {
        try {
          if (max && file.size > max) {
            refused.push(_t('{name} is {size}: this field takes up to {max}',
                            { name: file.name, size: sizeText(file.size), max: sizeText(max) }));
            continue;
          }
          const res = await s.upload(file, file.name);
          if (res.status === 'success' && res.data && s === source) {
            const added = res.data;
            entries = [...entries.filter((e) => e.key !== added.key), added].sort(byName);
          } else if (res.status !== 'success') {
            const why = res.message ?? _('Upload failed');
            refused.push(why.includes(file.name) ? why : `${file.name}: ${why}`);
          }
        } finally {
          uploading -= 1;
        }
      }
    } finally {
      if (refused.length > 0) error = refused.join('; ');
    }
  }

  function picked(e: Event) {
    const target = e.target as HTMLInputElement;
    const files = Array.from(target.files ?? []);
    target.value = '';
    if (files.length > 0) send(files);
  }

  function dropped(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0 && canWrite) send(files);
  }

  async function describe(entry: FileEntry) {
    const s = source;
    const text = (drafts[entry.key] ?? entry.description).trim();
    const { [entry.key]: _sent, ...rest } = drafts;
    drafts = rest;
    if (!s || text === entry.description) return;
    const res = await s.describe(entry.key, text);
    if (res.status === 'success') {
      entries = entries.map((e) => (e.key === entry.key ? { ...e, description: text } : e));
    } else {
      error = res.message ?? _('Error saving');
    }
  }

  async function remove(entry: FileEntry) {
    const s = source;
    if (!s) return;
    error = null;
    const res = await s.remove(entry.key);
    if (res.status === 'success') {
      entries = entries.filter((e) => e.key !== entry.key);
      notice = _t('{name} moved to the trash', { name: entry.name });
    } else {
      error = res.message ?? _('Error saving');
    }
  }

  function open(entry: FileEntry, viewer: Viewer, e: MouseEvent) {
    if (viewer.mode === 'overlay') {
      e.preventDefault();
      viewing = entry;
    }
  }

  function dateText(seconds: number | undefined): string {
    return seconds ? new Date(seconds * 1000).toLocaleDateString() : '';
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="kb-files"
  class:kb-files-drag={dragging}
  ondragover={(e) => { if (canWrite) { e.preventDefault(); dragging = true; } }}
  ondragleave={() => (dragging = false)}
  ondrop={dropped}
>
  {#if source === null}
    <span class="kb-files-hint">{_('Save the record before adding a file')}</span>
  {:else}
    {#if entries.length > 0}
      <ul class="kb-files-list">
        {#each entries as entry (entry.key)}
          {@const viewer = viewerOf(entry)}
          {@const Icon = ICONS[viewer.icon]}
          {@const href = mediaUrl(entry.url)}
          <li class="kb-files-row">
            <span class="kb-files-thumb">
              {#if entry.thumb}
                <img src={mediaUrl(entry.thumb)} alt="" loading="lazy" />
              {:else}
                <Icon size={20} />
              {/if}
            </span>
            <span class="kb-files-name">
              {#if href}
                <a
                  {href}
                  target={viewer.mode === 'tab' ? '_blank' : undefined}
                  rel="noopener"
                  download={viewer.mode === 'download' ? entry.name : undefined}
                  onclick={(e) => open(entry, viewer, e)}
                >{entry.name}</a>
              {:else}
                {entry.name}
              {/if}
              <span class="kb-files-meta">
                {entry.size !== undefined ? sizeText(entry.size) : ''} {dateText(entry.modified)}
              </span>
            </span>
            {#if canWrite && source.capabilities.describe}
              <input
                class="kb-files-desc input"
                type="text"
                placeholder={_('Description')}
                value={drafts[entry.key] ?? entry.description}
                oninput={(e) => (drafts[entry.key] = (e.target as HTMLInputElement).value)}
                onblur={() => describe(entry)}
                onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); (e.target as HTMLInputElement).blur(); } }}
              />
            {:else}
              <span class="kb-files-desc-text">{entry.description}</span>
            {/if}
            {#if canWrite && source.capabilities.remove}
              <button type="button" class="kb-files-remove" title={_('Remove')} aria-label={_('Remove')}
                      onclick={() => remove(entry)}>
                <X size={16} />
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {:else if !loading}
      <span class="kb-files-hint">{_('No file')}</span>
    {/if}

    {#if canWrite}
      <div class="kb-files-actions">
        <input
          bind:this={input}
          id="input-{field.name}"
          type="file"
          multiple
          class="sr-only"
          accept={acceptAttr(column.accept)}
          onchange={picked}
        />
        <button type="button" class="btn btn-secondary py-1 text-xs" disabled={uploading > 0}
                onclick={() => input?.click()}>
          {uploading > 0 ? _('Uploading…') : _('Add files')}
        </button>
        <span class="kb-files-hint">{_('or drop them here')}</span>
      </div>
    {/if}
  {/if}

  {#if error}
    <p class="kb-files-error">{error}</p>
  {:else if notice}
    <p class="kb-files-hint">{notice}</p>
  {/if}
</div>

{#if viewing}
  <div class="kb-files-overlay" role="dialog" aria-modal="true" aria-label={viewing.name}
       tabindex="-1" bind:this={overlay}
       onclick={() => (viewing = null)}
       onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); viewing = null; } }}>
    <figure>
      <img src={mediaUrl(viewing.url)} alt={viewing.description || viewing.name} />
      <figcaption>{viewing.description || viewing.name}</figcaption>
    </figure>
  </div>
{/if}

<style>
  .kb-files {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.4rem;
    border: 1px dashed transparent;
    border-radius: 4px;
  }
  .kb-files-drag {
    border-color: var(--kb-accent);
    background: var(--kb-accent-subtle);
  }
  .kb-files-list {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--kb-border);
    border-radius: 4px;
  }
  .kb-files-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.3rem 0.5rem;
  }
  .kb-files-row + .kb-files-row {
    border-top: 1px solid var(--kb-border);
  }
  .kb-files-thumb {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 2.5rem;
    height: 2.5rem;
    color: var(--kb-text-subtle);
  }
  .kb-files-thumb img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 2px;
  }
  .kb-files-name {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1 1 12rem;
    font-size: 0.875rem;
  }
  .kb-files-name a {
    color: var(--kb-accent);
    word-break: break-all;
  }
  .kb-files-meta {
    font-size: 0.75rem;
    color: var(--kb-text-subtle);
  }
  .kb-files-desc {
    flex: 2 1 14rem;
    min-width: 0;
    font-size: 0.875rem;
  }
  .kb-files-desc-text {
    flex: 2 1 14rem;
    font-size: 0.875rem;
    color: var(--kb-text-muted);
  }
  .kb-files-remove {
    display: inline-flex;
    flex: none;
    padding: 0.25rem;
    border-radius: 4px;
    color: var(--kb-text-subtle);
  }
  .kb-files-remove:hover {
    color: var(--kb-danger);
    background: var(--kb-surface-hover);
  }
  .kb-files-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .kb-files-hint {
    font-size: 0.75rem;
    color: var(--kb-text-subtle);
  }
  .kb-files-error {
    font-size: 0.75rem;
    color: var(--kb-danger);
  }
  .kb-files-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 0.75);
    cursor: zoom-out;
  }
  .kb-files-overlay figure {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
  }
  .kb-files-overlay img {
    max-width: 90vw;
    max-height: 85vh;
    object-fit: contain;
    background: var(--kb-surface);
  }
  .kb-files-overlay figcaption {
    color: #fff;
    font-size: 0.875rem;
  }
</style>
