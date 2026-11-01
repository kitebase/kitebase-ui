<script lang="ts">
  /**
   * The widget of an Image or File column (server: kitebase.media).
   *
   * The value is the signed URL the record brought, or, after an upload, the
   * reference the server allocated: the form saves it like any other value,
   * and the URL sent back on save means "unchanged". Removing puts null. The
   * upload writes nothing in the row, so a file uploaded in a form that is
   * then cancelled is an orphan for the collector, not a change.
   *
   * On a root whose layout holds the record id (`needs_record`) a new record
   * has nowhere to put the file yet: the widget waits for the first save.
   */
  import type { FormField } from '../dataform.types';
  import type { TableColumnInfo } from '../../api/serverConfig.svelte';
  import { api } from '../../api/client';
  import { isMediaRef, mediaFileName, mediaUrl } from '../../api/media';
  import { _, _t } from '../../i18n';
  import { acceptAttr, reduceImage, reducibleSize, sizeText } from './media';
  import { msgbox } from '../msgbox.svelte';

  interface Props {
    value: unknown;
    onchange: (v: string | null) => void;
    readonly?: boolean;
    field: FormField;
    table: string;
    column: TableColumnInfo;
    recordId: number | string | null | undefined;
  }

  let { value, onchange, readonly = false, field, table, column, recordId }: Props = $props();

  const isImage = $derived(column.media === 'image');
  const waitsForSave = $derived(!!column.needs_record && (recordId === null || recordId === undefined));

  // The URL of a file uploaded here, until the save turns its reference back
  // into a URL of the record.
  let uploaded = $state<{ ref: string; url: string } | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let dragging = $state(false);
  let input: HTMLInputElement | undefined = $state();
  const disabled = $derived(readonly || busy || waitsForSave);

  const src = $derived(
    uploaded && value === uploaded.ref ? mediaUrl(uploaded.url)
      : isMediaRef(value) ? null
      : mediaUrl(value),
  );
  const name = $derived(src ? mediaFileName(src) : '');
  // A file the browser cannot show (not the image it claims to be, gone from
  // its root) gets a frame with its name, never a broken-image icon.
  let brokenSrc = $state<string | null>(null);

  /**
   * The file to send: the original, or the image reduced to `resize:` when
   * it is over it and the user agrees. null when the user cancels.
   */
  async function prepare(file: File): Promise<File | null> {
    const side = column.resize;
    if (!isImage || !side) return file;
    const size = await reducibleSize(file);
    if (!size || Math.max(size.width, size.height) <= side) return file;
    const max = column.max_size;
    const fits = !max || file.size <= max;
    const message = _t('{name} is {width}x{height} pixels, {size}. This field reduces images to {side} pixels on the longest side.',
                       { name: file.name, width: size.width, height: size.height,
                         size: sizeText(file.size), side })
      + (fits ? '' : ' ' + _t('The original is over the limit of {max}.', { max: sizeText(max!) }));
    const choice = await msgbox.show({
      title: _('Image larger than required'),
      message,
      variant: 'warning',
      modal: true,
      buttons: [
        { label: _('Cancel'), value: 'cancel', variant: 'secondary' },
        ...(fits ? [{ label: _('Keep the original'), value: 'keep', variant: 'secondary' as const }] : []),
        { label: _('Reduce'), value: 'reduce', variant: 'primary' },
      ],
    });
    if (choice === 'keep') return file;
    if (choice === 'reduce') return reduceImage(file, side);
    return null;
  }

  async function send(file: File) {
    error = null;
    busy = true;
    try {
      const ready = await prepare(file);
      if (!ready) return;
      const max = column.max_size;
      if (max && ready.size > max) {
        error = _t('{name} is {size}: this field takes up to {max}',
                   { name: file.name, size: sizeText(ready.size), max: sizeText(max) });
        return;
      }
      const res = await api.upload(table, field.name, recordId, ready, file.name);
      if (res.status === 'success' && res.data) {
        uploaded = res.data;
        onchange(res.data.ref);
      } else {
        error = res.message ?? _('Upload failed');
      }
    } finally {
      busy = false;
    }
  }

  function picked(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    target.value = '';           // the same file can be chosen again
    if (file) send(file);
  }

  function dropped(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    const file = e.dataTransfer?.files?.[0];
    if (file && !disabled) send(file);
  }

  function remove() {
    uploaded = null;
    error = null;
    onchange(null);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="kb-media"
  class:kb-media-drag={dragging}
  ondragover={(e) => { if (!disabled) { e.preventDefault(); dragging = true; } }}
  ondragleave={() => (dragging = false)}
  ondrop={dropped}
>
  {#if src && isImage && src !== brokenSrc}
    <a href={src} target="_blank" rel="noopener" class="kb-media-preview">
      <img src={src} alt={field.label ?? field.name} onerror={() => (brokenSrc = src)} />
    </a>
  {:else if src && isImage}
    <span class="kb-media-broken" title={name}>{_('Image unavailable')}</span>
  {:else if src}
    <a href={src} target="_blank" rel="noopener" class="kb-media-link">{name}</a>
  {:else if readonly}
    <span class="kb-media-empty">{_('No file')}</span>
  {/if}

  {#if !readonly}
    {#if waitsForSave}
      <span class="kb-media-hint">{_('Save the record before adding a file')}</span>
    {:else}
      <div class="kb-media-actions">
        <input
          bind:this={input}
          id="input-{field.name}"
          type="file"
          class="sr-only"
          accept={acceptAttr(column.accept) ?? (isImage ? 'image/*' : undefined)}
          onchange={picked}
          {disabled}
        />
        <button type="button" class="btn btn-secondary py-1 text-xs" {disabled} onclick={() => input?.click()}>
          {busy ? _('Uploading…') : src ? _('Replace') : isImage ? _('Choose an image') : _('Choose a file')}
        </button>
        {#if src || isMediaRef(value)}
          <button type="button" class="btn btn-secondary py-1 text-xs" {disabled} onclick={remove}>
            {_('Remove')}
          </button>
        {/if}
        {#if !src}
          <span class="kb-media-hint">{_('or drop it here')}</span>
        {/if}
      </div>
    {/if}
  {/if}

  {#if error}
    <p class="kb-media-error">{error}</p>
  {/if}
</div>

<style>
  .kb-media {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.4rem;
    padding: 0.4rem;
    border: 1px dashed transparent;
    border-radius: 4px;
  }
  .kb-media-drag {
    border-color: var(--kb-accent);
    background: var(--kb-accent-subtle);
  }
  .kb-media-preview img {
    display: block;
    max-width: 12rem;
    max-height: 12rem;
    object-fit: contain;
    border: 1px solid var(--kb-border);
    border-radius: 4px;
    background: var(--kb-surface);
  }
  .kb-media-broken {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 8rem;
    height: 5rem;
    font-size: 0.75rem;
    color: var(--kb-text-subtle);
    border: 1px dashed var(--kb-border);
    border-radius: 4px;
  }
  .kb-media-link {
    color: var(--kb-accent);
    font-size: 0.875rem;
    word-break: break-all;
  }
  .kb-media-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .kb-media-empty,
  .kb-media-hint {
    font-size: 0.75rem;
    color: var(--kb-text-subtle);
  }
  .kb-media-error {
    font-size: 0.75rem;
    color: var(--kb-danger);
  }
</style>
