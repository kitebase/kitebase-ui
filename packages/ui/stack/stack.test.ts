/**
 * Frame ids, and the context they have to work in.
 *
 * `crypto.randomUUID()` exists only in a secure context — HTTPS, or localhost.
 * A compiled client served over plain HTTP from a LAN address is neither, and
 * there every `push` threw `crypto.randomUUID is not a function`: the menu drew,
 * and no panel would open.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';

import { createStack } from './stack.svelte.ts';

const Component = () => null;
const realCrypto = globalThis.crypto;

afterEach(() => {
  Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true });
});

/** A context without `randomUUID`, which is what plain HTTP gives you. */
function withoutRandomUUID() {
  Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
}

describe('pushing a frame', () => {
  it('returns an id', () => {
    const stack = createStack();
    expect(stack.push(Component)).toMatch(/.+/);
    expect(get(stack)).toHaveLength(1);
  });

  it('works where crypto.randomUUID does not exist', () => {
    withoutRandomUUID();
    const stack = createStack();

    expect(() => stack.push(Component)).not.toThrow();
    expect(get(stack)).toHaveLength(1);
  });

  it('gives every frame an id of its own, there too', () => {
    withoutRandomUUID();
    const stack = createStack();

    stack.push(Component);
    stack.push(Component);

    const ids = get(stack).map((page) => page.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('focus across a frame', () => {
  // Node has no DOM: a document whose focus the test moves by hand is enough.
  function fakeDom() {
    const body = { focus: () => {} };
    const doc = { body, activeElement: body as unknown };
    const element = (connected = true) => {
      const el = { isConnected: connected, focus: () => { doc.activeElement = el; } };
      return el;
    };
    Object.defineProperty(globalThis, 'document', { value: doc, configurable: true });
    return { doc, body, element };
  }

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'document');
    vi.useRealTimers();
  });

  it('goes back to the widget that opened the frame', () => {
    vi.useFakeTimers();
    const { doc, body, element } = fakeDom();
    const field = element();
    doc.activeElement = field;

    const stack = createStack();
    stack.push(Component);
    doc.activeElement = body;           // the frame took it, and took it away
    stack.pop();
    vi.runAllTimers();

    expect(doc.activeElement).toBe(field);
  });

  it('takes it back from a frame still leaving', () => {
    vi.useFakeTimers();
    const { doc, element } = fakeDom();
    const field = element();
    const grid = element();             // the picker's grid, alive while it slides out
    doc.activeElement = field;

    const stack = createStack();
    stack.push(Component);
    grid.focus();
    stack.pop();
    vi.runAllTimers();

    expect(doc.activeElement).toBe(field);
  });

  it('leaves it where the caller put it on return', () => {
    vi.useFakeTimers();
    const { doc, element } = fakeDom();
    const field = element();
    const grid = element();
    doc.activeElement = field;

    const stack = createStack();
    stack.push(Component, {}, () => grid.focus());
    stack.pop();
    vi.runAllTimers();

    expect(doc.activeElement).toBe(grid);
  });

  it('does nothing for a widget that is no longer there', () => {
    vi.useFakeTimers();
    const { doc, body, element } = fakeDom();
    const gone = element(false);
    doc.activeElement = gone;

    const stack = createStack();
    stack.push(Component);
    doc.activeElement = body;
    stack.pop();
    vi.runAllTimers();

    expect(doc.activeElement).toBe(body);
  });
});

describe('telling who listens', () => {
  it('says when a frame opens and when it closes, with the depth it leaves', async () => {
    const { lifecycle } = await import('../lifecycle');
    const seen: unknown[] = [];
    const offPush = lifecycle.on('stack:push', (e) => seen.push(['push', e.depth]));
    const offPop = lifecycle.on('stack:pop', (e) => seen.push(['pop', e.depth]));
    const s = createStack();
    const id = s.push({});
    s.push({});
    s.pop();
    s.pop();
    s.pop();
    offPush(); offPop();
    expect(seen).toEqual([['push', 1], ['push', 2], ['pop', 1], ['pop', 0]]);
    expect(typeof id).toBe('string');
  });
});
