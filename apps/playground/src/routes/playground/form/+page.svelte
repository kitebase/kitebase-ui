<script lang="ts">
  import { Combobox, Dialog, Tabs } from 'bits-ui';
  import TabDate from './TabDate.svelte';
  import TabAltro from './TabAltro.svelte';

  const persone = [
    { id: 1, nome: 'Rossi Mario', ruolo: 'Amministratore', reparto: 'Direzione' },
    { id: 2, nome: 'Rossini Lucia', ruolo: 'Operatore', reparto: 'Supporto' },
    { id: 3, nome: 'Romualdi Francesco', ruolo: 'Tecnico', reparto: 'IT' },
    { id: 4, nome: 'Romano Elena', ruolo: 'Operatore', reparto: 'Supporto' },
    { id: 5, nome: 'Romani Alberto', ruolo: 'Tecnico', reparto: 'IT' },
    { id: 6, nome: 'Bianchi Sara', ruolo: 'Amministratore', reparto: 'Direzione' },
    { id: 7, nome: 'Verdi Carlo', ruolo: 'Tecnico', reparto: 'IT' },
    { id: 8, nome: 'Neri Giulia', ruolo: 'Operatore', reparto: 'Supporto' },
    { id: 9, nome: 'Ferrari Luca', ruolo: 'Amministratore', reparto: 'Direzione' },
    { id: 10, nome: 'Conti Marta', ruolo: 'Operatore', reparto: 'Supporto' },
    { id: 11, nome: 'Esposito Marco', ruolo: 'Tecnico', reparto: 'IT' },
    { id: 12, nome: 'Ricci Anna', ruolo: 'Operatore', reparto: 'Supporto' },
    { id: 13, nome: 'Colombo Pietro', ruolo: 'Tecnico', reparto: 'IT' },
    { id: 14, nome: 'Moretti Irene', ruolo: 'Amministratore', reparto: 'Direzione' },
    { id: 15, nome: 'Fontana Davide', ruolo: 'Operatore', reparto: 'Supporto' },
  ];

  let query = $state('');
  let selected = $state<{ id: number; nome: string; ruolo: string; reparto: string } | null>(null);

  let filtrati = $derived(
    query.length === 0
      ? persone.slice(0, 5)
      : persone
          .filter(
            (p) =>
              p.nome.toLowerCase().includes(query.toLowerCase()) ||
              p.ruolo.toLowerCase().includes(query.toLowerCase()) ||
              p.reparto.toLowerCase().includes(query.toLowerCase())
          )
          .slice(0, 5)
  );

  const totaleRisultati = $derived(
    query.length === 0
      ? persone.length
      : persone.filter(
          (p) =>
            p.nome.toLowerCase().includes(query.toLowerCase()) ||
            p.ruolo.toLowerCase().includes(query.toLowerCase()) ||
            p.reparto.toLowerCase().includes(query.toLowerCase())
        ).length
  );

  let dialogOpen = $state(false);
  let dialogQuery = $state('');
  let dialogFiltroRuolo = $state('');

  let dialogRisultati = $derived(
    persone.filter((p) => {
      const matchTesto =
        dialogQuery.length === 0 ||
        p.nome.toLowerCase().includes(dialogQuery.toLowerCase()) ||
        p.reparto.toLowerCase().includes(dialogQuery.toLowerCase());
      const matchRuolo = dialogFiltroRuolo === '' || p.ruolo === dialogFiltroRuolo;
      return matchTesto && matchRuolo;
    })
  );

  function apriDialog() {
    dialogQuery = query;
    dialogFiltroRuolo = '';
    dialogOpen = true;
  }

  function selezionaDaDialog(persona: (typeof persone)[0]) {
    selected = persona;
    query = persona.nome;
    dialogOpen = false;
  }

  let form = $state({ titolo: '', priorita: 'media', note: '' });
  let submitted = $state(false);

  function handleSubmit(e: Event) {
    e.preventDefault();
    submitted = true;
  }

  function reset() {
    query = '';
    selected = null;
    form = { titolo: '', priorita: 'media', note: '' };
    submitted = false;
  }

  let ricerca = $state('');

  const ruoliBadge: Record<string, string> = {
    Amministratore: 'badge badge-success',
    Tecnico: 'badge badge-neutral',
    Operatore: 'badge badge-danger',
  };
</script>

