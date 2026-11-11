<script lang="ts">
  import { Dialog, AlertDialog, Popover } from 'bits-ui';
  import Sheet from './Sheet.svelte';
  import SheetDialog from '$kitebase/components/SheetDialog.svelte';

  let itemToDelete = $state('Documento importante.pdf');

  let sheetOpen = $state(false);
  let sheetSide = $state<'top' | 'right' | 'bottom' | 'left'>('right');

  let sheetDialogOpen = $state(false);
  let sheetDialogSide = $state<'top' | 'right' | 'bottom' | 'left'>('right');

  let formName = $state('');
  let formEmail = $state('');

  function handleDelete() {
    console.log('Eliminato:', itemToDelete);
  }

  function handleFormSubmit() {
    console.log('Form inviato:', { formName, formEmail });
    formName = '';
    formEmail = '';
  }
</script>

<div class="mx-auto max-w-4xl p-8">
  <h1 class="mb-2 text-2xl font-bold text-gray-800">Dialogs Demo</h1>
  <p class="mb-8 text-gray-500">Tutti i pattern di overlay disponibili con bits-ui</p>

  <div class="grid grid-cols-1 gap-8 md:grid-cols-2">
    <!-- ── 1. DIALOG BASE ───────────────────────────────── -->
    <div class="rounded-xl border border-gray-200 p-6">
      <h2 class="mb-1 text-lg font-semibold text-gray-800">Dialog</h2>
      <p class="mb-4 text-sm text-gray-500">
        Modal classico con overlay e chiusura su Esc/click fuori
      </p>

      <Dialog.Root>
        <Dialog.Trigger class="btn btn-primary">
          Apri Dialog
        </Dialog.Trigger>

        <Dialog.Portal>
          <Dialog.Overlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content
            class="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl"
          >
            <Dialog.Title class="mb-1 text-xl font-bold text-gray-900">
              Titolo del Dialog
            </Dialog.Title>
            <Dialog.Description class="mb-6 text-sm text-gray-500">
              Questo è un dialog base. Puoi chiuderlo premendo Esc, cliccando fuori o sul bottone.
            </Dialog.Description>
            <p class="mb-6 text-sm text-gray-700">
              Contenuto del dialog. Può contenere qualsiasi cosa: testo, immagini, form, ecc.
            </p>
            <div class="flex justify-end gap-2">
              <Dialog.Close class="btn btn-secondary">Annulla</Dialog.Close>
              <Dialog.Close class="btn btn-primary">Conferma</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>

    <!-- ── 2. DIALOG CON FORM ──────────────────────────── -->
    <div class="rounded-xl border border-gray-200 p-6">
      <h2 class="mb-1 text-lg font-semibold text-gray-800">Dialog con Form</h2>
      <p class="mb-4 text-sm text-gray-500">Modal che contiene un form con validazione</p>

      <Dialog.Root>
        <Dialog.Trigger class="btn btn-primary bg-green-600 hover:bg-green-700">
          Nuovo Utente
        </Dialog.Trigger>

        <Dialog.Portal>
          <Dialog.Overlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content
            class="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl"
          >
            <Dialog.Title class="mb-1 text-xl font-bold text-gray-900">Nuovo Utente</Dialog.Title>
            <Dialog.Description class="mb-6 text-sm text-gray-500">
              Compila i campi per aggiungere un nuovo utente.
            </Dialog.Description>
            <div class="space-y-4">
              <div>
                <label for="dialog-name" class="mb-1 block text-sm font-medium text-gray-700">Nome</label>
                <input
                  id="dialog-name"
                  type="text"
                  bind:value={formName}
                  placeholder="Mario Rossi"
                  class="input"
                />
              </div>
              <div>
                <label for="dialog-email" class="mb-1 block text-sm font-medium text-gray-700">Email</label>
                <input
                  id="dialog-email"
                  type="email"
                  bind:value={formEmail}
                  placeholder="mario@example.com"
                  class="input"
                />
              </div>
            </div>
            <div class="mt-6 flex justify-end gap-2">
              <Dialog.Close class="btn btn-secondary">Annulla</Dialog.Close>
              <Dialog.Close
                onclick={handleFormSubmit}
                disabled={!formName || !formEmail}
                class="btn btn-primary bg-green-600 hover:bg-green-700"
              >
                Salva
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>

    <!-- ── 3. ALERT DIALOG ─────────────────────────────── -->
    <div class="rounded-xl border border-gray-200 p-6">
      <h2 class="mb-1 text-lg font-semibold text-gray-800">Alert Dialog</h2>
      <p class="mb-4 text-sm text-gray-500">
        Conferma azione distruttiva — non si chiude cliccando fuori
      </p>

      <AlertDialog.Root>
        <AlertDialog.Trigger class="btn btn-danger">
          Elimina file
        </AlertDialog.Trigger>

        <AlertDialog.Portal>
          <AlertDialog.Overlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <AlertDialog.Content
            class="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl"
          >
            <AlertDialog.Title class="mb-1 text-xl font-bold text-gray-900">
              Eliminare il file?
            </AlertDialog.Title>
            <AlertDialog.Description class="mb-6 text-sm text-gray-500">
              Stai per eliminare <strong class="text-gray-800">{itemToDelete}</strong>. Questa
              azione non può essere annullata.
            </AlertDialog.Description>
            <div class="flex justify-end gap-2">
              <AlertDialog.Cancel class="btn btn-secondary">Annulla</AlertDialog.Cancel>
              <AlertDialog.Action onclick={handleDelete} class="btn btn-danger">
                Sì, elimina
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>

    <!-- ── 4. POPOVER ─────────────────────────────────── -->
    <div class="rounded-xl border border-gray-200 p-6">
      <h2 class="mb-1 text-lg font-semibold text-gray-800">Popover</h2>
      <p class="mb-4 text-sm text-gray-500">Pannello contestuale ancorato all'elemento trigger</p>

      <Popover.Root>
        <Popover.Trigger class="btn btn-secondary">
          Apri Popover ▾
        </Popover.Trigger>
        <Popover.Content
          class="z-50 w-72 rounded-lg border border-gray-200 bg-white p-4 shadow-lg"
          sideOffset={8}
        >
          <h3 class="mb-1 font-semibold text-gray-800">Informazioni</h3>
          <p class="mb-3 text-sm text-gray-600">
            Il Popover rimane aperto finché non clicchi fuori. Utile per filtri, menu contestuali,
            tooltip arricchiti.
          </p>
          <div class="flex gap-2">
            <button class="btn btn-primary flex-1 py-1.5 text-xs">Azione</button>
            <Popover.Close class="btn btn-secondary flex-1 py-1.5 text-xs">Chiudi</Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Root>
    </div>

    <!-- ── 5. Sheet.svelte — CSS puro ─────────────────── -->
    <div class="rounded-xl border border-purple-200 bg-purple-50/30 p-6">
      <div class="mb-3 flex items-start justify-between">
        <div>
          <h2 class="mb-1 text-lg font-semibold text-gray-800">Sheet.svelte</h2>
          <code class="text-xs text-purple-700">CSS puro + Tailwind</code>
        </div>
        <span class="rounded-full bg-purple-100 px-2 py-1 text-xs text-purple-700">senza bits-ui</span>
      </div>
      <ul class="mb-4 space-y-1 text-xs text-gray-500">
        <li>❌ No Esc key</li>
        <li>❌ No focus trap</li>
        <li>❌ No ARIA</li>
        <li>❌ No Portal</li>
        <li>✅ Semplice da capire</li>
        <li>✅ Solo Tailwind</li>
      </ul>
      <div class="flex flex-wrap gap-2">
        {#each (['top', 'right', 'bottom', 'left'] as const) as s}
          <button
            onclick={() => { sheetSide = s; sheetOpen = true; }}
            class="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700"
          >
            {s === 'top' ? '↓' : s === 'right' ? '←' : s === 'bottom' ? '↑' : '→'} {s}
          </button>
        {/each}
      </div>
    </div>

    <!-- ── 6. SheetDialog.svelte — bits-ui Dialog ──────── -->
    <div class="rounded-xl border border-blue-200 bg-blue-50/30 p-6">
      <div class="mb-3 flex items-start justify-between">
        <div>
          <h2 class="mb-1 text-lg font-semibold text-gray-800">SheetDialog.svelte</h2>
          <code class="text-xs text-blue-700">Dialog bits-ui + Tailwind</code>
        </div>
        <span class="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700">ispirato shadcn</span>
      </div>
      <ul class="mb-4 space-y-1 text-xs text-gray-500">
        <li>✅ Esc key</li>
        <li>✅ Focus trap</li>
        <li>✅ ARIA completo</li>
        <li>✅ Portal</li>
        <li>✅ Accessibile</li>
        <li>✅ Solo bits-ui</li>
      </ul>
      <div class="flex flex-wrap gap-2">
        {#each (['top', 'right', 'bottom', 'left'] as const) as s}
          <button
            onclick={() => { sheetDialogSide = s; sheetDialogOpen = true; }}
            class="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            {s === 'top' ? '↓' : s === 'right' ? '←' : s === 'bottom' ? '↑' : '→'} {s}
          </button>
        {/each}
      </div>
    </div>
  </div>
</div>

<Sheet bind:open={sheetOpen} side={sheetSide} title="Sheet.svelte — {sheetSide}">
  <p class="mb-1 text-sm font-medium text-gray-700">Implementazione CSS puro</p>
  <p class="mb-4 text-xs text-gray-500">Prova: Esc non chiude, tab esce dal pannello</p>
  <ul class="space-y-2">
    {#each ['Impostazioni', 'Profilo', 'Notifiche', 'Aiuto'] as item}
      <li>
        <button class="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100">{item}</button>
      </li>
    {/each}
  </ul>
</Sheet>

<SheetDialog
  bind:open={sheetDialogOpen}
  side={sheetDialogSide}
  title="SheetDialog.svelte — {sheetDialogSide}"
  description="Prova: Esc chiude, tab rimane dentro"
>
  <p class="mb-1 text-sm font-medium text-gray-700">Implementazione con bits-ui Dialog</p>
  <p class="mb-4 text-xs text-gray-500">Focus trap attivo, ARIA completo, Portal</p>
  <ul class="space-y-2">
    {#each ['Impostazioni', 'Profilo', 'Notifiche', 'Aiuto'] as item}
      <li>
        <button class="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100">{item}</button>
      </li>
    {/each}
  </ul>
</SheetDialog>

<a href="/playground" class="mt-4 block px-8 text-sm text-blue-600 hover:underline">← Playground</a>
