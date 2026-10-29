<script lang="ts">
  /**
   * A set of codes from a small vocabulary, as a list of checkboxes: the roles
   * of a user, the roles of a partner. The value is the array of the codes
   * checked, in the order of the choices.
   *
   * The choices come with the field (`choices`) or from an endpoint
   * (`choices_endpoint`), each `{ value, label, group?, implies? }`:
   *   - `group` gathers the choices under a heading;
   *   - `implies` names the choices one brings along: those show checked and
   *     disabled, with the choice they come from, and are not stored, since
   *     the definition already gives them;
   *   - a code in the value that no choice offers stays on show as unknown,
   *     checked, so it can be seen and taken away rather than kept unseen.
   */
  import { untrack } from 'svelte';
  import { _ } from '../../i18n';
  import { api } from '$kitebase/api/client';
  import type { FormField } from '../dataform.types';

  interface Choice {
    value: string;
    label: string;
    group?: string;
    implies?: string[];
  }

  interface Props {
    value: unknown;
    onchange: (v: string[]) => void;
    onblur?: () => void;
    readonly?: boolean;
    field: FormField;
  }

  let { value, onchange, onblur, readonly = false, field }: Props = $props();

  let fetched = $state<Choice[] | null>(null);
  let loadError = $state<string | null>(null);

  const endpoint = $derived(field.choices_endpoint as string | undefined);

  $effect(() => {
    const name = endpoint;
    if (!name) return;
    untrack(async () => {
      try {
        const res = await api.endpoint(name, {});
        if (res.status === 'success') fetched = res.data as Choice[];
        else loadError = res.message ?? _('The choices could not be loaded');
      } catch (e) {
        loadError = e instanceof Error ? e.message : String(e);
      }
    });
  });

  const choices = $derived<Choice[]>(
    endpoint ? (fetched ?? []) : ((field.choices ?? []) as unknown as Choice[]),
  );
  const byValue = $derived(new Map(choices.map((c) => [c.value, c])));

  const checked = $derived(
    Array.isArray(value) ? (value as unknown[]).filter((v) => typeof v === 'string') as string[] : [],
  );

  /** What the checked choices bring along: code -> the label of a choice that brings it. */
  const implied = $derived.by(() => {
    const own = new Set(checked);
    const from = new Map<string, string>();
    for (const code of checked) {
      const origin = byValue.get(code)?.label ?? code;
      const stack = [...(byValue.get(code)?.implies ?? [])];
      const seen = new Set<string>();
      while (stack.length) {
        const next = stack.pop()!;
        if (seen.has(next)) continue;
        seen.add(next);
        if (!own.has(next) && !from.has(next)) from.set(next, origin);
        stack.push(...(byValue.get(next)?.implies ?? []));
      }
    }
    return from;
  });

  const groups = $derived.by(() => {
    const out = new Map<string, Choice[]>();
    for (const c of choices) {
      const key = c.group ?? '';
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(c);
    }
    return [...out.entries()];
  });

  // Unknown only once the vocabulary is there: before, every code would be.
  const unknown = $derived(
    endpoint && fetched === null ? [] : checked.filter((code) => !byValue.has(code)),
  );

  function toggle(code: string) {
    const next = new Set(checked);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    const ordered = choices.map((c) => c.value).filter((v) => next.has(v));
    onchange([...ordered, ...[...next].filter((v) => !byValue.has(v))]);
    onblur?.();
  }
</script>

<div class="checklist" aria-label={field.label ?? field.name}>
  {#if loadError}
    <p class="note">{loadError}</p>
  {/if}

  {#each groups as [group, items] (group)}
    <fieldset>
      {#if group}<legend>{group}</legend>{/if}
      {#each items as c (c.value)}
        {@const from = implied.get(c.value)}
        <label class={{ implied: from }}>
          <input
            type="checkbox"
            checked={checked.includes(c.value) || !!from}
            disabled={readonly || !!from}
            onchange={() => toggle(c.value)}
          />
          <span>{c.label}</span>
          {#if from}<span class="note">{_('from')} {from}</span>{/if}
        </label>
      {/each}
    </fieldset>
  {/each}

  {#if unknown.length}
    <fieldset>
      <legend>{_('Unknown')}</legend>
      {#each unknown as code (code)}
        <label class="unknown">
          <input type="checkbox" checked disabled={readonly} onchange={() => toggle(code)} />
          <code>{code}</code>
        </label>
      {/each}
    </fieldset>
  {/if}
</div>

<style>
  .checklist {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1.25rem;
    margin: 0;
    padding: 0;
    border: none;
  }
  legend {
    width: 100%;
    margin-bottom: 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--kb-text-subtle);
  }
  label {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.875rem;
    color: var(--kb-text);
    cursor: pointer;
  }
  label.implied {
    color: var(--kb-text-subtle);
    cursor: default;
  }
  label.unknown code {
    color: var(--kb-danger);
  }
  input {
    accent-color: var(--kb-accent);
  }
  .note {
    font-size: 0.75rem;
    color: var(--kb-text-subtle);
  }
</style>
