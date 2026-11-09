import { describe, it, expect } from 'vitest';
import {
  toBlocks, toRows, blockRowIndices, duplicateBlock, isComplete,
  serializeRule, serializeRuleSet, operatorsFor, operatorSymbol, blockConflicts, declaredRules,
  type Rule, type RuleRow,
} from './dataview.rules';

const r = (field: string, op: Rule['op'], value?: unknown): Rule => ({ field, op, value });
const row = (rule: Rule, join: RuleRow['join'] = 'and'): RuleRow => ({ rule, join });

describe('flat list ↔ blocks', () => {
  it('keeps a single block when every row is joined by AND', () => {
    const rows = [row(r('a', 'eq', 1)), row(r('b', 'eq', 2))];
    expect(toBlocks(rows)).toEqual([[r('a', 'eq', 1), r('b', 'eq', 2)]]);
  });

  it('opens a new block on every OR', () => {
    const rows = [
      row(r('a', 'eq', 1)),
      row(r('b', 'eq', 2)),
      row(r('c', 'eq', 3), 'or'),
    ];
    expect(toBlocks(rows)).toEqual([
      [r('a', 'eq', 1), r('b', 'eq', 2)],
      [r('c', 'eq', 3)],
    ]);
  });

  it('ignores the join of the first row', () => {
    expect(toBlocks([row(r('a', 'eq', 1), 'or')])).toEqual([[r('a', 'eq', 1)]]);
  });

  it('round-trips through toRows', () => {
    const rows = [
      row(r('a', 'eq', 1)),
      row(r('b', 'eq', 2)),
      row(r('c', 'eq', 3), 'or'),
      row(r('d', 'eq', 4)),
    ];
    expect(toRows(toBlocks(rows))).toEqual(rows);
  });

  it('has no rows and no blocks when empty', () => {
    expect(toBlocks([])).toEqual([]);
    expect(toRows([])).toEqual([]);
  });
});

describe('duplicateBlock', () => {
  it('appends a copy as a new alternative', () => {
    const blocks = [[r('a', 'eq', 1)]];
    const out = duplicateBlock(blocks, 0);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual([r('a', 'eq', 1)]);
  });

  it('copies the rules instead of sharing them', () => {
    const blocks = [[r('a', 'eq', 1)]];
    const out = duplicateBlock(blocks, 0);
    (out[1][0] as Rule).value = 99;
    expect(out[0][0].value).toBe(1);
  });

  it('leaves the set alone for an index that is not there', () => {
    const blocks = [[r('a', 'eq', 1)]];
    expect(duplicateBlock(blocks, 5)).toBe(blocks);
  });
});

describe('completeness', () => {
  it('needs no value for the operators that carry none', () => {
    expect(isComplete(r('a', 'empty'))).toBe(true);
    expect(isComplete(r('a', 'notempty'))).toBe(true);
    expect(isComplete(r('a', 'istrue'))).toBe(true);
  });

  it('rejects a missing or blank value', () => {
    expect(isComplete(r('a', 'eq'))).toBe(false);
    expect(isComplete(r('a', 'eq', ''))).toBe(false);
    expect(isComplete(r('a', 'eq', null))).toBe(false);
  });

  it('accepts falsy values that are values', () => {
    expect(isComplete(r('a', 'eq', 0))).toBe(true);
    expect(isComplete(r('a', 'eq', false))).toBe(true);
  });

  it('takes one bound as an open interval, and none as a row switched off', () => {
    expect(isComplete(r('a', 'between', [1, 10]))).toBe(true);
    expect(isComplete(r('a', 'between', [1]))).toBe(true);
    expect(isComplete(r('a', 'between', [null, 10]))).toBe(true);
    expect(isComplete(r('a', 'between', [null, null]))).toBe(false);
    expect(isComplete(r('a', 'between', []))).toBe(false);
    expect(isComplete(r('a', 'between', 1))).toBe(false);
  });

  it('wants a non-empty list for in', () => {
    expect(isComplete(r('a', 'in', ['TV', 'UD']))).toBe(true);
    expect(isComplete(r('a', 'in', []))).toBe(false);
    expect(isComplete(r('a', 'in', 'TV'))).toBe(false);
  });

  it('rejects a rule without a field', () => {
    expect(isComplete(r('', 'eq', 1))).toBe(false);
  });
});

