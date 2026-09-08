import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { Subscriptions } from './Subscriptions';

// J3: cancelling and permanently deleting a subscription used to fire on a
// single click, no confirmation. J3 also requires the two confirmations read
// differently — cancel is reversible, permanent delete is not.

const activeSub = {
  id: 3,
  name: 'Spotify',
  category: { id: 1, name: 'Entertainment' },
  billingPeriod: 'MONTHLY' as const,
  status: 'ACTIVE' as const,
  nextBillingOn: '2026-10-01',
  amount: '29.99',
  currency: 'PLN',
  monthlyAmount: '29.99',
  notes: null,
};

const cancelledSub = {
  id: 4,
  name: 'Old Gym',
  category: { id: 2, name: 'Health' },
  billingPeriod: 'MONTHLY' as const,
  status: 'CANCELLED' as const,
  nextBillingOn: '2026-10-01',
  amount: '50.00',
  currency: 'PLN',
  monthlyAmount: '50.00',
  notes: 'Cancelled after the price hike.',
};

const updateSubMutate = vi.hoisted(() => vi.fn());
const deleteSubMutate = vi.hoisted(() => vi.fn());
const createSubMutate = vi.hoisted(() => vi.fn());

beforeEach(() => {
  updateSubMutate.mockClear();
  deleteSubMutate.mockClear();
  createSubMutate.mockClear();
});

vi.mock('../api/hooks', () => ({
  useActiveProfile: () => ({ id: 1, name: 'Household', defaultCurrency: 'PLN' }),
  useCategories: () => ({ data: [{ id: 1, name: 'Entertainment', parentId: null, color: null, depth: 0, children: [] }] }),
  useCreateSubscription: () => ({ mutate: createSubMutate, isPending: false }),
  useUpdateSubscription: () => ({
    mutate: updateSubMutate,
    isPending: false,
    variables: undefined,
  }),
  useDeleteSubscription: () => ({
    mutate: deleteSubMutate,
    isPending: false,
    variables: undefined,
  }),
  useSubscriptionDashboard: () => ({
    data: { monthlyCost: [], chargedThisMonth: [], upcoming: [], overdue: [] },
  }),
  useSubscriptions: () => ({ data: [activeSub, cancelledSub] }),
}));

test('clicking Cancel does not call the mutation until confirmed', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Subscriptions />);
  await user.click(screen.getByLabelText('Cancel Spotify'));
  expect(updateSubMutate).not.toHaveBeenCalled();

  const dialog = screen.getByRole('dialog');
  expect(dialog.textContent).toContain('Spotify');
  await user.click(screen.getByRole('button', { name: /cancel subscription/i }));
  expect(updateSubMutate).toHaveBeenCalledTimes(1);
  expect(updateSubMutate.mock.calls[0][0].body.status).toBe('CANCELLED');
});

test('dismissing the cancel confirmation calls the mutation zero times', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Subscriptions />);
  await user.click(screen.getByLabelText('Cancel Spotify'));
  await user.keyboard('{Escape}');
  expect(updateSubMutate).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('clicking permanent delete does not call the mutation until confirmed', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Subscriptions />);
  await user.click(screen.getByLabelText('Delete Old Gym'));
  expect(deleteSubMutate).not.toHaveBeenCalled();

  const dialog = screen.getByRole('dialog');
  expect(dialog.textContent).toContain('Old Gym');
  expect(dialog.textContent).toMatch(/can't be undone/i);
  await user.click(screen.getByRole('button', { name: /delete permanently/i }));
  expect(deleteSubMutate).toHaveBeenCalledTimes(1);
  expect(deleteSubMutate).toHaveBeenCalledWith(4, expect.anything());
});

test('dismissing the delete confirmation calls the mutation zero times', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Subscriptions />);
  await user.click(screen.getByLabelText('Delete Old Gym'));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(deleteSubMutate).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('the cancel confirmation does not read like the permanent-delete one', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Subscriptions />);
  await user.click(screen.getByLabelText('Cancel Spotify'));
  const cancelDialog = screen.getByRole('dialog');
  // Cancel is reversible (Task 20 adds the restore path) — the copy must not
  // claim permanence the way the delete confirmation does.
  expect(cancelDialog.textContent).not.toMatch(/can't be undone/i);
  expect(cancelDialog.textContent).not.toMatch(/permanent/i);
});

// J4: the API has always supported un-cancelling a subscription
// (PUT with status: ACTIVE) but the UI's only offer on a cancelled row was
// permanent deletion. A restore action must reuse the same update mutation.

test('the cancel confirmation says the subscription can be restored', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Subscriptions />);
  await user.click(screen.getByLabelText('Cancel Spotify'));
  const cancelDialog = screen.getByRole('dialog');
  expect(cancelDialog.textContent).toMatch(/restor/i);
});

test('a cancelled row offers a restore action that calls update with ACTIVE status', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Subscriptions />);
  await user.click(screen.getByLabelText('Restore Old Gym'));
  expect(updateSubMutate).toHaveBeenCalledTimes(1);
  const call = updateSubMutate.mock.calls[0][0];
  expect(call.id).toBe(4);
  expect(call.body.status).toBe('ACTIVE');
});

// J12: notes are accepted and stored by the API but were never rendered or
// editable anywhere in the UI.

// J11: the create form used to force every subscription onto the profile's
// default currency, with no way to record a foreign-currency one.

test('the create form defaults the currency to the profile default and lets it be changed', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Subscriptions />);
  expect(screen.getByLabelText('Currency')).toHaveValue('PLN');

  await user.type(screen.getByLabelText('Service name'), 'Netflix');
  await user.type(screen.getByLabelText('Price'), '9.99');
  await user.selectOptions(screen.getByLabelText('Currency'), 'USD');
  await user.click(screen.getByRole('button', { name: 'Add' }));

  expect(createSubMutate).toHaveBeenCalledWith(
    expect.objectContaining({ currency: 'USD' }),
    expect.anything(),
  );
});

test('editing a subscription offers no currency selector — it keeps the subscription’s own currency', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Subscriptions />);
  await user.click(screen.getByLabelText('Edit Spotify'));
  expect(screen.queryByLabelText('Currency')).not.toBeInTheDocument();
});

test("a subscription's notes render on its row", async () => {
  renderWithProviders(<Subscriptions />);
  const row = screen.getByText('Old Gym').closest('tr');
  expect(row?.textContent).toContain('Cancelled after the price hike.');
});

test('editing a subscription pre-fills its notes, and saving includes the edited notes', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Subscriptions />);
  await user.click(screen.getByLabelText('Edit Spotify'));
  const notesField = screen.getByLabelText(/notes/i);
  expect(notesField).toHaveValue('');
  await user.type(notesField, 'Family plan, split 4 ways');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(updateSubMutate).toHaveBeenCalledTimes(1);
  expect(updateSubMutate.mock.calls[0][0].body.notes).toBe('Family plan, split 4 ways');
});
