# Move the frontend's test seam to the network

Status: ready-for-agent
Candidate: 8 — Move the test seam to the network
Strength: Worth exploring
Depends on: none

## Problem Statement

The owner and every future contributor rely on the frontend's unit tests to catch regressions. Those tests
do not run the code where the frontend's data behaviour lives.

Twelve of the fifteen unit test files replace the whole hooks module with hand-built objects, such as "a
mutate function and a pending flag". As a result, 83 of the 93 unit tests never execute a hook, a query
key, a cache refresh after a mutation, the client's CSRF header, its RFC 9457 Problem parsing, or its
session-expiry events. Only one test runs a real hook, and it stubs the client, so no unit test exercises
the request path at all.

The consequence is already on record. The pinned insight tiles on the dashboard were not refreshed after a
Transaction changed, and that bug survived every review, because the helper that should have refreshed them
never executed in any test.

Coverage today:
- one of the thirty refresh edges has a test;
- the client module has none;
- the route gates' handling of a Session that expires, or loses its Active profile mid-use, has no test at
  any level;
- the connected components that screens mock away have no test of their own.

The stubs also make the suite brittle. A test must know the exact hook names a screen imports and TanStack
Query's result shape, so renaming or splitting a hook breaks tests even when behaviour is unchanged.

The fixtures are untyped and have drifted from the wire contract:
- a saved Plan fixture carries a field that does not exist;
- Category roots have depth 0 in five files and depth 1 in two, while the app counts depth from 1;
- Subscription fixtures lack required fields;
- Money amounts use two decimals instead of the four the wire carries;
- one error fixture uses a Problem type the backend never sends.

The same signed-in Session and Active profile are re-declared in up to seven files.

The tool meant to fix this, `msw`, was never wired up. The maintenance run adopted it so that "hooks are
tested through real fetch rather than a stubbed module".

Wiring it naively would also create a new hazard. Once `msw` is active, the client's relative `/api` URLs
resolve against the test environment's default origin, `localhost:3000`. That is exactly where the shipped
stack publishes the app. A request that `msw` passed through could therefore reach the owner's running
instance, where passwordless mode authenticates every request as the Local account. Today's unit tests are
network-safe only by accident: their relative URLs cannot resolve at all.

## Solution

Unit tests put their fake at the network. A shared test server built on `msw` answers every HTTP request
the frontend makes. Screens, hooks, query keys, cache refreshes, the client and the route gates all run
exactly as in production. The only thing a test arranges is which answers the backend gives. The same seam
already has a second adapter: the e2e suite, which answers with the real backend.

For the owner, this brings three things:
- tests that fail when a refresh, a CSRF header, a Problem's journey to the screen, or a redirect breaks;
- fixtures that fail the build when they drift from the wire types;
- a guarantee, enforced four independent ways, that nothing a unit test does ever reaches a socket. Running
  the tests next to a live instance is safe.

For a contributor, there is one rule to know:
- pure logic is tested by calling it;
- a component that only takes props is rendered with props;
- anything that reaches the server is tested by declaring the answers it needs.

A missing answer fails the test and names the method and URL. A lint rule stops new mocks of the hooks or
client modules, and asks every JSON answer to name its wire type. The existing tests keep working untouched.
A test file that mocks the hooks converts to the network seam, as a unit and in its own commit, the first
time someone needs to add a test to it.

The first modules brought under test are the ones with no tests today:
- the client module;
- the route gates and the global Session handling;
- the hooks' refresh contract, which replaces the one existing hook test.

No production code changes, and the app behaves exactly as before.

## User Stories

1. As the owner, I want screen tests to run the real hooks, query keys and cache refreshes, so that a
   missing refresh like the pinned-tile one fails a test instead of surviving review.
2. As the owner, I want the client module's CSRF header, Problem parsing, `204` handling and session events
   covered by tests, so that the one module every request passes through cannot break silently.
3. As the owner, I want a Session that expires mid-use to be proven to land on the sign-in screen, so that a
   regression in that path is caught before a user meets a broken page.
4. As the owner, I want losing the Active profile mid-use to be proven to land on the profile picker, so
   that a Profile deleted in another tab never leaves a screen stuck.
5. As the owner, I want every branch of the three route gates tested, so that signed-out, no-profile and
   signed-in visitors always reach the right screen.
6. As the owner, I want "Log out" tested end to end in the unit suite, so that the sign-out request, the
   cleared state and the redirect stay correct together.
7. As the owner, I want every mutation family's refresh contract tested, so that adding, editing or deleting
   something refreshes every view that shows it.
8. As the owner, I want `npm test` never to send a request to my running instance, so that a buggy test can
   neither read nor change my real data, including in passwordless mode.
9. As the owner, I want a request no test answered to fail that test with the method and URL named, so that
   I know exactly which answer is missing.
