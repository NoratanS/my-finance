import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, isAbortError } from './client';

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

test('api() forwards a caller-supplied AbortSignal to fetch (Step 3b cancel support)', async () => {
  const controller = new AbortController();
  vi.mocked(global.fetch).mockResolvedValue({
    status: 200,
    ok: true,
    json: async () => ({ ok: true }),
  } as Response);

  await api('/api/insights/interpret', {
    method: 'POST',
    body: { text: 'hi' },
    signal: controller.signal,
  });

  expect(global.fetch).toHaveBeenCalledWith(
    '/api/insights/interpret',
    expect.objectContaining({ signal: controller.signal }),
  );
});

test('an aborted request rejects, and isAbortError recognizes it as a cancel, not a failure', async () => {
  const controller = new AbortController();
  vi.mocked(global.fetch).mockImplementation(() => {
    controller.abort();
    return Promise.reject(new DOMException('The user aborted a request.', 'AbortError'));
  });

  await expect(api('/api/insights/interpret', { signal: controller.signal })).rejects.toSatisfy(
    (err: unknown) => isAbortError(err),
  );
});

test('isAbortError is false for an ordinary error', () => {
  expect(isAbortError(new Error('network down'))).toBe(false);
  expect(isAbortError(new TypeError('failed to fetch'))).toBe(false);
});
