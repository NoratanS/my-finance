# Docs proposals — candidate 8: move the test seam to the network

## (a) Proposed glossary terms

**Session**:
The state the server holds for one browser: it records that the browser is signed in as a User, and which
Profile is that User's Active profile. It ends when the User signs out or when it expires.
_Avoid_: login (that is the act of signing in), token, auth state, "me" (that is only the endpoint's name)

Why propose it: the seed vocabulary has User, Active profile, Local account and Sign-in mode, but not the
thing that holds the Active profile. API.md already speaks of "the session's profile", and this spec says
"the Session" throughout. Groups G1 and G5 (candidates 1, 6 and 13) may propose the same term; the
orchestrator should merge them into one entry.

The test-infrastructure names in this spec (test server, default answers, wire fixtures, Problem answer)
are implementation vocabulary, not domain terms, so they stay out of the glossary.

## (b) Proposed ADRs

None.

The decision to put the unit-test adapter at the network does meet all three ADR criteria:
- **hard to reverse:** once many tests declare answers, going back means rewriting them;
- **surprising without context:** two test styles coexist on purpose, during an incremental migration;
- **a real trade-off:** asynchronous, slightly slower tests in exchange for running the hooks, the client
  and the gates.

The repository's rule nevertheless puts recorded decisions in ARCHITECTURE.md rather than in a separate
ADR, so it is recorded as a new paragraph in ARCHITECTURE.md §4. That document has no testing section, and
this paragraph sits next to its existing "Why Storybook, scoped to primitives only".

## (c) Required updates to recorded-decision documents

### 1. ARCHITECTURE.md §4 "Frontend" — new paragraph (required)

**Section:** §4 "Frontend", appended after the paragraph "**Why Storybook, scoped to primitives only:** …".

**When:** the paragraph lands with step 1. The last sentence below, about the ESLint rule, lands with
step 2.

**Proposed text:**

> **Why unit tests fake the network, not the hooks:** a screen's data behaviour lives below the screen. It
> lives in the hooks (`frontend/src/api/hooks/`): profile-scoped query keys, queries that wait for the active
> profile, and the caches each mutation refreshes. It also lives in the client (`frontend/src/api/client.ts`):
> the CSRF header, RFC 9457 parsing, and the `401`/`409` events that the route gates react to. Unit tests that
> replaced the hooks module with hand-built stubs never ran any of this, which is how a missing refresh of
> the pinned dashboard tiles survived review.
>
> Unit tests therefore put their fake at the network. `msw` answers the requests the real client makes, with
> bodies typed against `frontend/src/api/types.ts`, so everything above `fetch` runs as it does in
> production. The e2e suite is the same seam's other adapter: it answers with the real backend.
>
> Four rules keep this deterministic and safe:
> - Every request a test causes must be answered by a handler that test declares; only the session is
>   answered by default. An unanswered request fails the test, and the failure names it.
> - Nothing ever passes through to a real socket, and the unit-test origin is a reserved `.invalid` name.
>   jsdom's default origin, `localhost:3000`, is also where the shipped app is published, and on a
>   passwordless instance a request that reached it would be authenticated.
> - Tests use real timers.
> - Handlers never set cookies.
>
> Which seam a test uses follows from what it tests. Pure logic is called directly. A component that only
> takes props is rendered with props. Anything that reaches the server goes through the network. The older
> tests that stub the hooks module are kept while they pass; a file converts, as a whole, the first time it
> needs a new test. The cost accepted: network-seam tests wait for answers, so they are asynchronous and
> somewhat slower than stubbed ones. An ESLint rule for test files rejects new mocks of the hooks or client
> modules outside a shrinking allowlist, and requires every JSON answer to name its wire type.

**Why the document must change:** the decision is structural and binds every future frontend test. Without
this paragraph, a reader who meets two test styles in the tree has nowhere to learn which one is current,
or why.

### 2. ARCHITECTURE.md §5 "CI/CD (GitHub Actions)" — no change

The frontend job's description ("ESLint, Prettier `--check`, vitest, the production build, and the Storybook
build") stays accurate. The new lint rule runs inside ESLint. The typed fixtures are checked by the
production build's `tsc -b`, which has always included test files (`frontend/tsconfig.app.json`,
`include: ["src"]`).