10. As the owner, I want a fixture with a misspelt or missing field to fail `npm run build` and CI, so that
    fixtures cannot drift from the wire types unnoticed.
11. As the owner, I want Category fixtures to take their depth from the tree's shape, so that a 0-based
    depth can never creep back in.
12. As the owner, I want Money amounts in fixtures to default to the wire format (a decimal string at scale
    4), so that tests see what the backend sends.
13. As the owner, I want Problem fixtures to use the types the backend actually sends, so that error tests
    do not depend on types that do not exist.
14. As the owner, I want the existing, passing tests kept as they are, so that adopting the network seam
    costs no wholesale rewrite.
15. As the owner, I want the number of hook-mocked test files to shrink over time and never grow, so that
    the two styles do not coexist forever.
16. As the owner, I want the `msw` dependency, installed for exactly this, to finally earn its place.
17. As the owner, I want this work to change no production code, so that the app and its bundle are
    unaffected.
18. As the owner, I want the decision and its reasons written in ARCHITECTURE.md, so that nobody has to
    rediscover them from commit history.
19. As the owner learning this ecosystem, I want a LESSONS entry comparing `msw` with `httpx.MockTransport`,
    so that the idea maps onto what I already know from Python.
20. As the owner, I want the test suite to stay fast and free of flakiness, so that CI stays trustworthy.
21. As the owner, I want the runtime cost measured when the harness lands, so that "cheap" is a number and
    not a claim.
22. As the owner, I want every step to be a separately shippable change that leaves lint, format, tests and
    build green, so that the work can stop after any step.
23. As a future contributor, I want a one-look rule for which seam a new test uses, so that I never have to
    choose between hook mocks and network answers by guesswork.
24. As a future contributor, I want pure logic tested by calling it directly, so that a simple test needs no
    server set-up.
25. As a future contributor, I want a component that only takes props tested by rendering it with props, so
    that testing a dialog never involves a server.
26. As a future contributor, I want a lint error when I mock the hooks or client module in a new test, so
    that the rule reaches me even if I never read the docs.
27. As a future contributor, I want a lint error when a JSON answer does not name its wire type, so that my
    fixture is checked by the compiler.
28. As a future contributor, I want a signed-in Session with an Active profile answered for me by default,
    so that a screen test declares only the screen's own requests.
29. As a future contributor, I want to override the Session in one place for signed-out, passwordless or
    no-active-profile scenarios, so that those states are easy to set up.
30. As a future contributor, I want one helper that answers with an RFC 9457 Problem, so that error-path
    tests look like the backend's real answers.
31. As a future contributor, I want to simulate the backend being unreachable, so that I can test what the
    user sees when the backend is down.
32. As a future contributor, I want to assert the exact body a form sends over the wire, so that rules like
    "Money is never a JSON number" are checked where they matter.
33. As a future contributor, I want to assert what the screen shows after a mutation, such as the refreshed
    list, so that I test what the user sees rather than which function was called.
34. As a future contributor, I want tests that survive a hook being renamed or split, so that refactoring
    the hooks does not break unrelated screen tests.
35. As a future contributor, I want every test to start from a clean slate (default answers only, a fresh
    query cache, the CSRF cookie present, real timers), so that test order never matters.
36. As a future contributor, I want loading states tested with an answer the test holds open, not a timed
    delay, so that such tests are deterministic.
37. As a future contributor, I want shared builders for common wire objects and my scenario data kept in my
    test, so that tests stay short and readable.
38. As a future contributor, I want to know that mocking a chart component jsdom cannot render is fine, but
    mocking a connected child to skip its requests is not, so that I don't hide part of a screen's network
    conversation.
39. As a future contributor converting a legacy test file, I want a clear procedure (its own commit, same
    test names, same assertions wherever possible), so that reviewers can see nothing was lost.
40. As a future contributor editing an existing hook-mocked test in place, I want that to stay allowed, so
    that a one-line text change does not force a file conversion.
41. As a future contributor, I want the Transactions search-debounce tests documented as the one known hard
    case, so that I do not break them when that file converts.
42. As a future contributor (human or AI agent), I want the rules stated in ARCHITECTURE.md, in the
    test-support modules' own comments and in lint messages, so that I follow them without the
    conversation that produced them.
43. As a reviewer, I want every new test shown failing once against a deliberately planted defect, so that
    no test in this change is one that cannot fail.
44. As a reviewer, I want the lint allowlist to name every remaining hook-mocked file, so that the
    migration's progress is visible in one place.
45. As a reviewer, I want the one replaced test deleted in the same change that replaces it, so that the
    suite never carries two tests of one behaviour.
46. As a reviewer, I want the step that introduces the harness to report the suite's wall time before and
    after, so that I can judge its cost.
47. As a self-hosting user, I want an expired Session to take me to the sign-in screen rather than a broken
    page, and that behaviour protected by tests.
48. As a self-hosting user, I want losing my Active profile to take me to the profile picker, with a test
    guarding it.
