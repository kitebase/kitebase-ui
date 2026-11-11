import { describe, expect, it } from 'vitest';
import { errorOf, errorText } from './envelope';

describe('errorOf', () => {
  it('keeps the whole envelope of a refusal', () => {
    const body = {
      status: 'error', status_code: 400, message: 'not changed', request_id: 'abc123',
      data: { errors: { confirm: 'the two do not match' } },
    };
    expect(errorOf(body)).toEqual({
      status: 'error', message: 'not changed', request_id: 'abc123',
      data: { errors: { confirm: 'the two do not match' } },
      error_type: undefined, traceback: undefined,
    });
  });

  it('keeps what a failure of the server says', () => {
    const r = errorOf({ status: 'error', message: 'boom', error_type: 'KeyError', traceback: 'Traceback ...' });
    expect(r.error_type).toBe('KeyError');
    expect(r.traceback).toBe('Traceback ...');
  });

  it('falls back when nothing came back', () => {
    expect(errorOf(undefined, 'Request failed').message).toBe('Request failed');
    expect(errorOf('<html>bad gateway</html>', 'Request failed').message).toBe('Request failed');
  });

  it('invents no message of its own', () => {
    expect(errorOf({ status: 'error' }).message).toBeUndefined();
  });
});

describe('errorText', () => {
  it('ends with the start of the request id, the line to look up', () => {
    expect(errorText({ message: 'boom', request_id: '0123456789abcdef' }, 'failed')).toBe('boom [01234567]');
  });

  it('is the message alone without an id', () => {
    expect(errorText({ message: 'not allowed' }, 'failed')).toBe('not allowed');
  });

  it('falls back on an empty or missing message, and keeps the id', () => {
    expect(errorText({}, 'failed')).toBe('failed');
    expect(errorText({ message: '', request_id: 'abcdef0123' }, 'failed')).toBe('failed [abcdef01]');
  });
});
