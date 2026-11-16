import { describe, expect, it } from 'vitest';
import { boardColumns, valueKey } from './kanban';

const stages = [
  { value: 1, label: 'New' },
  { value: 2, label: 'Proposal', folded: true },
  { value: 3, label: 'Negotiation' },
];

describe('boardColumns', () => {
  it('has a column for every value, in order, empty ones included', () => {
    const cols = boardColumns(stages, [{ id: 9, stage_id: 3 }], 'stage_id');
    expect(cols.map((c) => c.label)).toEqual(['New', 'Proposal', 'Negotiation']);
    expect(cols.map((c) => c.rows.length)).toEqual([0, 0, 1]);
    expect(cols[1].folded).toBe(true);
  });

  it('matches a value whatever its type: 3 from a query, "3" from a form', () => {
    const cols = boardColumns(stages, [{ id: 1, stage_id: '3' }], 'stage_id');
    expect(cols[2].rows).toHaveLength(1);
  });

  it('keeps the order the rows come in, and totals the sum column', () => {
    const rows = [
      { id: 1, stage_id: 1, amount: 100 },
      { id: 2, stage_id: 1, amount: '50.5' },
      { id: 3, stage_id: 1, amount: null },
    ];
    const [first, second] = boardColumns(stages, rows, 'stage_id', 'amount');
    expect(first.rows.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(first.sum).toBe(150.5);
    expect(second.sum).toBe(0);
  });

  it('has no sum without a sum column', () => {
    expect(boardColumns(stages, [], 'stage_id')[0].sum).toBeNull();
  });

  it('puts a row that matches no value in a last column, where nothing is dropped', () => {
    const cols = boardColumns(stages, [{ id: 1, stage_id: 7 }, { id: 2, stage_id: null }],
                              'stage_id', undefined, 'Other');
    expect(cols).toHaveLength(4);
    expect(cols[3]).toMatchObject({ label: 'Other', droppable: false });
    expect(cols[3].rows.map((r) => r.id)).toEqual([1, 2]);
    expect(cols.slice(0, 3).every((c) => c.droppable)).toBe(true);
  });

  it('adds no last column when every row has its place', () => {
    expect(boardColumns(stages, [{ stage_id: 2 }], 'stage_id')).toHaveLength(3);
  });
});

describe('valueKey', () => {
  it('reads an empty value as the empty key', () => {
    expect(valueKey(null)).toBe('');
    expect(valueKey(undefined)).toBe('');
    expect(valueKey(0)).toBe('0');
  });
});
