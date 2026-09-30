import { screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { api } from '../api/client';
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
