import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

/** A fresh QueryClient per test: retries off so a failed query surfaces immediately
    instead of hanging the test for three backoffs. */
export function renderWithProviders(
  ui: ReactElement,
  options: { route?: string; state?: unknown } = {},
): RenderResult {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Split off the query string manually: passing an object entry (needed to carry
  // `state`) skips react-router's own path parsing, so a raw route like
  // "/picker?x=1" would otherwise land whole inside `pathname`.
  const [pathname, search] = options.route?.split('?') ?? [];
  const initialEntries = options.route
    ? [{ pathname, search: search ? `?${search}` : '', state: options.state }]
    : undefined;
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
