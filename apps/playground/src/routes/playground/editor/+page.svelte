<script lang="ts">
  import MarkdownEditor from '$kitebase/components/editor/MarkdownEditor.svelte';

  const placeholders = [
    { name: 'partner.name', label: 'Partner' },
    { name: 'number', label: 'Invoice number' },
    { name: 'date', label: 'Invoice date' },
    { name: 'partner_id.first_name', label: 'First name' },
    { name: '$note', label: 'Note' }
  ];

  const samples: Record<string, string> = {
    reminder: 'Dear **[[partner.name]]**,\n\nyour invoice [[number]] of [[date]] is *still open*.\n\n- amount: [[balance]]\n- due: [[$due_date]]\n\n[[$note]]\n\nSee [our terms](https://example.com/terms).',
    tricky: '# Title\n\nAn [[array, 2]], a_b, A & B < C, and *[[partner_id.first_name]]*.\n\n1. first\n2. second',
    empty: ''
  };

  let value = $state<string | null>(samples.reminder);
  let readonly = $state(false);
  let changes = $state(0);
</script>

<div class="max-w-5xl space-y-6">
  <div>
    <h1 class="mb-1 text-2xl font-bold text-gray-800">MarkdownEditor (Tiptap)</h1>
    <p class="text-sm text-gray-500">
      Prototipo del widget <code>markdown</code> del plugin <code>editor</code>: WYSIWYG, sorgente
      col tasto a destra, segnaposto <code>[[...]]</code> dal tasto graffe. A destra il valore
      che il widget manda al form.
    </p>
  </div>

  <div class="flex flex-wrap items-center gap-2 text-sm">
    {#each Object.keys(samples) as name (name)}
      <button class="rounded border border-gray-300 bg-white px-3 py-1 hover:bg-gray-100"
              onclick={() => (value = samples[name])}>{name}</button>
    {/each}
    <label class="ml-4 flex items-center gap-1">
      <input type="checkbox" bind:checked={readonly} /> readonly
    </label>
    <span class="ml-auto text-xs text-gray-400">onchange: {changes}</span>
  </div>

  <div class="grid gap-6 md:grid-cols-2">
    <MarkdownEditor {value} {readonly} {placeholders}
                    field={{ name: 'body', label: 'Body' }}
                    onchange={(v) => { value = v; changes++; }} />
    <pre class="overflow-auto rounded-lg border border-gray-200 bg-white p-3 text-xs whitespace-pre-wrap">{value ?? '(null)'}</pre>
  </div>
</div>
