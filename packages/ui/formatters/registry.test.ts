import { describe, it, expect } from 'vitest';
import { resolveFormatter } from './registry';

const cell = (value: unknown) => ({ getValue: () => value });
const show = (rawFmt: string, value: unknown) => {
  const { formatter, formatterParams } = resolveFormatter(rawFmt);
  return (formatter as (c: unknown, p: unknown) => string)(cell(value), formatterParams);
};

describe('datetime', () => {
  it('reads to the minute by default', () => {
    const text = show('datetime', '2026-10-06T18:34:31.283236');
    expect(text).toContain('2026');
    expect(text).not.toContain('31');
  });

  it('adds the seconds when the column asks for them', () => {
    expect(resolveFormatter('datetime,second').formatterParams).toEqual({ granularity: 'second' });
    expect(show('datetime,second', '2026-10-06T18:34:31')).toContain('31');
  });

  it('leaves an empty value empty', () => {
    expect(show('datetime', null)).toBe('');
  });
});

describe('codes', () => {
  it('shows the codes of a set one after the other', () => {
    expect(show('codes', ['C', 'S'])).toBe('C, S');
  });

  it('shows nothing for an empty set', () => {
    expect(show('codes', [])).toBe('');
    expect(show('codes', null)).toBe('');
  });

  it('escapes what it puts in', () => {
    expect(show('codes', ['<b>'])).toBe('&lt;b&gt;');
  });
});
