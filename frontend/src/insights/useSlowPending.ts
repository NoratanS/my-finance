import { useEffect, useState } from 'react';

/** How long a pending AI call gets before the UI admits it might be a while. */
const SLOW_AFTER_MS = 5000;

/**
 * True once a pending call has been running longer than a few seconds. The
 * backend's analytics read timeout is 130s (Task 16) and the client
 * deliberately sets no shorter one (Step 3b — that would recreate the same
 * "misreported as broken" bug on the browser side), so a silent spinner can
 * sit there for over two minutes with nothing to say. This is the signal
 * `interpret`/`narrate` callers use to switch from "thinking…" to an explicit
 * "still working" message once it's actually true.
 */
export function useSlowPending(isPending: boolean, delayMs: number = SLOW_AFTER_MS): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!isPending) return undefined;
    const timer = setTimeout(() => setSlow(true), delayMs);
    // Runs on the next isPending flip (or unmount) — clearing the timer and
    // resetting `slow` from the cleanup, not the effect body, keeps this a
    // callback reacting to a change rather than a synchronous render-time set.
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [isPending, delayMs]);

  return slow;
}
