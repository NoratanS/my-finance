import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { TxnModal } from './TxnModal';

// J8: Enter did not submit, Tab could escape the dialog onto the page behind
// it, and closing always returned focus to <body> instead of whatever opened
// the dialog.

const CATEGORIES = [{ id: 15, name: 'Groceries', parentId: null, color: null, depth: 0, children: [] }];

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

test('Tab from the last control wraps back to the first instead of escaping the dialog', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TxnModal onClose={vi.fn()} />);
  screen.getByRole('button', { name: /save transaction/i }).focus();
  await user.tab();
  expect(screen.getByLabelText('Amount')).toHaveFocus();
});

test('Shift+Tab from the first control wraps to the last instead of escaping the dialog', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TxnModal onClose={vi.fn()} />);
  expect(screen.getByLabelText('Amount')).toHaveFocus();
  await user.tab({ shift: true });
  expect(screen.getByRole('button', { name: /save transaction/i })).toHaveFocus();
});

test('closing returns focus to whatever opened the dialog (not <body>)', async () => {
  const user = userEvent.setup();
  const trigger = document.createElement('button');
  trigger.textContent = 'Add transaction';
  document.body.appendChild(trigger);
  trigger.focus();

  const { unmount } = renderWithProviders(<TxnModal onClose={() => unmount()} />);
  await user.keyboard('{Escape}');
  expect(trigger).toHaveFocus();
  trigger.remove();
});
