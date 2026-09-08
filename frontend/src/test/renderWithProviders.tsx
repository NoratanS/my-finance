import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

/** A fresh QueryClient per test: retries off so a failed query surfaces immediately
    instead of hanging the test for three backoffs. */
export function renderWithProviders(
  ui: ReactElement,
  options: { route?: string } = {},
): RenderResult {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={options.route ? [options.route] : undefined}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
