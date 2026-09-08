import { fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AiSearchBox } from './AiSearchBox';

// Step 3b: Task 16 raised the backend's analytics read timeout to 130s for a slow local
// model. client.ts sets no client-side timeout to match (that would recreate the same bug on
// the browser side) — so the UI needs its own progressive feedback instead: a "still working"
// message once a call has been pending a while, plus a Cancel that actually aborts it.

const interpretMutate = vi.hoisted(() => vi.fn());
const interpretCancel = vi.hoisted(() => vi.fn());
const useInterpretMock = vi.hoisted(() => vi.fn());

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

test('a pending call shows a still-working hint with Cancel once it runs long, and Cancel aborts it', () => {
  useInterpretMock.mockReturnValue({
    mutate: interpretMutate,
    isPending: true,
    cancel: interpretCancel,
  });
  vi.useFakeTimers();
  render(<AiSearchBox onDraft={vi.fn()} />);

  expect(screen.getByRole('button', { name: 'Thinking…' })).toBeInTheDocument();
  expect(screen.queryByText(/still working/i)).not.toBeInTheDocument();

  act(() => {
    vi.advanceTimersByTime(5000);
  });

  expect(screen.getByText(/still working/i)).toBeInTheDocument();
  expect(screen.getByText(/local models can be slow/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
  expect(interpretCancel).toHaveBeenCalledTimes(1);
});

test('a cancelled (aborted) request does not surface an error message', () => {
  interpretMutate.mockImplementation((_vars, opts) => {
    opts.onError(new DOMException('The user aborted a request.', 'AbortError'));
  });
  render(<AiSearchBox onDraft={vi.fn()} />);

  fireEvent.change(screen.getByLabelText('Ask about your money'), {
    target: { value: 'how much on groceries' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
