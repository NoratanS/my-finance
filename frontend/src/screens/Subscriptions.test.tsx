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
  notes: null,
};

const updateSubMutate = vi.hoisted(() => vi.fn());
const deleteSubMutate = vi.hoisted(() => vi.fn());

beforeEach(() => {
  updateSubMutate.mockClear();
  deleteSubMutate.mockClear();
});

vi.mock('../api/hooks', () => ({
  useActiveProfile: () => ({ id: 1, name: 'Household', defaultCurrency: 'PLN' }),
  useCategories: () => ({ data: [] }),
  useCreateSubscription: () => ({ mutate: vi.fn(), isPending: false }),
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
