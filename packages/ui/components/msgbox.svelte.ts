import { _ } from '../i18n';

export type DialogVariant = 'info' | 'warning' | 'error' | 'danger';
export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface DialogButton {
  label: string;
  value: unknown;
  variant?: ButtonVariant;
}

export interface DialogChoice {
  label: string;
  value: unknown;
  /** The one in force now — shown as such, so the list also reads as state. */
  current?: boolean;
}

export interface DialogOptions {
  title?: string;
  message: string;
  /** Shown in a collapsible <pre> block — tracebacks, YAML/JS errors */
  detail?: string;
  /**
   * What the collapsed block is called. The default says "technical details",
   * which is right for a traceback and wrong for the answer of an operation
   * that just did some work — that one is a report, and reads as one.
   */
  detailLabel?: string;
  variant?: DialogVariant;
  /** true = Esc and outside-click do NOT close the dialog */
  modal?: boolean;
  /** A vertical list to pick from; each entry resolves with its value. */
  choices?: DialogChoice[];
  buttons: DialogButton[];
}

interface ActiveDialog {
  title?: string;
  message: string;
  detail?: string;
  detailLabel?: string;
  variant: DialogVariant;
  modal: boolean;
  choices?: DialogChoice[];
  buttons: DialogButton[];
}

// The resolve function lives outside $state — storing functions in reactive
// state causes Svelte to wrap them in proxies, breaking the Promise chain.
let _resolve: ((v: unknown) => void) | null = null;
let _active = $state<ActiveDialog | null>(null);

function show(opts: DialogOptions): Promise<unknown> {
  return new Promise((resolve) => {
    _resolve = resolve;
    _active = { variant: 'info', modal: false, ...opts };
  });
}

export const msgbox = {
  get active(): ActiveDialog | null { return _active; },

  respond(value: unknown) {
    _active = null;
    const res = _resolve;
    _resolve = null;
    res?.(value);
  },

  /**
   * Requires explicit choice — not dismissible by clicking outside.
   *
   * `labels` names the two buttons after what they do. Cancel/Confirm read
   * wrong whenever the action is itself a cancelling: "Discard the changes?"
   * with a button called Cancel leaves no one sure which one discards.
   * `danger` draws the confirming button as a destructive one.
   */
  confirm(message: string, title?: string,
          labels?: { confirm?: string; cancel?: string; danger?: boolean }): Promise<boolean> {
    return show({
      title: title ?? _('Confirm'),
      message,
      variant: 'warning',
      modal: true,
      buttons: [
        { label: labels?.cancel ?? _('Cancel'),   value: false, variant: 'secondary' },
        { label: labels?.confirm ?? _('Confirm'), value: true,
          variant: labels?.danger ? 'danger' : 'primary' },
      ],
    }) as Promise<boolean>;
  },

  /** Simple informational message */
  alert(message: string, title?: string): Promise<void> {
    return show({
      title,
      message,
      variant: 'info',
      modal: false,
      buttons: [{ label: 'OK', value: undefined, variant: 'primary' }],
    }) as Promise<void>;
  },

  /**
   * Error with optional detail block.
   * detail is typically a Python traceback or YAML parse error string.
   */
  error(message: string, detail?: string, title?: string): Promise<void> {
    return show({
      title: title ?? _('Error'),
      message,
      detail,
      variant: 'error',
      modal: false,
      buttons: [{ label: _('Close'), value: undefined, variant: 'secondary' }],
    }) as Promise<void>;
  },

  /**
   * One pick from a list. Resolves with the chosen value, or undefined when
   * dismissed — the caller then does nothing, which is what a closed menu means.
   */
  choose(choices: DialogChoice[], title?: string, message?: string): Promise<unknown> {
    return show({
      title,
      message: message ?? '',
      variant: 'info',
      modal: false,
      choices,
      buttons: [{ label: _('Cancel'), value: undefined, variant: 'secondary' }],
    });
  },

  /** Fully custom — escape hatch for multi-button or non-standard cases */
  show(opts: DialogOptions): Promise<unknown> {
    return show(opts);
  },
};