49. As a self-hosting user, I want pinned tiles, Budgets and lists to refresh after I add, edit or delete a
    Transaction, and tests to guarantee it.
50. As a self-hosting user, I want every change I make to carry the CSRF token, and tests to keep it that
    way.
51. As a self-hosting user who also runs the test suite on the machine that hosts my instance, I want a test
    run never to contact that instance, so that my data is safe.
52. As a self-hosting user, I want this work to leave the app's behaviour exactly as it is.

## Implementation Decisions

**Scope: no production code changes.** The change touches only:
- the test-support package (next to the existing render helper): a new **test server** module and a new
  **wire fixtures** module;
- the Vitest setup file;
- one option in the Vitest configuration (the jsdom URL);
- one rule in the ESLint configuration, for test files;
- test files: three new ones, next to the modules they test, and one deleted;
- documents: ARCHITECTURE.md §4, API.md "Errors" (recommended), and a LESSONS entry.

No endpoint, field, status code or Problem type changes. The production bundle is unaffected.

**The seam.** The seam is the global `fetch`: the boundary between the client module and the backend's HTTP
interface (the wire contract in API.md).
- Behind it: the Spring backend in production, `msw` handlers in unit tests, the real backend in e2e.
- In front of it: everything in the frontend, which runs for real in a network-seam test.
- `msw` patches the global `fetch`, so the client needs no injected transport and no new production seam
  appears.
- The hooks-module seam that today's tests use is retired incrementally, under the policy below.

**The test server: its interface.** This module is what every network-seam test depends on.
- **Operations.**
  - A test declares its answers with the server's "use" operation: `msw` HTTP handlers, one per method and
    `/api` path, written as the client writes them (relative paths).
  - The server holds two **default answers**:
    - the **session answer**, for `GET /api/auth/me`;
    - the **catch-all**, placed last, which answers anything no other handler answered.
  - It exports the **Problem answer** helper and the typed fixture builders (next section).
- **Invariants.**
  - Every test starts with only the default answers, a fresh query client, the CSRF cookie present, and real
    timers.
  - Nothing a unit test does ever reaches a socket.
  - Every request is answered by a handler that the test, or the defaults, declared. Otherwise the test fails
    and names the request.
  - JSON bodies are typed against the wire types module.
  - Handlers never set cookies.
  - Handlers are canned answers. They may branch on the one request parameter a test is about. They never
    re-implement backend rules (filtering, aggregation, validation). This is not a fake backend.
- **Ordering constraints.**
  - Declare answers before the render or action that sends the request. A handler applies only to requests
    that start after it was added.
  - Override the session answer before rendering. The Session is fetched once per query client.
  - Delete the CSRF cookie, when a test needs it gone, before acting.
  - Release a held-open answer before the test ends.
  - Tear-down order is fixed. After each test, the rendered tree is unmounted and runtime handlers are reset
    *before* the unanswered-request check runs, so a failed check never leaks into the next test.
- **Error modes.**
  - An unanswered request fails the test. The failure lists method and URL and says to declare the answer in
    that test. The app itself sees a network error.
  - A handler that throws becomes a `500` answer for the app, and `msw` logs the error.
  - A wrongly shaped body is a TypeScript error in `npm run build`, CI and the editor, not a test failure.
- **Configuration.** None per file. The unanswered-request behaviour, the origin and the defaults are fixed
  for every unit test.
- **Forbidden in tests:** `msw`'s passthrough and bypass, resetting the handlers to an explicit list (which
  would drop the catch-all), `Set-Cookie`, concurrent tests in a network-seam file, and fake timers
  (exception below).

**Safety invariant and its four guards.** Nothing a unit test does ever reaches a socket. The guards are
independent:
1. `msw` runs with its "error" strategy for unhandled requests, which never performs them.
2. The catch-all answers every request that no earlier handler answered with a network error, and records
   it. This also covers the easy mistake of a handler that records a body but forgets to return an answer:
   `msw` falls through to later handlers before passing a request through, so the catch-all answers it.
3. The unit-test origin, the Vitest jsdom URL, becomes a reserved name under the `.invalid` top-level domain
   (RFC 6761), for example `my-finance.invalid`. It replaces the default `localhost:3000`, which is the
   address the shipped app is published on. Even a request that escaped the first two guards could not
   reach a local instance.
4. The "forbidden in tests" rules above.

While the catch-all is present, the "error" strategy never fires, because every request matches the
catch-all. It remains as the second line in case the catch-all is ever dropped. The catch-all and the origin
are what keep the guarantee if a future `msw` upgrade changes how unhandled requests are treated. `msw`
2.15 routes that option through a compatibility layer.

