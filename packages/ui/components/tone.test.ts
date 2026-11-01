import { describe, expect, it } from 'vitest';
import { rowTones, toneOf } from './tone';

describe('toneOf', () => {
  const status = { values: { A: 'success', N: 'muted', X: 'purple' } };
  const rating = { ranges: [[1, 'danger'], [4, 'success'], [3, 'warning']] as Array<[number, string]> };

  it('maps an exact value through its text', () => {
    expect(toneOf(status, 'A')).toBe('success');
    expect(toneOf({ values: { '5': 'success' } }, 5)).toBe('success');
  });

  it('gives a number the tone of the highest minimum it reaches, whatever the order', () => {
    expect(toneOf(rating, 5)).toBe('success');
    expect(toneOf(rating, 4)).toBe('success');
    expect(toneOf(rating, 3.5)).toBe('warning');
    expect(toneOf(rating, '1')).toBe('danger');
  });

  it('gives no tone below every range, to an empty value, or to a name off the list', () => {
    expect(toneOf(rating, 0)).toBeNull();
    expect(toneOf(rating, null)).toBeNull();
    expect(toneOf(rating, 'n/a')).toBeNull();
    expect(toneOf(status, 'X')).toBeNull();
    expect(toneOf(undefined, 'A')).toBeNull();
  });

  it('looks up the exact values before the ranges', () => {
    expect(toneOf({ values: { '0': 'muted' }, ranges: [[0, 'danger']] }, 0)).toBe('muted');
  });
});

describe('rowTones', () => {
  it('colours the toned cells and mutes the row when any column says so', () => {
    const tones = { status: { values: { N: 'muted' } }, rating: { ranges: [[4, 'success']] as Array<[number, string]> } };
    expect(rowTones(tones, { status: 'A', rating: 5 })).toEqual({ cells: { rating: 'success' }, muted: false });
    expect(rowTones(tones, { status: 'N', rating: 2 })).toEqual({ cells: {}, muted: true });
  });
});
