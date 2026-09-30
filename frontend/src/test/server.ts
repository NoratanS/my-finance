// The test server: the fake behind the network seam (the global fetch) for every unit test.
// See ARCHITECTURE.md §4, "Why unit tests fake the network, not the hooks".
//
// A test declares the answers it needs with `server.use(http.get('/api/...', ...))`, before
// the render or action that sends the request. Two default answers are always present: the
// Session (GET /api/auth/me, a signed-in User with the "Household" Profile active) and, last,
// a catch-all. src/test/setup.ts starts the server, plants the XSRF-TOKEN cookie before each
// test, and after each test unmounts, resets to the defaults and fails the test if any
// request went unanswered.
//
// Rules:
// - Nothing a unit test does ever reaches a socket. Never use msw's passthrough() or
//   bypass(), and never call server.resetHandlers() with arguments: that replaces the
//   defaults, catch-all included.
// - Every JSON answer names its wire type: HttpResponse.json<CategoryNode[]>(...). Without the
//   type argument the body is not checked at all (it is NoInfer). The check runs in tsc -b
//   (npm run build), not in npm test.
// - Handlers never send Set-Cookie. A test about a missing CSRF cookie deletes it itself.
// - Handlers are canned answers. They may branch on the one request parameter a test is
//   about, never re-implement backend rules. This is not a fake backend.
// - Real timers only; a pending state comes from an answer the test holds open, then
//   releases. No concurrent tests.
// - Override the Session before rendering: it is fetched once per query client.

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { FieldError } from '../api/client';
import type { SessionResponse } from '../api/types';
import { session } from './fixtures';

/** The value planted as the XSRF-TOKEN cookie before each test: obviously not a real token. */
export const XSRF_TOKEN = 'test-xsrf-token';

const unanswered: string[] = [];

export const server = setupServer(
  http.get('/api/auth/me', () => HttpResponse.json<SessionResponse>(session())),
  // Last: anything no other handler answered, including a handler that returned nothing
  // (msw falls through to later handlers before it would pass a request through).
  http.all('*', ({ request }) => {
    unanswered.push(`${request.method} ${request.url}`);
    return HttpResponse.error();
  }),
);

/** Returns the requests the catch-all answered since the last call, and forgets them. */
export function takeUnansweredRequests(): string[] {
  return unanswered.splice(0);
}

/**
 * The Problem types the backend sends: docs/API.md "Errors", the security layer's
 * `unauthenticated` and `forbidden`, and the `500` answer's `internal`.
 */
export type ProblemType =
  | 'analytics-unavailable'
  | 'auth-disabled'
  | 'backup-invalid'
  | 'backup-too-large'
  | 'bad-credentials'
  | 'budget-exists'
  | 'category-cycle'
  | 'category-depth-exceeded'
  | 'category-in-use'
  | 'category-name-taken'
  | 'conflict'
  | 'email-taken'
  | 'forbidden'
  | 'insight-name-taken'
  | 'internal'
  | 'invalid-backup-file'
  | 'invalid-plan'
  | 'invalid-request'
  | 'last-profile'
  | 'no-active-profile'
  | 'not-found'
  | 'passwordless-only'
  | 'profile-name-taken'
  | 'subscription-name-taken'
  | 'unauthenticated'
  | 'validation-failed';

/** RFC 9457, in the backend's shape; extension members (problems, maxDepth, ...) sit beside. */
interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail: string;
  errors?: FieldError[];
  [extension: string]: unknown;
}

/** An RFC 9457 Problem answer, served as application/problem+json. The title defaults to the type. */
export function problem(
  status: number,
  type: ProblemType,
  detail: string,
  options: { title?: string; errors?: FieldError[]; extensions?: Record<string, unknown> } = {},
) {
  const body: ProblemBody = {
    ...options.extensions,
    type: `/errors/${type}`,
    title: options.title ?? type,
    status,
    detail,
  };
  if (options.errors) body.errors = options.errors;
  return HttpResponse.json<ProblemBody>(body, {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}
