// The test server: the fake behind the network seam (the global fetch) for every unit test.
// See ARCHITECTURE.md §4, "Why unit tests fake the network, not the hooks".
//
// A test declares the answers it needs with `server.use(http.get('/api/...', ...))`, before
// the render or action that sends the request. Two default answers are always present: the
// profile list (GET /api/profiles, the one "Household" Profile) and, last, a catch-all.
// src/test/setup.ts starts the server, remembers "Household" as the Active profile before
// each test, and after each test unmounts, resets to the defaults, forgets the Active
// profile and fails the test if any request went unanswered.
//
// Rules:
// - Nothing a unit test does ever reaches a socket. Never use msw's passthrough() or
//   bypass(), and never call server.resetHandlers() with arguments: that replaces the
//   defaults, catch-all included.
// - Every JSON answer names its wire type: HttpResponse.json<CategoryNode[]>(...). Without the
//   type argument the body is not checked at all (it is NoInfer). The check runs in tsc -b
//   (npm run build), not in npm test.
// - A test about having no Active profile, or another one, says so itself before it renders:
//   forgetProfile() or rememberProfile(id) from api/activeProfile.
// - Handlers are canned answers. They may branch on the one request parameter a test is
//   about, never re-implement backend rules, and never remember an earlier request: this is
//   not a fake backend. When an answer changes during a test, the test says so: it declares
//   the new answer with `server.use(...)` right before the action that asks again, or declares
//   the first answer with `{ once: true }` on top of the one that follows.
// - Real timers only; a pending state comes from an answer the test holds open, then
//   releases. No concurrent tests.
// - Override the profile list before rendering (`answerProfiles`): the route gates wait for
//   its first answer. The picker asks for the list again each time it opens.

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { FieldError } from '../api/client';
import type { ProfileResponse } from '../api/types';
import { profile } from './fixtures';

const unanswered: string[] = [];

export const server = setupServer(
  http.get('/api/profiles', () => HttpResponse.json<ProfileResponse[]>([profile()])),
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

/** From now on the profile list answers with exactly these Profiles (none: an empty instance). */
export function answerProfiles(...profiles: ProfileResponse[]): void {
  server.use(http.get('/api/profiles', () => HttpResponse.json<ProfileResponse[]>(profiles)));
}

/** The Problem types the backend sends: docs/API.md "Errors", and the `500` answer's `internal`. */
export type ProblemType =
  | 'analytics-unavailable'
  | 'backup-invalid'
  | 'backup-too-large'
  | 'budget-exists'
  | 'category-cycle'
  | 'category-depth-exceeded'
  | 'category-in-use'
  | 'category-name-taken'
  | 'conflict'
  | 'insight-name-taken'
  | 'internal'
  | 'invalid-backup-file'
  | 'invalid-plan'
  | 'invalid-request'
  | 'no-active-profile'
  | 'not-found'
  | 'profile-header-missing'
  | 'profile-name-taken'
  | 'subscription-name-taken'
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
