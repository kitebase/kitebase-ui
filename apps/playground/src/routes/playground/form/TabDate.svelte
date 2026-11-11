<script lang="ts">
  import { DatePicker, DateRangePicker, Portal } from 'bits-ui';
  import type { DateValue } from '@internationalized/date';

  let dataSemplice = $state<DateValue | undefined>(undefined);
  let dataOra = $state<DateValue | undefined>(undefined);
  let dataRange = $state<{ start: DateValue | undefined; end: DateValue | undefined }>({
    start: undefined,
    end: undefined,
  });

  const segClass =
    'rounded px-0.5 text-sm tabular-nums caret-transparent ' +
    'focus:bg-brand focus:text-white focus:outline-none ' +
    'data-[placeholder]:text-gray-400';

  const dayClass =
    'flex h-8 w-8 items-center justify-center rounded-md text-sm ' +
    'hover:bg-gray-100 ' +
    'data-[selected]:bg-brand data-[selected]:text-white ' +
    'data-[disabled]:opacity-30 data-[disabled]:pointer-events-none ' +
    'data-[outside-month]:opacity-40 ' +
    'data-[today]:border data-[today]:border-brand';
</script>

<div class="space-y-6">

  <!-- 1. Solo data -->
  <div>
    <DatePicker.Root bind:value={dataSemplice} granularity="day" locale="it">
      <DatePicker.Label class="mb-1 block text-sm font-medium text-gray-700">
        Solo data
      </DatePicker.Label>
      <div class="relative">
        <DatePicker.Input class="input flex items-center gap-0.5 pr-9">
          {#snippet children({ segments })}
            {#each segments as { part, value }}
              {#if part === 'literal'}
                <span class="select-none text-gray-400">{value}</span>
              {:else}
                <DatePicker.Segment {part} class={segClass}>{value}</DatePicker.Segment>
              {/if}
            {/each}
          {/snippet}
        </DatePicker.Input>
        <DatePicker.Trigger
          class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand"
          aria-label="Apri calendario"
        >📅</DatePicker.Trigger>
      </div>
      <DatePicker.Portal>
        <DatePicker.Content class="z-50 mt-1 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
          <DatePicker.Calendar>
            {#snippet children({ months, weekdays })}
              <DatePicker.Header class="mb-2 flex items-center justify-between">
                <DatePicker.PrevButton class="rounded p-1 hover:bg-gray-100">←</DatePicker.PrevButton>
                <DatePicker.Heading class="text-sm font-semibold" />
                <DatePicker.NextButton class="rounded p-1 hover:bg-gray-100">→</DatePicker.NextButton>
              </DatePicker.Header>
              {#each months as month}
                <DatePicker.Grid class="w-full">
                  <DatePicker.GridHead>
                    <DatePicker.GridRow class="flex">
                      {#each weekdays as day}
                        <DatePicker.HeadCell class="w-8 text-center text-xs font-medium text-gray-400">
                          {day.slice(0, 2)}
                        </DatePicker.HeadCell>
                      {/each}
                    </DatePicker.GridRow>
                  </DatePicker.GridHead>
                  <DatePicker.GridBody>
                    {#each month.weeks as weekDates}
                      <DatePicker.GridRow class="flex">
                        {#each weekDates as date}
                          <DatePicker.Cell {date} month={month.value} class="p-0.5">
                            <DatePicker.Day class={dayClass} />
                          </DatePicker.Cell>
                        {/each}
                      </DatePicker.GridRow>
                    {/each}
                  </DatePicker.GridBody>
                </DatePicker.Grid>
              {/each}
            {/snippet}
          </DatePicker.Calendar>
        </DatePicker.Content>
      </DatePicker.Portal>
    </DatePicker.Root>
    {#if dataSemplice}
      <p class="mt-1 text-xs text-gray-500">Selezionato: {dataSemplice.toString()}</p>
    {/if}
  </div>

  <!-- 2. Data + ora -->
  <div>
    <DatePicker.Root bind:value={dataOra} granularity="minute" locale="it">
      <DatePicker.Label class="mb-1 block text-sm font-medium text-gray-700">
        Data e ora <span class="font-normal text-gray-400">(click su ora/min → frecce ↑↓)</span>
      </DatePicker.Label>
      <div class="relative">
        <DatePicker.Input class="input flex items-center gap-0.5 pr-9">
          {#snippet children({ segments })}
            {#each segments as { part, value }}
              {#if part === 'literal'}
                <span class="select-none text-gray-400">{value}</span>
              {:else}
                <DatePicker.Segment {part} class={segClass}>{value}</DatePicker.Segment>
              {/if}
            {/each}
          {/snippet}
        </DatePicker.Input>
        <DatePicker.Trigger
          class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand"
          aria-label="Apri calendario"
        >🕐</DatePicker.Trigger>
      </div>
      <DatePicker.Portal>
        <DatePicker.Content class="z-50 mt-1 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
          <DatePicker.Calendar>
            {#snippet children({ months, weekdays })}
              <DatePicker.Header class="mb-2 flex items-center justify-between">
                <DatePicker.PrevButton class="rounded p-1 hover:bg-gray-100">←</DatePicker.PrevButton>
                <DatePicker.Heading class="text-sm font-semibold" />
                <DatePicker.NextButton class="rounded p-1 hover:bg-gray-100">→</DatePicker.NextButton>
              </DatePicker.Header>
              {#each months as month}
                <DatePicker.Grid class="w-full">
                  <DatePicker.GridHead>
                    <DatePicker.GridRow class="flex">
                      {#each weekdays as day}
                        <DatePicker.HeadCell class="w-8 text-center text-xs font-medium text-gray-400">
                          {day.slice(0, 2)}
                        </DatePicker.HeadCell>
                      {/each}
                    </DatePicker.GridRow>
                  </DatePicker.GridHead>
                  <DatePicker.GridBody>
                    {#each month.weeks as weekDates}
                      <DatePicker.GridRow class="flex">
                        {#each weekDates as date}
                          <DatePicker.Cell {date} month={month.value} class="p-0.5">
                            <DatePicker.Day class={dayClass} />
                          </DatePicker.Cell>
                        {/each}
                      </DatePicker.GridRow>
                    {/each}
                  </DatePicker.GridBody>
                </DatePicker.Grid>
              {/each}
            {/snippet}
          </DatePicker.Calendar>
        </DatePicker.Content>
      </DatePicker.Portal>
    </DatePicker.Root>
    {#if dataOra}
      <p class="mt-1 text-xs text-gray-500">Selezionato: {dataOra.toString()}</p>
    {/if}
  </div>

  <!-- 3. Intervallo da–a -->
  <div>
    <DateRangePicker.Root bind:value={dataRange} locale="it">
      <DateRangePicker.Label class="mb-1 block text-sm font-medium text-gray-700">
        Intervallo (da — a)
      </DateRangePicker.Label>
      <div class="relative flex items-center gap-1">
        <DateRangePicker.Input
          type="start"
          class="input flex min-w-0 flex-1 items-center gap-0.5"
        >
          {#snippet children({ segments })}
            {#each segments as { part, value }}
              {#if part === 'literal'}
                <span class="select-none text-gray-400">{value}</span>
              {:else}
                <DateRangePicker.Segment {part} class={segClass}>{value}</DateRangePicker.Segment>
              {/if}
            {/each}
          {/snippet}
        </DateRangePicker.Input>

        <span class="shrink-0 text-gray-400">—</span>

        <DateRangePicker.Input
          type="end"
          class="input flex min-w-0 flex-1 items-center gap-0.5 pr-8"
        >
          {#snippet children({ segments })}
            {#each segments as { part, value }}
              {#if part === 'literal'}
                <span class="select-none text-gray-400">{value}</span>
              {:else}
                <DateRangePicker.Segment {part} class={segClass}>{value}</DateRangePicker.Segment>
              {/if}
            {/each}
          {/snippet}
        </DateRangePicker.Input>

        <DateRangePicker.Trigger
          class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand"
          aria-label="Apri calendario"
        >📅</DateRangePicker.Trigger>
      </div>

      <Portal>
        <DateRangePicker.Content class="z-50 mt-1 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
          <DateRangePicker.Calendar>
            {#snippet children({ months, weekdays })}
              <DateRangePicker.Header class="mb-2 flex items-center justify-between">
                <DateRangePicker.PrevButton class="rounded p-1 hover:bg-gray-100">←</DateRangePicker.PrevButton>
                <DateRangePicker.Heading class="text-sm font-semibold" />
                <DateRangePicker.NextButton class="rounded p-1 hover:bg-gray-100">→</DateRangePicker.NextButton>
              </DateRangePicker.Header>
              {#each months as month}
                <DateRangePicker.Grid class="w-full">
                  <DateRangePicker.GridHead>
                    <DateRangePicker.GridRow class="flex">
                      {#each weekdays as day}
                        <DateRangePicker.HeadCell class="w-8 text-center text-xs font-medium text-gray-400">
                          {day.slice(0, 2)}
                        </DateRangePicker.HeadCell>
                      {/each}
                    </DateRangePicker.GridRow>
                  </DateRangePicker.GridHead>
                  <DateRangePicker.GridBody>
                    {#each month.weeks as weekDates}
                      <DateRangePicker.GridRow class="flex">
                        {#each weekDates as date}
                          <DateRangePicker.Cell {date} month={month.value} class="p-0.5">
                            <DateRangePicker.Day
                              class="{dayClass}
                                data-[in-range]:bg-blue-50
                                data-[selection-start]:bg-brand data-[selection-start]:text-white
                                data-[selection-end]:bg-brand data-[selection-end]:text-white"
                            />
                          </DateRangePicker.Cell>
                        {/each}
                      </DateRangePicker.GridRow>
                    {/each}
                  </DateRangePicker.GridBody>
                </DateRangePicker.Grid>
              {/each}
            {/snippet}
          </DateRangePicker.Calendar>
        </DateRangePicker.Content>
      </Portal>
    </DateRangePicker.Root>
    {#if dataRange.start && dataRange.end}
      <p class="mt-1 text-xs text-gray-500">
        Da {dataRange.start.toString()} a {dataRange.end.toString()}
      </p>
    {/if}
  </div>

</div>
