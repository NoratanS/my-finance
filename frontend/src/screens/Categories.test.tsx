import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { ApiError } from '../api/client';
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

const updateCategoryMutate = vi.hoisted(() => vi.fn());
const deleteCategoryMutate = vi.hoisted(() => vi.fn());
const createCategoryMutate = vi.hoisted(() => vi.fn());

beforeEach(() => {
  updateCategoryMutate.mockClear();
  deleteCategoryMutate.mockClear();
  createCategoryMutate.mockClear();
});

vi.mock('../api/hooks', () => ({
  useCategories: () => ({ data: [groceries] }),
  useCategoryCounts: () => ({
    data: [
      { categoryId: 15, count: 50 },
      { categoryId: 19, count: 41 },
    ],
  }),
  useCreateCategory: () => ({ mutate: createCategoryMutate, isPending: false }),
  useUpdateCategory: () => ({ mutate: updateCategoryMutate, isPending: false }),
  useDeleteCategory: () => ({ mutate: deleteCategoryMutate, isPending: false }),
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

test('renaming a category calls useUpdateCategory with the new name', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Categories />);
  await user.click(screen.getByLabelText('Rename Groceries'));
  const input = screen.getByLabelText('New name for Groceries');
  await user.clear(input);
  await user.type(input, 'Food & Drink');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(updateCategoryMutate).toHaveBeenCalledWith(
    { id: 15, body: { name: 'Food & Drink' } },
    expect.anything(),
  );
});

test('re-parenting a category calls useUpdateCategory with the new parentId, and cannot target itself', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Categories />);
  await user.click(screen.getByLabelText('Move Supermarket'));
  const select = screen.getByLabelText('New parent for Supermarket');
  // Supermarket must not be able to become its own parent.
  expect(
    Array.from(select.querySelectorAll('option')).some((o) => o.textContent === 'Supermarket'),
  ).toBe(false);
  await user.selectOptions(select, 'root');
  await user.click(screen.getByRole('button', { name: 'Move' }));
  expect(updateCategoryMutate).toHaveBeenCalledWith(
    { id: 19, body: { parentId: null } },
    expect.anything(),
  );
});

test('the move popover does not offer a descendant as the new parent, a guaranteed 422 category-cycle', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Categories />);
  await user.click(screen.getByLabelText('Move Groceries'));
  const select = screen.getByLabelText('New parent for Groceries');
  // Supermarket is Groceries' own child — offering it back as Groceries' new
  // parent is a cycle the server always rejects with 422 category-cycle.
  // (trimmed: nested options are indented with leading spaces by categoryOptions)
  expect(
    Array.from(select.querySelectorAll('option')).some(
      (o) => o.textContent?.trim() === 'Supermarket',
    ),
  ).toBe(false);
});

test('deleting a category requires confirmation before the mutation fires', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Categories />);
  await user.click(screen.getByLabelText('Delete Groceries'));
  expect(deleteCategoryMutate).not.toHaveBeenCalled();
  const dialog = screen.getByRole('dialog');
  expect(dialog.textContent).toContain('Groceries');
  await user.click(screen.getByRole('button', { name: /delete category/i }));
  expect(deleteCategoryMutate).toHaveBeenCalledWith(15, expect.anything());
});

test('a 409 category-in-use rejection from delete surfaces its server message as visible text', async () => {
  const user = userEvent.setup();
  deleteCategoryMutate.mockImplementation((_id, opts) => {
    opts.onError(
      new ApiError(409, {
        type: '/errors/category-in-use',
        title: 'Category is in use',
        status: 409,
        detail:
          "'Groceries' has 1 subcategories, 50 transactions, 0 budgets and 0 subscriptions. Reassign or delete them first.",
      }),
    );
  });
  renderWithProviders(<Categories />);
  await user.click(screen.getByLabelText('Delete Groceries'));
  await user.click(screen.getByRole('button', { name: /delete category/i }));
  expect(await screen.findByText(/has 1 subcategories, 50 transactions/)).toBeInTheDocument();
});

// A colour change used to fail silently: the popover closed and the dot kept
// its old colour, with nothing saying why.

test('a failed colour change shows its message below the tree', async () => {
  updateCategoryMutate.mockImplementationOnce(
    (_vars, opts?: { onError?: (err: unknown) => void }) =>
      opts?.onError?.(
        new ApiError(404, {
          type: '/errors/not-found',
          status: 404,
          detail: 'Category 15 not found.',
        }),
      ),
  );
  const user = userEvent.setup();
  renderWithProviders(<Categories />);
  await user.click(screen.getByLabelText('Change color of Groceries'));
  const popover = screen.getByRole('dialog', { name: 'Category color' });
  await user.click(within(popover).getByRole('button', { name: 'Lavender' }));
  expect(await screen.findByText('404 not-found — Category 15 not found.')).toBeInTheDocument();
});

// Every error on this screen reads like its "Rules from the API" card: status
// and Problem type. Row errors used to drop the type.

test('a row error carries its status and Problem type', async () => {
  updateCategoryMutate.mockImplementationOnce(
    (_vars, opts?: { onError?: (err: unknown) => void }) =>
      opts?.onError?.(
        new ApiError(409, {
          type: '/errors/category-name-taken',
          status: 409,
          detail: "A sibling named 'Food' already exists.",
        }),
      ),
  );
  const user = userEvent.setup();
  renderWithProviders(<Categories />);
  await user.click(screen.getByLabelText('Rename Groceries'));
  const input = screen.getByLabelText('New name for Groceries');
  await user.clear(input);
  await user.type(input, 'Food');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(
    await screen.findByText("409 category-name-taken — A sibling named 'Food' already exists."),
  ).toBeInTheDocument();
});

// The add form was not a <form>: Enter in the name did nothing.

test('pressing Enter in the category name creates the category', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Categories />);
  await user.type(screen.getByLabelText('Category name'), 'Rent{Enter}');
  expect(createCategoryMutate).toHaveBeenCalledTimes(1);
  expect(createCategoryMutate.mock.calls[0][0]).toEqual({
    name: 'Rent',
    parentId: null,
    color: null,
  });
});

test('clicking a colour swatch only selects it — it does not create the category', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Categories />);
  await user.type(screen.getByLabelText('Category name'), 'Rent');
  const addCard = within(screen.getByLabelText('Category name').closest('.blueprint')!);
  await user.click(addCard.getByRole('button', { name: 'Mint' }));
  await user.click(addCard.getByRole('button', { name: 'Auto (inherit from parent)' }));
  expect(createCategoryMutate).not.toHaveBeenCalled();
});