**Lifecycle: the Vitest setup file, for every test file.**
- Start the test server before a file's tests, with the "error" strategy.
- Before each test: clear the unanswered-request record and plant the CSRF cookie.
- After each test, in a single hook and in this order:
  1. unmount (the existing clean-up, folded into this hook);
  2. reset runtime handlers to the defaults;
  3. take a copy of the unanswered-request record and clear it;
  4. only then, fail the test if the copy was not empty.

  The order matters. Vitest runs after-each hooks one after another, and a hook that throws skips every hook
  after it. A check that ran first would leave the previous render mounted and its handlers active for the
  next test, turning one missing answer into a cascade of failures.
- After the file: close the server.

In files that mock the hooks, the server is present but receives no requests. Applying it everywhere makes
"the network is always fake in unit tests" a single rule. A future file can never forget to opt in.

**CSRF and cookies.**
- The setup plants `XSRF-TOKEN` into the document's cookies before each test, with a fixed, obviously fake
  value. This mirrors the state after the Session bootstrap in production.
- Handlers never send `Set-Cookie`. `msw` keeps such cookies in its own jar, persisted in the test
  environment's local storage, where the client never sees them and where they would leak across tests.
- A test about "no cookie, no header" deletes the cookie itself.

**Determinism rules.**
- Real timers only. TanStack Query delivers results to components through zero-delay timers, and Vitest's
  fake timers hold those back.
- A pending state comes from an answer the test holds open and then releases, never from a timed delay.
- The first assertion that depends on an answer is awaited (a `findBy` query or `waitFor`). Synchronous
  queries are used only after an awaited anchor.
- Retries stay off, and each test has a fresh query client. The existing render helper already guarantees
  both.
- No concurrency inside network-seam files.

**Typing against the wire contract.**
- Every JSON answer names the wire type the matching hook parses, taken from the wire types module
  (`api/types`). It is written as `msw`'s `HttpResponse.json` with an explicit type argument.
- That function takes its body type only from the type argument or from context, never from the literal.
  An answer without one is not checked at all.
- Handler-level response type parameters are not used, because they forbid a handler that answers with
  either success or a Problem.
- Fixture builders return wire types, so an answer that wraps a builder is checked even without the type
  argument.
- The check runs in `tsc -b` (`npm run build`, CI, the editor). `npm test` does not type-check.
- When candidate 15 derives the wire types from the generated OpenAPI schema, fixtures follow through the
  same import with no test edits. Any drift it exposes appears as compile errors, which is the intent.

**Default answers.** Exactly two: the session answer and the catch-all.

The default Session:
- a signed-in User in password Sign-in mode;
- one Profile, "Household", currency code PLN, id 1, which is the Active profile. This is the state the app
  layout guarantees before any screen renders, and it matches the most common legacy stub, so converted
  tests read the same.

Variants override the session answer inside a test:
- signed out: a `401` Problem;
- passwordless: Sign-in mode `NONE`, with the Local account `local@localhost`;
- no Active profile.

Nothing else is answered by default, so each test states its screen's network conversation.

**Wire fixtures.** Typed builders, each returning a fresh object with wire-format defaults. A test overrides
only the fields it is about. A builder enters test support when a second test file needs the same wire
object: the rule of two.
- **From step 1:** the Session and its Profile summary. The default session answer uses it, and every Session
  override builds on it. The Problem answer is shared the same way, by the client tests and the `App` tests,
  and it lives in the test server module (below).
- **Expected next, under the rule of two:**
  - a Category tree built from nesting, which derives `parentId` and a depth that starts at 1 for roots;
  - a Transaction (Money amount as a scale-4 decimal string, currency code, ISO date, ISO timestamp,
    Category reference);
  - a page of results, with totals consistent with its content unless overridden.

  Until a second file needs one of these, the single test that uses it declares the object locally, typed
  against the wire types module. The first conversions of legacy files are the expected second users.

Rules:
- Scenario-specific data, handlers and DOM helpers stay in the test file.
- No test mutates a shared object; the session answer builds a fresh Session for each request.

**Answer kinds.**
- **Problem answer**: status, type slug and detail, plus an optional title, optional field errors and
  optional extension members (`problems`, `maxDepth`, …). It is served as `application/problem+json` in the
  backend's shape, using the types the backend really sends: those listed in API.md "Errors", plus the
  security layer's `/errors/unauthenticated` (`401`) and `/errors/forbidden` (`403`). Its body shape is
  declared inside test support. If candidate 2 introduces a frontend Problem type, the helper adopts it.
- **Backend unreachable**: `msw`'s network-error answer.
- **Deletes and other `204`s**: an empty `204`.
- **A download**: a body plus `Content-Disposition`.
- **Named helpers**, such as "not found": only when the rule of two asks for them.

**Observing outcomes.**
1. What the user sees, first.
2. The request as the handler received it, recorded inside that handler, only for wire properties the user
   cannot see: body fields (amounts as strings, explicit nulls), query parameters, the CSRF header, the
   multipart part.
3. How many times a query asked the server again, only in the refresh-contract test.
4. Never cache state, hook names or spies on `mutate`.

