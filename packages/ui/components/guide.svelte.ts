/**
 * The guide of where the user is, shown by the single HelpGuide the work area
 * mounts. Whoever wants it open asks here: the button of the chrome, F1, the
 * "?" of a field. A chrome without the button keeps F1.
 *
 * The server decides which guide tells the top of the stack (`get_help`): the
 * client only says which pages are open, from the bottom, and where the user is.
 */
import { get } from 'svelte/store';
import { stack } from '../stack/stack.svelte';

export interface GuideRequest {
  /** The pages open, from the bottom; empty when no page is open. */
  stack?: string[];
  /** What a link of a guide points to: a page, `Table` or `Table.column`. */
  ref?: string;
  /** Where to open it: a field (`Book.title`) or a screen. */
  focus?: string;
}

// The HelpGuide mounted by the work area; none, and asking does nothing.
let shown: ((request: GuideRequest) => void) | null = null;

/** Called by HelpGuide when it mounts; returns what unregisters it. */
export function registerGuide(show: (request: GuideRequest) => void): () => void {
  shown = show;
  return () => {
    if (shown === show) shown = null;
  };
}

/**
 * The page a frame shows, from the props it was pushed with: a panel, a form,
 * the list a "Search more..." opens. A frame without one (a step of a wizard,
 * a collection opened from a button) says nothing and is skipped.
 */
export function framePage(props: Record<string, unknown> | undefined): string | undefined {
  if (!props) return undefined;
  for (const key of ['panelId', 'formId', 'page']) {
    if (typeof props[key] === 'string' && props[key]) return props[key] as string;
  }
  if (typeof props.table === 'string' && props.table) return `${props.table.toLowerCase()}_list`;
  return undefined;
}

export function openPages(): string[] {
  return get(stack)
    .map((frame) => framePage(frame.props))
    .filter((id): id is string => !!id);
}

export function openGuide(focus?: string): void {
  shown?.({ stack: openPages(), focus });
}
