import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { ApiError } from '../api/client';
import { renderWithProviders } from '../test/renderWithProviders';
import { Insights } from './Insights';

// J3: deleting a saved insight used to fire on a single click, no confirmation.
// J15: a zero-match run used to render a blank axes-only chart instead of the
// designed empty-answer message.
// J10: a deep link to a deleted insight used to fail silently and quietly show
// the default plan.

const savedInsight = {
  id: 7,
  name: 'Groceries, monthly',
  plan: { filters: {}, groupBy: null, interval: null },
  viz: null,
  pinned: false,
};

// A probe, not a no-op: clicking it dispatches a live-plan edit through
// onChange, the same shape a real chip fires, so tests can prove a chip edit
// does not clear lastEnvelope (test below).
vi.mock('../insights/chips/ChipBar', () => ({
  ChipBar: ({
    plan,
    onChange,
  }: {
    plan: import('../api/types').Plan;
    onChange: (p: import('../api/types').Plan) => void;
  }) => <button onClick={() => onChange({ ...plan, metric: 'income' })}>chip-edit</button>,
}));
// The chart/table renderer pulls in recharts, which needs real layout to do
// anything useful in jsdom — replaced with a marker so tests can assert
// whether a result actually got a chart, without depending on recharts' DOM.
vi.mock('../insights/renderers/ResultRenderer', () => ({
  ResultRenderer: () => <div data-testid="result-renderer" />,
}));

const deleteInsightMutate = vi.hoisted(() => vi.fn());
const executePlanMutate = vi.hoisted(() => vi.fn());
const useInsightMock = vi.hoisted(() => vi.fn());

beforeEach(() => {
  deleteInsightMutate.mockClear();
  executePlanMutate.mockReset();
  useInsightMock.mockReset();
  useInsightMock.mockReturnValue({ data: undefined, isError: false, error: null });
});

vi.mock('../api/hooks', () => ({
  useActiveProfile: () => ({ id: 1, name: 'Household', defaultCurrency: 'PLN' }),
  useCategories: () => ({ data: [] }),
  useCreateInsight: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateInsight: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteInsight: () => ({ mutate: deleteInsightMutate, isPending: false }),
  useExecutePlan: () => ({ mutate: executePlanMutate, isPending: false, error: null }),
  useInsight: (id: number) => useInsightMock(id),
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

test('J15: a zero-match run renders the empty-answer message, not a blank chart', async () => {
  // The executor answers "nothing matched" in one of two shapes: no result
  // entry when the plan pins no currency, or — as here, since the explorer
  // always pins one — one entry for the pinned currency with an empty
  // groups/points/series array inside it (docs/INSIGHTS.md → "Empty data is a
  // result, not an error").
  executePlanMutate.mockImplementation((_plan, { onSuccess }) => {
    onSuccess({
      plan: {
        version: 1,
        metric: 'spend',
        filters: { currency: 'PLN' },
        groupBy: 'category',
        interval: null,
        range: { type: 'lastMonths', n: 1 },
      },
      results: [{ currency: 'PLN', shape: 'breakdown', groups: [] }],
      meta: { truncatedGroups: false },
    });
  });
  const user = userEvent.setup();
  renderWithProviders(<Insights />);
  await user.click(screen.getByRole('button', { name: 'Run' }));

  expect(screen.getByText(/No transactions match this plan/)).toBeInTheDocument();
  expect(screen.queryByTestId('result-renderer')).not.toBeInTheDocument();
});

test('J15 regression guard: a matching run still renders its chart, not the empty message', async () => {
  executePlanMutate.mockImplementation((_plan, { onSuccess }) => {
    onSuccess({
      plan: {
        version: 1,
        metric: 'spend',
        filters: { currency: 'PLN' },
        groupBy: 'category',
        interval: null,
        range: { type: 'lastMonths', n: 1 },
      },
      results: [
        {
          currency: 'PLN',
          shape: 'breakdown',
          groups: [{ key: 'a', label: 'A', value: '10.0000' }],
        },
      ],
      meta: { truncatedGroups: false },
    });
  });
  const user = userEvent.setup();
  renderWithProviders(<Insights />);
  await user.click(screen.getByRole('button', { name: 'Run' }));

  expect(screen.getByTestId('result-renderer')).toBeInTheDocument();
  expect(screen.queryByText(/No transactions match this plan/)).not.toBeInTheDocument();
});

test('a chip edit after Run keeps the last result on screen', async () => {
  executePlanMutate.mockImplementation((_plan, { onSuccess }) => {
    onSuccess({
      plan: {
        version: 1,
        metric: 'net',
        filters: { currency: 'PLN' },
        groupBy: 'category',
        interval: null,
        range: { type: 'lastMonths', n: 1 },
      },
      results: [
        {
          currency: 'PLN',
          shape: 'breakdown',
          groups: [{ key: 'a', label: 'A', value: '10.0000' }],
        },
      ],
      meta: { truncatedGroups: false },
    });
  });
  const user = userEvent.setup();
  renderWithProviders(<Insights />);
  await user.click(screen.getByRole('button', { name: 'Run' }));

  // Editing a chip changes the *live* plan only. It must not clear
  // lastEnvelope: the chart keeps showing the last Run.
  await user.click(screen.getByRole('button', { name: 'chip-edit' }));

  expect(screen.getByTestId('result-renderer')).toBeInTheDocument();
});

test('J10: a deep link to a deleted insight shows a visible message, not a silent default plan', () => {
  useInsightMock.mockReturnValue({
    data: undefined,
    isError: true,
    error: new ApiError(404, { type: '/errors/not-found', detail: 'No such insight.' }),
  });
  renderWithProviders(<Insights />, { route: '/insights?insight=99999' });

  expect(screen.getByText(/no longer exists/i)).toBeInTheDocument();
});

test('J10: a non-404 failure loading a saved insight gets a generic message, not "no longer exists"', () => {
  useInsightMock.mockReturnValue({
    data: undefined,
    isError: true,
    error: new ApiError(503, { type: '/errors/analytics-unavailable', detail: 'Down.' }),
  });
  renderWithProviders(<Insights />, { route: '/insights?insight=5' });

  expect(screen.queryByText(/no longer exists/i)).not.toBeInTheDocument();
  expect(screen.getByText(/couldn.t load this saved insight/i)).toBeInTheDocument();
});
