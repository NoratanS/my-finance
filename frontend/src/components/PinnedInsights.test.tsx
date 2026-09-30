import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { useInsight } from '../api/hooks';
import type { components } from '../api/schema';
import type { CategoryNode, Insight, ResultEnvelope } from '../api/types';
import { insight } from '../test/fixtures';
import { renderWithProviders } from '../test/renderWithProviders';
import { server } from '../test/server';
import { PinnedInsights } from './PinnedInsights';

// The tile runs through its real hooks and client; the test server answers its requests
// (src/test/server.ts), with the default Session. A test that mocked '../api/hooks'
// wholesale could not see a fix made inside the hooks.
// recharts needs real layout that jsdom lacks — a marker shows whether a
// result got a chart (same substitution as Insights.test.tsx).
vi.mock('../insights/renderers/ResultRenderer', () => ({
  ResultRenderer: () => <div data-testid="result-renderer" />,
}));

/** A saved Insight as the backend sends it: its plan verbatim, as the author saved it. */
type InsightResponse = components['schemas']['InsightResponse'];

const pinnedPln = insight({
  name: 'Groceries this month',
  pinned: true,
  plan: {
    version: 1,
    metric: 'spend',
    filters: { includeDescendants: true, currency: 'PLN' },
    groupBy: 'category',
    interval: null,
    range: { type: 'lastMonths', n: 1 },
  },
});

/** Answers the four exchanges the tile makes besides the Session: insights, categories, execute. */
function serve(insight: Insight | InsightResponse, envelope: ResultEnvelope) {
  server.use(
    http.get('/api/insights', () => HttpResponse.json<(Insight | InsightResponse)[]>([insight])),
    http.get('/api/insights/7', () => HttpResponse.json<Insight | InsightResponse>(insight)),
    http.get('/api/categories', () => HttpResponse.json<CategoryNode[]>([])),
    http.post('/api/insights/execute', () => HttpResponse.json<ResultEnvelope>(envelope)),
  );
}

function envelopeWith(results: ResultEnvelope['results']): ResultEnvelope {
  return { plan: pinnedPln.plan, results, meta: { truncatedGroups: false } };
}

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
const minimalPlanInsight: InsightResponse = {
  id: pinnedPln.id,
  name: pinnedPln.name,
  viz: null,
  pinned: true,
  createdAt: pinnedPln.createdAt,
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
