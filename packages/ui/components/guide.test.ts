import { describe, expect, it } from 'vitest';
import { framePage } from './guide.svelte';

describe('framePage: the page a frame of the stack shows', () => {
  it('reads a panel, a form, the page of a picker', () => {
    expect(framePage({ panelId: 'book_list' })).toBe('book_list');
    expect(framePage({ formId: 'book_form', title: 'Edit' })).toBe('book_form');
    expect(framePage({ table: 'Publisher', page: 'publisher_pick' })).toBe('publisher_pick');
  });

  it('falls back on the list of the table a picker shows', () => {
    expect(framePage({ table: 'Publisher' })).toBe('publisher_list');
  });

  it('says nothing for a frame without a page', () => {
    expect(framePage({ descriptor: {}, title: 'Lines' })).toBeUndefined();
    expect(framePage(undefined)).toBeUndefined();
  });
});
