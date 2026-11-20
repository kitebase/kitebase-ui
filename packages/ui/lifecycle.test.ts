import { describe, it, expect, vi } from 'vitest';
import { createLifecycle, formKey } from './lifecycle';

const form = { key: 'form-1', page: 'book_form', model: 'Book', id: 7 };

describe('the lifecycle of forms and frames', () => {
  it('tells every listener of an event, and only of that one', () => {
    const lc = createLifecycle();
    const a = vi.fn(), b = vi.fn(), other = vi.fn();
    lc.on('form:open', a);
    lc.on('form:open', b);
    lc.on('form:close', other);
    lc.emit('form:open', form);
    expect(a).toHaveBeenCalledWith(form);
    expect(b).toHaveBeenCalledWith(form);
    expect(other).not.toHaveBeenCalled();
  });

  it('stops telling a listener that stopped listening', () => {
    const lc = createLifecycle();
    const a = vi.fn();
    const off = lc.on('form:change', a);
    off();
    lc.emit('form:change', form);
    expect(a).not.toHaveBeenCalled();
  });

  it('goes on past a listener that throws', () => {
    const lc = createLifecycle();
    const after = vi.fn();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    lc.on('form:saved', () => { throw new Error('boom'); });
    lc.on('form:saved', after);
    lc.emit('form:saved', form);
    expect(after).toHaveBeenCalled();
    quiet.mockRestore();
  });

  it('lets a listener leave while the event is being told', () => {
    const lc = createLifecycle();
    const second = vi.fn();
    const off = lc.on('stack:pop', () => off());
    lc.on('stack:pop', second);
    lc.emit('stack:pop', { frame: 'f', depth: 0 });
    expect(second).toHaveBeenCalled();
  });

  it('gives every opening its own key', () => {
    expect(formKey()).not.toBe(formKey());
  });
});
