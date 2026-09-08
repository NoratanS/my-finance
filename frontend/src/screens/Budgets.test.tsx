import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { Budgets } from './Budgets';

const groceries = { id: 1, name: 'Groceries', parentId: null, color: null, depth: 0, children: [] };

// A budget whose period already ended — active-today filter excludes it, but
// it must not read as "no budgets exist" (J9).
const endedBudget = {
  id: 5,
  category: { id: 1, name: 'Groceries' },
  amountLimit: '500.0000',
  currency: 'PLN',
  periodStart: '2020-01-01',
  periodEnd: '2020-01-31',
};

const deleteBudgetMutate = vi.hoisted(() => vi.fn());
const createBudgetMutate = vi.hoisted(() => vi.fn());
const updateBudgetMutate = vi.hoisted(() => vi.fn());
let budgetsData: (typeof endedBudget)[] = [];

beforeEach(() => {
  deleteBudgetMutate.mockClear();
  createBudgetMutate.mockClear();
  updateBudgetMutate.mockClear();
  budgetsData = [];
});

vi.mock('../api/hooks', () => ({
  useActiveProfile: () => ({ id: 1, name: 'Household', defaultCurrency: 'PLN' }),
  useCategories: () => ({ data: [groceries] }),
  useBudgets: () => ({ data: budgetsData }),
  useBudgetStatuses: () => [],
  useDeleteBudget: () => ({ mutate: deleteBudgetMutate, isPending: false }),
  useCreateBudget: () => ({ mutate: createBudgetMutate, isPending: false }),
  useUpdateBudget: () => ({ mutate: updateBudgetMutate, isPending: false }),
}));

test('shows the empty state when the profile has no budgets at all', () => {
  renderWithProviders(<Budgets />);
  expect(screen.getByText(/No budgets yet for Household/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /create your first budget/i })).toBeInTheDocument();
});

// J9: budgets exist but none match the default "active today" filter — the
// empty state must say so, not claim none exist.
test('distinguishes "none active this period" from "no budgets exist" (J9)', () => {
  budgetsData = [endedBudget];
  renderWithProviders(<Budgets />);
  expect(screen.queryByText(/No budgets yet for Household/)).not.toBeInTheDocument();
  expect(screen.getByText(/No budgets active today for Household/)).toBeInTheDocument();
  expect(screen.getByText(/1 budget total/)).toBeInTheDocument();
});

// J9: the ended budget must be reachable via the Past filter.
test('a past budget is reachable by switching to the Past filter', async () => {
  const user = userEvent.setup();
  budgetsData = [endedBudget];
  renderWithProviders(<Budgets />);
  await user.click(screen.getByRole('button', { name: 'past' }));
  expect(screen.getByText('Groceries')).toBeInTheDocument();
});

test('clicking "New budget" opens the create form', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Budgets />);
  await user.click(screen.getByRole('button', { name: /new budget/i }));
  expect(screen.getByRole('dialog', { name: /add budget/i })).toBeInTheDocument();
});

test('clicking Edit on a budget card opens the edit form', async () => {
  const user = userEvent.setup();
  budgetsData = [endedBudget];
  renderWithProviders(<Budgets />);
  await user.click(screen.getByRole('button', { name: 'past' }));
  await user.click(screen.getByLabelText('Edit Groceries budget'));
  expect(screen.getByRole('dialog', { name: /edit budget/i })).toBeInTheDocument();
});

test('deleting a budget requires confirmation before the mutation fires', async () => {
  const user = userEvent.setup();
  budgetsData = [endedBudget];
  renderWithProviders(<Budgets />);
  await user.click(screen.getByRole('button', { name: 'past' }));
  await user.click(screen.getByLabelText('Delete Groceries budget'));
  expect(deleteBudgetMutate).not.toHaveBeenCalled();

  const dialog = screen.getByRole('dialog');
  expect(dialog.textContent).toContain('Groceries');
  await user.click(screen.getByRole('button', { name: /delete budget/i }));
  expect(deleteBudgetMutate).toHaveBeenCalledWith(5, expect.anything());
});
