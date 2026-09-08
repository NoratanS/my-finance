import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { api } from './client';
import { sessionKey, useInterpret, useNarrate } from './hooks';

// Step 3b: `useInterpret`/`useNarrate` are exercised for real against a real QueryClient — no
// `vi.mock('../api/hooks', ...)` here. Only the HTTP layer (`api`) is stubbed, so the
// AbortController wiring inside hooks.ts actually runs.
vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>();
  return { ...actual, api: vi.fn() };
});

const session = {
  user: { id: 1, email: 'a@b.com', displayName: 'A' },
  profiles: [{ id: 1, name: 'Household', defaultCurrency: 'PLN' }],
  activeProfileId: 1,
};

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

test('useInterpret exposes a cancel() that aborts the in-flight request', async () => {
  const client = makeClient();
  client.setQueryData(sessionKey, session);
  let capturedSignal: AbortSignal | undefined;
  vi.mocked(api).mockImplementation(
    (_path: string, options?: { signal?: AbortSignal }) =>
      new Promise(() => {
        capturedSignal = options?.signal;
      }),
  );

  const { result } = renderHook(() => useInterpret(), { wrapper: wrapperFor(client) });
  act(() => {
    result.current.mutate({ text: 'how much on groceries', currentPlan: null });
  });

  await waitFor(() => expect(capturedSignal).toBeDefined());
  expect(capturedSignal?.aborted).toBe(false);

  act(() => {
    result.current.cancel();
  });

  expect(capturedSignal?.aborted).toBe(true);
});

test('useNarrate exposes a cancel() that aborts the in-flight request', async () => {
  const client = makeClient();
  client.setQueryData(sessionKey, session);
  let capturedSignal: AbortSignal | undefined;
  vi.mocked(api).mockImplementation(
    (_path: string, options?: { signal?: AbortSignal }) =>
      new Promise(() => {
        capturedSignal = options?.signal;
      }),
  );

  const plan = {
    version: 1,
    metric: 'spend' as const,
    filters: { currency: 'PLN' },
    groupBy: null,
    interval: null,
    range: { type: 'lastMonths' as const, n: 1 },
  };
  const { result } = renderHook(() => useNarrate(), { wrapper: wrapperFor(client) });
  act(() => {
    result.current.mutate(plan);
  });

  await waitFor(() => expect(capturedSignal).toBeDefined());
  expect(capturedSignal?.aborted).toBe(false);
  act(() => {
    result.current.cancel();
  });
  expect(capturedSignal?.aborted).toBe(true);
});