describe('serializeRule', () => {
  it('writes equality in the short form', () => {
    expect(serializeRule(r('title', 'eq', 'x'))).toEqual({ title: 'x' });
  });

  it('turns contains and startswith into ilike patterns', () => {
    expect(serializeRule(r('title', 'contains', 'ros'))).toEqual({ title: ['ilike', '%ros%'] });
    expect(serializeRule(r('title', 'startswith', 'ros'))).toEqual({ title: ['ilike', 'ros%'] });
  });

  it('escapes wildcards typed by the user', () => {
    expect(serializeRule(r('title', 'contains', '50%'))).toEqual({ title: ['ilike', '%50\\%%'] });
    expect(serializeRule(r('code', 'startswith', 'a_b'))).toEqual({ code: ['ilike', 'a\\_b%'] });
  });

  it('spreads the two bounds of between', () => {
    expect(serializeRule(r('year', 'between', [2020, 2024])))
      .toEqual({ year: ['between', 2020, 2024] });
  });

  it('degrades an interval missing one end into the comparison it means', () => {
    expect(serializeRule(r('year', 'between', [2020, null]))).toEqual({ year: ['ge', 2020] });
    expect(serializeRule(r('year', 'between', [2020]))).toEqual({ year: ['ge', 2020] });
    expect(serializeRule(r('year', 'between', [null, 2024]))).toEqual({ year: ['le', 2024] });
    expect(serializeRule(r('year', 'between', ['', 2024]))).toEqual({ year: ['le', 2024] });
  });

  it('passes the list of in as one value', () => {
    expect(serializeRule(r('province', 'in', ['TV', 'UD'])))
      .toEqual({ province: ['in', ['TV', 'UD']] });
  });

  it('drops the value for the null checks', () => {
    expect(serializeRule(r('note', 'empty'))).toEqual({ note: ['isnull'] });
    expect(serializeRule(r('note', 'notempty'))).toEqual({ note: ['isnotnull'] });
  });

  it('resolves the boolean operators to their value', () => {
    expect(serializeRule(r('active', 'istrue'))).toEqual({ active: true });
    expect(serializeRule(r('active', 'isfalse'))).toEqual({ active: false });
  });

  it('writes the comparisons verbatim', () => {
    expect(serializeRule(r('price', 'ge', 100))).toEqual({ price: ['ge', 100] });
  });

  it('never serialises the display labels', () => {
    const rule: Rule = { field: 'method', op: 'in', value: [3, 7], labels: ['Cash', 'Wire'] };
    expect(serializeRule(rule)).toEqual({ method: ['in', [3, 7]] });
  });
});

describe('serializeRuleSet', () => {
  it('gives nothing for an empty set', () => {
    expect(serializeRuleSet([])).toBeUndefined();
    expect(serializeRuleSet([[]])).toBeUndefined();
  });

  it('keeps a single block flat', () => {
    expect(serializeRuleSet([[r('a', 'eq', 1), r('b', 'ge', 2)]]))
      .toEqual([{ a: 1 }, { b: ['ge', 2] }]);
  });

  it('wraps two blocks in an or node', () => {
    expect(serializeRuleSet([[r('a', 'eq', 1)], [r('b', 'eq', 2)]])).toEqual([
      { op: 'or', conditions: [[{ a: 1 }], [{ b: 2 }]] },
    ]);
  });

  it('drops incomplete rules', () => {
    expect(serializeRuleSet([[r('a', 'eq', 1), r('b', 'eq')]]))
      .toEqual([{ a: 1 }]);
  });

  it('drops a block left empty, and unwraps the or when one remains', () => {
    expect(serializeRuleSet([[r('a', 'eq', 1)], [r('b', 'eq')]]))
      .toEqual([{ a: 1 }]);
  });

  it('gives nothing when no rule is complete', () => {
    expect(serializeRuleSet([[r('a', 'eq')], [r('b', 'in', [])]])).toBeUndefined();
  });

  it('builds the payment-method case', () => {
    const blocks = [[
      { field: 'method_id', op: 'in', value: [3, 7], labels: ['Cash', 'Wire'] } as Rule,
      r('amount', 'ge', 1000),
    ]];
    expect(serializeRuleSet(blocks)).toEqual([
      { method_id: ['in', [3, 7]] },
      { amount: ['ge', 1000] },
    ]);
  });
});

