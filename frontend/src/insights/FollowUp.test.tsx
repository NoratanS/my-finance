import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { FollowUp } from './FollowUp';

// Same Step 3b feedback as AiSearchBox, on FollowUp's own interpret call.

const interpretMutate = vi.hoisted(() => vi.fn());
const interpretCancel = vi.hoisted(() => vi.fn());
const useInterpretMock = vi.hoisted(() => vi.fn());

const currentPlan = {
  version: 1,
  metric: 'spend' as const,
  filters: { currency: 'PLN' },
  groupBy: null,
  interval: null,
  range: { type: 'lastMonths' as const, n: 1 },
};

beforeEach(() => {
  interpretMutate.mockReset();
  interpretCancel.mockReset();
  useInterpretMock
    .mockReset()
    .mockReturnValue({ mutate: interpretMutate, isPending: false, cancel: interpretCancel });
});

afterEach(() => {
  vi.useRealTimers();
});

vi.mock('../api/hooks', () => ({
  useAiCapabilities: () => ({ data: { interpret: true, model: 'test-model' } }),
  useInterpret: () => useInterpretMock(),
}));

test('a pending follow-up shows a still-working hint with Cancel once it runs long', () => {
  useInterpretMock.mockReturnValue({
    mutate: interpretMutate,
    isPending: true,
    cancel: interpretCancel,
  });
  vi.useFakeTimers();
  render(<FollowUp currentPlan={currentPlan} onPlan={vi.fn()} />);

  expect(screen.queryByText(/still working/i)).not.toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(screen.getByText(/still working/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
  expect(interpretCancel).toHaveBeenCalledTimes(1);
});

test('a cancelled (aborted) follow-up does not surface an error message', () => {
  interpretMutate.mockImplementation((_vars, opts) => {
    opts.onError(new DOMException('The user aborted a request.', 'AbortError'));
  });
  render(<FollowUp currentPlan={currentPlan} onPlan={vi.fn()} />);

  fireEvent.change(screen.getByLabelText('Follow-up question'), {
    target: { value: 'and only this year?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'refine' }));

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
