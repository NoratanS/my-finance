import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useSlowPending } from './useSlowPending';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test('stays false until the delay elapses while still pending', () => {
  const { result } = renderHook(() => useSlowPending(true, 5000));
  expect(result.current).toBe(false);

  act(() => {
    vi.advanceTimersByTime(4999);
  });
  expect(result.current).toBe(false);

  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(result.current).toBe(true);
});

test('resets the moment the call stops being pending, even before the delay fires', () => {
  const { result, rerender } = renderHook(({ pending }) => useSlowPending(pending, 5000), {
    initialProps: { pending: true },
  });

  act(() => {
    vi.advanceTimersByTime(2000);
  });
  rerender({ pending: false });
  expect(result.current).toBe(false);

  // No stray timer firing late and flipping it back on.
  act(() => {
    vi.advanceTimersByTime(10000);
  });
  expect(result.current).toBe(false);
});

test('never fires for a call that was never pending', () => {
  const { result } = renderHook(() => useSlowPending(false, 5000));

  act(() => {
    vi.advanceTimersByTime(10000);
  });
  expect(result.current).toBe(false);
});