### 3. docs/API.md "Errors" — name the two security-layer problem types (recommended)

**Section:** "Errors", after the paragraph that ends "`detail` is prose and may change without notice."
(API.md 168–169), before "### Validation failures — `400`".

**Why:** the unit-test fixtures mirror what the backend actually sends. The security filter chain writes two
Problems that API.md never names:
- `401` `/errors/unauthenticated`, with detail "Log in with POST /api/auth/login first.";
- `403` `/errors/forbidden`, with detail "The CSRF token is missing or invalid."

Both are in `backend/src/main/java/com/myfinance/backend/config/SecurityConfig.java:90–100`, written through
`security/ProblemDetailResponseWriter.java:30–38`.

CLAUDE.md asks for an underspecified design document to be completed in the same change that relies on it.
This is additive; nothing on the wire changes.

**Proposed text:**

> Two problems are written by the security filter chain, before any controller runs, in the same shape:
> **`401`** `/errors/unauthenticated` when the request has no authenticated session (never on a passwordless
> instance, where every request is authenticated), and **`403`** `/errors/forbidden` when the CSRF token is
> missing or invalid. The frontend's global redirect to the sign-in screen keys on the `401` status, not on
> the slug.

**Coordination:** candidates 1 and 6 (group G1) may also edit API.md. This is a separate paragraph in
"Errors", so it should not conflict, but land it after G1's edits if both are in flight.

### 4. docs/LESSONS.md — new entry (required by CLAUDE.md; the file is git-ignored)

**When:** step 1. Write the entry, and never `git add` it (the file is listed in `.gitignore`).

**Proposed text:**

> ### Faking the network instead of the module: `msw` in Vitest
>
> - **What** — frontend unit tests declare the HTTP answers a screen needs (`msw` handlers) instead of
>   replacing `src/api/hooks` with `vi.mock`. The hooks, query keys, cache refreshes, and the client's CSRF
>   header and Problem parsing all run for real.
> - **Where** — the test-support modules next to `renderWithProviders` (the test server and the wire
>   fixtures), `frontend/src/test/setup.ts`, and the client, `App` and hooks refresh-contract tests.
> - **Why it's this way** —
>
>   `vi.mock('../api/hooks')` is `unittest.mock.patch` aimed at the code under test. The test passes while
>   the real hook never runs, which is how a missing pinned-tile refresh survived review.
>
>   `msw` is the frontend's `httpx.MockTransport` (see "Testing an HTTP client with `httpx.MockTransport`…"):
>   a fake *behind* the transport, so the real call sites run. The difference is how the fake gets in. The
>   Python client takes its transport by dependency injection. The SPA calls the global `fetch`, so `msw`
>   patches `fetch` for the test process instead.
>
>   Two TypeScript/Vitest specifics are worth remembering:
>   - `HttpResponse.json<T>(…)` checks a fixture against the wire type only because of the explicit `<T>`,
>     since its parameter is `NoInfer<T>`. It is checked only in `tsc -b`, because Vitest strips types
>     without checking them.
>   - TanStack Query hands results to components through zero-delay timers, so fake timers freeze a
>     network-seam test.
>
>   This supersedes "Testing a hook that only fires inside another hook's `onSuccess`", which asserted on
>   cache state with the client stubbed.
> - **A surprise worth remembering** — jsdom's default origin under Vitest is `http://localhost:3000`, the
>   same address the compose stack publishes the app on. Once `msw` resolves relative URLs, a request it
>   passed through could reach a running instance. Hence the reserved `.invalid` test origin and the
>   catch-all answer.

### 5. Documents deliberately not changed

- **The maintenance-run spec and plan** (`docs/superpowers/specs/2026-09-07-maintenance-run-design.md`,
  `docs/superpowers/plans/2026-09-07-maintenance-run.md`) are historical records. The plan's
  never-created `frontend/src/test/msw.ts` is realised by the test-support modules. The records are not
  edited.
- **CLAUDE.md**: not a recorded-decision document. The rule reaches contributors through ARCHITECTURE.md,
  the lint rule's messages and the test-support modules' own comments.
- **docs/SCHEMA.md and docs/INSIGHTS.md**: untouched. No schema or Plan DSL is involved.
