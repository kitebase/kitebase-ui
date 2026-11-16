import { describe, it, expect } from 'vitest';
import { buildQuery, mergeDomain, extractFieldKey } from './dataview.query';
import type { RuleRow } from './dataview.rules';
import type { ViewSource } from './dataview.types';

const src = (extra: Partial<ViewSource> = {}): ViewSource =>
  ({ model: 'Partner', ...extra }) as ViewSource;

const rule = (field: string, op: string, value?: unknown): RuleRow =>
  ({ rule: { field, op: op as never, value }, join: 'and' });

describe('sibling groups', () => {
  it('says nothing when the view declares nothing', () => {
    expect(buildQuery(src(), undefined, {}).filters).toBeUndefined();
  });

  it('wraps a lone group so the payload always has the same shape', () => {
    const q = buildQuery(src({ domain: [{ active: true }] }), undefined, {});
    expect(q.filters).toEqual({ conditions: [{ active: true }] });
  });

  it('places domain, view filters and rules side by side', () => {
    const q = buildQuery(
      src({ domain: [{ active: true }], filters: { conditions: [{ kind: 'C' }] } }),
      undefined, {},
      { rules: [rule('city', 'eq', 'Udine')] },
    );
    expect(q.filters).toEqual({
      conditions: [
        [{ active: true }],
        [{ kind: 'C' }],
        [{ city: 'Udine' }],
      ],
    });
  });

  it('keeps an OR node whole instead of spilling its branches', () => {
    // Unwrapping {op: or, conditions} would AND the branches together, which
    // is a different query and a silently narrower one.
    const filters = { op: 'or', conditions: [{ a: 1 }, { b: 2 }] };
    const q = buildQuery(src({ domain: [{ active: true }], filters }), undefined, {});
    expect(q.filters).toEqual({ conditions: [[{ active: true }], [filters]] });
  });

  it('drops rules the user has not finished rather than narrowing to nothing', () => {
    const q = buildQuery(src(), undefined, {}, { rules: [rule('city', 'eq', '')] });
    expect(q.filters).toBeUndefined();
  });

  it('emits the rules as an OR node when there are two blocks', () => {
    const rules: RuleRow[] = [
      rule('city', 'eq', 'Udine'),
      { rule: { field: 'kind', op: 'eq' as never, value: 'C' }, join: 'or' },
    ];
    const q = buildQuery(src(), undefined, {}, { rules });
    expect(q.filters).toEqual({
      conditions: [{ op: 'or', conditions: [[{ city: 'Udine' }], [{ kind: 'C' }]] }],
    });
  });
});

describe('quick search', () => {
  it('travels as a key of its own, never as a condition', () => {
    const q = buildQuery(src({ domain: [{ active: true }] }), undefined, {}, { search: 'rossi' });
    expect(q.search).toBe('rossi');
    expect(q.filters).toEqual({ conditions: [{ active: true }] });
  });

  it('is absent when the box is empty or holds only spaces', () => {
    expect(buildQuery(src(), undefined, {}, { search: '' }).search).toBeUndefined();
    expect(buildQuery(src(), undefined, {}, { search: '   ' }).search).toBeUndefined();
  });

  it('is trimmed, so a stray space is not a different set', () => {
    expect(buildQuery(src(), undefined, {}, { search: '  rossi ' }).search).toBe('rossi');
  });

  it('leaves the rules alone', () => {
    const q = buildQuery(src(), undefined, {}, {
      search: 'rossi',
      rules: [rule('city', 'eq', 'Udine')],
    });
    expect(q.search).toBe('rossi');
    expect(q.filters).toEqual({ conditions: [{ city: 'Udine' }] });
  });
});

