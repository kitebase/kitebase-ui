/**
 * A field that asks the server to recompute others when it changes
 * (`on_change` in the form's YAML): leaving it with a new value calls
 * `endpoint` with the fields in `pass`, and the fields in `apply` take what
 * the server answers.
 *
 *     - name: end_at
 *       on_change: { endpoint: projects_hours, pass: [start_at, end_at], apply: [hours] }
 *
 * The logic stays on the server, where the save can use it too: a form and a
 * write that skips the form compute the same thing. The person may still
 * type over what came back; it changes again only when the field that asked
 * changes again.
 */
import type { OnChange } from './dataform.types';

/** What is sent: the fields of `pass`, or the field that changed. */
export function onChangeParams(field: string, onChange: OnChange,
                               draft: Record<string, unknown>): Record<string, unknown> {
  const names = onChange.pass?.length ? onChange.pass : [field];
  return Object.fromEntries(names.map((n) => [n, draft[n] ?? null]));
}

/** What the draft takes: the answer, limited to `apply` when it says. */
export function onChangePatch(onChange: OnChange, answer: unknown): Record<string, unknown> {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return {};
  const values = answer as Record<string, unknown>;
  const names = onChange.apply?.length ? onChange.apply : Object.keys(values);
  return Object.fromEntries(names.filter((n) => n in values).map((n) => [n, values[n]]));
}

/** A value as the key of the last call: the same value twice asks once. */
export function onChangeKey(value: unknown): string {
  return JSON.stringify(value ?? null);
}
