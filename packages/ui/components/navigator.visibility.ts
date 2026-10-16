/**
 * Which navigator buttons a view shows: the defaults of its mode, plus what
 * the descriptor adds with `show`, minus what it takes away with `hide`.
 *
 * In a module of its own because two places need the same answer: the
 * navigator draws the buttons, and the view answers their keys (F7 runs the
 * export only where the button is there to be seen).
 */
import type { NavigatorConfig } from './dataview.types';

export const MODE_DEFAULTS: Record<string, ReadonlySet<string>> = {
  browser:  new Set(['add', 'edit', 'delete', 'select', 'filter', 'search', 'export']),
  lookup:   new Set(['add', 'edit', 'delete', 'accept', 'cancel', 'filter', 'search']),
  batch:    new Set(['edit', 'accept', 'cancel', 'select', 'filter']),
  // The rows are a buffer, not a set the user chose: nothing to search or
  // re-query, and the count is what the grid already shows.
  buffered: new Set(['add', 'edit', 'delete']),
  readonly: new Set(['filter', 'search', 'export']),
};

export function visibleButtons(config: NavigatorConfig | undefined): Set<string> {
  const base = new Set(MODE_DEFAULTS[config?.mode ?? 'browser'] ?? MODE_DEFAULTS.browser);
  for (const id of config?.show ?? []) base.add(id);
  for (const id of config?.hide ?? []) base.delete(id);
  return base;
}
