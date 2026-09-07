import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { Insights } from './Insights';

// J3: deleting a saved insight used to fire on a single click, no confirmation.

const savedInsight = {
  id: 7,
  name: 'Groceries, monthly',
  plan: { filters: {}, groupBy: null, granularity: null },
  viz: null,
  pinned: false,
};

vi.mock('../insights/AiSearchBox', () => ({ AiSearchBox: () => null }));
vi.mock('../insights/chips/ChipBar', () => ({ ChipBar: () => null }));
vi.mock('../insights/FollowUp', () => ({ FollowUp: () => null }));

const deleteInsightMutate = vi.hoisted(() => vi.fn());

beforeEach(() => {
  deleteInsightMutate.mockClear();
});

vi.mock('../api/hooks', () => ({
  useActiveProfile: () => ({ id: 1, name: 'Household', defaultCurrency: 'PLN' }),
  useAiCapabilities: () => ({ data: undefined }),
  useCategories: () => ({ data: [] }),
  useCreateInsight: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateInsight: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteInsight: () => ({ mutate: deleteInsightMutate, isPending: false }),
  useExecutePlan: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useInsight: () => ({ data: undefined }),
  useInsights: () => ({ data: [savedInsight] }),
}));

test('clicking delete on a saved insight does not call the mutation until confirmed', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Insights />);
  await user.click(screen.getByLabelText('Delete Groceries, monthly'));
  expect(deleteInsightMutate).not.toHaveBeenCalled();

  const dialog = screen.getByRole('dialog');
  expect(dialog.textContent).toContain('Groceries, monthly');
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(deleteInsightMutate).toHaveBeenCalledTimes(1);
  expect(deleteInsightMutate).toHaveBeenCalledWith(7, expect.anything());
});

test('dismissing the confirmation calls the mutation zero times', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Insights />);
  await user.click(screen.getByLabelText('Delete Groceries, monthly'));
  await user.keyboard('{Escape}');
  expect(deleteInsightMutate).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
