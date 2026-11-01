import { describe, expect, it } from 'vitest';
import { errorOf } from './envelope';

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
