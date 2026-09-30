import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { TxnModal } from './TxnModal';

// J8: Enter did not submit. (J8's other two findings — Tab escaping the
// dialog, focus not returning to the opener — are tested once, for every
// dialog, in Dialog.test.tsx.)

const CATEGORIES = [
  { id: 15, name: 'Groceries', parentId: null, color: null, depth: 0, children: [] },
];

const createTxnMutate = vi.hoisted(() => vi.fn());
const updateTxnMutate = vi.hoisted(() => vi.fn());

beforeEach(() => {
  createTxnMutate.mockClear();
  updateTxnMutate.mockClear();
});

vi.mock('../api/hooks', () => ({
  useActiveProfile: () => ({ id: 1, name: 'Household', defaultCurrency: 'PLN' }),
  useCategories: () => ({ data: CATEGORIES }),
  useCreateTransaction: () => ({ mutate: createTxnMutate, isPending: false }),
  useUpdateTransaction: () => ({ mutate: updateTxnMutate, isPending: false }),
}));

test('pressing Enter in a field submits the form', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TxnModal onClose={vi.fn()} />);
  await user.type(screen.getByLabelText('Amount'), '12.50');
  await user.keyboard('{Enter}');
  expect(createTxnMutate).toHaveBeenCalledTimes(1);
  expect(createTxnMutate).toHaveBeenCalledWith(
    expect.objectContaining({ amount: '12.50' }),
    expect.anything(),
  );
});

// Regression: wrapping the fields in a <form> so Enter submits makes every
// plain <button> inside default to type="submit" unless given an explicit
// type — the EXPENSE/INCOME toggle and Cancel must not save the transaction.

test('clicking the type toggle does not submit the form', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TxnModal onClose={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: 'income' }));
  expect(createTxnMutate).not.toHaveBeenCalled();
});

test('clicking Cancel does not submit the form', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  renderWithProviders(<TxnModal onClose={onClose} />);
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(createTxnMutate).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
});

// J11: the create form used to force every transaction onto the profile's
// default currency, with no way to record a foreign-currency one — though the
// rest of the app displays and warns about them throughout.

test('the create form defaults the currency to the profile default and lets it be changed', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TxnModal onClose={vi.fn()} />);
  expect(screen.getByLabelText('Currency')).toHaveValue('PLN');

  await user.selectOptions(screen.getByLabelText('Currency'), 'EUR');
  await user.type(screen.getByLabelText('Amount'), '12.50');
  await user.click(screen.getByRole('button', { name: /save transaction/i }));

  expect(createTxnMutate).toHaveBeenCalledWith(
    expect.objectContaining({ currency: 'EUR' }),
    expect.anything(),
  );
});

test('editing a transaction offers no currency selector — it keeps the transaction’s own currency', () => {
  renderWithProviders(
    <TxnModal
      initial={{
        id: 1,
        category: { id: 15, name: 'Groceries' },
        amount: '10.0000',
        currency: 'USD',
        type: 'EXPENSE',
        occurredOn: '2026-09-01',
        description: null,
        merchant: null,
        subscriptionId: null,
        createdAt: '2026-09-01T10:00:00Z',
      }}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByLabelText('Currency')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Amount')).toBeInTheDocument();
});
