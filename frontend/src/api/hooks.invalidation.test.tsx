import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { api } from './client';
import { sessionKey, useDeleteTransaction } from './hooks';

// Step 4b: useInvalidateTransactionData (the private helper behind useCreate/Update/
// DeleteTransaction) is exercised for real against a real QueryClient — no
// `vi.mock('../api/hooks', ...)` here. Every screen test mocks '../api/hooks' wholesale,
// which is exactly why the missing 'insight-result' invalidation survived every previous
// review: that helper never executed in any test. Only the HTTP layer (`api`) is stubbed.
vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>();
  return { ...actual, api: vi.fn() };
});

const session = {
  user: { id: 1, email: 'a@b.com', displayName: 'A' },
  profiles: [{ id: 1, name: 'Household', defaultCurrency: 'PLN' }],
  activeProfileId: 1,
  authMode: 'PASSWORD' as const,
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

test('deleting a transaction invalidates the pinned-insight-tile cache', async () => {
  const client = makeClient();
  // A fresh, immediately-usable session (staleTime 60s), so useActiveProfileId resolves
  // from cache without firing a real /api/auth/me request.
  client.setQueryData(sessionKey, session);
  // The exact key PinnedInsights' useInsightResults uses (hooks.ts ~line 612).
  client.setQueryData(['insight-result', 1, 7], { plan: {}, results: [], meta: {} });
  vi.mocked(api).mockResolvedValue(undefined);

  const { result } = renderHook(() => useDeleteTransaction(), { wrapper: wrapperFor(client) });

  act(() => {
    result.current.mutate(42);
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(client.getQueryState(['insight-result', 1, 7])?.isInvalidated).toBe(true);
});