describe('operatorsFor', () => {
  it('answers per primitive', () => {
    expect(operatorsFor('number')).toContain('between');
    expect(operatorsFor('number')).not.toContain('contains');
    expect(operatorsFor('date')).not.toContain('contains');
  });

  it('asks a boolean one question, leaving room for "not asking"', () => {
    // Two operators can say true and false but never "all": the third answer
    // is an empty value, which is a switched off row like everywhere else.
    expect(operatorsFor('boolean')).toEqual(['eq', 'empty', 'notempty']);
    expect(isComplete(r('ok', 'eq', false))).toBe(true);
    expect(isComplete(r('ok', 'eq', undefined))).toBe(false);
  });

  it('reads the key of a foreign key, never its display', () => {
    // A range over stored codes is the selection mask of every gestionale;
    // a "contains" would run on a display that presentation settings compose.
    expect(operatorsFor('fk')).toEqual(['eq', 'in', 'between', 'empty', 'notempty']);
    expect(operatorsFor('fk')).not.toContain('contains');
  });

  it('asks a set of codes which codes it holds', () => {
    expect(operatorsFor('codes')).toEqual(['has', 'empty', 'notempty']);
    expect(isComplete(r('roles', 'has', ['C']))).toBe(true);
    expect(isComplete(r('roles', 'has', []))).toBe(false);
    expect(serializeRule(r('roles', 'has', ['C', 'S']))).toEqual({ roles: ['has', ['C', 'S']] });
  });

  it('falls back to the string operators for an unknown primitive', () => {
    expect(operatorsFor('nope')).toEqual(operatorsFor('string'));
  });

  it('lets a schema type override the list', () => {
    expect(operatorsFor('string', ['eq'])).toEqual(['eq']);
  });
});

describe('blockRowIndices', () => {
  it('carries the row indices of each block', () => {
    const rows = [
      row(r('a', 'eq', 1)),
      row(r('b', 'eq', 2)),
      row(r('c', 'eq', 3), 'or'),
    ];
    expect(blockRowIndices(rows)).toEqual([[0, 1], [2]]);
  });

  it('agrees with toBlocks on the shape', () => {
    const rows = [row(r('a', 'eq', 1)), row(r('b', 'eq', 2), 'or'), row(r('c', 'eq', 3))];
    expect(blockRowIndices(rows).map(b => b.length))
      .toEqual(toBlocks(rows).map(b => b.length));
  });
});

describe('operatorSymbol', () => {
  it('uses the symbol where a convention exists', () => {
    expect(operatorSymbol('eq')).toBe('=');
    expect(operatorSymbol('ne')).toBe('≠');
    expect(operatorSymbol('ge')).toBe('≥');
    expect(operatorSymbol('between')).toBe('><');
  });

  it('keeps the word where inventing a symbol would have to be learnt', () => {
    expect(operatorSymbol('contains')).toBe('contains');
    expect(operatorSymbol('in')).toBe('is one of');
    expect(operatorSymbol('empty')).toBe('is empty');
  });
});

