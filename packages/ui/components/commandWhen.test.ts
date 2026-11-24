import { describe, expect, it, vi } from 'vitest';

vi.mock('../auth/store.svelte', () => ({
  authStore: { user: { id: 7, username: 'tester', partner_id: 3 }, opDate: '2026-11-24' },
}));

import { commandApplies } from './commandWhen';

describe('commandApplies', () => {
  it('shows a command without a condition, row or not', () => {
    expect(commandApplies(undefined, null)).toBe(true);
    expect(commandApplies(undefined, { id: 1 })).toBe(true);
  });

  it('hides a command with a condition when there is no row to ask', () => {
    expect(commandApplies('tasks_to_copy', null)).toBe(false);
  });

  it('reads a field name as a yes when it is full', () => {
    expect(commandApplies('tasks_to_copy', { tasks_to_copy: 4 })).toBe(true);
    expect(commandApplies('tasks_to_copy', { tasks_to_copy: 0 })).toBe(false);
    expect(commandApplies('tasks_to_copy', { tasks_to_copy: false })).toBe(false);
    expect(commandApplies('tasks_to_copy', { tasks_to_copy: null })).toBe(false);
    expect(commandApplies('tasks_to_copy', {})).toBe(false);
    expect(commandApplies('layout', { layout: 'invoice.xml' })).toBe(true);
  });

  it('judges a rule on the row, a joined column like any other', () => {
    expect(commandApplies({ field: 'layout', op: 'notempty' }, { layout: 'a.xml' })).toBe(true);
    expect(commandApplies({ field: 'layout', op: 'notempty' }, { layout: '' })).toBe(false);
    expect(commandApplies({ field: 'layout', op: 'empty' }, {})).toBe(true);
    expect(commandApplies({ field: 'state', op: 'in', value: ['planned', 'active'] },
      { state: 'active' })).toBe(true);
    expect(commandApplies({ field: 'state', op: 'ne', value: 'done' }, { state: 'done' })).toBe(false);
    expect(commandApplies({ field: 'hours', op: 'gt', value: 2 }, { hours: '2.5' })).toBe(true);
    expect(commandApplies({ field: 'hours', op: 'le', value: 2 }, { hours: null })).toBe(false);
  });

  it('wants every rule of a list, with the tokens of the session', () => {
    const mine = [{ field: 'state', op: 'eq' as const, value: 'active' },
      { field: 'assignee_id', op: 'eq' as const, value: '$ctx.partner_id' }];
    expect(commandApplies(mine, { state: 'active', assignee_id: 3 })).toBe(true);
    expect(commandApplies(mine, { state: 'active', assignee_id: 4 })).toBe(false);
    expect(commandApplies({ field: 'due', op: 'lt', value: '$op_date' }, { due: '2026-11-20' })).toBe(true);
  });
});