**Test placement policy.** The rule a contributor follows when adding a test:
1. Does the module under test, or a child it renders, import the hooks or client module? If not, call it
   (pure logic) or render it with props. No `msw`, no mocks.
2. If it does, the new test uses the network seam, whatever it asserts.
3. The test goes in the module's own test file. If that file mocks the hooks module, first convert the whole
   file to the network seam in its own commit: same test names, the same assertions wherever the seam
   allows, no behaviour change. Then add the new test. `vi.mock` applies to a whole file, so one file cannot
   mix the two seams.
4. Editing an existing hook-mocked test in place stays allowed: new text, a changed expectation, deleting a
   test, or adding one stub entry because the screen now calls one more hook. Only a new test triggers a
   conversion.
5. Never add a new mock of the hooks or client modules.

**Component mocks in network-seam tests.**
- Allowed: mocking a presentational child that jsdom cannot render meaningfully, such as the Recharts-based
  result charts.
- Not allowed: mocking a connected child, one that reaches the server, to skip its requests. Those requests
  are part of the screen's network conversation, and the unanswered-request check exists to make the test
  declare them. A local list of quiet answers for a screen's background requests is fine.
- Navigation is observed by rendering probe routes, not by mocking the router's navigate function.

**Converting a legacy file.**
- Conversion happens only under rule 3. No conversion is scheduled by this spec.
- The file's drifted fixtures are replaced by typed builders at that moment. Further Notes lists them.
- The known hard case is the Transactions screen's two search-debounce tests. They pin a 300 ms boundary
  with fake timers and read the arguments of the mocked query hook. If that file ever converts, the
  converter either:
  - proves that Vitest's asynchronous timer advance settles both TanStack's zero-delay notifications and
    `msw`'s answer, and then asserts the request's `q` and `page` parameters at 299 ms and at 300 ms; or
  - keeps those two tests in a narrow hook-mocked file of their own, named for the timer they pin and left
    on the allowlist. That is the only sanctioned exception to "one file per module".

**Lint guard.** One restricted-syntax rule in the ESLint configuration, scoped to test files and test
support, with two parts:
- no `vi.mock` of the hooks or client modules, matched by module specifier, except in allowlisted files;
- every `HttpResponse.json` call carries a type argument.

Each message points at the ARCHITECTURE.md paragraph.
- The allowlist starts with the twelve hook-mocked files plus the existing invalidation test.
- A file leaves the allowlist in the same commit that converts or deletes it.
- The allowlist is the migration's visible progress. It is not a list to grow.

**The client module's tests**: a new test file next to the module, at the network seam.

For requests in general:
- a read sends no CSRF header and no JSON content type;
- every mutating method sends the cookie's decoded value in the CSRF header, and a JSON body with its content
  type;
- with no cookie, there is no header;
- a 2xx answer resolves to the parsed body;
- a `204` resolves without parsing;
- a Problem becomes an `ApiError` carrying status, type, title, detail, field errors and extension members;
- a non-JSON error body, such as a proxy's HTML `502`, gives the fallback detail and the unknown type;
- a network failure rejects with an error that is not an `ApiError`.

For the Session events:
- `401` fires "unauthenticated";
- `409` `no-active-profile` fires "no-active-profile";
- a `409` with any other type fires nothing;
- the opt-out used by the auth endpoints suppresses both.

For the backup download:
- the file and the filename from `Content-Disposition`;
- the fallback filename;
- the CSRF header;
- a Problem.

For the backup upload:
- a multipart body whose part named `file` carries the file's content;
- no JSON content type set by the client;
- the CSRF header;
- a `422` `backup-invalid` whose `problems` list reaches the error's extension members.

The query-string builder is pure and is tested directly in the same file. A test that listens for a Session
event removes its listener before it ends.

**`App`'s tests**: a new test file for `App`, rendered at a route with the default Session or an override.
It needs no production change, because the router lives outside `App`.
- the loading splash while the Session answer is held open;
- signed out, at an app route or at the picker: the sign-in screen;
- signed in without an Active profile, at an app route: the picker. After the user picks a Profile (the
  switch request carries `profileId`), the app returns to that route;
- signed in without an Active profile, at the sign-in route: the picker;
- signed in with an Active profile, at the sign-in route: the app;
- mid-Session, a request answered `401`: the sign-in screen;
- mid-Session, a request answered `409` `no-active-profile`: the picker;
- "Log out": the sign-out request is answered `204`, and the sign-in screen shows.

Each test lists the answers for the target screen's own requests. That list doubles as documentation of the
screen's network conversation.

**The hooks' refresh contract**: a new test file next to the hooks module. It replaces the existing
invalidation test, which is deleted in the same step.

For each mutation family:
1. mount the query hooks the family must refresh, in one hook render inside a query-client provider;
2. run one mutation of the family;
3. assert that each mounted query asked the server again. For the documented bug, also assert that the
   pinned result shows the new answer.