<div class="mx-auto max-w-6xl p-8">
  <h1 class="mb-6 text-2xl font-bold text-gray-800">Form con Combobox</h1>

  <div class="flex flex-col gap-6 lg:flex-row lg:items-start">
  <!-- ── Colonna sinistra: form ─────────────────── -->
  <div class="w-full lg:w-96 lg:shrink-0">
  {#if submitted}
    <div class="card mb-6 border-green-200 bg-green-50">
      <h2 class="mb-3 font-semibold text-green-800">Dati inviati</h2>
      <dl class="space-y-1 text-sm text-green-700">
        <div class="flex gap-2"><dt class="font-medium">Titolo:</dt><dd>{form.titolo}</dd></div>
        <div class="flex gap-2">
          <dt class="font-medium">Assegnato a:</dt>
          <dd>{selected ? `${selected.nome} (${selected.ruolo})` : '—'}</dd>
        </div>
        <div class="flex gap-2"><dt class="font-medium">Priorità:</dt><dd>{form.priorita}</dd></div>
        <div class="flex gap-2"><dt class="font-medium">Note:</dt><dd>{form.note || '—'}</dd></div>
      </dl>
      <button class="btn btn-secondary mt-4" onclick={reset}>Nuova scheda</button>
    </div>
  {:else}
    <form class="card space-y-5" onsubmit={handleSubmit}>
      <!-- Titolo -->
      <div>
        <label for="titolo" class="mb-1 block text-sm font-medium text-gray-700">Titolo *</label>
        <input
          id="titolo"
          type="text"
          class="input"
          placeholder="Es. Riparazione server sala A"
          bind:value={form.titolo}
          required
        />
      </div>

      <!-- Input decorato -->
      <div>
        <label for="ricerca" class="mb-1 block text-sm font-medium text-gray-700">
          Input decorato
        </label>
        <div class="relative">
          <button
            type="button"
            onclick={() => alert('Filtro avanzato')}
            class="absolute left-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-brand"
            aria-label="Filtro"
          >⚙</button>
          <button
            type="button"
            onclick={() => alert('Mostra preferiti')}
            class="absolute left-8 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-yellow-500"
            aria-label="Preferiti"
          >★</button>
          <input
            id="ricerca"
            type="text"
            bind:value={ricerca}
            placeholder="Cerca con icone a sinistra e destra…"
            class="input pl-14 pr-16"
          />
          {#if ricerca}
            <button
              type="button"
              onclick={() => (ricerca = '')}
              class="absolute right-8 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-300 hover:text-gray-500"
              aria-label="Svuota"
            >✕</button>
          {/if}
          <button
            type="button"
            onclick={() => alert('Opzioni campo')}
            class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-brand"
            aria-label="Opzioni"
          >···</button>
        </div>
      </div>

      <!-- Combobox — Assegna a -->
      <div>
        <label for="assegna" class="mb-1 block text-sm font-medium text-gray-700">
          Assegna a *
        </label>

        <div class="flex gap-1">
          <div class="relative min-w-0 flex-1">
            <Combobox.Root
              type="single"
              inputValue={query}
              onValueChange={(v) => {
                selected = persone.find((p) => String(p.id) === v) ?? null;
                if (selected) query = selected.nome;
              }}
            >
              <Combobox.Input
                id="assegna"
                class="input pr-8"
                placeholder="Cerca per nome, ruolo o reparto…"
                oninput={(e) => (query = (e.target as HTMLInputElement).value)}
              />
              <Combobox.Trigger
                class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Apri lista"
              >
                ▾
              </Combobox.Trigger>

              <Combobox.Portal>
                <Combobox.Content
                  class="z-50 mt-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg"
                  sideOffset={4}
                >
                  <Combobox.Viewport class="max-h-48 overflow-auto py-1">
                    {#if filtrati.length === 0}
                      <div class="px-3 py-2 text-sm text-gray-400">Nessun risultato</div>
                    {:else}
                      {#each filtrati as persona (persona.id)}
                        <Combobox.Item
                          value={String(persona.id)}
                          label={persona.nome}
                          class="flex cursor-pointer items-center justify-between px-3 py-2 text-sm
                                 hover:bg-blue-50 data-[highlighted]:bg-blue-50
                                 data-[selected]:font-semibold data-[selected]:text-brand"
                        >
                          <span>{persona.nome}</span>
                          <span class={ruoliBadge[persona.ruolo] ?? 'badge badge-neutral'}>
                            {persona.ruolo}
                          </span>
                        </Combobox.Item>
                      {/each}
                    {/if}
                  </Combobox.Viewport>

                  {#if totaleRisultati > 5}
                    <div class="border-t border-gray-100 px-3 py-1.5">
                      <button
                        type="button"
                        class="w-full text-left text-xs text-brand hover:underline"
                        onclick={apriDialog}
                      >
                        Mostra tutti i {totaleRisultati} risultati…
                      </button>
                    </div>
                  {/if}
                </Combobox.Content>
              </Combobox.Portal>
            </Combobox.Root>
          </div>

          <button
            type="button"
            class="btn btn-secondary shrink-0 px-3 text-gray-500"
            title="Ricerca estesa"
            onclick={apriDialog}
          >
            ···
          </button>
        </div>

        {#if selected}
          <p class="mt-1 text-xs text-gray-500">
            <span class="font-medium">{selected.nome}</span> —
            <span class={ruoliBadge[selected.ruolo] ?? 'badge badge-neutral'}>{selected.ruolo}</span>
            — {selected.reparto}
          </p>
        {/if}
      </div>

      <!-- Priority -->
      <div>
        <label for="priorita" class="mb-1 block text-sm font-medium text-gray-700">Priorità</label>
        <select id="priorita" class="input" bind:value={form.priorita}>
          <option value="bassa">Bassa</option>
          <option value="media">Media</option>
          <option value="alta">Alta</option>
          <option value="critica">Critica</option>
        </select>
      </div>

      <!-- Note -->
      <div>
        <label for="note" class="mb-1 block text-sm font-medium text-gray-700">Note</label>
        <textarea
          id="note"
          class="input"
          rows="3"
          placeholder="Descrizione opzionale…"
          bind:value={form.note}
        ></textarea>
      </div>

      <div class="flex gap-2 pt-2">
        <button type="submit" class="btn btn-primary" disabled={!form.titolo || !selected}>
          Invia
        </button>
        <button type="button" class="btn btn-secondary" onclick={reset}>Reset</button>
      </div>
    </form>
  {/if}
  </div>

  <!-- ── Colonna destra: tabs ──────────────────── -->
  <div class="min-w-0 flex-1">
    <Tabs.Root value="date">
      <Tabs.List class="mb-4 flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        <Tabs.Trigger
          value="date"
          class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors
                 hover:text-gray-900 data-[state=active]:bg-white data-[state=active]:text-brand
                 data-[state=active]:shadow-sm"
        >
          Date
        </Tabs.Trigger>
        <Tabs.Trigger
          value="altro"
          class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors
                 hover:text-gray-900 data-[state=active]:bg-white data-[state=active]:text-brand
                 data-[state=active]:shadow-sm"
        >
          Controlli
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="date" class="card">
        <TabDate />
      </Tabs.Content>

      <Tabs.Content value="altro" class="card">
        <TabAltro />
      </Tabs.Content>
    </Tabs.Root>
  </div>

  </div><!-- fine flex -->
</div>

<!-- Dialog ricerca estesa -->
<Dialog.Root bind:open={dialogOpen}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
    <Dialog.Content
      class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2
             rounded-xl bg-white shadow-2xl focus:outline-none"
    >
      <div class="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <Dialog.Title class="text-base font-semibold text-gray-800">Ricerca estesa</Dialog.Title>
        <Dialog.Close class="rounded-md p-1 text-gray-400 hover:bg-gray-100" aria-label="Chiudi">
          ✕
        </Dialog.Close>
      </div>

      <div class="flex gap-2 px-5 pt-4">
        <input
          type="text"
          class="input flex-1"
          placeholder="Nome o reparto…"
          bind:value={dialogQuery}
        />
        <select class="input w-36 shrink-0" bind:value={dialogFiltroRuolo}>
          <option value="">Tutti i ruoli</option>
          <option value="Amministratore">Amministratore</option>
          <option value="Tecnico">Tecnico</option>
          <option value="Operatore">Operatore</option>
        </select>
      </div>

      <div class="max-h-72 overflow-y-auto px-5 py-3">
        {#if dialogRisultati.length === 0}
          <p class="py-6 text-center text-sm text-gray-400">Nessun risultato</p>
        {:else}
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-100 text-left text-xs font-medium text-gray-500">
                <th class="pb-2 pr-4">Nome</th>
                <th class="pb-2 pr-4">Ruolo</th>
                <th class="pb-2">Reparto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each dialogRisultati as persona (persona.id)}
                <tr class="border-b border-gray-50 hover:bg-gray-50">
                  <td class="py-2 pr-4 font-medium text-gray-800">{persona.nome}</td>
                  <td class="py-2 pr-4">
                    <span class={ruoliBadge[persona.ruolo] ?? 'badge badge-neutral'}>
                      {persona.ruolo}
                    </span>
                  </td>
                  <td class="py-2 pr-4 text-gray-500">{persona.reparto}</td>
                  <td class="py-2">
                    <button
                      type="button"
                      class="btn btn-primary py-0.5 text-xs"
                      onclick={() => selezionaDaDialog(persona)}
                    >
                      Seleziona
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
          <p class="mt-2 text-right text-xs text-gray-400">{dialogRisultati.length} risultati</p>
        {/if}
      </div>

      <div class="border-t border-gray-200 px-5 py-3 text-right">
        <Dialog.Close class="btn btn-secondary text-sm">Chiudi</Dialog.Close>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<a href="/playground" class="mt-4 block px-8 text-sm text-blue-600 hover:underline">← Playground</a>