describe('order', () => {
  it('opens on the order the descriptor asked for', () => {
    const q = buildQuery(src({ order_by: ['title', '-price'] }), undefined, {});
    expect(q.order_by).toEqual(['title', ['price', 'desc']]);
  });

  it('lets the query replace it — the descriptor only says how the list opens', () => {
    const q = buildQuery(src({ order_by: ['title'] }), undefined, {},
      { order: [{ field: 'city', dir: 'desc' }] });
    expect(q.order_by).toEqual([['city', 'desc']]);
  });

  it('keeps several sort levels in the order they were set', () => {
    const q = buildQuery(src(), undefined, {}, {
      order: [{ field: 'city', dir: 'asc' }, { field: 'name', dir: 'desc' }],
    });
    expect(q.order_by).toEqual(['city', ['name', 'desc']]);
  });

  it('falls back to the descriptor when the query asks for no order', () => {
    const q = buildQuery(src({ order_by: ['title'] }), undefined, {}, { order: [] });
    expect(q.order_by).toEqual(['title']);
  });

  it('is not a filter: it leaves the conditions untouched', () => {
    const q = buildQuery(src({ domain: [{ active: true }] }), undefined, {},
      { order: [{ field: 'name', dir: 'asc' }] });
    expect(q.filters).toEqual({ conditions: [{ active: true }] });
  });
});

describe('trigger variables still apply', () => {
  it('substitutes inside the domain before grouping', () => {
    const q = buildQuery(
      src({ domain: [{ author_id: '$trigger.id' }] }), undefined, { id: 7 },
    );
    expect(q.filters).toEqual({ conditions: [{ author_id: 7 }] });
  });
});

describe('helpers', () => {
  it('reads the field key of a select expression', () => {
    expect(extractFieldKey('CASE WHEN 1 THEN 2 END as display_name')).toBe('display_name');
    expect(extractFieldKey('Author.first_name')).toBe('first_name');
    expect(extractFieldKey('title')).toBe('title');
  });

  it('mergeDomain answers undefined when there is nothing to merge', () => {
    expect(mergeDomain(src(), {})).toBeUndefined();
  });
});

describe('the key in the select', () => {
  const columns = [{ field: 'descrizione' }] as any;

  it('adds the table key, not the literal id', () => {
    const q = buildQuery({ model: 'Attivita' } as any, columns, {}, { pk: 'codice' });
    expect(q.select).toEqual(['codice', 'descrizione']);
  });

  it('does not add it twice when a column already shows it', () => {
    const cols = [{ field: 'codice' }, { field: 'descrizione' }] as any;
    const q = buildQuery({ model: 'Attivita' } as any, cols, {}, { pk: 'codice' });
    expect(q.select).toEqual(['codice', 'descrizione']);
  });

  it('falls back to id when the caller does not know the key yet', () => {
    const q = buildQuery({ model: 'Book' } as any, columns, {}, {});
    expect(q.select).toEqual(['id', 'descrizione']);
  });
});

describe('touched rows', () => {
  it('asks for the keys as one more group beside what the view already says', () => {
    const q = buildQuery(
      src({ domain: [{ active: true }] }), undefined, {},
      { rules: [rule('city', 'eq', 'Udine')], only: [3, 7], pk: 'id' },
    );
    expect(q.filters).toEqual({
      conditions: [
        [{ active: true }],
        [{ city: 'Udine' }],
        [{ id: ['in', [3, 7]] }],
      ],
    });
  });

  it('names the key the table declares, not a literal id', () => {
    const q = buildQuery(src(), undefined, {}, { only: ['A1'], pk: 'code' });
    expect(q.filters).toEqual({ conditions: [{ code: ['in', ['A1']] }] });
  });

  it('carries the opaque params too, so the behaviors answer the same way', () => {
    const q = buildQuery(src(), undefined, {}, { only: [1], params: { archived: 'only' } });
    expect(q.archived).toBe('only');
    expect(q.filters).toEqual({ conditions: [{ id: ['in', [1]] }] });
  });
});

describe('buildQuery for a board', () => {
  const src = { model: 'Opportunity', domain: [{ outcome: 'open' }] };
  const cols = [{ field: 'name' }, { field: 'Stage.name as stage' }];

  it('selects what the board needs and the view does not show, once', () => {
    const q = buildQuery(src, cols, {}, { also: ['stage_id', 'name'] });
    expect(q.select).toEqual(['id', 'name', 'Stage.name as stage', 'stage_id']);
  });

  it('ANDs the value it is within as a group of its own, beside the domain', () => {
    const q = buildQuery(src, cols, {}, { context: { pipeline_id: 2 } });
    expect(q.filters).toEqual({ conditions: [[{ pipeline_id: 2 }], [{ outcome: 'open' }]] });
  });

  it('adds nothing for an empty context', () => {
    const q = buildQuery(src, cols, {}, { context: {} });
    expect(q.filters).toEqual({ conditions: [{ outcome: 'open' }] });
  });
});
