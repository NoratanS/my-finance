import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { Transactions } from './Transactions';

// The regression these tests exist for: the money tiles used to sum the rows the
// screen had loaded. Every mock below therefore returns a page of THREE rows next
// to an aggregate covering 235 — a screen that sums its rows cannot pass.

const row = (id: number, amount: string, type: 'EXPENSE' | 'INCOME') => ({
  id,
  category: { id: 15, name: 'Groceries' },
  amount,
  currency: 'PLN',
  type,
  occurredOn: '2026-09-01',
  description: 'weekly shop',
  merchant: null,
  subscriptionId: null,
  createdAt: '2026-09-01T10:00:00Z',
});

const page = {
  content: [row(1, '10.0000', 'EXPENSE'), row(2, '20.0000', 'EXPENSE'), row(3, '30.0000', 'INCOME')],
  page: 0,
  size: 50,
  totalElements: 235,
  totalPages: 5,
};

const PLN_ROW = {
  currency: 'PLN',
  income: '3351.3000',
  expense: '48236.0300',
  net: '-44884.7300',
  count: 235,
};

const summaryRows = vi.hoisted(() => ({
  current: [] as {
    currency: string;
    income: string;
    expense: string;
    net: string;
    count: number;
  }[],
}));

const deleteTxnMutate = vi.hoisted(() => vi.fn());

beforeEach(() => {
  summaryRows.current = [PLN_ROW];
  deleteTxnMutate.mockClear();
});

vi.mock('../components/MerchantBackfill', () => ({ MerchantBackfill: () => null }));

vi.mock('../api/hooks', () => ({
  useActiveProfile: () => ({ id: 1, name: 'Household', defaultCurrency: 'PLN' }),
  useCategories: () => ({ data: [] }),
  useTransactions: () => ({ data: page }),
  useTransactionSummary: () => ({ data: summaryRows.current }),
  useDeleteTransaction: () => ({ mutate: deleteTxnMutate, isPending: false, variables: undefined }),
}));

/** The big number of the KPI tile with this kicker, with pl-PL's NBSPs flattened. */
function tileValue(label: string): string {
  const card = screen.getByText(label).parentElement;
  return (card?.querySelector('.kpi-value')?.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ');
}

test('the money tiles show the server aggregate, not the sum of the loaded page', () => {
  renderWithProviders(<Transactions />);
  // The loaded page sums to 30,00 / 30,00; the true totals are two orders larger.
  expect(tileValue('Expenses')).toContain('48 236,03');
  expect(tileValue('Income')).toContain('3351,30');
  expect(tileValue('Net')).toContain('44 884,73');
});

test('no tile caption claims to have summed only the first 200 rows', () => {
  renderWithProviders(<Transactions />);
  expect(document.body.textContent).not.toMatch(/first 200|latest 200|200 summed/i);
});

test('the search caption describes the page it searched, not the whole dataset', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Transactions />);
  await user.type(screen.getByLabelText('Search transactions'), 'groceries');

  // "N of 235 transactions match" was the lie: the search only ever saw one page.
  expect(screen.queryByText(/of 235 transactions match/)).not.toBeInTheDocument();
  expect(screen.getByText(/matches on this page/)).toBeInTheDocument();
});

test('foreign-currency rows are disclosed on every tile including Net', () => {
  summaryRows.current = [
    { currency: 'EUR', income: '20.0000', expense: '50.0000', net: '-30.0000', count: 2 },
    PLN_ROW,
  ];
  renderWithProviders(<Transactions />);
  expect(screen.getAllByText(/2 foreign-currency txns excluded/)).toHaveLength(3);
});

// J3: deleting a transaction used to fire on a single click, no confirmation.

test('clicking delete does not call the mutation until the confirmation is accepted', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Transactions />);
  await user.click(screen.getAllByLabelText('Delete transaction')[0]);
  expect(deleteTxnMutate).not.toHaveBeenCalled();

  const dialog = screen.getByRole('dialog');
  expect(dialog.textContent).toContain('weekly shop');
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(deleteTxnMutate).toHaveBeenCalledTimes(1);
  expect(deleteTxnMutate).toHaveBeenCalledWith(1, expect.anything());
});

test('dismissing the confirmation calls the mutation zero times', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Transactions />);
  await user.click(screen.getAllByLabelText('Delete transaction')[0]);
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(deleteTxnMutate).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
