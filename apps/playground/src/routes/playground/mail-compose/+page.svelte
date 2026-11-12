<script lang="ts">
  /**
   * Mockup of the smtp plugin's compose form, to judge how its variants are
   * built: one base form, and each context changes it the way a YAML variant
   * would with deep_merge (fields removed, made read only, added). Nothing is
   * sent: on the right, the message the form would hand to `smtp_send`.
   */
  import DataForm from '$kitebase/components/DataForm.svelte';
  import type { FormDescriptor, FormField } from '$kitebase/components/dataform.types';

  // The fields of the record a placeholder may name, as the server would list them
  const partnerFields = [
    { name: 'name', label: 'Name' },
    { name: 'email', label: 'Email' },
    { name: 'city', label: 'City' },
    { name: 'agent.name', label: 'Agent' }
  ];

  // ── The base form: a free email ─────────────────────────────────────────────

  const base: FormField[] = [
    { name: 'account', label: 'From', widget: 'combobox', width: 220,
      choices: [{ value: 'office', label: 'office' }, { value: 'info', label: 'info' }] },
    { name: 'to', label: 'To', help: 'Addresses separated by commas: ann@example.com, Bob <bob@example.com>' },
    { name: 'cc', label: 'Cc' },
    { name: 'bcc', label: 'Bcc', same_row: true },
    { name: 'subject', label: 'Subject', required: true },
    { name: 'body', label: 'Text', type: 'Markdown', widget: 'markdown' },
    { name: 'receipt', label: 'Ask for a receipt', type: 'boolean' }
  ];

  // What a YAML variant does with deep_merge, written as code for the mockup
  type Variant = {
    remove?: string[];
    readonly?: string[];
    add?: { after: string; fields: FormField[] }[];
    placeholders?: { name: string; label?: string }[];
    params?: string[];
    attachments: boolean;
    data: Record<string, unknown>;
  };

  function build(v: Variant): FormField[] {
    let fields: FormField[] = base.filter((f) => !v.remove?.includes(f.name))
      .map((f) => ({ ...f, readonly: v.readonly?.includes(f.name) || f.readonly }));
    for (const block of v.add ?? []) {
      const i = fields.findIndex((f) => f.name === block.after);
      fields = [...fields.slice(0, i + 1), ...block.fields, ...fields.slice(i + 1)];
    }
    return fields.map((f) => (f.name === 'body' && v.placeholders
      ? { ...f, placeholders: v.placeholders } as FormField : f));
  }

  const variants: Record<string, { title: string; note: string; v: Variant }> = {
    free: {
      title: 'A. Free email',
      note: 'From the menu: every field, attachments, no record behind it, so no placeholder.',
      v: { attachments: true, data: { account: 'office', subject: '', body: '' } }
    },
    partner: {
      title: 'B. From a partner',
      note: 'A command on the partner: the recipient comes from the record and is fixed, no Cc/Bcc, no attachments; the placeholders read the partner.',
      v: {
        remove: ['cc', 'bcc', 'receipt'],
        readonly: ['to'],
        placeholders: partnerFields,
        attachments: false,
        data: { account: 'office', to: 'Riverside Hardware <orders@riverside.example>',
                subject: 'News for [[name]]', body: 'Dear [[name]],\n\n' }
      }
    },
    reminder: {
      title: 'C. Payment reminder',
      note: 'An invoices command computes two values and passes them; the variant draws them as fields (the count read only, the amount editable) and declares them as params.',
      v: {
        remove: ['cc', 'bcc'],
        readonly: ['to'],
        add: [{ after: 'subject', fields: [
          { name: 'invoices', label: 'Invoices', type: 'Int', readonly: true, width: 120 },
          { name: 'total_amount', label: 'Total due', type: 'Float', widget: 'number',
            widget_props: { prefix: '€' }, same_row: true, width: 180 }
        ] }],
        placeholders: [...partnerFields, { name: '$invoices', label: 'Invoices' },
                       { name: '$total_amount', label: 'Total due' }],
        params: ['invoices', 'total_amount'],
        attachments: true,
        data: {
          account: 'office', to: 'Riverside Hardware <accounts@riverside.example>',
          invoices: 3, total_amount: 1234.5, receipt: true,
          subject: 'Payment reminder for [[name]]',
          body: 'Dear [[name]],\n\nthe total due for **[[$invoices]]** invoices is **[[$total_amount]]** euro.\n\nKind regards'
        }
      }
    }
  };

  let current = $state<keyof typeof variants>('free');
  let drafts = $state<Record<string, Record<string, unknown>>>(
    Object.fromEntries(Object.entries(variants).map(([k, x]) => [k, { ...x.v.data }])));
  let staged = $state<Record<string, string[]>>({ free: [], partner: [], reminder: ['statement.pdf'] });

  const variant = $derived(variants[current]);
  const view = $derived<FormDescriptor>({
    type: 'form',
    policy: { editable: true },
    fields: build(variant.v)
  });

  const split = (v: unknown) => (typeof v === 'string' && v.trim()
    ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

  // What the form would send: the params are the fields the variant declares as such
  const message = $derived.by(() => {
    const d = drafts[current];
    const params = Object.fromEntries((variant.v.params ?? []).map((p) => [p, d[p]]));
    return {
      account: d.account,
      to: split(d.to), cc: split(d.cc), bcc: split(d.bcc),
      subject: d.subject, body: d.body, receipt: !!d.receipt,
      ...(variant.v.params ? { params } : {}),
      ...(current !== 'free' ? { record: { model: 'Partner', id: 42 } } : {}),
      attachments: variant.v.attachments
        ? staged[current].map((n) => ({ ref: `mail:outbox/7/202611/3f2a9c/${n}` })) : undefined
    };
  });

  function addFile() {
    staged[current] = [...staged[current], `file-${staged[current].length + 1}.pdf`];
  }
</script>

<div class="max-w-6xl space-y-5">
  <div>
    <h1 class="mb-1 text-2xl font-bold text-gray-800">Compose email: variants</h1>
    <p class="text-sm text-gray-500">
      Mockup of the <code>smtp</code> compose form. One base form; each context changes it
      as a YAML variant would. Nothing is sent: the form's save plays Send, and on the right
      appears what would go to <code>smtp_send</code>.
    </p>
  </div>

  <div class="flex flex-wrap gap-2">
    {#each Object.entries(variants) as [key, x] (key)}
      <button class="rounded border px-3 py-1 text-sm {current === key
                ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white hover:bg-gray-100'}"
              onclick={() => (current = key)}>{x.title}</button>
    {/each}
  </div>
  <p class="text-sm text-gray-600">{variant.note}</p>

  <div class="grid gap-6 lg:grid-cols-[3fr_2fr]">
    <div class="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      {#key current}
        <DataForm {view} data={drafts[current]} persist={false}
                  onSave={(d) => { drafts[current] = { ...d }; }} />
      {/key}
      {#if variant.v.attachments}
        <div class="border-t border-gray-100 pt-3 text-sm">
          <div class="mb-1 font-medium text-gray-600">Attachments</div>
          <div class="flex flex-wrap items-center gap-2">
            {#each staged[current] as name, i (name)}
              <span class="rounded bg-gray-100 px-2 py-0.5">
                {name}
                <button class="ml-1 text-gray-400 hover:text-red-600"
                        onclick={() => (staged[current] = staged[current].filter((_, j) => j !== i))}>x</button>
              </span>
            {/each}
            <button class="rounded border border-dashed border-gray-300 px-2 py-0.5 text-gray-500 hover:bg-gray-50"
                    onclick={addFile}>+ Attach a file</button>
          </div>
        </div>
      {/if}
    </div>
    <pre class="overflow-auto rounded-lg border border-gray-200 bg-white p-3 text-xs whitespace-pre-wrap">{JSON.stringify(message, null, 2)}</pre>
  </div>
</div>
