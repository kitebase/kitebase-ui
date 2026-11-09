import { describe, it, expect } from 'vitest';
import { filterFields, orderFields, fieldPrimitive, splitByRank } from './dataview.fields';
import type { TableInfo, TypeRegistry } from '../api/serverConfig';

const types: TypeRegistry = {
  Name:      { inheritance: ['String'], builtin: false },
  ShortStr:  { inheritance: ['String'], builtin: false },
  Money:     { inheritance: ['Numeric'], builtin: false },
  Price:     { inheritance: ['Money', 'Numeric'], builtin: false },
  ID:        { inheritance: ['Integer'], builtin: false },
  Payload:   { inheritance: ['JSON'], builtin: false },
  Odd:       { inheritance: [], builtin: false, python_type: 'str' },
  Roles:     { inheritance: ['CodeSet'], builtin: false },
};

const table = (columns: TableInfo['columns'], extra: Partial<TableInfo> = {}): TableInfo => ({
  pk_fields: ['id'],
  columns,
  ...extra,
});

describe('fieldPrimitive', () => {
  it('answers for the base types directly', () => {
    expect(fieldPrimitive('String', types)).toBe('string');
    expect(fieldPrimitive('Integer', types)).toBe('number');
    expect(fieldPrimitive('Boolean', types)).toBe('boolean');
    expect(fieldPrimitive('DateTime', types)).toBe('datetime');
  });

  it('follows a plugin type up to the base that answers', () => {
    expect(fieldPrimitive('Name', types)).toBe('string');
    expect(fieldPrimitive('Price', types)).toBe('number');
  });

  it('declines what nothing can be asked of', () => {
    expect(fieldPrimitive('JSON', types)).toBeUndefined();
    expect(fieldPrimitive('Payload', types)).toBeUndefined();
    expect(fieldPrimitive('LargeBinary', types)).toBeUndefined();
  });

  it('declines a type it cannot place', () => {
    expect(fieldPrimitive('Mystery', types)).toBeUndefined();
    expect(fieldPrimitive(undefined, types)).toBeUndefined();
  });
});

describe('filterFields', () => {
  it('keeps declaration order and labels what has no label', () => {
    const fields = filterFields(table([
      { name: 'id', type: 'ID' },
      { name: 'title', type: 'Name', label: 'Titolo' },
      { name: 'published_date', type: 'Date' },
    ]), types);
    expect(fields.map(f => f.name)).toEqual(['id', 'title', 'published_date']);
    expect(fields[1].label).toBe('Titolo');
    expect(fields[2].label).toBe('Published date');
  });

  it('never offers a secret column — the server refuses it in every direction', () => {
    const fields = filterFields(table([
      { name: 'username', type: 'ShortStr' },
      { name: 'password', type: 'ShortStr', secret: true },
    ]), types);
    expect(fields.map(f => f.name)).toEqual(['username']);
  });

  it('leaves out a virtual column: there is no column to compare', () => {
    const fields = filterFields(table([
      { name: 'name', type: 'Name' },
      { name: 'full_name', type: 'Name', virtual: true },
    ]), types);
    expect(fields.map(f => f.name)).toEqual(['name']);
  });

  it('reads a foreign key as identity, and remembers its target', () => {
    const [fk] = filterFields(table([
      { name: 'author_id', type: 'ID', foreign_key: { target: 'Author', field: 'id' } },
    ]), types);
    expect(fk.primitive).toBe('fk');
    expect(fk.fkTarget).toBe('Author');
    expect(fk.label).toBe('Author');
  });

  it('marks what the database can order cheaply', () => {
    const fields = filterFields(table([
      { name: 'id', type: 'ID' },
      { name: 'isbn', type: 'ShortStr', unique: true },
      { name: 'title', type: 'Name', index: true },
      { name: 'note', type: 'ShortStr' },
    ]), types);
    expect(fields.map(f => [f.name, !!f.indexed])).toEqual([
      ['id', true], ['isbn', true], ['title', true], ['note', false],
    ]);
    expect(fields[0].pk).toBe(true);
  });

  it('counts only the leading column of a compound index', () => {
    const fields = filterFields(table(
      [{ name: 'first_name', type: 'Name' }, { name: 'last_name', type: 'Name' }],
      { pk_fields: [], indexes: [{ name: 'idx_full', columns: ['first_name', 'last_name'] }] },
    ), types);
    expect(fields.map(f => !!f.indexed)).toEqual([true, false]);
  });

  it('has nothing to say about a table it does not know', () => {
    expect(filterFields(undefined, types)).toEqual([]);
  });
});

describe('a set of codes', () => {
  it('is asked with its own primitive, the core type or one derived from it', () => {
    expect(fieldPrimitive('CodeSet', types)).toBe('codes');
    expect(fieldPrimitive('Roles', types)).toBe('codes');
  });

  it('carries where its codes come from, and is never offered for ordering', () => {
    const fields = filterFields(table([
      { name: 'id', type: 'Integer' },
      { name: 'roles', type: 'Roles', choices_endpoint: 'partner_roles' },
    ]), types);
    expect(fields[1]).toMatchObject({ name: 'roles', primitive: 'codes', choicesEndpoint: 'partner_roles' });
    expect(orderFields(fields).map(f => f.name)).toEqual(['id']);
  });
});

describe('orderFields', () => {
  it('puts the key first, then the indexed, keeping the rest as they were', () => {
    const fields = filterFields(table([
      { name: 'note', type: 'ShortStr' },
      { name: 'title', type: 'Name', index: true },
      { name: 'id', type: 'ID' },
      { name: 'subtitle', type: 'Name' },
    ]), types);
    expect(orderFields(fields).map(f => f.name))
      .toEqual(['id', 'title', 'note', 'subtitle']);
  });
});

describe('query_rank', () => {
  const ranked = table([
    { name: 'id', type: 'ID' },
    { name: 'memo', type: 'Name', query_rank: 'none' },
    { name: 'created_at', type: 'DateTime', query_rank: 'more' },
    { name: 'city', type: 'Name', query_rank: 'low' },
    { name: 'name', type: 'Name' },
    { name: 'code', type: 'ShortStr', query_rank: 'top' },
    { name: 'phone', type: 'Name', query_rank: 'normal' },
  ]);

  it('orders by rank, keeping the declaration order within one', () => {
    expect(filterFields(ranked, types).map(f => f.name))
      .toEqual(['code', 'id', 'name', 'phone', 'city', 'created_at']);
  });

  it('never offers a column ranked none', () => {
    expect(filterFields(ranked, types).some(f => f.name === 'memo')).toBe(false);
  });

  it('puts the more ranks behind "Show more"', () => {
    const { main, more } = splitByRank(filterFields(ranked, types));
    expect(main.map(f => f.name)).toEqual(['code', 'id', 'name', 'phone', 'city']);
    expect(more.map(f => f.name)).toEqual(['created_at']);
  });

  it('ranks first in the order combo too, the cheap columns first within a rank', () => {
    const fields = filterFields(table([
      { name: 'id', type: 'ID' },
      { name: 'name', type: 'Name' },
      { name: 'code', type: 'ShortStr', index: true },
      { name: 'stamp', type: 'DateTime', index: true, query_rank: 'more' },
      { name: 'code2', type: 'ShortStr', query_rank: 'top' },
    ]), types);
    expect(orderFields(fields).map(f => f.name)).toEqual(['code2', 'id', 'code', 'name', 'stamp']);
  });
});
