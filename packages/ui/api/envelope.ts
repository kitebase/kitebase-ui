import type { APIResponse } from './types';

/**
 * The error envelope of a kitebase answer, whatever its HTTP status: 400, 403,
 * 404 and 500 carry the same body, and the caller needs all of it, the field
 * errors of a form in `data` and the `request_id` that finds the line in the
 * server's log. `fallback` is the message when the body has none, as when the
 * request never reached the server.
 */
export function errorOf<T = unknown>(body: unknown, fallback?: string): APIResponse<T> {
  const d = (body && typeof body === 'object' ? body : {}) as Record<string, any>;
  return {
    status: 'error',
    message: d.message ?? fallback,
    data: d.data,
    error_type: d.error_type,
    traceback: d.traceback,
    request_id: d.request_id,
  };
}
