import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { rememberProfile } from '../api/activeProfile';
import { profile } from './fixtures';
import { server, takeUnansweredRequests } from './server';

// The network is fake in every unit test file (src/test/server.ts). 'error' never performs an
// unhandled request; the catch-all answers first anyway, and this stays as the second line.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

beforeEach(() => {
  takeUnansweredRequests();
  // The state of a browser that has already chosen the default list's one Profile.
  rememberProfile(profile().id);
});

// One hook, in this order: Vitest runs after-each hooks one by one and a throwing hook skips
// the ones after it, so the unanswered-request check comes last, after the unmount, the
// handler reset and the forgetting, and a failure never leaks into the next test.
afterEach(() => {
  cleanup();
  server.resetHandlers();
  window.localStorage.clear();
  const unanswered = takeUnansweredRequests();
  if (unanswered.length > 0) {
    throw new Error(
      `Unanswered request(s):\n${unanswered.map((request) => `  ${request}`).join('\n')}\n` +
        'Declare each answer in this test with server.use(...) (src/test/server.ts).',
    );
  }
});

afterAll(() => server.close());
