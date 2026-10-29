import { describe, it, expect } from 'vitest';
import { lookupPageId, pickerView, lookupFilters, filterConditions, filterRules } from './lookup';

describe('lookup page', () => {
  it('is the list of the target table by default', () => {
    expect(lookupPageId({}, 'Utente')).toBe('utente_list');
  });

  it('is the page the field declares', () => {
    expect(lookupPageId({ lookup: { page: 'utente_attivi' } }, 'Utente')).toBe('utente_attivi');
  });

  it('is none when the field says so', () => {
    expect(lookupPageId({ lookup: { page: false } }, 'Utente')).toBeNull();
  });
});

describe('picker view', () => {
  const page = {
    title: 'Utenti',
    content: {
      type: 'table',
      source: { model: 'Utente', joins: [{ Committente: 'x' }], order_by: ['nome'] },
      columns: [{ field: 'nome' }, { field: 'Committente.nome as committente' }],
      navigator: { commands: [{ id: 'archive', endpoint: 'archivable' }] },
    },
    panels: [{ id: 'detail' }],
  };

  it('keeps the view as written and switches the navigator to lookup', () => {
    const view = pickerView(page)!;
    expect(view.source).toEqual(page.content.source);
    expect(view.columns).toEqual(page.content.columns);
    expect(view.navigator).toEqual({
      commands: [{ id: 'archive', endpoint: 'archivable' }],
      mode: 'lookup',
    });
  });

  it('does not touch the page it was given', () => {
    pickerView(page);
    expect(page.content.navigator).not.toHaveProperty('mode');
  });

  it('is null when there is no table to pick from', () => {
    expect(pickerView(null)).toBeNull();
    expect(pickerView({ content: { type: 'form' } })).toBeNull();
  });
});

describe('lookup filters', () => {
  const field = { lookup: { filters: { committente_id: '$record.committente_id', active: true } } };

  it('reads $record from the draft and keeps literals', () => {
    expect(lookupFilters(field, { committente_id: 5 })).toEqual({ committente_id: 5, active: true });
  });

  it('drops a condition whose value is still empty', () => {
    expect(lookupFilters(field, { committente_id: null })).toEqual({ active: true });
    expect(lookupFilters(field, {})).toEqual({ active: true });
  });

  it('is empty when the field declares none', () => {
    expect(lookupFilters({}, { committente_id: 5 })).toEqual({});
  });

  it('becomes conditions for the drop-down and removable rules for the list', () => {
    expect(filterConditions({ committente_id: 5 })).toEqual([{ committente_id: 5 }]);
    expect(filterRules({ committente_id: 5 })).toEqual([
      { rule: { field: 'committente_id', op: 'eq', value: 5 }, join: 'and' },
    ]);
  });
});
