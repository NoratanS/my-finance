import { screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { Categories } from './Categories';

// Counts come from the server aggregate over EVERY transaction. The old screen
// counted rows out of one 200-row page, so 91 could only ever render as 75.

const supermarket = {
  id: 19,
  name: 'Supermarket',
  parentId: 15,
  color: null,
  depth: 2,
  children: [],
};
const groceries = {
  id: 15,
  name: 'Groceries',
  parentId: null,
  color: '#7aa2f7',
  depth: 1,
  children: [supermarket],
};

vi.mock('../api/hooks', () => ({
  useCategories: () => ({ data: [groceries] }),
  useCategoryCounts: () => ({
    data: [
      { categoryId: 15, count: 50 },
      { categoryId: 19, count: 41 },
    ],
  }),
  useCreateCategory: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateCategory: () => ({ mutate: vi.fn(), isPending: false }),
}));

test('a row counts its whole subtree over every transaction, not one page', () => {
  renderWithProviders(<Categories />);
  expect(screen.getByText('91 txn')).toBeInTheDocument();
  expect(screen.getByText('41 txn')).toBeInTheDocument();
});

test('no tooltip hides a caveat about capped counts', () => {
  renderWithProviders(<Categories />);
  for (const el of document.querySelectorAll('[title]')) {
    expect(el.getAttribute('title')).not.toMatch(/latest 200|200 transactions/i);
  }
});

test('the header no longer apologises for a cap that is gone', () => {
  renderWithProviders(<Categories />);
  expect(document.body.textContent).not.toMatch(/latest 200/i);
});
