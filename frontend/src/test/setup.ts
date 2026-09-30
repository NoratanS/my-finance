import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { server, takeUnansweredRequests, XSRF_TOKEN } from './server';

// The network is fake in every unit test file (src/test/server.ts). 'error' never performs an
// unhandled request; the catch-all answers first anyway, and this stays as the second line.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

beforeEach(() => {
  takeUnansweredRequests();
  // The state after the Session bootstrap in production, where GET /api/auth/me sets it.
  document.cookie = `XSRF-TOKEN=${XSRF_TOKEN}; path=/`;
});

// One hook, in this order: Vitest runs after-each hooks one by one and a throwing hook skips
// the ones after it, so the unanswered-request check comes last, after the unmount and the
// handler reset, and a failure never leaks into the next test.
afterEach(() => {
  cleanup();
  server.resetHandlers();
  const unanswered = takeUnansweredRequests();
  if (unanswered.length > 0) {
    throw new Error(
      `Unanswered request(s):\n${unanswered.map((request) => `  ${request}`).join('\n')}\n` +
        'Declare each answer in this test with server.use(...) (src/test/server.ts).',
    );
  }
});

afterAll(() => server.close());
