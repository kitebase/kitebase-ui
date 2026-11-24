/**
 * The `$` tokens the client resolves from the session, the same everywhere:
 * a column's default in a new form (`default: $user_id`), a view's first
 * rules (`{field: user_id, op: eq, value: $user_id}`). Anything else is the
 * server's, which resolves it when it writes.
 */
import { authStore } from '../auth/store.svelte';

export const CONTEXT_TOKENS: Record<string, () => unknown> = {
  op_date: () => authStore.opDate,
  user_id: () => authStore.user?.id,
};

/**
 * A value that is a known token, resolved; any other value as it is.
 * `$ctx.<name>` is a field of the login context, as a row condition on the
 * server reads it (`$ctx.partner_id`, which a plugin puts in every token):
 * null when the context does not carry it.
 */
export function resolveContextToken(value: unknown): unknown {
  if (typeof value !== 'string' || !value.startsWith('$')) return value;
  if (value.startsWith('$ctx.')) {
    return (authStore.user as Record<string, unknown> | null)?.[value.slice(5)] ?? null;
  }
  const getter = CONTEXT_TOKENS[value.slice(1)];
  return getter ? getter() : value;
}
