<script lang="ts">
  import { RadioGroup, Switch, Slider, Progress } from 'bits-ui';

  let notifiche = $state(true);
  let modalita = $state('standard');
  let volume = $state(60);
  let avanzamento = $state(45);
</script>

<div class="space-y-6">

  <!-- Switch -->
  <div>
    <p class="mb-2 text-sm font-medium text-gray-700">Notifiche email</p>
    <div class="flex items-center gap-3">
      <Switch.Root
        bind:checked={notifiche}
        class="relative h-6 w-11 rounded-full transition-colors
               bg-gray-300 data-[state=checked]:bg-brand"
      >
        <Switch.Thumb
          class="block h-4 w-4 translate-x-1 rounded-full bg-white shadow transition-transform
                 data-[state=checked]:translate-x-6"
        />
      </Switch.Root>
      <span class="text-sm text-gray-600">{notifiche ? 'Attive' : 'Disattivate'}</span>
    </div>
  </div>

  <!-- RadioGroup -->
  <div>
    <p class="mb-2 text-sm font-medium text-gray-700">Modalità di lavoro</p>
    <RadioGroup.Root bind:value={modalita} class="space-y-2">
      {#each [
        { value: 'base', label: 'Base', desc: 'Solo funzioni essenziali' },
        { value: 'standard', label: 'Standard', desc: 'Configurazione consigliata' },
        { value: 'avanzata', label: 'Avanzata', desc: 'Tutte le opzioni disponibili' },
      ] as opt}
        <div class="flex items-start gap-2">
          <RadioGroup.Item
            value={opt.value}
            id="radio-{opt.value}"
            class="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-gray-300
                   data-[state=checked]:border-brand data-[state=checked]:bg-brand
                   focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
          >
            {#snippet children({ checked })}
              {#if checked}
                <span class="flex h-full w-full items-center justify-center
                             after:block after:h-1.5 after:w-1.5 after:rounded-full after:bg-white"></span>
              {/if}
            {/snippet}
          </RadioGroup.Item>
          <label for="radio-{opt.value}" class="cursor-pointer">
            <span class="block text-sm font-medium text-gray-800">{opt.label}</span>
            <span class="block text-xs text-gray-500">{opt.desc}</span>
          </label>
        </div>
      {/each}
    </RadioGroup.Root>
    <p class="mt-2 text-xs text-gray-500">Selezionato: <span class="font-medium">{modalita}</span></p>
  </div>

  <!-- Slider volume -->
  <div>
    <div class="mb-3 flex items-center justify-between">
      <p class="text-sm font-medium text-gray-700">Volume</p>
      <span class="text-sm font-semibold text-brand">{volume}%</span>
    </div>
    <Slider.Root
      type="single"
      bind:value={volume}
      min={0}
      max={100}
      step={5}
      class="relative flex w-full touch-none items-center py-2"
    >
      {#snippet children({ thumbs })}
        <!-- Track -->
        <div class="relative h-2 w-full rounded-full bg-gray-200">
          <Slider.Range class="absolute h-full rounded-full bg-brand" />
        </div>
        <!-- Thumb -->
        {#each thumbs as thumb}
          <Slider.Thumb
            index={thumb}
            class="absolute block h-5 w-5 rounded-full border-2 border-brand bg-white shadow
                   focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
          />
        {/each}
      {/snippet}
    </Slider.Root>
  </div>

  <!-- Progress avanzamento -->
  <div>
    <div class="mb-2 flex items-center justify-between">
      <p class="text-sm font-medium text-gray-700">Avanzamento attività</p>
      <span class="text-sm font-semibold text-brand">{avanzamento}%</span>
    </div>
    <Progress.Root
      value={avanzamento}
      max={100}
      class="h-2 w-full overflow-hidden rounded-full bg-gray-200"
    >
      <div
        class="h-full rounded-full bg-brand transition-all duration-300"
        style="width: {avanzamento}%"
      ></div>
    </Progress.Root>
    <div class="mt-3 flex gap-2">
      <button
        type="button"
        class="btn btn-secondary py-1 text-xs"
        onclick={() => (avanzamento = Math.max(0, avanzamento - 10))}
      >−10%</button>
      <button
        type="button"
        class="btn btn-primary py-1 text-xs"
        onclick={() => (avanzamento = Math.min(100, avanzamento + 10))}
      >+10%</button>
    </div>
  </div>

</div>
