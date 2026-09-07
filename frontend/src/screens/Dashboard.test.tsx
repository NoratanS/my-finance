import { screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { Dashboard } from './Dashboard';

// D2, the worst of the family: the spend-by-category chart rolled up one 200-row
// page, so a whole category worth 1117.99 PLN vanished from it with no caption.
// The mocks below reproduce that shape — 206 transactions in the month, of which
// only two "Recent transactions" rows are loaded — and the chart must still show
// both categories and the full 3117.99.

const probe = { id: 1, name: 'Probe', parentId: null, color: '#7aa2f7', depth: 1, children: [] };
const probeB = { id: 2, name: 'ProbeB', parentId: null, color: '#9ece6a', depth: 1, children: [] };

const recent = {
  content: [
    {
      id: 1,
      category: { id: 2, name: 'ProbeB' },
      amount: '10.0000',
      currency: 'PLN',
      type: 'EXPENSE',
      occurredOn: '2026-09-05',
      description: 'bulk',
      merchant: null,
      subscriptionId: null,
      createdAt: '2026-09-05T10:00:00Z',
    },
  ],
  page: 0,
  size: 6,
  totalElements: 206,
  totalPages: 35,
};

vi.mock('../components/PinnedInsights', () => ({ PinnedInsights: () => null }));

vi.mock('../api/hooks', () => ({
  useActiveProfile: () => ({ id: 46, name: 'Audit Probe', defaultCurrency: 'PLN' }),
  useCategories: () => ({ data: [probe, probeB] }),
  useTransactions: () => ({ data: recent, isSuccess: true }),
  useTransactionSummary: () => ({
    data: [
      { currency: 'EUR', income: '20.0000', expense: '50.0000', net: '-30.0000', count: 2 },
      { currency: 'PLN', income: '0.0000', expense: '3117.9900', net: '-3117.9900', count: 204 },
    ],
  }),
  useCategoryTotals: () => ({
    data: [
      { categoryId: 1, currency: 'PLN', total: '1117.9900' },
      { categoryId: 2, currency: 'PLN', total: '2000.0000' },
      { categoryId: 1, currency: 'EUR', total: '50.0000' },
    ],
  }),
  useBudgets: () => ({ data: [] }),
  useBudgetStatuses: () => [],
}));

/** The big number of the KPI tile with this kicker, with pl-PL's NBSPs flattened. */
function tileValue(label: string): string {
  const card = screen.getByText(label).parentElement;
  return (card?.querySelector('.kpi-value')?.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ');
}

test('the spend tile totals the whole month, not the rows it loaded', () => {
  renderWithProviders(<Dashboard />);
  expect(tileValue('Spent this month')).toContain('3117,99');
});

test('no category is dropped from the breakdown chart', () => {
  renderWithProviders(<Dashboard />);
  const chart = screen.getByText('Spend by category').closest('.blueprint') as HTMLElement;
  // "Probe" is the category the capped rollup used to lose entirely.
  expect(within(chart).getByText('Probe')).toBeInTheDocument();
  expect(within(chart).getByText('ProbeB')).toBeInTheDocument();
  const text = chart.textContent.replace(/[\u00a0\u202f]/g, ' ');
  expect(text).toContain('1117,99');
  expect(text).toContain('2000,00');
  // Foreign-currency rows are a separate currency, never folded into the PLN bars.
  expect(text).not.toContain('50,00');
});

test('the Net tile discloses the foreign-currency rows it excluded', () => {
  renderWithProviders(<Dashboard />);
  expect(screen.getByText(/2 foreign-currency txns excluded/)).toBeInTheDocument();
});

test('no caption apologises for a 200-row cap', () => {
  renderWithProviders(<Dashboard />);
  expect(document.body.textContent).not.toMatch(/first 200|latest 200/i);
});
