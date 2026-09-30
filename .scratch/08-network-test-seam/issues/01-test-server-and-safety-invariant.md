# 01: A shared test server answers every request, and nothing reaches a socket

**What to build:** every frontend unit test runs with a fake network. A shared test server answers the Session by default and answers anything else nobody declared with a network error, recording it; a test that leaves a request unanswered fails with the method and URL named, and the next test still starts clean. The unit-test origin is a reserved `.invalid` name instead of `localhost:3000`, where the shipped app is published, so a test run next to a running instance can never read or change its data. Every test starts with the default answers only, a fresh query client, the CSRF cookie planted and real timers. The decision and its reasons are written in ARCHITECTURE.md, and a lessons entry maps it onto `httpx.MockTransport`. The existing tests stay unchanged and green.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The unit-test origin is a `.invalid` name, proven by a test
- [x] A request no test answered never opens a connection (proven against a real local listener), including one whose handler returns nothing
- [x] An unanswered request fails its test, naming method and URL; the test after it starts with nothing mounted and no leftover handlers (planted once and seen)
- [x] The default Session answer is a signed-in User with the "Household" (PLN) Profile active, built fresh per request by a typed wire-fixture builder
- [x] One Problem answer helper serves `application/problem+json` in the backend's shape
- [x] The CSRF cookie is present at the start of every test
- [x] ARCHITECTURE.md §4 carries "Why unit tests fake the network, not the hooks"; the lessons entry is written
- [x] `npm test` wall time is recorded before and after
- [x] lint, format, test and build stay green, with every existing test unchanged

## Comments

- **Safety proof as a test.** The invariant is proven by `src/test/server.test.ts` (seven tests),
  a test file the spec does not list: a real `node:http` listener on a free `127.0.0.1` port stands
  in for a running instance and counts connections. It sits next to the test server, like
  `renderWithProviders.test.tsx` next to its helper.
- **Planted defects, each seen failing and reverted:**
  - catch-all answering `passthrough()` instead of a network error: "never reaches a socket" and
    "a handler that returns nothing falls through" fail — the fetch really reached the listener
    (`200 OK`);
  - `onUnhandledRequest: 'bypass'`: "without the catch-all, the error strategy still never performs
    the request" fails;
  - jsdom origin option removed: the origin test fails (`http://localhost:3000` received) and the
    recorded URL no longer matches;
  - a throwaway file with a request nobody answered, and a handler that returns nothing: both fail
    with `Unanswered request(s): GET http://my-finance.invalid/api/budgets`; the test after them
    finds nothing mounted and the first test's handler gone.
- **Wall time of `npm test`** (five alternating runs each, same machine): before 3.37–4.17 s
  (median 3.67 s, 185 tests); after 3.79–4.18 s (median 4.07 s, 192 tests). About +0.4 s, including
  the seven new tests and msw's start per file.
- **`/errors/internal`.** The backend's `500` Problem type is not listed in API.md "Errors"; the
  Problem answer's type list includes it because the backend really sends it.
