import { describe, expect, it, vi } from 'vitest';

// The session, as the decoded token leaves it: id and the context fields
vi.mock('../auth/store.svelte', () => ({
  authStore: { user: { id: 7, username: 'tester', partner_id: 3 }, opDate: '2026-11-24' },
}));

import { resolveContextToken } from './contextTokens';

describe('resolveContextToken', () => {
  it('resolves the named tokens of the session', () => {
    expect(resolveContextToken('$user_id')).toBe(7);
    expect(resolveContextToken('$op_date')).toBe('2026-11-24');
  });

  it('reads $ctx.<name> from the login context, as a row condition does', () => {
    expect(resolveContextToken('$ctx.partner_id')).toBe(3);
  });

  it('gives null for a context field the token does not carry', () => {
    expect(resolveContextToken('$ctx.missing')).toBeNull();
  });

  it('leaves any other value as it is', () => {
    expect(resolveContextToken('$unknown')).toBe('$unknown');
    expect(resolveContextToken(5)).toBe(5);
  });
});
