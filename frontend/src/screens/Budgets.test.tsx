import { screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { Budgets } from './Budgets';

vi.mock('../api/hooks', () => ({
  useActiveProfile: () => ({ id: 1, name: 'Household', defaultCurrency: 'PLN' }),
  useCategories: () => ({ data: [] }),
  useBudgets: () => ({ data: [] }),
  useBudgetStatuses: () => [],
}));

test('shows the empty state when the profile has no budgets', () => {
  renderWithProviders(<Budgets />);
  expect(screen.getByText(/No budgets yet for Household/)).toBeInTheDocument();
});
