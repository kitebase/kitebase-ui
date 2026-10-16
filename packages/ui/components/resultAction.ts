/**
 * What to do with what an operation answered.
 *
 * An operation that runs from a menu item, from a row action or from a
 * navigator command ends the same way: it has done something, and the person
 * who asked deserves to see what. That last step is not always a dialog —
 * sometimes the answer IS a page (the rows that failed, a preview to work
 * through), sometimes a menu of what can be done next — so the server says
 * which, using the same `action` vocabulary as everything else: a scalar verb
 * plus its sibling keys.
 *
 *   {status: 'success', data: {message, detail, touched?}}       → a box; the
 *       view then refreshes the touched keys, or everything when none are named
 *   {status: 'success', data: {action: 'stack_push', panel: …}}  → a page
 *   {action: 'choose', options: [{label, current?, then}]}       → a menu; the
 *       pick's `then` is applied with these same rules
 *   {action: 'endpoint', op, params, confirm?}                   → another call,
 *       whose answer is applied with these same rules
 *   {action: 'download', op, params}                             → a file: the
 *       call goes to the download route, and the browser saves what comes back
 *   {action: 'set_query_params', params}                         → keys the view
 *       carries on every query from now on
 *
 * Saying nothing means a box, which is what most operations want and keeps the
 * common case free of ceremony. The client never interprets the words: only the
 * server knows how many rows it touched, and only the server knows what
 * `include_archived` means. A `choose` whose options carry a ready-made
 * `endpoint` call is how a server-driven popup works without the client
 * knowing what any entry does.
 */
import { api } from '../api/client';
import { msgbox } from './msgbox.svelte';
import { _ } from '../i18n';
import PanelPage from './PanelPage.svelte';
import type { StackInstance } from '$kitebase/stack/stack.svelte';

export interface ResultContext {
  /** Shown as the dialog title — normally the label of what was clicked. */
  title?: string;
  stack: StackInstance;
  /** Where the view is: how it takes the keys of `set_query_params`. */
  setQueryParams?: (params: Record<string, unknown>) => void;
  /**
   * Where the view is: an answer that reports (a box) has done something the
   * rows may show. With `touched` it names the keys and the view refreshes
   * just those; without, the view reloads.
   */
  refreshRows?: (ids: unknown[]) => void | Promise<void>;
  reload?: () => void;
}

type Payload = Record<string, unknown>;

export async function applyResult(response: unknown, ctx: ResultContext): Promise<void> {
  const payload = (response ?? {}) as Payload;

  if (payload.status === 'error') {
    // The id is the line in the server's log: what a person reports, and
    // what turns "it failed" into something that can be looked up.
    const id = typeof payload.request_id === 'string' ? ` [${payload.request_id.slice(0, 8)}]` : '';
    await msgbox.error(
      ((payload.message as string) ?? _('The operation failed')) + id,
      (((payload.data ?? {}) as Payload).detail as string | undefined)
        ?? (payload.traceback as string | undefined),
      ctx.title,
    );
    return;
  }

  await applyBody((payload.data ?? {}) as Payload, ctx, payload.message as string | undefined);
}

async function applyBody(body: Payload, ctx: ResultContext, fallback?: string): Promise<void> {
  switch (body.action) {
    case 'stack_push':
      if (typeof body.panel === 'string') {
        ctx.stack.push(PanelPage, { panelId: body.panel, ...(body.props as object ?? {}) });
      }
      return;

    case 'choose': {
      const options = (body.options ?? []) as Array<{ label: string; current?: boolean; then?: Payload }>;
      const picked = await msgbox.choose(
        options.map(o => ({ label: o.label, current: o.current, value: o })),
        (body.title as string) ?? ctx.title,
        body.message as string | undefined,
      ) as { then?: Payload } | undefined;
      if (picked?.then) await applyBody(picked.then, ctx);
      return;
    }

    case 'endpoint': {
      if (typeof body.op !== 'string') return;
      const confirmText = typeof body.confirm === 'string' ? body.confirm : null;
      if (confirmText && !(await msgbox.confirm(confirmText, ctx.title))) return;
      const res = await api.endpoint(body.op, (body.params ?? {}) as Payload);
      await applyResult(res, ctx);
      return;
    }

    case 'download': {
      if (typeof body.op !== 'string') return;
      const res = await api.download(body.op, (body.params ?? {}) as Payload);
      // Saved is its own report: a box saying so would be one click too many.
      if (res.status === 'error') await applyResult(res, ctx);
      return;
    }

    case 'set_query_params':
      ctx.setQueryParams?.((body.params ?? {}) as Payload);
      return;
  }

  await msgbox.show({
    title: ctx.title,
    message: (body.message as string) ?? fallback ?? _('Done'),
    detail: body.detail as string | undefined,
    detailLabel: body.detail_label as string | undefined ?? _('Show what was done'),
    variant: 'info',
    buttons: [{ label: 'OK', value: undefined, variant: 'primary' }],
  });
  if (Array.isArray(body.touched) && ctx.refreshRows) await ctx.refreshRows(body.touched);
  else ctx.reload?.();
}
