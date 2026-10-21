/**
 * A form in a dialog, asked for from code and answered with its values:
 *
 *   const values = await formDialog.open(view, { title: 'Phone book' }, 'Print');
 *   if (values) ...                       // null: cancelled
 *
 * The same shape as `msgbox`, one level up: a message box answers with one of
 * a few fixed values, a form dialog with the values the person typed. The
 * host is `FormDialog.svelte`, mounted once beside `MessageBox`.
 */
import type { FormDescriptor } from './dataform.types';

interface ActiveForm {
  view: FormDescriptor;
  values: Record<string, unknown>;
  title?: string;
}

// The resolve function lives outside $state, as in msgbox: a proxied function
// breaks the Promise chain.
let _resolve: ((v: Record<string, unknown> | null) => void) | null = null;
let _active = $state<ActiveForm | null>(null);

export const formDialog = {
  get active() { return _active; },

  open(view: FormDescriptor, values: Record<string, unknown> = {},
       title?: string): Promise<Record<string, unknown> | null> {
    // One at a time: a second form would take the first one's answer.
    _resolve?.(null);
    return new Promise((resolve) => {
      _resolve = resolve;
      _active = { view, values, title };
    });
  },

  respond(values: Record<string, unknown> | null) {
    const resolve = _resolve;
    _resolve = null;
    _active = null;
    resolve?.(values);
  },
};
