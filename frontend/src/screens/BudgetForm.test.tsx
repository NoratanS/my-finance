import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { ApiError } from '../api/client';
import { renderWithProviders } from '../test/renderWithProviders';
import { BudgetForm } from './BudgetForm';

const groceries = { id: 1, name: 'Groceries', parentId: null, color: null, depth: 0, children: [] };

const createBudgetMutate = vi.hoisted(() => vi.fn());
const updateBudgetMutate = vi.hoisted(() => vi.fn());

beforeEach(() => {
  createBudgetMutate.mockClear();
  updateBudgetMutate.mockClear();
});

vi.mock('../api/hooks', () => ({
  useActiveProfile: () => ({ id: 1, name: 'Household', defaultCurrency: 'PLN' }),
  useCategories: () => ({ data: [groceries] }),
  useCreateBudget: () => ({ mutate: createBudgetMutate, isPending: false }),
  useUpdateBudget: () => ({ mutate: updateBudgetMutate, isPending: false }),
}));

test('a zero amount limit is rejected and does not submit', async () => {
  const user = userEvent.setup();
  renderWithProviders(<BudgetForm onClose={vi.fn()} />);

  await user.type(screen.getByLabelText(/amount limit/i), '0');
  await user.click(screen.getByRole('button', { name: /add budget/i }));

  expect(await screen.findByText(/greater than zero/i)).toBeInTheDocument();
  expect(createBudgetMutate).not.toHaveBeenCalled();
});

test('a valid submission passes amountLimit through as the string "1500.50", never a number', async () => {
  const user = userEvent.setup();
  renderWithProviders(<BudgetForm onClose={vi.fn()} />);

  await user.type(screen.getByLabelText(/amount limit/i), '1500.50');
  await user.click(screen.getByRole('button', { name: /add budget/i }));

  await vi.waitFor(() => expect(createBudgetMutate).toHaveBeenCalledTimes(1));
  const body = createBudgetMutate.mock.calls[0][0];
  expect(body.amountLimit).toBe('1500.50');
  expect(typeof body.amountLimit).toBe('string');
});

// A server-side field error used to arrive as the Problem's detail alone —
// "The request body has 1 invalid field(s)." — which says nothing about what
// to fix. (Asserts only the text: where it is shown moves under the field later.)

test('a server field message from saving is visible', async () => {
  createBudgetMutate.mockImplementationOnce((_body, opts: { onError?: (err: unknown) => void }) =>
    opts.onError?.(
      new ApiError(400, {
        type: '/errors/validation-failed',
        detail: 'The request body has 1 invalid field(s).',
        errors: [{ field: 'periodValid', message: 'periodEnd must be on or after periodStart' }],
      }),
    ),
  );
  const user = userEvent.setup();
  renderWithProviders(<BudgetForm onClose={vi.fn()} />);
  await user.type(screen.getByLabelText(/amount limit/i), '1500.50');
  await user.click(screen.getByRole('button', { name: /add budget/i }));
  expect(await screen.findByText(/periodEnd must be on or after periodStart/)).toBeInTheDocument();
});