Refreshes only re-run queries that are mounted, which is why the test mounts every dependent query.

Families:
- Transaction data, through delete: lists, summary, counts, totals, Budgets, Budget status, Subscription
  dashboard, merchant suggestions, pinned results;
- Category data, through update: tree, counts, totals, Budgets, Budget status, Subscriptions, Subscription
  dashboard;
- Budgets;
- Subscriptions, plus delete's refresh of Transactions;
- Insights: list, the open Insight, pinned results;
- the Profile mutations' Session updates: create, rename, delete clearing the Active profile when it was the
  deleted one;
- restore's refetch of the Session.

The Profile-list refresh is not asserted, because the only reader of that list has no callers (dead code,
owned by candidate 17). Sign-in, sign-out and profile switching are covered at `App` level.

**Documents updated in the same change.**
- ARCHITECTURE.md §4 gains a paragraph, "Why unit tests fake the network, not the hooks", in step 1, plus one
  sentence about the lint guard in step 2.
- API.md "Errors" names the security layer's `401` `/errors/unauthenticated` and `403` `/errors/forbidden`,
  which the fixtures mirror. This is recommended, in step 1.
- A LESSONS entry (git-ignored, written but never committed) compares `msw` with `httpx.MockTransport` and
  supersedes the entry on testing a hook through cache state.

The proposed texts are in docs-proposals.md.

**Ordered steps.** Each is separately shippable. Each leaves `npm run lint`, `npm run format:check`,
`npm test` and `npm run build` green.

1. **Harness, client tests and docs.**
   - Contents:
     - the test server with its two default answers and the Problem answer;
     - the wire fixtures for the Session and Profile;
     - the lifecycle, the unanswered-request check and the planted cookie in the setup file;
     - the `.invalid` origin in the Vitest configuration;
     - the client module's tests;
     - the ARCHITECTURE.md paragraph, the API.md "Errors" addition and the LESSONS entry.
   - Verification:
     - the four commands;
     - `npm test` wall time before and after, reported in the PR;
     - planted defects, each seen failing and then reverted: remove the CSRF header from the client (the
       CSRF test fails); stop the client firing the `409` event (the event test fails); add a throwaway test
       with no answer for a request (the check names it, and the test after it still starts clean: nothing
       mounted, no leftover handlers); add a handler that returns nothing (it fails fast with the catch-all's
       message).
   - Leaves every existing test unchanged and green, the client covered, and the policy written down.
2. **Lint guard.**
   - Contents: the restricted-syntax rule and its thirteen-file allowlist; one sentence in ARCHITECTURE.md.
   - Verification: plant a hook mock in a new test file (lint fails); plant a JSON answer without a type
     argument (lint fails); plant a non-existent field in a typed answer (`npm run build` fails). Revert each.
   - Leaves the policy enforced.
3. **`App`'s gates and Session events.**
   - Contents: the `App` test file, plus any builder that a second file now needs (the rule of two).
   - Verification: planted defects. Remove the listener's `409` branch, then its `401` branch; make the app
     layout ignore a missing Active profile. Each named test fails.
   - Leaves every gate branch, both listener branches and sign-out covered.
4. **The hooks' refresh contract.**
   - Contents: the refresh-contract test file, whose Transaction and page fixtures stay local until a second
     file needs them; delete the old invalidation test and remove it from the allowlist (twelve entries
     remain).
   - Verification: planted defects. Remove the pinned-result refresh from the Transaction data helper, then
     Subscription delete's Transaction refresh. Each family test fails.
   - Leaves every mutation family covered.

After step 4 nothing is scheduled. Existing files follow the placement policy.

## Testing Decisions

**The seam: one, the network.** Every module that reaches the server is tested through the network seam,
the global `fetch`, answered by `msw`. This is the highest seam available. Everything the frontend owns runs
above it: screens, hooks, keys, refreshes, the client, the gates. It is also an existing seam with two
adapters already: production (the backend) and e2e (the real backend). Choosing it adds no new production
seam and no second seam in tests.

Alternatives rejected:
- the hooks-module boundary, which is today's seam: it skips all the behaviour listed above and couples
  tests to hook names and TanStack's result shape;
- the client-module boundary, as used by today's single hook test: the client stays untested, and stubs
  must know its call signature;
- a hand-written `fetch` spy: each test would re-implement routing, URL matching, body parsing and the
  unanswered-request policy that `msw` already provides, and `msw` is installed and settled.

Pure logic and prop-driven components need no seam; they are called or rendered directly.

**What makes a good test here.**
- It asserts externally observable behaviour: what the user sees and, for wire properties the user cannot
  see, what went over the wire.
