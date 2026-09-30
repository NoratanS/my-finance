import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { ApiError } from '../api/client';
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
const dashboardData = vi.hoisted(() => vi.fn());

beforeEach(() => {
  updateSubMutate.mockClear();
  deleteSubMutate.mockClear();
  createSubMutate.mockClear();
  dashboardData.mockReturnValue({
    data: { monthlyCost: [], chargedThisMonth: [], upcoming: [], overdue: [] },
  });
});

vi.mock('../api/hooks', () => ({
  useActiveProfile: () => ({ id: 1, name: 'Household', defaultCurrency: 'PLN' }),
  useCategories: () => ({
    data: [{ id: 1, name: 'Entertainment', parentId: null, color: null, depth: 0, children: [] }],
  }),
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
  useSubscriptionDashboard: () => dashboardData(),
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

// Asserts only the text: where it is shown moves under the field later.

test('a server field message from saving the form is visible', async () => {
  createSubMutate.mockImplementationOnce((_body, opts: { onError?: (err: unknown) => void }) =>
    opts.onError?.(
      new ApiError(400, {
        type: '/errors/validation-failed',
        detail: 'The request body has 1 invalid field(s).',
        errors: [{ field: 'name', message: 'size must be between 1 and 100' }],
      }),
    ),
  );
  const user = userEvent.setup();
  renderWithProviders(<Subscriptions />);
  await user.type(screen.getByLabelText('Service name'), 'Netflix');
  await user.type(screen.getByLabelText('Price'), '9.99');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByText(/size must be between 1 and 100/)).toBeInTheDocument();
});

// The subscription form was not a <form>: Enter did nothing, and a server
// message could only reach its banner.

test('pressing Enter in the service name adds the subscription', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Subscriptions />);
  await user.type(screen.getByLabelText('Price'), '9.99');
  await user.type(screen.getByLabelText('Service name'), 'Netflix{Enter}');
  expect(createSubMutate).toHaveBeenCalledTimes(1);
  expect(createSubMutate.mock.calls[0][0].name).toBe('Netflix');
});

test('clicking a cadence only selects it — it does not submit the form', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Subscriptions />);
  await user.type(screen.getByLabelText('Service name'), 'Netflix');
  await user.type(screen.getByLabelText('Price'), '9.99');
  await user.click(screen.getByRole('button', { name: 'quarterly' }));
  expect(createSubMutate).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'quarterly' })).toHaveAttribute('aria-pressed', 'true');
});

test('a price typed with a comma is sent with a dot', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Subscriptions />);
  await user.type(screen.getByLabelText('Service name'), 'Netflix');
  await user.type(screen.getByLabelText('Price'), '9,99');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(createSubMutate).toHaveBeenCalledWith(
    expect.objectContaining({ amount: '9.99' }),
    expect.anything(),
  );
});

test('after an add the form empties itself for the next one', async () => {
  createSubMutate.mockImplementationOnce((_body, opts: { onSuccess?: () => void }) =>
    opts.onSuccess?.(),
  );
  const user = userEvent.setup();
  renderWithProviders(<Subscriptions />);
  await user.type(screen.getByLabelText('Service name'), 'Netflix');
  await user.type(screen.getByLabelText('Price'), '9.99');
  await user.click(screen.getByRole('button', { name: 'yearly' }));
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(screen.getByLabelText('Service name')).toHaveValue('');
  expect(screen.getByLabelText('Price')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'monthly' })).toHaveAttribute('aria-pressed', 'true');
});

test('a server message about the price shows under Price', async () => {
  createSubMutate.mockImplementationOnce((_body, opts: { onError?: (err: unknown) => void }) =>
    opts.onError?.(
      new ApiError(400, {
        type: '/errors/validation-failed',
        detail: 'The request body has 1 invalid field(s).',
        errors: [{ field: 'amount', message: 'numeric value out of bounds' }],
      }),
    ),
  );
  const user = userEvent.setup();
  renderWithProviders(<Subscriptions />);
  await user.type(screen.getByLabelText('Service name'), 'Netflix');
  await user.type(screen.getByLabelText('Price'), '9.99');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  const priceField = within(screen.getByLabelText('Price').closest('.field')!);
  expect(priceField.getByText('numeric value out of bounds')).toBeInTheDocument();
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

// Harness gate for Task 26 (breaking this file into focused modules): a
// pre-refactor test covering the dashboard summary and the per-row actions,
// so extracting the form and the row can't silently drop either.

test('the dashboard summary renders monthly cost, charged-this-month, and upcoming renewals', () => {
  dashboardData.mockReturnValue({
    data: {
      monthlyCost: [{ currency: 'PLN', amount: '79.98' }],
      chargedThisMonth: [{ currency: 'PLN', amount: '29.99' }],
      upcoming: [
        {
          id: 3,
          name: 'Spotify',
          nextBillingOn: '2026-10-01',
          amount: '29.99',
          currency: 'PLN',
          daysUntil: 5,
        },
      ],
      overdue: [
        { id: 4, name: 'Old Gym', nextBillingOn: '2026-08-01', amount: '50.00', currency: 'PLN' },
      ],
    },
  });
  renderWithProviders(<Subscriptions />);
  expect(screen.getByText(/79,98/).textContent).toMatch(/zł/);
  expect(screen.getByText(/charged this month/i).textContent).toMatch(/29,99/);
  const renewals = screen.getByText('Upcoming renewals').closest('div')!;
  expect(renewals.textContent).toContain('Spotify');
  expect(renewals.textContent).toContain('in 5d');
  expect(renewals.textContent).toContain('Old Gym');
  expect(renewals.textContent).toContain('overdue');
});

test('an active row offers Edit, Pause, and Cancel; a cancelled row offers Restore and Delete', () => {
  renderWithProviders(<Subscriptions />);
  expect(screen.getByLabelText('Edit Spotify')).toBeInTheDocument();
  expect(screen.getByLabelText('Pause Spotify')).toBeInTheDocument();
  expect(screen.getByLabelText('Cancel Spotify')).toBeInTheDocument();
  expect(screen.queryByLabelText('Resume Spotify')).not.toBeInTheDocument();

  expect(screen.getByLabelText('Restore Old Gym')).toBeInTheDocument();
  expect(screen.getByLabelText('Delete Old Gym')).toBeInTheDocument();
  expect(screen.queryByLabelText('Edit Old Gym')).not.toBeInTheDocument();
});
