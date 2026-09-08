import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Caption } from './Caption';

// Same Step 3b feedback as AiSearchBox/FollowUp, on the "explain" (narrate) call.

const narrateMutate = vi.hoisted(() => vi.fn());
const narrateCancel = vi.hoisted(() => vi.fn());
const useNarrateMock = vi.hoisted(() => vi.fn());

const plan = {
  version: 1,
  metric: 'spend' as const,
  filters: { currency: 'PLN' },
  groupBy: null,
  interval: null,
  range: { type: 'lastMonths' as const, n: 1 },
};

beforeEach(() => {
  narrateMutate.mockReset();
  narrateCancel.mockReset();
  useNarrateMock.mockReset().mockReturnValue({
    mutate: narrateMutate,
    isPending: false,
    cancel: narrateCancel,
    data: undefined,
    variables: undefined,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

vi.mock('../api/hooks', () => ({
  useNarrate: () => useNarrateMock(),
}));

test('a pending "explain" call shows a still-working hint with Cancel once it runs long', () => {
  useNarrateMock.mockReturnValue({
    mutate: narrateMutate,
    isPending: true,
    cancel: narrateCancel,
    data: undefined,
    variables: plan,
  });
  vi.useFakeTimers();
  render(<Caption plan={plan} />);

  expect(screen.queryByText(/still working/i)).not.toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(screen.getByText(/still working/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
  expect(narrateCancel).toHaveBeenCalledTimes(1);
});
