/**
 * The vocabulary a set of codes is picked from: given with the field
 * (`choices`) or served by an endpoint (`choices_endpoint`), each
 * `{ value, label, group?, implies? }`.
 *
 * Fetched every time it is asked for: the vocabulary is a table someone may
 * have just edited, and a form or a filter opens rarely enough for it to cost
 * nothing.
 */
import { _ } from '../../i18n';
import { api } from '$kitebase/api/client';

export interface CodeChoice {
  value: string;
  label: string;
  group?: string;
  implies?: string[];
}

export async function fetchChoices(endpoint: string): Promise<CodeChoice[]> {
  const res = await api.endpoint(endpoint, {});
  if (res.status !== 'success') throw new Error(res.message ?? _('The choices could not be loaded'));
  return res.data as CodeChoice[];
}

/** The codes of a value, whatever reached the widget: an array, or nothing. */
export function codesOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * The codes in the order of the vocabulary, and after them the ones it does not
 * know: kept, so a code nobody declares can be seen and taken away.
 */
export function inVocabularyOrder(codes: Iterable<string>, choices: CodeChoice[]): string[] {
  const wanted = new Set(codes);
  const known = choices.map((c) => c.value).filter((v) => wanted.has(v));
  const declared = new Set(choices.map((c) => c.value));
  return [...known, ...[...wanted].filter((v) => !declared.has(v))];
}
