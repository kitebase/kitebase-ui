<script lang="ts">
  import { api } from '$kitebase/api/client';
  import { _ } from '../i18n';
  import SheetDialog from './SheetDialog.svelte';
  import { onMount } from 'svelte';
  import { openGuide, registerGuide, type GuideRequest } from './guide.svelte';

  // The guide inside the application: the page the server composes, in a frame.
  // The page carries no script. Its anchors are followed here, and so are the
  // links to other guides (`data-help`), sent back to the server: each step is
  // a new request, and Back walks the guides seen. Links to the web open in a
  // new tab by themselves (`target="_blank"`, set by the server).
  //
  // Mounted once, by the work area: F1 outside a field opens the guide of where
  // the user is, whatever the chrome around it.

  interface Shown {
    html: string;
    title: string;
    anchor: string;
  }

  let open = $state(false);
  let history = $state<Shown[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(false);
  let fetching = $state(false);
  let frame = $state<HTMLIFrameElement | null>(null);

  const current = $derived(history.at(-1));

  async function load(request: GuideRequest, replace: boolean) {
    error = null;
    loading = true;
    try {
      const res = await api.endpoint('get_help', { ...request });
      if (res.status === 'success') {
        const shown = res.data as Shown;
        history = replace ? [shown] : [...history, shown];
      } else {
        error = res.message ?? _('The guide could not be opened');
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  onMount(() => registerGuide((request) => {
    open = true;
    load(request, true);
  }));

  function back() {
    history = history.slice(0, -1);
  }

  function scrollTo(id: string) {
    const target = frame?.contentDocument?.getElementById(id);
    target?.scrollIntoView({ block: 'start' });
  }

  // A fragment is followed by hand: in a frame written with `srcdoc`, `#id`
  // resolves against the URL of the application, not of the frame.
  function onClick(e: MouseEvent) {
    const link = (e.target as Element | null)?.closest?.('a');
    if (!link) return;
    const ref = link.getAttribute('data-help');
    const href = link.getAttribute('href') ?? '';
    if (href.startsWith('#')) {
      e.preventDefault();
      scrollTo(href.slice(1));
    } else if (ref) {
      e.preventDefault();
      load({ ref }, false);
    } else if (link.getAttribute('target') !== '_blank' && !href.startsWith('mailto:')) {
      e.preventDefault();
    }
  }

  function onLoad() {
    const doc = frame?.contentDocument;
    if (!doc) return;
    doc.addEventListener('click', onClick);
    // After the layout: on load the sheet is still sliding in, and the frame
    // has no height to scroll yet.
    const anchor = current?.anchor;
    if (anchor && anchor !== 'top') requestAnimationFrame(() => setTimeout(() => scrollTo(anchor), 0));
  }

  function print() {
    frame?.contentWindow?.print();
  }

  // The whole manual of this user, in a new tab: to read, to print, to keep
  async function manual() {
    fetching = true;
    try {
      const res = await api.download('help_manual');
      if (res.status !== 'success') error = res.message ?? _('The manual could not be opened');
    } finally {
      fetching = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'F1' && !e.defaultPrevented) {
      e.preventDefault();
      openGuide();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<SheetDialog bind:open title={current?.title ?? _('Guide')} width="min(48rem, 100vw)">
  <div class="kb-guide">
    <div class="kb-guide-bar">
      <button type="button" class="kb-guide-button" onclick={back}
              disabled={history.length < 2}>{_('Back')}</button>
      <button type="button" class="kb-guide-button" onclick={print}
              disabled={!current}>{_('Print')}</button>
      <button type="button" class="kb-guide-button" onclick={manual}
              disabled={fetching}>{_('Manual')}</button>
      {#if loading}<span class="kb-guide-note">{_('Loading…')}</span>{/if}
    </div>
    {#if error}
      <p class="kb-guide-note">{error}</p>
    {:else if current}
      <!-- Same origin, no scripts of its own: this component follows its links.
           Popups for the links to the web, modals for printing. A new frame for
           each guide shown: the same page asked again on another field loads,
           and scrolls, again. -->
      {#key current}
      <iframe
        bind:this={frame}
        title={current.title}
        srcdoc={current.html}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-modals"
        onload={onLoad}
      ></iframe>
      {/key}
    {/if}
  </div>
</SheetDialog>

<style>
  .kb-guide {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 0.5rem;
  }
  .kb-guide-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .kb-guide-button {
    border: 1px solid var(--kb-border);
    border-radius: 0.375rem;
    padding: 0.125rem 0.625rem;
    font-size: 0.8rem;
    color: var(--kb-text);
    background: var(--kb-bg);
  }
  .kb-guide-button:disabled {
    opacity: 0.4;
  }
  .kb-guide-note {
    font-size: 0.8rem;
    color: var(--kb-text-muted);
  }
  iframe {
    flex: 1;
    width: 100%;
    border: 0;
  }
</style>
