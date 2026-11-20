/**
 * Stack navigation — writable store (Svelte 4 store API, works in Svelte 5).
 *
 * Usage:
 *   stack.push(Component, props, onReturn?)  → opens a page on top
 *   stack.pop(returnData?)                   → goes back, calls onReturn with data
 *                                              and gives the focus back (see below)
 *   stack.clear()                            → reset (call in onMount cleanup)
 *   stack.subscribe(...)                     → standard store reactivity
 *
 * Browser Back is handled by the host page with popstate + history.pushState
 * (see +page.svelte in playground/stack for the pattern).
 */

import { writable } from 'svelte/store';
import { lifecycle } from '../lifecycle';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = any;

type StackPage = {
  id: string;
  component: AnyComponent;
  props?: Record<string, unknown>;
  onReturn?: (data?: unknown) => void;
  /** What had the focus when the frame was opened. */
  opener?: { focus(): void; isConnected?: boolean } | null;
};

/**
 * Coming back, the focus goes where it was: the widget that opened the frame —
 * a field after "Search more…", a grid row after its form. Only when it was lost
 * on the way: a caller that moved it on return (`onReturn`, a row focused after
 * a save) has said where it belongs, and is not overridden. The frames below
 * stay mounted, so the opener is still there; one that is gone is left alone.
 */
function currentFocus(): StackPage['opener'] {
  if (typeof document === 'undefined') return null;
  return (document.activeElement as StackPage['opener']) ?? null;
}

function restoreFocus(opener: StackPage['opener'], leaving: StackPage['opener']): void {
  if (!opener || typeof document === 'undefined') return;
  // After the frame below is shown again: hidden, it cannot take the focus.
  // Lost means on the body, or still where it was when the frame closed: the
  // frame leaves with a transition, and keeps its focus while it plays.
  setTimeout(() => {
    const now = document.activeElement as unknown;
    const lost = !now || now === document.body || now === leaving;
    if (lost && opener.isConnected !== false) opener.focus();
  }, 0);
}

/**
 * An id for a frame, unique within this page.
 *
 * Not `crypto.randomUUID()` alone: that exists only in a secure context —
 * HTTPS, or localhost. Served over plain HTTP from any other host, which is
 * what a compiled client on a LAN is, it is undefined and every push throws.
 * Nothing here needs a UUID's guarantees; it needs a key no other frame has.
 */
let counter = 0;
function frameId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `frame-${Date.now().toString(36)}-${(counter += 1)}`;
}

export function createStack() {
  const { subscribe, update } = writable<StackPage[]>([]);

  return {
    subscribe,

    push(
      component: AnyComponent,
      props: Record<string, unknown> = {},
      onReturn?: (data?: unknown) => void
    ): string {
      const id = frameId();
      const opener = currentFocus();
      let depth = 0;
      update((pages) => {
        depth = pages.length + 1;
        return [...pages, { id, component, props, onReturn, opener }];
      });
      lifecycle.emit('stack:push', { frame: id, depth });
      return id;
    },

    pop(returnData?: unknown): void {
      let gone = null as { frame: string; depth: number } | null;
      update((pages) => {
        if (pages.length === 0) return pages;
        const next = [...pages];
        const popped = next.pop();
        const leaving = currentFocus();
        popped?.onReturn?.(returnData);
        restoreFocus(popped?.opener, leaving);
        if (popped) gone = { frame: popped.id, depth: next.length };
        return next;
      });
      if (gone) lifecycle.emit('stack:pop', gone);
    },

    clear(): void {
      update(() => []);
    },

    get length(): number {
      let len = 0;
      subscribe((pages) => (len = pages.length))();
      return len;
    }
  };
}

export const stack = createStack();
export type StackInstance = ReturnType<typeof createStack>;
