import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { Transactions } from './Transactions';

// The regression these tests exist for: the money tiles used to sum the rows the
// screen had loaded. Every mock below therefore returns a page of THREE rows next
// to an aggregate covering 235 — a screen that sums its rows cannot pass.

const row = (
  id: number,
  amount: string,
  type: 'EXPENSE' | 'INCOME',
  merchant: string | null = null,
) => ({
  id,
  category: { id: 15, name: 'Groceries' },
  amount,
  currency: 'PLN',
  type,
  occurredOn: '2026-09-01',
  description: 'weekly shop',
  merchant,
  subscriptionId: null,
  createdAt: '2026-09-01T10:00:00Z',
});

const page = {
  content: [
    row(1, '10.0000', 'EXPENSE', 'Lidl'),
    row(2, '20.0000', 'EXPENSE'),
    row(3, '30.0000', 'INCOME'),
  ],
  page: 0,
  size: 50,
  totalElements: 235,
  totalPages: 5,
};

const CATEGORIES = [{ id: 15, name: 'Groceries', parentId: null, color: null, depth: 0, children: [] }];

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
const createTxnMutate = vi.hoisted(() => vi.fn());
const updateTxnMutate = vi.hoisted(() => vi.fn());

beforeEach(() => {
  summaryRows.current = [PLN_ROW];
  deleteTxnMutate.mockClear();
  createTxnMutate.mockClear();
  updateTxnMutate.mockClear();
});

vi.mock('../components/MerchantBackfill', () => ({ MerchantBackfill: () => null }));

vi.mock('../api/hooks', () => ({
  useActiveProfile: () => ({ id: 1, name: 'Household', defaultCurrency: 'PLN' }),
  useCategories: () => ({ data: CATEGORIES }),
  useTransactions: () => ({ data: page }),
  useTransactionSummary: () => ({ data: summaryRows.current }),
  useDeleteTransaction: () => ({ mutate: deleteTxnMutate, isPending: false, variables: undefined }),
  useCreateTransaction: () => ({ mutate: createTxnMutate, isPending: false }),
  useUpdateTransaction: () => ({ mutate: updateTxnMutate, isPending: false, variables: undefined }),
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

// J1/C4: PUT /api/transactions/{id} existed but had no caller — the UI offered
// only delete. J5: merchant could be set (incl. via bulk backfill) but was
// displayed nowhere and could never be viewed, corrected or cleared.

test('an Edit control exists for each transaction row', () => {
  renderWithProviders(<Transactions />);
  expect(screen.getAllByLabelText(/^Edit transaction /)).toHaveLength(3);
});

test('the merchant column renders, including rows with no merchant set', () => {
  renderWithProviders(<Transactions />);
  expect(screen.getByRole('columnheader', { name: 'Merchant' })).toBeInTheDocument();
  expect(screen.getByText('Lidl')).toBeInTheDocument();
});

test('opening the edit control prefills every field, including merchant, and saving calls update with the edited values', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Transactions />);
  await user.click(screen.getAllByLabelText(/^Edit transaction /)[0]);

  expect(screen.getByLabelText('Amount')).toHaveValue('10');
  expect(screen.getByLabelText('Date')).toHaveValue('2026-09-01');
  expect(screen.getByLabelText('Category')).toHaveValue('15');
  expect(screen.getByLabelText('Description')).toHaveValue('weekly shop');
  expect(screen.getByLabelText('Merchant')).toHaveValue('Lidl');

  await user.clear(screen.getByLabelText('Amount'));
  await user.type(screen.getByLabelText('Amount'), '12.50');
  await user.click(screen.getByRole('button', { name: /save/i }));

  expect(updateTxnMutate).toHaveBeenCalledTimes(1);
  expect(updateTxnMutate).toHaveBeenCalledWith(
    {
      id: 1,
      body: expect.objectContaining({
        categoryId: 15,
        amount: '12.50',
        currency: 'PLN',
        type: 'EXPENSE',
        occurredOn: '2026-09-01',
        description: 'weekly shop',
        merchant: 'Lidl',
      }),
    },
    expect.anything(),
  );
  expect(createTxnMutate).not.toHaveBeenCalled();
});

test('opening the edit control on an INCOME row prefills type, not the modal default of EXPENSE', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Transactions />);
  // Row 3 is the INCOME row; the modal's own default (for create) is EXPENSE.
  await user.click(screen.getAllByLabelText(/^Edit transaction /)[2]);

  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('button', { name: 'income' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await user.click(within(dialog).getByRole('button', { name: /save/i }));
  expect(updateTxnMutate).toHaveBeenCalledWith(
    { id: 3, body: expect.objectContaining({ type: 'INCOME' }) },
    expect.anything(),
  );
});

test('clearing the merchant field and saving sends an explicit clear, not the old value', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Transactions />);
  await user.click(screen.getAllByLabelText(/^Edit transaction /)[0]);

  await user.clear(screen.getByLabelText('Merchant'));
  await user.click(screen.getByRole('button', { name: /save/i }));

  expect(updateTxnMutate).toHaveBeenCalledTimes(1);
  expect(updateTxnMutate).toHaveBeenCalledWith(
    { id: 1, body: expect.objectContaining({ merchant: null }) },
    expect.anything(),
  );
});
