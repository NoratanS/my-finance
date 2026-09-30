import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import { api } from '../api/client';
import { useInsight } from '../api/hooks';
import type { Insight, ResultEnvelope } from '../api/types';
import { renderWithProviders } from '../test/renderWithProviders';
import { PinnedInsights } from './PinnedInsights';

// The tile runs through its real hooks; only the HTTP function is stubbed, by
// path (same seam as hooks.invalidation.test.tsx). A test that mocked
// '../api/hooks' wholesale could not see a fix made inside the hooks.
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, api: vi.fn() };
});
// recharts needs real layout that jsdom lacks — a marker shows whether a
// result got a chart (same substitution as Insights.test.tsx).
vi.mock('../insights/renderers/ResultRenderer', () => ({
  ResultRenderer: () => <div data-testid="result-renderer" />,
}));

const session = {
  user: { id: 1, email: 'a@b.com', displayName: 'A' },
  profiles: [{ id: 1, name: 'Household', defaultCurrency: 'PLN' }],
  activeProfileId: 1,
  authMode: 'PASSWORD' as const,
};

const pinnedPln: Insight = {
  id: 7,
  name: 'Groceries this month',
  plan: {
    version: 1,
    metric: 'spend',
    filters: { includeDescendants: true, currency: 'PLN' },
    groupBy: 'category',
    interval: null,
    range: { type: 'lastMonths', n: 1 },
  },
  viz: null,
  pinned: true,
  createdAt: '2026-09-01T10:00:00Z',
};

/** Answers the four exchanges the tile makes: session, insights, categories, execute. */
function serve(insight: unknown, envelope: ResultEnvelope) {
  vi.mocked(api).mockImplementation(async (path: string) => {
    if (path === '/api/auth/me') return session;
    if (path === '/api/insights') return [insight];
    if (path === '/api/insights/7') return insight;
    if (path === '/api/categories') return [];
    if (path === '/api/insights/execute') return envelope;
    throw new Error(`unexpected request: ${path}`);
  });
}

function envelopeWith(results: ResultEnvelope['results']): ResultEnvelope {
  return { plan: pinnedPln.plan, results, meta: { truncatedGroups: false } };
}

beforeEach(() => {
  vi.mocked(api).mockReset();
});

test('a pinned insight that matches nothing shows the empty answer, not an empty chart', async () => {
  serve(pinnedPln, envelopeWith([{ currency: 'PLN', shape: 'breakdown', groups: [] }]));
  renderWithProviders(<PinnedInsights />);

  expect(await screen.findByText('No transactions match this plan.')).toBeInTheDocument();
  expect(screen.queryByTestId('result-renderer')).not.toBeInTheDocument();
});

test('a pinned insight with a matching group still draws its chart', async () => {
  serve(
    pinnedPln,
    envelopeWith([
      {
        currency: 'PLN',
        shape: 'breakdown',
        groups: [{ key: '3', label: 'Food', value: '12.5000' }],
      },
    ]),
  );
  renderWithProviders(<PinnedInsights />);

  expect(await screen.findByTestId('result-renderer')).toBeInTheDocument();
  expect(screen.queryByText('No transactions match this plan.')).not.toBeInTheDocument();
});

test('a pinned insight whose answer has no result entry shows the empty answer', async () => {
  serve(pinnedPln, envelopeWith([]));
  renderWithProviders(<PinnedInsights />);

  expect(await screen.findByText('No transactions match this plan.')).toBeInTheDocument();
  expect(screen.queryByTestId('result-renderer')).not.toBeInTheDocument();
});

// Only a hand-crafted POST/PUT /api/insights can save a plan like this; the
// executor accepts it and reads the absent fields as {}, null and null.
const minimalPlanInsight = {
  ...pinnedPln,
  plan: { version: 1, metric: 'spend', range: { type: 'all' } },
};

test('a pinned insight whose saved plan omits filters, groupBy and interval renders its tile', async () => {
  serve(minimalPlanInsight, envelopeWith([{ currency: 'PLN', shape: 'value', value: '12.5000' }]));
  renderWithProviders(<PinnedInsights />);

  expect(
    await screen.findByText('spend · all categories · all time · every currency'),
  ).toBeInTheDocument();
  const open = screen.getByRole('link', { name: 'Open' });
  const plan = new URLSearchParams(open.getAttribute('href')!.split('?')[1]).get('plan');
  // Absent groupBy must reopen as "no grouping", not the explorer's default "by category".
  expect(JSON.parse(plan!)).toMatchObject({ filters: {}, groupBy: null, interval: null });
});

test('the explorer deep link reads a saved minimal plan as a Normalized plan', async () => {
  serve(minimalPlanInsight, envelopeWith([]));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  const { result } = renderHook(() => useInsight(7), { wrapper });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.plan).toEqual({
    version: 1,
    metric: 'spend',
    range: { type: 'all' },
    filters: {},
    groupBy: null,
    interval: null,
  });
});