describe('blockConflicts', () => {
  const conflict = (block: Rule[]) => blockConflicts(block).map(c => c.reason);

  it('sees two different values demanded of one field', () => {
    expect(conflict([r('a', 'eq', 5), r('a', 'eq', 7)])).toEqual(['distinct-values']);
  });

  it('says nothing when the two values are the same', () => {
    expect(conflict([r('a', 'eq', 5), r('a', 'eq', 5)])).toEqual([]);
    expect(conflict([r('a', 'eq', 5), r('a', 'eq', '5')])).toEqual([]);
  });

  it('leaves other fields alone', () => {
    expect(conflict([r('a', 'eq', 5), r('b', 'eq', 7)])).toEqual([]);
  });

  it('sees two value lists that share nothing', () => {
    expect(conflict([r('p', 'in', ['TV', 'UD']), r('p', 'in', ['VE'])]))
      .toEqual(['distinct-values']);
    expect(conflict([r('p', 'in', ['TV', 'UD']), r('p', 'in', ['UD', 'VE'])])).toEqual([]);
  });

  it('sees a value outside a list, and a list outside a range', () => {
    expect(conflict([r('p', 'eq', 'VE'), r('p', 'in', ['TV', 'UD'])]))
      .toEqual(['distinct-values']);
    expect(conflict([r('n', 'in', [1, 2]), r('n', 'ge', 10)]))
      .toEqual(['value-outside-bounds']);
    expect(conflict([r('n', 'in', [1, 20]), r('n', 'ge', 10)])).toEqual([]);
  });

  it('sees disjoint bounds', () => {
    expect(conflict([r('n', 'le', 10), r('n', 'ge', 20)])).toEqual(['disjoint-bounds']);
    expect(conflict([r('n', 'between', [1, 5]), r('n', 'between', [8, 9])]))
      .toEqual(['disjoint-bounds']);
  });

  it('keeps the interval that two bounds actually describe', () => {
    expect(conflict([r('n', 'ge', 5), r('n', 'le', 10)])).toEqual([]);
    expect(conflict([r('n', 'ge', 10), r('n', 'le', 10)])).toEqual([]);
  });

  it('counts a bound that excludes the only value left', () => {
    expect(conflict([r('n', 'gt', 10), r('n', 'le', 10)])).toEqual(['disjoint-bounds']);
  });

  it('reads an open interval as the comparison it means', () => {
    expect(conflict([r('n', 'between', [20, null]), r('n', 'le', 10)]))
      .toEqual(['disjoint-bounds']);
  });

  it('sees that a NULL satisfies no comparison', () => {
    expect(conflict([r('a', 'empty'), r('a', 'eq', 5)])).toEqual(['null-and-value']);
    expect(conflict([r('a', 'empty'), r('a', 'contains', 'x')])).toEqual(['null-and-value']);
    expect(conflict([r('a', 'empty'), r('a', 'notempty')])).toEqual(['null-and-value']);
    expect(conflict([r('a', 'empty'), r('a', 'empty')])).toEqual([]);
  });

  it('sees a boolean asked to be both', () => {
    expect(conflict([r('ok', 'istrue'), r('ok', 'isfalse')])).toEqual(['distinct-values']);
  });

  it('keeps quiet where deciding cheaply is not possible', () => {
    expect(conflict([r('a', 'contains', 'ross'), r('a', 'contains', 'bianchi')])).toEqual([]);
    expect(conflict([r('a', 'eq', 5), r('a', 'ne', 7)])).toEqual([]);
    expect(conflict([r('a', 'contains', 'ross'), r('a', 'notempty')])).toEqual([]);
  });

  it('says nothing about values it cannot compare', () => {
    expect(conflict([r('d', 'ge', 5), r('d', 'le', 'abc')])).toEqual([]);
  });

  it('ignores rules the user has not finished', () => {
    expect(conflict([r('a', 'eq', 5), r('a', 'eq')])).toEqual([]);
  });

  it('reports the pair it found', () => {
    const found = blockConflicts([r('a', 'eq', 1), r('b', 'eq', 2), r('a', 'eq', 3)]);
    expect(found).toEqual([{ a: 0, b: 2, field: 'a', reason: 'distinct-values' }]);
  });
});

describe('declaredRules', () => {
  it('reads the rules a view opens with as AND rows', () => {
    expect(declaredRules({ rules: [{ field: 'returned_on', op: 'empty' },
                                   { field: 'km', op: 'gt', value: 0 }] })).toEqual([
      { rule: { field: 'returned_on', op: 'empty' }, join: 'and' },
      { rule: { field: 'km', op: 'gt', value: 0 }, join: 'and' },
    ]);
  });

  it('says nothing when the view declares none', () => {
    expect(declaredRules({})).toBeUndefined();
  });
});

describe('RefSet operators', () => {
  it('asks some, all or none of the entries', () => {
    expect(operatorsFor('refset')).toEqual(['any_of', 'all_of', 'none_of']);
  });

  it('serializes as an operator on the field with the list of keys', () => {
    expect(serializeRule(r('tags', 'all_of', [3, 7]))).toEqual({ tags: ['all_of', [3, 7]] });
    expect(serializeRule(r('tags', 'none_of', [3]))).toEqual({ tags: ['none_of', [3]] });
  });

  it('is complete once a key is chosen', () => {
    expect(isComplete(r('tags', 'any_of', [3]))).toBe(true);
    expect(isComplete(r('tags', 'any_of', []))).toBe(false);
  });
});