- It never asserts cache state, hook names, `mutate` calls or other internals.
- It declares every answer it depends on, typed against the wire types.
- It awaits anything that depends on an answer.
- It runs on real timers.
- It would fail if the behaviour it names broke. For every test added by this spec, that is shown once
  against a planted defect that is then reverted, and recorded in the PR description. A test that cannot
  fail proves nothing.

**Modules tested.**
- The client module: the request contract, CSRF, Problem parsing, `204`, network failure, Session events,
  download, upload.
- `App`: the three route gates, the global Session listener, sign-out.
- The hooks module: its refresh contract, one test per mutation family.

Later, and only under the placement policy: connected components still without tests (the pinned tiles,
merchant backfill, the backup flow, the explorer's save and result error branches), and existing screen
files as each first needs a new test.

**Prior art in the codebase.**
- The existing hook test, which uses a real query client, a hook render with a provider wrapper, and
  `waitFor`. It is the model for the refresh-contract test, minus its client stub and its cache-state
  assertion.
- The set-password screen's test, which observes navigation through probe routes. That is the model for
  `App`'s redirect assertions.
- The shared render helper, which provides a fresh query client, an initial route and router state.
- The Transactions tests' awaited `findBy` with an explicit timeout.
- The confirmation dialog's tests: the model for prop-driven components, which need no seam.
- On the Python side, the analytics package's client tests with `httpx.MockTransport`: the same idea of
  faking behind the transport rather than stubbing the caller.
- The e2e suite, the seam's other adapter.
- The maintenance run's verification of lint rules against planted defects, the model for this spec's
  planted-defect checks.

## Out of Scope

- **Converting existing test files.** None of the twelve hook-mocked files is converted by this spec. Each
  converts under the placement policy when it first needs a new test.
- **Correcting drifted fixtures inside legacy files.** They are corrected when their file converts. The list
  is in Further Notes.
- **Unit tests for pure modules that have none** (the Category colour helper, the explorer's Plan defaults,
  the chart row builder, the Plan-version normalisation). They need no network. The policy says how they are
  tested when someone writes them.
- **Tests for connected components still without tests** (pinned insight tiles, merchant backfill, backup
  export and restore, the explorer's error branches). They are added when those modules next change. The
  pinned tiles' test arrives with candidate 17's bug fix.
- **A fake backend** that emulates filtering, aggregation, validation or persistence.
- **Typing handlers from the generated OpenAPI paths**, for example with a typed-handler library. Revisit
  after candidate 15.
- **`msw` in the browser or in Storybook.** Storybook stays scoped to primitives (ARCHITECTURE.md §4).
- **Changes to the e2e suite.** Its duplicated helpers belong to candidate 17.
- **A query-key registry or any refactor of the invalidation map.** The tests pin behaviour, not keys.
- **Every production change**, including dead code (the unused Profile-list hook, the unused field-message
  helper, the unused sum helper), stale comments, a Problem type in the wire types module (candidate 2's
  call), and the stale generated schema (candidate 15).
- **Changing the shared render helper's interface**, or mirroring production's window-focus setting in it.
  It has no effect in jsdom.
- **Moving the KPI-tile DOM helper** that two legacy files duplicate.
- **Measuring or optimising the suite beyond the step-1 before-and-after report.**

## Further Notes

**Read from source but not executed.** Each claim will be proven by the named check.
- A relative `/api/…` request resolves under `msw` in this environment. `msw`'s interceptor resolves relative
  URLs against the test document's location. Proven by the client's first read test.
- The CSRF cookie round-trips on a `.invalid` origin. tough-cookie 6 allows special-use domains by default
  and rejects public suffixes only for cookies with a domain attribute. Proven by the CSRF test.
- A jsdom `FormData` body survives interception. Vitest's compat request converts it. The uploaded part's
  filename becomes `blob`, so tests assert content, not the name. Proven by the upload test.
- `tsc -b` accepts the `msw` Node declarations under the app's TypeScript configuration. Library checking is
  skipped and Node's types are installed. Proven by step 1's build.
- The two lint selectors match. Proven by step 2's planted violations.
- A throwing after-each hook skips the hooks after it. Vitest's suite-hook loop runs them one by one, with no
  per-hook catch. This is why the unanswered-request check runs last, inside the same hook as the
  clean-up. Proven by step 1's planted missing answer: the following test must still start clean.
- The runtime overhead. Measured in step 1.
- Whether `msw`'s "error" strategy also produces an unhandled rejection. Moot: the catch-all answers first.
- Whether a passed-through mutation would have cleared the backend's CSRF check. `msw` copies document
  cookies onto the intercepted request, so the token cookie and header would travel together. The outcome
  depends on how the backend parses the duplicated cookie header, and was not determined. It is moot once
  nothing passes through.
- Recharts under jsdom was not examined. Tests of chart-hosting components mock the renderer.
- That the old client test was deleted in commit `2c252b6` comes from the frontend review; the commit was
  not re-read.

**Why four safety guards.** Four facts combine:
- the test environment's default origin, `localhost:3000`, is the address both compose files publish the app
  on;
- `msw` makes relative URLs resolvable;
- `msw` passes a request through to the network both under its default strategy and when a handler returns
  nothing;
- passwordless mode authenticates every request as the Local account.

Adopting `msw` without the guards would turn today's accidental safety into a real chance of a test run
reading, or changing, a developer's own data.

**Cross-candidate effects and recommended order.**
- **Candidate 2** (one module turns a Problem into messages). Its mapping table is pure and needs no seam.
  Its per-screen "a server error is shown" tests are new tests of server-reaching modules. Written after
  step 1, they use the network seam, where the real client parses the real Problem. Adding one to a
  hook-mocked file triggers that file's conversion. If candidate 2 adds a frontend Problem type, the Problem
  answer adopts it. Recommended: steps 1–2 land before those per-screen tests are written.
- **Candidate 3** (one dialog module). Its tests are prop-driven and need no network. Deleting the dialog
  tests from the transaction modal's file is an in-place edit and triggers no conversion.
- **Candidate 5** (plain form idiom, one money input). Its money functions are pure. Any new screen test
  such as "Enter submits" or "the amount goes out as a string" is a network-seam test, and a stronger one
  there, because it asserts the wire body. The Budget form's two existing tests may be edited in place.
- **Candidate 15** (the OpenAPI document as the checked wire contract). It changes what sits behind the wire
  types module. Fixtures follow with no edits, and any drift surfaces as compile errors. No ordering
  constraint.
- **Candidate 17** (housekeeping):
  - its stale-comment item in the old invalidation test is moot if step 4 lands first;
  - the duplicated Session and Active-profile fixtures it hands over are resolved for network-seam tests,
    and the legacy copies go at conversion;
  - its possible bugs 2 (a pinned tile with an empty result) and 4 (a minimal saved Plan) need failing tests
    of connected components first, which are network-seam tests. Recommended: step 1 lands before them. The
    pinned-tile test mocks the chart renderer, which is allowed.
- **Candidate 1** (the Active profile's single home). It makes a dangling Active profile answer `409`
  `no-active-profile` everywhere. Step 3's listener test pins the frontend's half of that behaviour.
  Candidates 1 and 6 may edit API.md, so coordinate the small "Errors" addition.
- **Candidates 4 and 11.** If cross-field violations move to real fields, or the Transaction filter's
  parameters change, the fixtures and the asserted query parameters follow the wire.
- **Candidates 7, 13, 9, 10.** No effect.

**Drift handed over for conversions.**
- The explorer test's saved Plan has a `granularity` field; it should be `interval`.
- Its "no longer exists" test uses the Problem type `insight-not-found`; it should be `/errors/not-found`.
- Category roots have depth 0 in the Transactions, Subscriptions, Budgets, Budget form and transaction modal
  tests; roots are depth 1.
- The Subscription fixtures lack `createdAt`.
- The Subscription dashboard stub lacks `asOf`, `activeCount`, `pausedCount`, `yearlyCost` and
  `byCategory`.
- Subscription amounts use scale 2.
- The dashboard test's Active profile is "Audit Probe" (id 46), where every other file uses "Household"
  (id 1).

**Risks.**
- The first new test added to a large legacy file (Subscriptions, 13 tests; Transactions, 17) carries a
  whole-file conversion. That cost is accepted in exchange for one seam per file.
- `msw` 2.15 serves the unhandled-request option through a compatibility layer, so a future upgrade could
  change it. The catch-all and the origin keep the safety guarantee regardless.
- Compile-time checking needs `npm run build`. A developer who runs only `npm test` sees fixture drift in the
  editor and in CI, not in the test output.

**Lesson for LESSONS.md.** Faking the network rather than the module:
- mocking the hooks module is `unittest.mock.patch` on the thing under test;
- `msw` is the frontend's `httpx.MockTransport`, reached by patching the global `fetch`, because the app has
  no injected transport;
- a type argument on each JSON answer makes the compiler check the fixture against the wire type.

**Added when the specs were cross-checked (2026-09-30).**

- **Test seam, reconciled with candidates 2 and 5.** Those two specs add their new screen tests on
  the hook-mocked seam of files that already mock the hooks module, and that stands: converting
  those files is not part of either candidate. The rule "a hook-mocked file converts as a whole the
  first time it needs a new test" applies to tests added after candidates 2 and 5 have landed;
  until then the lint guard's allowlist keeps those files. Candidate 17's two frontend defect
  tests use the network seam when step 1 of this spec has landed, and the fallback that spec names
  when it has not.
- **No dependency on candidate 15.** Candidate 15's recommended order lists "candidate 8's typed
  fixtures" after its step 5. That is a preference, not a dependency: this spec types its answers
  against the frontend's wire types module, which holds complete hand-written response types
  today, so step 1 can land at any time and the fixtures follow whatever candidate 15 later puts
  behind that module.
