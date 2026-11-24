import { describe, expect, it } from 'vitest';
import { onChangeKey, onChangeParams, onChangePatch } from './onChange';

const hours = { endpoint: 'projects_hours', pass: ['start_at', 'end_at'], apply: ['hours'] };

describe('onChangeParams', () => {
  it('sends the fields of pass, empty ones as null', () => {
    expect(onChangeParams('end_at', hours, { start_at: '2026-11-24T09:00', hours: 2 }))
      .toEqual({ start_at: '2026-11-24T09:00', end_at: null });
  });

  it('sends the changed field when pass says nothing', () => {
    expect(onChangeParams('customer_id', { endpoint: 'x' }, { customer_id: 4 }))
      .toEqual({ customer_id: 4 });
  });
});

describe('onChangePatch', () => {
  it('takes only the fields of apply', () => {
    expect(onChangePatch(hours, { hours: 3.5, end_at: 'ignored' })).toEqual({ hours: 3.5 });
  });

  it('takes nothing from an empty answer: there was nothing to compute', () => {
    expect(onChangePatch(hours, {})).toEqual({});
    expect(onChangePatch(hours, null)).toEqual({});
  });

  it('takes every field answered when apply says nothing', () => {
    expect(onChangePatch({ endpoint: 'x' }, { agent_id: 5, payment_id: 2 }))
      .toEqual({ agent_id: 5, payment_id: 2 });
  });
});

describe('onChangeKey', () => {
  it('is the same for the same value, empty or not', () => {
    expect(onChangeKey(undefined)).toBe(onChangeKey(null));
    expect(onChangeKey('2026-11-24T09:00')).not.toBe(onChangeKey('2026-11-24T10:00'));
  });
});
