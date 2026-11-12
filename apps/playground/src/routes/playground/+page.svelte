<script lang="ts">
  // Index delle pagine di test disponibili nel playground.
  // Aggiungere qui i link man mano che si creano nuove pagine.

  const pages: { href: string; label: string }[] = [
    { href: '/playground/api', label: 'API & Auth' },
    { href: '/playground/plugins', label: 'Plugin System' },
    { href: '/playground/stack', label: 'Stack Navigation' },
    { href: '/playground/form', label: 'Form (bits-ui)' },
    { href: '/playground/dialogs', label: 'Dialogs (bits-ui)' },
    { href: '/playground/split', label: 'SplitPane' },
    { href: '/playground/editor', label: 'MarkdownEditor (Tiptap)' },
    { href: '/playground/types', label: 'Type Schema' },
    { href: '/playground/datatable', label: 'DataTable' },
    { href: '/playground/pages', label: 'Page Renderer' },
    { href: '/playground/pages2', label: 'Page Multi-Split' },
    { href: '/playground/pages3', label: 'Page Nested Splits' },
    { href: '/playground/triggers', label: 'Trigger System' },
    { href: '/playground/tables',   label: 'Table Browser' },
    { href: '/playground/tables2',  label: 'Table Browser 2 (Navigator)' },
    { href: '/playground/panel',    label: 'Panel Stack Isolation' },
    { href: '/playground/dataform', label: 'DataForm (Step A)' },
    { href: '/playground/dataform-b', label: 'DataForm (Step B — endpoint)' },
    { href: '/playground/dataform-layout', label: 'DataForm (Layout engine — tabs, column-first)' },
    { href: '/playground/wizard',     label: 'Wizard — Multi-step endpoint' }
  ];
</script>

<h1 class="mb-4 text-xl font-semibold">Playground</h1>

{#if pages.length === 0}
  <p class="text-sm text-gray-400">Nessuna pagina di test ancora. Aggiungile in questo file.</p>
{:else}
  <ul class="space-y-2">
    {#each pages as page (page.href)}
      <li>
        <a href={page.href} class="text-sm text-blue-600 hover:underline">{page.label}</a>
      </li>
    {/each}
  </ul>
{/if}
