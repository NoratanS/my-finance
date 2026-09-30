# Grilling log — candidate 8: move the test seam to the network

Group G4. Repository `my-finance`, branch `dev`, HEAD `c3e20c5` (a `-s ours` merge whose tree is identical to
`4545810`; `git diff --stat 4545810 c3e20c5` is empty). Read-only session: nothing in the repository was
created, edited, built, installed or run.

**Path convention.** Paths beginning with `src/`, `e2e/`, `node_modules/` or a frontend config file
(`package.json`, `vitest.config.ts`, `tsconfig.app.json`, `eslint.config.js`, `vite.config.ts`,
`playwright.config.ts`) are relative to `frontend/`. Every other path is relative to the repository root.
Line numbers were re-checked at HEAD. Library facts come from the installed packages under
`frontend/node_modules`, at the versions listed in Q5. They were **read from source, never executed**.
The verification ledger near the end separates what was read from what still has to be proven by a test.

**How the tree was worked.** Seven rounds. Each round holds only questions whose prerequisites were settled
in an earlier round. The owner delegated every decision, so each ➡️ recommendation stands unless its facts
or its strongest counter-argument say otherwise. Where that happened, the entry says so.

---

## Round 1 — no open prerequisites

❓ **Q1** - **Constraints the design must not break**: which recorded decisions, wire contracts, error
shapes, build and CI rules bind a change to the frontend's test seam?

🔎 Facts:
- Wire contract, `docs/API.md`: base path `/api`; bodies are JSON and errors are `application/problem+json`
  (14–15). CSRF: a readable `XSRF-TOKEN` cookie is echoed in `X-XSRF-TOKEN` on every
  `POST`/`PUT`/`PATCH`/`DELETE`, and a missing or stale token is `403` (55–58). No active profile gives `409`
  `/errors/no-active-profile`, which "the frontend should handle … by showing the profile picker" (77–80).
  The Problem base shape uses `type` as a stable slug and `detail` as prose (150–169). Validation `400`
  carries `errors[]` of `{field, message}`, and cross-field rules report pseudo-fields (171–196). A `404` is
  `/errors/not-found`, including rows in another profile (222–251). Money is a decimal string at the stored
  scale, and a JSON number is rejected (82–116). Export answers with `Content-Disposition` (1305–1306).
  Restore is `multipart/form-data` with one part named `file` (1376–1379). `204` is the answer for logout,
  set password and all deletes (1524).
- The backend's security layer writes `401` `/errors/unauthenticated` and `403` `/errors/forbidden`
  (`backend/src/main/java/com/myfinance/backend/config/SecurityConfig.java:90–100`, through
  `security/ProblemDetailResponseWriter.java:30–38`). API.md names neither slug (grep of API.md for
  `unauthenticated|errors/forbidden`: no hit).
- Recorded decisions: the frontend talks only to the backend's REST API (`ARCHITECTURE.md:232–235`).
  Storybook covers primitives only (`ARCHITECTURE.md:260–268`). CI's frontend job runs "ESLint, Prettier
  `--check`, vitest, the production build, and the Storybook build", and "CI runs the same commands a
  developer runs locally" (`ARCHITECTURE.md:345–364`).
- CI command: `npm ci && npm run lint && npm run format:check && npm test && npm run build && npm run
  build-storybook` (`.github/workflows/ci.yml:31`). Scripts: `lint` = `eslint src e2e`, `format:check` =
  `prettier --check src e2e`, `test` = `vitest run`, `build` = `tsc -b && vite build` (`package.json`).
- `tsconfig.app.json` is `strict` with `noUnusedLocals`/`noUnusedParameters`, `types: ["vite/client"]` and
  `include: ["src"]`, so test files and `src/test/*` are type-checked by `tsc -b` inside `npm run build`.
  Vitest itself does not type-check.
- `vitest.config.ts`: `environment: 'jsdom'`, `globals: true`, `setupFiles: ['./src/test/setup.ts']`,
  `css: false`, and `e2e/**` excluded.
- Settled (BRIEF §6): `msw` is adopted at the network seam, incrementally, and is not removed. OpenAPI stays.
- Project rules (CLAUDE.md): test-first for real logic, simplicity first, surgical changes, and a
  `docs/LESSONS.md` entry after non-trivial work.

➡️ The change must:
- leave the wire contract and production code untouched;
- keep `lint`, `format:check`, `test` and `build` green after every step;
- hold test code to the same strict TypeScript and ESLint rules as app code;
- shape fixtures like API.md and, where API.md is silent, like what the backend actually sends.

⚖️ Strongest argument against: strict TypeScript on test fixtures (and `noUnusedLocals`) makes tests slower
to write.

✅ Decision: accepted. The strictness is exactly what lets typed fixtures catch drift (Q11). Unblocks Q11,
Q12, Q31.

---

❓ **Q2** - **Dependencies by category**: what does the frontend's data path depend on, and in which category
(in-process, local-substitutable, ports & adapters, mock)?

🔎 Facts:
- `src/api/client.ts` is the only module that calls `fetch` or reads `document.cookie` (grep of `src` for
  `fetch(|XMLHttpRequest|document.cookie|sendBeacon|WebSocket|EventSource`: only `client.ts:47,83,137,160`).
- Every `api`/`apiDownload`/`apiUpload` call site is inside `src/api/hooks/*`. A grep for them outside
  hooks, client and tests finds nothing.
- The hooks use `@tanstack/react-query` 5.102.2; `App` uses `react-router-dom` 7.18.2.
- Tests run in jsdom 30.0.1 under Vitest 5.0.0.
- The e2e suite drives the real backend: 5 spec files, 17 test definitions, and no `page.route` or
  `context.route` anywhere in `e2e/` (grep).

➡️
- **In-process**, run for real and never replaced: screens, connected components, the hooks module, TanStack
  Query, React Router, the client module, fixture builders.
- **Local-substitutable**: the browser is replaced by jsdom (with Node's own `fetch`, see Q5); the whole
  stack by the e2e compose overlay.
- **Ports & adapters**: the backend's HTTP interface.
  - Port: the wire contract (`docs/API.md`).
  - Production adapter: the Spring backend behind the Vite dev proxy (`vite.config.ts`) or nginx.
  - Test adapters: `msw` handlers in unit tests, and the real backend in e2e.
- **Mock (true third party)**: none. The browser never talks to a third party.

⚖️ Strongest argument against: the backend is out of process, so "mock" is arguable. But it is our own
process with a written contract, and that makes it ports & adapters. The category has a consequence: the
test adapter must honour the contract, which is why bodies are typed (Q11).

✅ Decision: as recommended. Unblocks Q3 and Q11.

---

❓ **Q3** - **Where the seam lives, what sits behind it, and seam discipline**. Options:
- (a) the hooks-module boundary, as today;
- (b) the client-module boundary (`vi.mock('./client')`, as in the one invalidation test);
- (c) the global `fetch`, the network seam, answered by `msw`;
- (d) a hand-rolled `fetch` stub (`vi.spyOn(globalThis, 'fetch')`).

🔎 Facts:
- `vi.mock('../api/hooks', …)` appears in 12 of 15 unit test files: `AuthScreen`, `Nav`, `TxnModal`,
  `BudgetForm`, `Budgets`, `Categories`, `Dashboard`, `Insights`, `ProfilePicker`, `SetPassword`,
  `Subscriptions`, `Transactions` (grep of `vi.mock(`).
- Those factories hold 63 hook entries: 8+7+7+2+5+7+7+7+4+3+4+2, counted per file with awk.
- The 12 files contain 83 of the 93 test definitions. The other 10 are `hooks.invalidation` (1),
  `ConfirmDialog` (7) and `renderWithProviders` (2).
- Only 1 of 93 tests executes a real hook, `src/api/hooks.invalidation.test.tsx`. It stubs `api`
  (`hooks.invalidation.test.tsx:13–16`). So **0 of 93** tests run the client's request path: `fetch`, the
  CSRF header, `throwApiError`, the auth events.
- Its own comment explains why it exists (`hooks.invalidation.test.tsx:8–12`).
- The hooks module is deep: 44 exported hooks, of which 15 are queries, 27 mutations and 2 derived. Counted
  with grep: 27 × `useMutation(`, 13 × `useQuery`, 2 × `useQueries(`.
- It holds 30 `invalidateQueries` lines: budgets 2, categories 8, insights 3, profiles 5, subscriptions 3,
  transactions 9.
- History of the pattern:
  - The maintenance spec adopted `msw` to mock "at the network layer, so hooks are tested through real
    `fetch` rather than a stubbed module" (`docs/superpowers/specs/2026-09-07-maintenance-run-design.md:126`).
  - The plan listed `frontend/src/test/msw.ts` as created in M0
    (`docs/superpowers/plans/2026-09-07-maintenance-run.md:41`).
  - Task 1 installed `msw` (plan 148–155), but its first test used `vi.mock('../api/hooks', …)` (plan
    234–239). Every later test copied that pattern.

➡️ (c). The seam is `fetch`: the boundary between the client module and the backend's HTTP interface.
- Behind it: the backend in production, `msw` handlers in unit tests, the real backend in e2e.
- In front of it: everything in the frontend, which runs for real in a network-seam test.
- **Seam discipline**:
  - The network seam already has two real adapters: production, and e2e's backend. `msw` adds a third, so
    it is a real seam.
  - No new production seam is introduced. There is no transport injection: `msw` patches the global `fetch`
    (Q4).
  - The hooks-module seam, as tests use it, has one production adapter and 12 hand-built partial adapters.
    Each of those knows hook names and TanStack's result shape (`{ mutate, isPending, variables }`). It is a
    test-only seam laid over the very module whose behaviour tests should run, and it is retired step by
    step (Q22).
- Why not (b): `client.ts` stays untested, and the stub must know `api<T>(path, options)`.
- Why not (d): every test would re-implement routing, URL matching, body parsing and an
  unanswered-request policy by hand. `msw` is installed and settled.

⚖️ Strongest argument against: (a) is fast and synchronous, the tests are readable and already written, and
e2e covers integration.

✅ Decision: (c). The network is the one seam for every module that talks to the server. (a) is not
rewritten wholesale (Q22). Unblocks Q4–Q10 and Q17.

---

❓ **Q4** - **Does the candidate change production code?** Options:
- (a) no;
- (b) small production changes, such as an injectable transport or a Problem type in the wire types module.

🔎 Facts:
- `@mswjs/interceptors` 0.41.9 patches `globalThis.fetch` (`node_modules/@mswjs/interceptors/src/interceptors/fetch/index.ts:195–201`).
- The client calls the bare global `fetch(path, …)` (`client.ts:83,137,160`), so it is intercepted with no
  change.
- The wire types module has no Problem type (`src/api/types.ts`, read in full).

➡️ (a). The candidate touches only:
- test support;
- the Vitest setup file;
- one Vitest configuration option (Q6);
- the ESLint configuration;
- test files (one deleted, three added);
- documents.

The production bundle is unaffected.

⚖️ Strongest argument against: a Problem wire type would serve both the test helper and candidate 2.

✅ Decision: (a). The Problem answer helper declares its body shape locally in test support, and adopts
candidate 2's Problem type if that lands (Q15, Q34). Unblocks Q31.

---

❓ **Q5** - **What the test environment does with `fetch`, relative URLs and cookies**: fact-finding for the
card's question 1.

🔎 Facts. Installed versions, read from each package's `package.json` under `frontend/node_modules`: `msw`
2.15.0, `@mswjs/interceptors` 0.41.9, `vitest` 5.0.0, `jsdom` 30.0.1, `undici` 8.10.2, `tough-cookie`
6.0.2, `@tanstack/query-core` 5.102.2. Node is v24.20.0 (`.nvmrc` `24`; `ci.yml:27,56` use `'24'`).

- **Vitest's jsdom environment** (`node_modules/vitest/dist/chunks/index.1_nbEjJY.js`):
  - The default URL is `http://localhost:3000` (line 1348).
  - `populateGlobal` copies a window key onto Node's global only if that key is absent from the global or is
    listed in `KEYS` (1061–1067). `KEYS` includes `FormData`, `Blob`, `File`, `CustomEvent`, `location`,
    `document` and `localStorage` (822–1052), but not `fetch`, `Request`, `Response`, `Headers`,
    `AbortController` or `URL`.
  - So `fetch`, `Response` and `Headers` are Node's. `Request` and `URL` are replaced by compat subclasses
    (1372–1373). The `Request` subclass converts jsdom `FormData`/`Blob` bodies into Node ones (1384–1413).
  - The happy-dom branch notes "jsdom doesn't support fetch API" (1213).
- **jsdom 30.0.1** ships only `Headers` of the fetch interfaces. `lib/jsdom/living/fetch/` holds only the
  `Headers` implementation, and `interfaces.js:233` registers only `Headers`.
- **Consequence today**: a relative `fetch('/api/x')` in a unit test reaches Node's `fetch`, which has no
  base URL and cannot resolve it. This is Node behaviour I did not execute. Today no unit test calls
  `fetch` anyway: every hook is mocked, and `api` is stubbed in the one hook test.
- **msw's interceptor** resolves a relative string input against `location.href` whenever `location` exists
  (`@mswjs/interceptors/src/interceptors/fetch/index.ts:38–49`, citing msw issue #1625). It then builds a
  `FetchRequest`, which `extends Request` (`src/utils/fetchUtils.ts:11`).
- **Handler paths** are resolved against `location.href` too (`msw/src/core/utils/url/getAbsoluteUrl.ts`).
  Matching compares origin plus pathname only (`@mswjs/interceptors/src/utils/getCleanUrl.ts:4–6`, used by
  `msw/src/core/utils/matching/matchRequestUrl.ts`), so query strings never affect which handler matches.
- **Cookies**:
  - The client reads `document.cookie` (`client.ts:46–49`) and sends `credentials: 'include'`
    (`client.ts:86,140,163`).
  - jsdom always has a cookie jar; it creates one when none is passed (`node_modules/jsdom/lib/api.js:176–177`).
  - For `credentials: 'include'`, msw copies the document's cookies into the request that handlers see
    (`msw/src/core/utils/request/getRequestCookies.ts`, `getDocumentCookies`).
  - msw keeps a mocked `Set-Cookie` in its own tough-cookie jar, persisted to `localStorage` under
    `__msw-cookie-store__`. It never writes it into `document.cookie` (`msw/src/core/utils/cookieStore.ts`).

➡️ Summary. Relative URLs need no configuration under msw, because request and handler paths both resolve
against jsdom's location. The client's cookie must be put into `document.cookie` by the test setup; a
handler cannot deliver it.

⚖️ Strongest argument against: all of this is read from source, not run.

✅ Decision: recorded as facts. Each has a proving test in step 1 (verification ledger). Unblocks Q6 and Q9.

---

## Round 2 — the harness (depends on Q3, Q5)

❓ **Q6** - **Safety: once msw is in, can a unit test reach a real server?** Options:
- (a) msw's default, `'warn'`;
- (b) `onUnhandledRequest: 'error'`;
- (c) (b) plus a catch-all default handler that answers every request no test answered;
- (d) (c) plus a unit-test origin that cannot resolve.

🔎 Facts:
- The default strategy is `'warn'`: `listen` configures `options?.onUnhandledRequest || 'warn'`
  (`msw/src/node/setup-server-common.ts`).
- `'warn'` prints a warning and then **passes the request through**: `executeUnhandledFrameHandle(…)
  .then(() => this.passthrough())` (`msw/src/core/experimental/frames/http-frame.ts`, unhandled branch).
  Passthrough performs the request as-is: `pureFetch(request)` (`@mswjs/interceptors/src/interceptors/fetch/index.ts:63–100`).
- A matched handler whose resolver returns nothing **also passes through**, and this path bypasses the
  unhandled strategy entirely. See the "Handlers that returned no mocked response" branch in `http-frame.ts`.
  `executeHandlers` keeps trying later handlers until one returns a response
  (`msw/src/core/utils/executeHandlers.ts`, loop and comment).
- `'error'` never performs the request: `applyStrategy('error')` rejects with an `InternalError`, which
  reaches `frame.errorWith` and then `controller.errorWith`
  (`msw/src/core/experimental/on-unhandled-frame.ts`; `sources/interceptor-source.ts` `errorWith`).
- The legacy option is served through a compatibility bridge "between the old and the new APIs"
  (`msw/src/core/experimental/compat.ts`, `fromLegacyOnUnhandledRequest`).
- Once msw resolves relative URLs, a passed-through request goes to jsdom's origin, `http://localhost:3000`
  (Q5).
- **The shipped stack publishes the app on exactly that address.** `docker-compose.yml:118` and
  `deploy/release/docker-compose.yml:130` both publish `"${MYFINANCE_BIND_ADDRESS:-0.0.0.0}:3000:80"`, and
  nginx proxies `/api` to the backend (`ARCHITECTURE.md:280–292`).
- In passwordless mode, every request is authenticated as the local account (`ARCHITECTURE.md:128–145`).
- While matching, msw appends the document's cookies to the intercepted request's own headers
  (`HttpHandler.parse`, `msw/src/core/handlers/HttpHandler.ts:128`, then `getAllRequestCookies` and
  `request.headers.append('cookie', …)`). A passthrough performs that same request object
  (`fetch/index.ts:72–77`). The planted XSRF cookie and the client's `X-XSRF-TOKEN` header would therefore
  travel together.
- Whether Spring's CSRF check would accept such a request depends on how the backend parses the possibly
  duplicated cookie header. **Not determined.** `GET` requests need no token either way.
- Today's unit tests are network-safe **by accident**: their relative URLs cannot resolve (Q5). Adopting
  msw removes that accident.

➡️ (d), four independent guards:
1. **`'error'`**, so an unanswered request is never performed.
2. **A catch-all default handler**, last in the default list. It answers every request that no earlier
   handler answered, with a network error, and records the request. This closes the "resolver returned
   nothing" hole, because `executeHandlers` falls through to it.
3. **A unit-test origin under the reserved `.invalid` top-level domain** (RFC 6761), for example
   `http://my-finance.invalid`, set as Vitest's jsdom URL. Even a passthrough then cannot reach a local
   instance. The name is also self-explanatory in failure output.
4. **Rules for tests**: never `passthrough()`, never `bypass()`, never `resetHandlers(...list)` with
   arguments (that would drop the catch-all), never `Set-Cookie`.

⚖️ Strongest argument against: four guards for a failure that needs both a buggy test and a running
instance is belt and braces. Moving the origin also changes configuration to prevent something
hypothetical.

✅ Decision: (d), as a **hard invariant: nothing a unit test does ever reaches a socket.** The failure being
prevented is a unit test run reading, and possibly changing, the owner's real data through a running
instance.
- With the catch-all in place every request matches, so `'error'` never fires. It stays as the second line
  in case the catch-all is ever dropped.
- The catch-all and the origin are what protect against a future msw upgrade that changes the legacy
  compat path.
- No test or source file depends on `localhost:3000`. A grep for `window.location|location.href|
  location.origin|baseURI|localhost|document.cookie|localStorage|sessionStorage` finds only the email
  string `local@localhost` in three tests, and no source file uses `window.location` or web storage.

Unblocks Q7 and Q8.

---

❓ **Q7** - **Lifecycle: where the server is started, reset and stopped, and for which files.** Options:
- (a) in the shared setup file, for every test file;
- (b) opt-in, through an import in each network-seam file.

🔎 Facts:
- `setupFiles` runs `src/test/setup.ts` before each test file. It already registers `afterEach(cleanup)`
  (`src/test/setup.ts`).
- The hook-mocked files make no requests: every hook they use is mocked, and no client call site lives
  outside the hooks (Q2).
- `setupServer` exposes `listen`, `use`, `resetHandlers`, `restoreHandlers`, `listHandlers`, `close`,
  `events` and `boundary` (`msw/src/node/glossary.ts`, `setup-server.ts`).
- The jsdom environment is torn down per file, and the window is closed (`vitest` chunk `index.1_nbEjJY.js:1374–1381`).

➡️ (a):
- The setup file starts the test server before each file's tests.
- After each test, in one hook, it unmounts, resets runtime handlers, and takes and clears the per-test record,
  and only then runs the unanswered-request check (Q8). The existing unmount-only hook is folded into it.
- After each file it closes the server.
- In a hook-mocked file it is inert.

The rule "the network is always fake in unit tests" is then a single rule. It holds the safety invariant for
every file, including a future one whose author forgot an import.

⚖️ Strongest argument against: (b) makes the dependency visible, and it costs nothing in files that don't
need it.

✅ Decision: (a). Patching `fetch`/XHR/`http`/`WebSocket` once per file is cheap. With (b), a forgotten
import would not fail loudly: the relative URL would simply fail to resolve and the request would error
out. Unblocks Q8, Q9, Q10 and Q13.

---

❓ **Q8** - **Unanswered requests: what happens, and how does the test fail?** Options:
- (a) msw's `'error'` alone;
- (b) the catch-all records the request, and a per-test check fails the test, naming the method and URL.

🔎 Facts:
- `'error'` prints `Error: intercepted a request without a matching request handler: • GET …` to the
  console and fails only that one request (`on-unhandled-frame.ts`). The test then fails only if it waits on
  that response.
- The re-throw after `errorWith` (`InterceptorHttpNetworkFrame.errorWith`: `controller.errorWith(reason)`,
  then `throw reason`) may also surface as an unhandled rejection. That is traced through
  `@mswjs/interceptors/src/utils/handleRequest.ts` and **not executed**. The catch-all means this path is
  never reached.
- An error thrown in `afterEach` fails the test it follows: `callSuiteHook(… 'afterEach' …)` inside `try`,
  with `failTask` (`node_modules/vitest/dist/chunks/run.CQOUYP-x.js:3891–3897`).
- Hook order defaults to `"stack"` (`index.B89dZ0-N.js:14595`).
- In that mode, `callSuiteHook` runs after-each hooks in a sequential loop with no per-hook catch
  (`run.CQOUYP-x.js:3574–3592`, loop at 3588). Compare `callTestHooks`, which catches per hook (3566–3570).
  A throwing after-each hook therefore skips every hook after it, including unmount.

➡️ (b):
- The catch-all appends "METHOD URL" to a per-test list and answers with a network error.
- The setup file's after-each check fails the test when the list is not empty. The failure lists every
  unanswered request and says to declare it with `server.use` in that test.
- The list is cleared before each test.
- The check runs last, inside the same after-each hook as unmount and handler reset. A failure therefore never
  leaves the previous render mounted, or its handlers active, for the next test. This point was added after
  review, once the sequential hook loop was confirmed.

⚖️ Strongest argument against: the console message is usually enough, and the check is a second mechanism.

✅ Decision: (b). Take a Dashboard test that did not declare the pinned tiles' `GET /api/insights`. It would
pass while rendering an error branch it never meant to render; with (b) it fails and names the request.
Unblocks Q13, Q16 and Q23.

---

❓ **Q9** - **Cookies and CSRF in tests.** Options:
- (a) put `XSRF-TOKEN` into `document.cookie` before each test;
- (b) make the session handler send `Set-Cookie`;
- (c) no cookie by default.

🔎 Facts:
- The client echoes the cookie only on non-`GET` requests (`client.ts:78–81`; `apiDownload` 134–135;
  `apiUpload` 157–158).
- msw never writes `Set-Cookie` into `document.cookie`, and it persists its own jar in `localStorage` (Q5).
  So (b) would not reach the client, and it would leak cookie state across the tests of a file.
- In production the cookie is bootstrapped by `GET /api/auth/me` (comment at `src/api/hooks/auth.ts:14–18`).
  The backend sets it on every response (`backend/.../security/CsrfCookieFilter.java:15–17`).
- tough-cookie 6's `CookieJar` defaults `allowSpecialUseDomain` to `true`
  (`node_modules/tough-cookie/dist/index.js:1406`), and jsdom's jar adds `looseMode`
  (`node_modules/jsdom/lib/api.js:24–27`). The public-suffix rejection applies only to cookies that carry a
  `Domain` attribute. So a host-only cookie on `my-finance.invalid` should be stored. That is read from
  source, not executed.

➡️ (a):
- Plant a fixed, obviously fake token before each test.
- Handlers never send `Set-Cookie`.
- A test about "no cookie, no header" deletes the cookie itself; the next test plants it again.

⚖️ Strongest argument against: planting the cookie globally hides the bootstrap order (in production the
cookie exists only after `/api/auth/me`).

✅ Decision: (a). It mirrors the steady state after bootstrap, and bootstrap order is the server's behaviour,
not the frontend's. The step-1 CSRF test proves that the cookie round-trips on the `.invalid` origin.
Unblocks Q19.

---

❓ **Q10** - **Timers, retries and the other determinism rules.** Options: fake timers allowed or not;
retries; query client per test; concurrency.

🔎 Facts:
- TanStack Query 5.102.2 batches observer notifications through `setTimeout(cb, 0)`. See
  `@tanstack/query-core/build/modern/notifyManager.js:1–3`, where `defaultScheduler =
  systemSetTimeoutZero`, and `timeoutManager.js:55–57`.
- Vitest 5's default fake timers fake every timer except `nextTick` and `queueMicrotask`
  (`node_modules/vitest/dist/chunks/index.OVGXnVRj.js:6819–6821`). Under fake timers, a real query's result
  therefore never reaches the component until time is advanced.
- `renderWithProviders` builds a fresh `QueryClient` per call, with retries off
  (`src/test/renderWithProviders.tsx:12–14`). Production also sets `retry: false` and
  `refetchOnWindowFocus: false` (`src/main.tsx:9–17`).
- `Transactions.test.tsx` uses fake timers in two tests and restores real timers in `afterEach` (77–79,
  149–182).
- `server.use` changes a handler list shared by all tests of the file (`msw/src/node/setup-server.ts`;
  `server.boundary` exists for concurrent tests).

➡️
- Network-seam tests run on **real timers**.
- A pending or loading state comes from a handler the test **holds open** and releases itself, never from a
  wall-clock delay.
- Anything that depends on a response is awaited with `findBy…` or `waitFor`.
- Retries stay off, and there is a fresh query client per test (both already true).
- No `test.concurrent` in network-seam files.
- A held-open answer is released before the test ends.

⚖️ Strongest argument against: with real timers, a debounce's exact boundary cannot be pinned at the
network seam (Q26).

✅ Decision: as recommended. Q26 records the one known exception. Unblocks Q16 and Q28.

---

## Round 3 — typing and fixtures (depends on Round 2)

❓ **Q11** - **How are bodies typed against the wire contract, and against which types?** Options:
- (a) the wire types module, `src/api/types.ts`, which holds the types the hooks already parse;
- (b) the generated schema types directly (`components['schemas']`, `paths`);
- (c) untyped.

🔎 Facts:
- The body parameter of `HttpResponse.json` is `NoInfer<BodyType>` (`msw/src/core/HttpResponse.ts`, the
  `json` signature). The body type therefore comes from an explicit type argument or from the handler's
  declared response type. It is **never inferred from the object literal**.
- `http.*` handlers default the response-body type parameter to `undefined` (`msw/src/core/http.ts:14–26`).
  That makes the resolver's expected return a plain `Response`
  (`handlers/RequestHandler.ts` `ResponseResolverReturnType`), so an untyped handler accepts any JSON.
- A handler that declares a success response type cannot also return a Problem, because the return type is
  narrowed to `HttpResponse<ResponseBodyType>`.
- Test files are type-checked by `tsc -b` in `npm run build`, which CI runs (Q1). `vitest run` does not
  type-check.
- `src/api/types.ts`: 12 aliases of generated request types (`RegisterRequest`, `LoginRequest`,
  `CreateProfileRequest`, `UpdateProfileRequest`, `CreateCategoryRequest`, `UpdateCategoryRequest`,
  `CreateTransactionRequest`, `MerchantBackfillRequest`, `CreateBudgetRequest`,
  `CreateSubscriptionRequest`, `UpdateSubscriptionRequest`, `BackupExportRequest`). Every response type is
  hand-written.
- The generated file is stale: it has no `authMode` and no `/api/auth/password` (G7 card, verified by the
  frontend report §2a).
- The hooks name each response type at the call site, for example `api<CategoryNode[]>`
  (`src/api/hooks/categories.ts:12`).

➡️ (a). Each JSON answer names the wire type that the matching hook parses, using `HttpResponse.json` with an
explicit type argument, and the fixture builders return those types. Handler-level response type parameters
are not used, because they forbid a handler that answers with either success or a Problem. When candidate
15 makes the wire types module derive from the generated schema, fixtures follow through the same import,
with no test edits.

⚖️ Strongest argument against: (b) is "the contract itself", and the wire types module may diverge from the
backend.

✅ Decision: (a). The wire types module is what the frontend believes, and that belief is what these tests
exercise. Its accuracy against the backend is candidate 15's job. The check happens at compile time only: a
wrong field fails `npm run build`, CI and the editor, not `npm test`. Unblocks Q12 and Q14.

---

❓ **Q12** - **Enforcement: how does "a fixture with a wrong field fails to compile" hold in practice?**
Options:
- (a) documentation only;
- (b) an ESLint `no-restricted-syntax` rule for test files requiring a type argument on JSON answers;
- (c) typed wrapper helpers per endpoint.

🔎 Facts:
- `eslint.config.js` already has a block for test files: `e2e/**/*.ts`, `playwright.config.ts`,
  `**/*.test.{ts,tsx}`, `src/test/**/*.{ts,tsx}`.
- `npm run lint` runs in CI (`ci.yml:31`).
- In typescript-eslint 8.69.0, `CallExpression` carries `typeArguments`
  (`node_modules/@typescript-eslint/types/dist/generated/ast-spec.d.ts:333–339`).

➡️ (b), inside the same restricted-syntax rule as the hook-mock ban (Q24). Its message points at the
ARCHITECTURE.md paragraph. The main line of defence remains the builders (Q14): a builder is typed, so even
an untyped answer that wraps a builder is checked. (c) is rejected: a wrapper per endpoint would be a second
hooks layer inside the tests.

⚖️ Strongest argument against: a style rule for tests is unusual, and it can be bypassed (for example by
building `new HttpResponse(JSON.stringify(…))` by hand).

✅ Decision: (b), as a signpost rather than a proof. The selector is verified by planting a violation in its
step. Not executed here. Unblocks Q24 and Q31.

---

❓ **Q13** - **Default answers: what does every test get without asking?** Options:
- (a) the session and the catch-all only;
- (b) every `GET` endpoint with an empty but valid body;
- (c) nothing (each test declares even the session).

🔎 Facts:
- Every profile-scoped query waits for the session with `enabled: profileId !== null`, for example
  `src/api/hooks/categories.ts:13`.
- `useActiveProfile` and `useActiveProfileId` derive from `useSession` (`src/api/hooks/auth.ts:36–44`).
- `useSession` (`auth.ts:19–33`) has `staleTime: 60_000` (line 30) and `retry: false` (line 31), so it
  makes one request per query client.
- `AppLayout` guarantees a session with an active profile before any screen renders (`src/App.tsx:71–89`).

➡️ (a). The default session is signed in, in password mode, with one profile "Household" (PLN) active: the
state `AppLayout` guarantees. Variants override `GET /api/auth/me` inside the test: signed out (a `401`
Problem), passwordless (`authMode: 'NONE'`, the local account `local@localhost` per `ARCHITECTURE.md:131`),
and no active profile.

⚖️ Strongest argument against:
- For (b): a test would need fewer handlers.
- Against (a): every test must declare the screen's other endpoints.

✅ Decision: (a). (b) would hide what a screen calls, serve data nobody chose, and make the unanswered-request
failure uninformative. Under (a), the declared handlers document the screen's network conversation.
Unblocks Q14 and Q20.

---

❓ **Q14** - **Shared fixtures: what is centralised, and what stays local?** Options: centralise everything;
centralise the common wire objects; keep everything local.

🔎 Facts:
- **Duplication:**
  - an identical `useActiveProfile: () => ({ id: 1, name: 'Household', defaultCurrency: 'PLN' })` in 6 files
    (`Insights`, `Transactions`, `Subscriptions`, `Budgets`, `BudgetForm`, `TxnModal`), plus a variant in
    `Dashboard.test.tsx:39` (`'Audit Probe'`, id 46);
  - a session fixture in 4 files (`ProfilePicker`, `SetPassword`, `Nav`, `hooks.invalidation`);
  - `tileValue()` twice (`Dashboard.test.tsx:60`, `Transactions.test.tsx:94`).
- **Drift:**
  - `Insights.test.tsx:17` has `granularity: null`, but `Plan` has `interval` (`src/api/types.ts`, `Plan`).
  - Category roots have `depth: 0` in 5 files (`Transactions.test.tsx:42`, `Subscriptions.test.tsx:54`,
    `Budgets.test.tsx:7`, `BudgetForm.test.tsx:7`, `TxnModal.test.tsx:12`), but `depth: 1` in
    `Categories.test.tsx:24` and `Dashboard.test.tsx:12–13`. The app is 1-based: `(node.depth - 1) * 22` and
    `L{node.depth}` (`src/screens/Categories.tsx:173,251`), and API.md's example gives roots `"depth": 1`.
  - The subscription fixtures lack the required `createdAt` (`Subscriptions.test.tsx:11–35` against
    `SubscriptionResponse`).
  - The dashboard stub lacks `asOf`, `activeCount`, `pausedCount`, `yearlyCost` and `byCategory`
    (`Subscriptions.test.tsx:46–48`).
  - Amounts use scale 2 (`'29.99'`), while the wire uses the stored scale 4 (API.md 100–101).
  - Insights J10 uses the slug `/errors/insight-not-found` (`Insights.test.tsx:176`). The backend's `404`
    slug is `/errors/not-found`
    (`backend/.../exception/ResourceNotFoundException.java:12`: `super(HttpStatus.NOT_FOUND, "not-found", …)`),
    and no `insight-not-found` exists.
- G8 hands the session and active-profile duplication to this candidate (G8 card, "Duplication worth a
  glance").

➡️ Centralise, as typed builders with wire-format defaults, every wire object that more than one test file
needs: the rule of two.
- **From step 1:** the session and its profile, which the default session answer and every override use;
  and the Problem answer (Q15), which the client tests and the App tests both use.
- **Expected next**, each entering when a second file needs it:
  - a category tree built from nesting, with `depth` and `parentId` derived (a root is depth 1);
  - a transaction;
  - a page of results.

  Until then, the one test that needs such an object declares it locally, typed against the wire types
  module. The first conversions of legacy files are the expected second users.

Keep scenario data, handlers and DOM helpers local. Builders return fresh objects, and no test mutates a
shared object.

*Revised after review.* The first draft named all five builders as a set to add at once. Only the
session/profile and the Problem answer have two users from the start, so the other three follow the rule of
two like any later builder.

⚖️ Strongest argument against: builders hide the data a test depends on, so a reader has to jump to another
file.

✅ Decision: as recommended. A test overrides, visibly, the fields it is about. Builders hold only defaults
and invariants, including the ones types cannot express (1-based depth, scale-4 amounts). `tileValue` is a
DOM helper in two legacy files and is out of scope. Unblocks Q15 and Q19–Q21.

---

❓ **Q15** - **Error, empty, file and failure answers.** Options: one generic Problem helper; one named
helper per error kind; no helpers.

🔎 Facts:
- **Error parsing.** For any non-2xx answer the client tries to parse the body as JSON. It falls back to
  `Request failed with status N.` and the type `/errors/unknown` (`client.ts:25–38, 102–117`).
- **204.** A `204` resolves `undefined` without parsing (`client.ts:90–92`).
- **Download.** `apiDownload` reads `Content-Disposition` and falls back to `my-finance-backup.json`
  (`client.ts:146–148`).
- **Upload.** `apiUpload` sends `FormData` without setting `Content-Type` (`client.ts:151–170`).
- **Auth events.** The client fires them on `401`, and on `409` with `/errors/no-active-profile`, unless
  `skipAuthEvent` is set (`client.ts:110–115`).
- **Backend Problem shape.** The backend writes `type`, `title`, `status` and `detail`
  (`ProblemDetailResponseWriter.java:30–38`; `ApiException` for the rest).
- **Network failure.** `HttpResponse.error()` makes the `fetch` reject: `isResponseError`, then
  `createNetworkError` (`@mswjs/interceptors/src/interceptors/fetch/index.ts:102–107`).

➡️ One **Problem answer** helper. It takes a status, a slug and a detail, plus an optional title, field
errors and extension members. It serves `application/problem+json` in the backend's shape, using the slugs
the backend really sends: API.md "Errors", plus the security layer's `unauthenticated` and `forbidden`
(Q1).

Other answers need no helper:
- backend unreachable: msw's network-error answer;
- deletes: an empty `204`;
- a download: a body plus `Content-Disposition`.

⚖️ Strongest argument against: named helpers such as `notFound()` or `noActiveProfile()` read better.

✅ Decision: one generic helper now; named ones only when the rule of two asks for them. The body shape is
declared locally in test support. If candidate 2 adds a frontend Problem type, the helper adopts it.
Unblocks Q19–Q21.

---

❓ **Q16** - **How do tests observe outcomes?** Options: DOM only; DOM plus captured requests; request
counts.

🔎 Facts:
- Today's tests assert on what was passed to `mutate`:
  - `BudgetForm.test.tsx:35–46`: `amountLimit` is the string `'1500.50'`;
  - `Transactions.test.tsx:232–263`: the update body;
  - `Transactions.test.tsx:285–298`: `merchant: null`.
- The invalidation test asserts cache state: `getQueryState(…)?.isInvalidated`
  (`hooks.invalidation.test.tsx:53`).

➡️
1. **The DOM first**: assert what the user sees.
2. **Captured requests**, inside the handler, only for wire properties the user cannot see: body fields
   (money as strings, explicit nulls), query parameters, the CSRF header, the multipart part.
3. **Request counts** only in the hooks refresh-contract test (Q21). At that seam, "the dependent query
   asked the server again" is the thing to observe.
4. **Never cache state.**

⚖️ Strongest argument against: capturing requests couples tests to the wire format. It does, but the wire
format is the contract.

✅ Decision: as recommended. Unblocks Q19–Q21 and Q25.

---

## Round 4 — the deepened module and the first targets (depends on Round 3)

❓ **Q17** - **The shape of the deepened module(s)**: what is the interface, in prose?

🔎 Facts: Q2–Q16. In particular, 44 hooks and 30 invalidation lines sit behind names that screens import
(`src/api/hooks/index.ts` barrel), and every request passes through the client module.

➡️ There are two modules.

**(1) The module under test: the frontend data path.** Screens and connected components, the hooks, the
client and the route gates, tested together.
- Interface: the DOM on one side (what a user sees and does) and HTTP on the other (the wire contract).
- Depth: a great deal of behaviour sits behind those two unchanging interfaces: query keys, the cache's
  profile scoping, `enabled` gating, invalidation, CSRF, Problem parsing, auth events and redirects.
- Leverage: a screen test only needs to know which HTTP answers the screen will see. Renaming or splitting
  a hook breaks no test.

**(2) Test support: the test server plus the wire fixtures.**
- Operations:
  - declare answers for this test (msw handlers through `server.use`);
  - the default answers: the session, and the catch-all;
  - typed builders;
  - the Problem answer;
  - the planted XSRF cookie.
- Invariants:
  - every test starts with only the default answers, a fresh query client, the XSRF cookie and real timers;
  - nothing reaches a socket;
  - every request is answered by a handler that the test or the defaults declared, or the test fails and
    names the request;
  - bodies are typed against the wire types module;
  - handlers never set cookies;
  - handlers are canned answers that branch only on the parameter the test is about. They are never a fake
    backend: no filtering, aggregation or validation.
- Ordering constraints:
  - declare answers before the render or action that sends the request (a runtime handler applies to
    requests that start after it was added);
  - override the session before rendering, since it is fetched once per query client;
  - delete the XSRF cookie before acting.
- Error modes:
  - an unanswered request fails the test, naming its method and URL, and the app sees a network error;
  - a handler that throws is turned into a `500` answer for the app, with msw's console error.
    `handleRequest.ts` coerces unhandled listener exceptions to a `500`: "Otherwise, coerce unhandled
    exceptions to a 500 Internal Server Error response";
  - a wrongly shaped body is a `tsc -b` error, not a test failure.
- Configuration: none per file. The strategy, the origin and the defaults are fixed for all unit tests.
- Deletion test: delete test support and its complexity reappears in every network-seam file (lifecycle,
  cookie, unanswered check, session answer). It earns its keep.

⚖️ Strongest argument against: calling test support a "module" with invariants is overkill.

✅ Decision: as described. These invariants are exactly what a contributor must know to write a correct test
(Q33 lists what breaks without each one). Unblocks Q18–Q24.

---

❓ **Q18** - **The first modules to test through the network seam, and their order.** Options:
- client, then hooks, then gates;
- client, then gates, then hooks;
- screens first.

🔎 Facts:
- `client.ts` has 179 lines and no test. The last one, `client.test.ts`, covered only `AbortSignal`
  forwarding and was deleted in `2c252b6`, per the frontend report §2i. I did not re-read that commit.
- The gates and listener: `App.tsx:20–40` (listener), `52–89` (the three gates). E2e covers only the initial
  no-active-profile bounce (`e2e/smoke.spec.ts:556–571`) and the normal `/auth` → `/picker` → `/`
  navigation.
- No test at any level makes a request answer `401` or `409` in the middle of a session (grep of `e2e/`
  for `401|no-active-profile`: none).
- Invalidation: 30 lines, 1 edge tested. The frontend report found no live missing edge. `staleTime` is 0
  (`main.tsx:9–17` sets none), which masks most mistakes.

➡️
1. **Client**: the base that every other network-seam test relies on. Its tests are the smallest (no React),
   and they prove the harness facts: relative URLs, the cookie, `FormData`, headers.
2. **App's gates and auth events**: user-visible flows with no coverage at any level.
3. **The hooks' refresh contract**: this replaces the only test that stubs `api`, and extends coverage from
   one edge to every mutation family.

⚖️ Strongest argument against: the card lists invalidation second, and the `insight-result` bug is the
documented motivation.

✅ Decision: client, then gates, then hooks. Gates and hooks are independent once step 1 exists. Gates go
first because their branches are covered nowhere, while invalidation has a safety net (`staleTime` 0) and a
test. Unblocks Q19–Q21 and Q31.

---

❓ **Q19** - **The client module's tests**: which behaviours?

🔎 Facts: `client.ts` 15–44 (`ApiError`), 46–49 (`readCookie`), 55–63 (auth event), 72–99 (`api`), 102–117
(`throwApiError`), 129–149 (`apiDownload`), 155–170 (`apiUpload`), 172–179 (`queryString`, a pure
function).

➡️ One test file for the client module, at the network seam.

`api`:
- a `GET` sends no `X-XSRF-TOKEN` and no `Content-Type`;
- a mutating method sends the decoded cookie value in `X-XSRF-TOKEN`, and JSON with `Content-Type`;
- no cookie means no header;
- a 2xx JSON answer resolves to the parsed body;
- a `204` resolves without parsing;
- a Problem becomes an `ApiError` with its status, type, title, detail, `errors` and extension members;
- a non-JSON error body (for example a proxy's HTML `502`) gives the fallback detail and `/errors/unknown`;
- a network failure rejects with an error that is not an `ApiError`.

Auth events:
- `401` fires `unauthenticated`;
- `409` `no-active-profile` fires `no-active-profile`;
- a `409` with another slug fires nothing;
- `skipAuthEvent` suppresses both.

`apiDownload`:
- the body blob, and the filename from `Content-Disposition`;
- the fallback filename;
- the CSRF header;
- a Problem.

`apiUpload`:
- a multipart body whose part `file` carries the file's content;
- no JSON content type;
- the CSRF header;
- a `422` `backup-invalid` whose `problems[]` reach `extra`.

`queryString`, being pure, is tested directly in the same file.

⚖️ Strongest argument against: screen tests will cover some of this indirectly.

✅ Decision: the list stands. This is the contract every network-seam test leans on, and none of it runs in
any test today. A test that listens for the auth event removes its listener before it ends.

---

❓ **Q20** - **App's route gates and auth events**: which behaviours?

🔎 Facts:
- **`AuthGate`** (53–60): pending shows the splash; a session redirects to `/` or `/picker`; no session
  shows `AuthScreen`.
- **`PickerGate`** (63–68): no session redirects to `/auth`.
- **`AppLayout`** (71–89): no session redirects to `/auth`; no active profile redirects to `/picker`,
  carrying the `from` state.
- **The listener** (20–40): `401` sets the session to null and navigates to `/auth`; `409` clears
  `activeProfileId` and navigates to `/picker`.
- **Logout** (`Nav.tsx:97`, `hooks/auth.ts:64–73`): posts, clears the cache and navigates to `/auth`.
- **Router placement**: `App` holds no router; `BrowserRouter` lives in `main.tsx:22`. So `App` renders
  under `renderWithProviders`' `MemoryRouter`, which leaves `window.location` alone.

➡️ One test file for `App`, rendered at a route with the default session or an override:
- the splash while `/api/auth/me` is held open;
- signed out, at an app route or at `/picker`, lands on the sign-in screen;
- signed in without an active profile, at an app route, lands on the picker; after a profile is picked
  (`PUT /api/auth/active-profile` carries `{ profileId }`) the user returns to that route;
- signed in without an active profile, at `/auth`, lands on the picker;
- signed in with an active profile, at `/auth`, lands in the app;
- in the middle of a session, a request answering `401` lands on the sign-in screen;
- in the middle of a session, a request answering `409` `no-active-profile` lands on the picker;
- "Log out" posts, answers `204`, and lands on the sign-in screen.

A test lists the answers for the target screen's own requests in a local list, which doubles as
documentation of that screen's network conversation.

⚖️ Strongest argument against: this overlaps e2e's deep-link test.

✅ Decision: kept. The overlap is one test. The unit version adds the wire body of the profile switch and
runs in milliseconds, and the mid-session branches exist nowhere else. These tests are also the in-repo
example of a screen-level test at the network seam (Q25).

---

❓ **Q21** - **The hooks' refresh contract, and replacing the invalidation test.** Options:
- keep the old test and add;
- replace it with network-seam tests of every mutation family;
- test every one of the 30 lines individually.

🔎 Facts:
- `useInvalidateTransactionData` (`transactions.ts:102–120`, 9 keys, `insight-result` at 118).
- `useInvalidateCategoryData` (`categories.ts:36–48`, 7 keys).
- `useInvalidateBudgets` (`budgets.ts:29–36`).
- `useInvalidateSubscriptions` (`subscriptions.ts:32–39`), plus delete's extra `['transactions', …]`
  (`subscriptions.ts:65–71`).
- `useInvalidateInsights` (`insights.ts:29–40`).
- The profile mutations update the session (`profiles.ts:22–84`), and restore invalidates the session
  (`profiles.ts:110–115`).
- `useProfiles` has 0 callers (grep), so its `['profiles']` invalidations refresh nothing that is mounted.
- Invalidation refetches only mounted queries.

➡️ Replace. One test file for the refresh contract. For each mutation family, mount the queries it must
refresh (one hook-rendering with a query client wrapper), run one mutation of the family, and assert that
each mounted query asked the server again. For the documented bug, assert that the pinned result shows the
new answer.

Families:
- transaction data, through delete, covering all nine keys;
- category data, through update;
- budgets;
- subscriptions, plus delete's refresh of transactions;
- insights;
- profile create, rename and delete, whose session updates are visible in `useSession`'s data, and
  restore's session refetch.

Auth mutations are covered at App level (Q20). The old test is deleted in the same step. No assertion
covers `['profiles']`, because it would be testing dead code, which G8 owns.

⚖️ Strongest argument against: this pins the invalidation map, so a future key refactor could break the
tests.

✅ Decision: replace. The tests talk to hooks and to the network, never to keys, so a key refactor that
keeps behaviour keeps them green. That is the point of the seam.

---

## Round 5 — policy (depends on Rounds 3–4)

❓ **Q22** - **Policy for the 12 hook-mocked files, and the rule for a contributor adding a test.** Options:
- (a) untouched forever;
- (b) converted when next edited;
- (c) a planned conversion;
- (d) a file converts as a unit the first time it needs a network-seam test;
- (e) a sibling network-seam file per module.

🔎 Facts:
- `vi.mock` is hoisted and file-scoped. Every file declares it at the top level (for example
  `Budgets.test.tsx:32`), so one file cannot mix the two seams.
- One test file per module is the current convention: 15 files, each named after its module.
- The 12 files hold 83 tests in 1,625 lines (18+47+130+46+95+143+91+193+187+99+240+336).
- G3's candidates edit 7 of them (G3 card).
- G3's dialog draft deletes 3 tests from `TxnModal.test.tsx` and adds a prop-driven dialog test file, noting
  that "Candidate 8's seam does not apply (no network)" (`out/03-dialog-module/grilling.md:477–483,512–513`).

➡️ (d), stated as a decision procedure that depends on what the test touches:
1. Does the module under test, or a child it renders, import the hooks or client module? If not, call it
   (pure logic) or render it with props. No msw, no mocks.
2. If it does, the new test uses the network seam, whatever it asserts.
3. It goes in the module's own test file. If that file mocks the hooks module, first convert the whole file
   to the network seam in its own commit: same test names, the same assertions wherever the seam allows,
   no behaviour change. Then add the new test.
4. Editing an existing hook-mocked test in place is allowed: new text, a changed expectation, deleting a
   test, or adding one stub entry because the screen now calls one more hook. Only a new test triggers a
   conversion.
5. Never add a new mock of the hooks or client modules.

⚖️ Strongest argument against: the first network-seam test for a big file (Subscriptions has 13 tests,
Transactions 17) carries a large conversion. (e) would avoid that, at the price of two files and two seams
per module indefinitely.

✅ Decision: (d).
- One seam per file is a physical constraint, and one file per module is the existing convention.
- Each conversion retires a hook mock for good ("replace, don't layer").
- Conversions happen when needed, never on a schedule.
- (b) was rejected because it would tax every small edit.
- (c) contradicts "not rewritten wholesale".
- (e) layers two seams and stalls the migration.

Unblocks Q23, Q24, Q26 and Q27.

---

❓ **Q23** - **Component mocks: which stay allowed in network-seam tests?**

🔎 Facts:
- `Insights.test.tsx:22–39` mocks `ChipBar` (a probe) and `ResultRenderer`: "recharts … needs real layout".
- `Dashboard.test.tsx:36` mocks `PinnedInsights` to `() => null`.
- `Transactions.test.tsx:81` mocks `MerchantBackfill` to `() => null`.
- `Nav.test.tsx:29–31` mocks `TxnModal`'s hook.
- `ProfilePicker.test.tsx:46–49` mocks `useNavigate`.
- `SetPassword.test.tsx:34–42` observes navigation by rendering probe routes instead.

➡️
- **Allowed:** mocking a presentational child that jsdom cannot render meaningfully (the Recharts charts).
- **Not allowed:** mocking a connected child, one that reaches the server, to skip its requests. Its
  requests are part of the screen's network conversation, and the unanswered-request check exists to make
  the test declare them.
- **Navigation** is observed through probe routes, not a mocked `useNavigate`.

⚖️ Strongest argument against: declaring `PinnedInsights`' requests in every Dashboard test adds handlers
that have nothing to do with the KPI tiles.

✅ Decision: as recommended. A local list of quiet answers for a screen's background requests is fine.

---

❓ **Q24** - **Enforcing the policy.** Options: documentation only; a lint guard with a shrinking allowlist.

🔎 Facts: see Q12. The allowlist when the guard lands: the 12 hook-mocked files plus the invalidation test,
which mocks `'./client'`. After step 4 it holds 12.

➡️ One restricted-syntax rule for test files with two parts:
- no `vi.mock` of the hooks or client modules, matched by module specifier, outside the allowlisted files;
- JSON answers name their wire type (Q12).

Each message points at the ARCHITECTURE.md paragraph. When a file converts, it leaves the allowlist in the
same commit and can no longer regress.

⚖️ Strongest argument against: it adds noise to the configuration, and the allowlist is a to-do list living
in config.

✅ Decision: accepted. The allowlist is the migration's progress, visible in one place. It is also the
signpost for contributors, human or agent, who never open ARCHITECTURE.md. The selectors are verified by
planting violations in step 2.

---

❓ **Q25** - **What a screen test looks like at the network seam versus today, and what it can now assert.**

🔎 Facts: Q16, Q19–Q21; the existing tests quoted there.

➡️
- **Today:** arrange by stubbing hook results, act, then assert the DOM and `mutate`'s arguments.
- **At the network seam:** arrange by declaring typed answers, act, then assert the DOM (awaiting data) and,
  for wire properties, the captured request.

Behaviours it can now assert:
1. The wire body and the query string exactly as sent: amounts still strings after serialisation, `merchant:
   null` as an explicit clear, the Transaction filter's parameters.
2. The CSRF header on every mutating request and on none of the reads.
3. A Problem from the server reaching the screen through the real parsing: slug, detail, field errors,
   `problems[]`, non-JSON bodies.
4. What the screen shows after a mutation, such as the refreshed list.
5. Loading and error states produced by the real hooks.
6. Session effects: `401` mid-session, `409` `no-active-profile`, and caches re-scoped by a profile switch.
7. The `204`, download and upload paths.
8. Enable-gating: no profile-scoped request before the session resolves.
9. Resilience: a hook renamed or split breaks no test.

The App tests (Q20) are the in-repo example; no file conversion is scheduled to demonstrate it.

⚖️ Strongest argument against: tests become asynchronous, with a `findBy` anchor before most assertions.

✅ Decision: accepted, at the cost stated in Q28.

---

❓ **Q26** - **The known hard case: Transactions' fake-timer tests.**

🔎 Facts:
- The debounce is inline in the screen: `useEffect` plus `setTimeout(…, 300)` (`src/screens/Transactions.tsx:57–61`).
- The two tests read the arguments of the mocked `useTransactions` under fake timers
  (`Transactions.test.tsx:149–182`).
- TanStack notifies through `setTimeout(cb, 0)`, and Vitest fakes `setTimeout` (Q10).

➡️ No step converts Transactions. If that file ever converts, the converter must do one of two things:
- prove that Vitest's asynchronous timer advance settles both TanStack's zero-delay notifications and msw's
  promise chain, and then assert the request's `q` and `page` parameters at 299 ms and at 300 ms; or
- keep those two tests in a narrow hook-mocked file of their own, named for the timer they pin, and leave it
  on the allowlist.

⚖️ Strongest argument against: the second route is the one sanctioned exception to "one file per module".

✅ Decision: recorded. The exception is narrow, named after what it pins, and visible in the allowlist.

---

❓ **Q27** - **Drifted fixtures in the legacy files: fix now, or at conversion?**

🔎 Facts: Q14's drift list. None of those fields affects what its test asserts.

➡️ At conversion, through typed builders, which turn each drift into a compile error. At that point the J10
slug becomes `/errors/not-found`.

⚖️ Strongest argument against: known-wrong fixtures stay in the tree meanwhile.

✅ Decision: at conversion. Fixing them now would touch legacy files for no behaviour change, against the
surgical rule. The list is handed over in the spec's Further Notes.

---

## Round 6 — cost, tests, sequence, docs (depends on Round 5)

❓ **Q28** - **Cost: test runtime and flakiness.**

🔎 Facts:
- msw resolves each request through in-process promise chains (`handleRequest.ts`, `http-frame.ts`). The
  only timer involved is in msw's `delay()`, which the rules exclude (Q10).
- There are no sockets (Q6).
- Nothing was run.

➡️
- **Expected cost:** one extra asynchronous hop per answer and a `findBy` anchor per test. It is
  **unmeasured**.
- **Measurement:** the step-1 PR reports `npm test` wall time before and after. A network-seam file that is
  clearly slower than its hook-mocked predecessor gets investigated.
- **Flakiness controls:**
  - no sockets;
  - every request is declared;
  - reset after each test;
  - fresh query client, retries off;
  - real timers, and held-open answers instead of delays;
  - no cookie writes by handlers;
  - no concurrency;
  - `findBy` for anything that depends on an answer.

⚖️ Strongest argument against: without a number, "cheap" is a claim.

✅ Decision: measured in step 1, not assumed.

---

❓ **Q29** - **Tests: which survive, which are replaced, which are deleted.**

➡️
- **Survive unchanged:** all 12 hook-mocked files; `ConfirmDialog.test.tsx` (prop-driven);
  `renderWithProviders.test.tsx`.
- **Replaced:** `src/api/hooks.invalidation.test.tsx`, by the refresh-contract test (step 4). It is deleted
  in the same step.
- **New:**
  - the client test (step 1);
  - the App test (step 3);
  - the refresh-contract test (step 4).
- **`renderWithProviders`:** its interface is unchanged. It already provides a fresh query client, a route
  and state.
- **Stale lesson:** the LESSONS entry "Testing a hook that only fires inside another hook's `onSuccess`"
  (`docs/LESSONS.md:2194–2214`) points at deleted files. The new entry supersedes it (Q32).

✅ Decision: as listed.

---

❓ **Q30** - **Test-first, applied to tests of existing behaviour.**

🔎 Facts:
- The CLAUDE.md rule is aimed at new logic, and this candidate adds tests for behaviour that already exists.
- Precedent: the maintenance spec verified ESLint "against a file with three planted defects"
  (`docs/superpowers/specs/2026-09-07-maintenance-run-design.md:265–266`).

➡️ Every new test is seen failing once, by temporarily breaking the behaviour it pins. The break is never
committed:
- remove the `X-XSRF-TOKEN` line;
- drop the `insight-result` invalidation;
- delete the `409` branch of the listener;
- plant a missing handler (the failure must name it);
- plant a lint violation for each selector.

Each PR description records these checks.

✅ Decision: as recommended. A test that cannot fail proves nothing.

---

❓ **Q31** - **Sequence: safe, separately shippable steps.** Each step must leave `lint`, `format:check`,
`test` and `build` green.

➡️
1. **Harness, client tests, docs.**
   - The test server with its two default answers.
   - The wire fixtures (session and profile), the Problem answer.
   - The lifecycle and the unanswered check in the setup file; the planted cookie.
   - The `.invalid` origin in the Vitest configuration.
   - The client module's tests.
   - The ARCHITECTURE.md paragraph, the recommended API.md "Errors" addition, and the LESSONS entry.

   Leaves: every existing test unchanged and green, the client covered, and the policy written down.
2. **Lint guard** with its allowlist (13 files), plus one sentence in ARCHITECTURE.md. Leaves: the policy
   enforced.
3. **App gates and auth events.** Adds any builder that a second file now needs (the rule of two). Leaves:
   every gate branch and both listener branches covered.
4. **The hooks' refresh contract.** Deletes the invalidation test and removes it from the allowlist. The new
   test's transaction and page fixtures stay local until a second file needs them. Leaves: every mutation
   family covered; allowlist at 12.

After step 4 there are no scheduled conversions; the Q22 procedure applies.

⚖️ Strongest argument against: steps 1 and 2 could be one PR.

✅ Decision: kept as two. The guard is the part that could be dropped or tuned on its own.

---

❓ **Q32** - **Docs: which recorded-decision documents change in the same change?**

🔎 Facts:
- `ARCHITECTURE.md` §4 has "Why …" paragraphs (Vite, Recharts, Storybook, at 237–268) but nothing on unit
  tests.
- §5's CI paragraph already names ESLint and vitest (350–351).
- API.md "Errors" omits the security-layer slugs (Q1).
- `docs/LESSONS.md` is git-ignored (`.gitignore:13`).
- It has a Python-side counterpart, "Testing an HTTP client with `httpx.MockTransport` …" (1266–1294).

➡️
- **ARCHITECTURE.md §4** (step 1, plus one sentence in step 2): a paragraph, "Why unit tests fake the
  network, not the hooks".
- **§5**: unchanged.
- **API.md "Errors"** (recommended, step 1): name `401` `/errors/unauthenticated` and `403`
  `/errors/forbidden`, which the fixtures mirror.
- **LESSONS** (step 1): msw set against `httpx.MockTransport`. It supersedes the cache-state entry.
- **The maintenance spec and plan**: historical, not edited.

✅ Decision: as listed. The full proposed text is in docs-proposals.md.

---

❓ **Q33** - **Edge cases and failure modes, with concrete scenarios.**

➡️ Scenario, then outcome:
1. **A Dashboard test forgets `GET /api/insights`** (the pinned tiles). The catch-all answers with a network
   error and records it; the test fails with "unanswered: GET http://my-finance.invalid/api/insights". Q8.
2. **A handler that captures a body forgets to return an answer.** msw falls through to the catch-all, not
   to the network; the test fails, naming the request. Q6.
3. **A test calls `server.resetHandlers(someList)`**, dropping the catch-all. `'error'` still refuses to
   perform the request, and the origin cannot resolve anyway. Q6.
4. **A fixture misspells a field** (`granularity`). `tsc -b` fails in `npm run build` and CI. `npm test`
   still passes, so the editor and CI are where this shows. Q11.
5. **A fixture has the right shape but the wrong convention** (`depth: 0`, `'29.99'`). Types cannot see
   it; the builders' defaults and derivations prevent it. Q14.
6. **A test mutates a shared object** (it pushes into the default session's profiles). This cannot happen:
   the default answer builds a fresh session per request, and builders return fresh objects. Q14.
7. **A handler sends `Set-Cookie`.** The cookie would persist in msw's `localStorage` jar for the rest of the
   file. The rule forbids it. Q9.
8. **A test turns on fake timers.** TanStack's notifications never flush, and `findBy` times out. The rule
   forbids it; Q26 covers the one legacy case. Q10.
9. **A test asserts with `getBy` right after render.** The data has not arrived and the test fails. Use a
   `findBy` anchor. Q10.
10. **A handler throws.** The app sees a `500`, msw logs, and the test fails on its assertion. Q17.
11. **A request is still in flight when the test ends.** Cleanup unmounts, so the late answer has no
    observer, and the next test's handlers are unaffected: the frame captured its handler list when the
    request began (`define-network.ts`, `frame.getHandlers`).
12. **An upload test asserts the part's filename.** Vitest's compat `Request` rebuilds a jsdom `File` as a
    `Blob`, so the name becomes `blob` (`index.1_nbEjJY.js:1422–1432`, `makeCompatFormData` and `makeCompatBlob`). Assert the
    content, not the name.
13. **A download test in a screen** triggers `<a>.click()`. jsdom does not implement navigation. Keep
    download assertions at the client test.
14. **A `409` with another slug** (`category-in-use`). No picker bounce; the client test pins it. Q19.
15. **A contributor adds `vi.mock('../api/hooks')` to a new file.** The lint guard fails the build and
    points at ARCHITECTURE.md. Q24.
16. **A contributor mocks a connected child to skip its requests.** Review, guided by Q23; the lint rule does
    not catch this.
17. **A legacy file needs one new test.** The whole file converts in its own commit first. Q22.
18. **Candidate 15 renames a wire type** (for example `Insight` to `InsightResponse`). Fixtures follow
    mechanically, through compile errors. Q11.
19. **The unanswered check fails a test.** Unmount and handler reset have already run in the same hook, so the
    next test starts clean. One missing answer stays one failure instead of cascading. Q7, Q8.

✅ Decision: each scenario is handled as listed.

---

❓ **Q34** - **Cross-candidate effects.**

➡️
- **G3, candidate 2** (Problem → messages):
  - its mapping table is pure, so there is no seam;
  - per-screen "a server error is shown" tests are new tests of server-reaching modules. Written after step
    1, they use the network seam, where the client parses the real Problem;
  - in a hook-mocked file, such a test triggers that file's conversion (Q22);
  - if candidate 2 adds a frontend Problem type, the Problem answer adopts it.

  Recommended order: steps 1–2 before candidate 2's per-screen tests are written.
- **G3, candidate 3** (the dialog module): prop-driven tests, so no network. Deleting tests from
  `TxnModal.test.tsx` is an in-place edit and triggers no conversion.
- **G3, candidate 5** (form idiom, money input):
  - the money functions are pure;
  - new "Enter submits" or "sends the amount as a string" screen tests are network-seam tests, and are
    stronger there, since they assert the wire body;
  - `BudgetForm.test.tsx`'s two tests may be edited in place.
- **G7, candidate 15** changes what sits behind the wire types module. Fixtures follow through the same
  import, and drift shows up as compile errors, which is the point. There is no ordering constraint.
- **G8, candidate 17:**
  - its stale-comment item on `hooks.invalidation.test.tsx:42` is moot if step 4 lands first;
  - the session and profile duplication is resolved for network-seam tests; the legacy copies go away at
    conversion;
  - its possible bugs 2 (pinned tile, empty result) and 4 (minimal plan) need failing tests of connected
    components, which are network-seam tests. The recommended order is step 1 first. `PinnedInsights`
    renders charts, so its test mocks `ResultRenderer` (allowed, Q23);
  - dead `useProfiles`: no test asserts on it (Q21).
- **G1, candidates 1 and 6:** candidate 1 makes a dangling active profile answer `409` `no-active-profile`
  everywhere (`out/01-active-profile-scope/spec.md`, "API contract"). Step 3's listener test pins the
  frontend's half of that. Both candidates may also edit API.md, so coordinate the small "Errors" addition.
- **G2** (value rules, the Transaction filter): if the backend reports cross-field errors on the real field,
  or the filter's parameters change, the fixtures and asserted query parameters follow the wire.
- **G5 and G6:** no effect.

✅ Decision: recorded under Depends on (none), Out of Scope and Further Notes in the spec.

---

## Round 7 — domain modelling (depends on everything above)

❓ **Q35** - **Glossary terms and ADRs.**

🔎 Facts:
- The seed vocabulary has Problem, Active profile, User, Local account and Sign-in mode, but no **Session**.
- The spec relies on "the session" throughout, as does API.md: "the session's profile", `SessionResponse`.
- Repo rule: decisions go into ARCHITECTURE.md, not ADRs.

➡️ Propose the glossary term **Session**. It may overlap with G1 and G5, and the orchestrator merges. The
test-infrastructure names (test server, wire fixtures, default answers) are implementation, not domain,
and stay out of the glossary. No ADR: the decision meets all three ADR criteria (hard to reverse,
surprising, a real trade-off), but the repo rule puts it in ARCHITECTURE.md §4.

✅ Decision: one glossary term; no ADR; one ARCHITECTURE.md paragraph.

---

## Frontier check

Every question the card requires (1–8), and every mandatory branch of brief §2, maps to a decided Q:

| Card question or brief branch | Q |
|---|---|
| 1. msw set-up in jsdom: start/reset, unanswered requests, relative URLs, cookies | Q5–Q9 |
| 2. Typing handlers and fixtures; types today vs after candidate 15 | Q11, Q12 |
| 3. First modules, in order | Q18–Q21 |
| 4. Policy for the 12 files; a contributor's rule | Q22–Q24, Q26, Q27 |
| 5. Shared fixtures | Q13, Q14, Q15 |
| 6. A screen test then and now; new assertions | Q25 |
| 7. Cost and determinism | Q10, Q28 |
| 8. Order of steps | Q31 |
| Constraints | Q1 |
| Dependencies by category | Q2 |
| Shape of the deepened module | Q17 |
| Seam location, what sits behind it, discipline | Q3, Q4 |
| Tests: survive, replaced, deleted | Q29, Q30 |
| Docs | Q32 |
| Edge cases | Q33 |
| Cross-candidate effects | Q34 |
| Domain modelling | Q35 |

No decision depends on an unanswered question. **The frontier is empty.**

---

## Verification ledger

**Verified by reading** (the file and line are cited at each Q):
- the counts: 12 files, 63 entries, 83/93 tests, 44 hooks, 30 invalidation lines;
- the client and hook code;
- App's gates;
- the Vitest jsdom globals and default URL;
- jsdom's lack of `fetch`;
- the interceptor's relative-URL resolution and passthrough;
- msw's strategies, fallthrough, cookie handling, cookie store, URL resolution and matching, and
  `HttpResponse.json` typing;
- tough-cookie's defaults;
- TanStack's zero-delay scheduling;
- Vitest's fake-timer defaults, `afterEach` failure handling and hook order, and the fact that a throwing
  after-each hook skips the hooks after it;
- the tsconfig `include`;
- the CI command;
- the compose ports;
- the backend slugs.

**Read from source, not executed. Each is proven, or made moot, by the named check:**

| Claim | Proven by |
|---|---|
| A relative `/api/…` fetch resolves under msw in this environment | step-1 client `GET` test |
| The XSRF cookie round-trips on the `.invalid` origin | step-1 CSRF test |
| `FetchRequest` binds to Vitest's compat `Request`, so jsdom `FormData` survives; the filename becomes `blob` | step-1 `apiUpload` test |
| `'error'`'s re-throw may surface as an unhandled rejection | moot: the catch-all answers first |
| `tsc -b` accepts the `msw/node` declarations under `types: ["vite/client"]` (`skipLibCheck` is on, `@types/node` is present) | step-1 `npm run build` |
| The restricted-syntax selectors (`vi.mock` specifier match; `:not([typeArguments])`) | step-2 planted violations |
| The single after-each hook leaves the next test clean when the check fails | step-1 planted missing answer |
| Runtime overhead | step-1 before/after measurement |
| Node's `fetch` rejects relative URLs today (the "accident") | Node behaviour, not run; no step depends on it |
| Whether a passed-through mutation would clear the backend's CSRF check (duplicated cookie header) | not determined; moot once nothing passes through |
| Recharts under jsdom, for a future `PinnedInsights` test | not examined; that test mocks `ResultRenderer` |
| `client.test.ts` deleted in `2c252b6` | taken from the frontend report; commit not re-read |

---

## Decisions — one page

1. **One seam: the network.** In unit tests, `msw` answers every `fetch` the frontend makes. Screens, hooks,
   query keys, invalidation, the client and the route gates all run for real. E2e is the seam's other
   adapter (the real backend). No production code changes; no new production seam.
2. **Hard invariant: nothing a unit test does ever reaches a socket.** Today's unit tests are safe only
   because relative URLs cannot resolve. msw removes that accident, and jsdom's default origin
   `localhost:3000` is also the address of the shipped app, where passwordless mode authenticates every
   request. The design restores the guarantee with four guards: `onUnhandledRequest: 'error'`; a catch-all
   default answer; a reserved `.invalid` origin for unit tests; and rules against passthrough, bypass and
   resetting the defaults.
3. **Lifecycle in the shared setup file**, for every file:
   - start before a file's tests; reset after each test; stop after the file;
   - plant the XSRF cookie before each test;
   - one after-each hook unmounts, resets handlers and clears the record, and only then fails a test with any
     unanswered request, naming its method and URL. The check comes last because a throwing hook skips the
     hooks after it.
4. **Determinism:**
   - real timers only; held-open answers instead of delays;
   - `findBy` for anything that depends on an answer;
   - fresh query client, retries off;
   - no `Set-Cookie`; no concurrency.
5. **Typing:**
   - every JSON answer names its wire type from the wire types module (`HttpResponse.json` with a type
     argument; `NoInfer` means it is otherwise unchecked);
   - builders are typed;
   - `tsc -b` in `npm run build` and CI catches a wrong field;
   - candidate 15 improves the types behind the same import.
6. **Default answers:**
   - the session (signed in, password mode, "Household"/PLN active);
   - the catch-all;
   - nothing else, so each test declares its screen's conversation.
7. **Shared fixtures:**
   - typed builders with wire-format defaults, under the rule of two;
   - from step 1: session/profile and the Problem answer;
   - when a second file needs them: the category tree (1-based depth derived from nesting), the
     transaction, the page;
   - scenario data and handlers stay local;
   - never a fake backend.
8. **First modules:** the client (step 1), then App's gates and auth events (step 3), then the hooks'
   refresh contract (step 4), which replaces and deletes the only test that stubs `api`.
9. **Policy:**
   - pure logic is called directly; prop-driven components are rendered with props;
   - anything that reaches the server uses the network seam for every new test;
   - a hook-mocked file converts as a unit, in its own commit, the first time it needs one;
   - in-place edits are allowed; no new hook or client mocks;
   - component mocks only for what jsdom cannot render;
   - the Transactions timer tests are the one named exception;
   - drifted legacy fixtures are fixed at conversion.
10. **Enforcement:** an ESLint restricted-syntax rule for test files. It bans hook and client mocks outside a
    shrinking allowlist and requires a wire type on JSON answers.
11. **Characterisation discipline:** each new test is seen failing against a temporarily planted defect,
    recorded in the PR.
12. **Docs:**
    - ARCHITECTURE.md §4 gets "Why unit tests fake the network, not the hooks";
    - API.md "Errors" should name `/errors/unauthenticated` and `/errors/forbidden` (recommended);
    - a LESSONS entry that supersedes the cache-state one;
    - no ADR (repo rule).
13. **Steps:**
    - (1) harness, client tests and docs;
    - (2) lint guard;
    - (3) App gates and auth events;
    - (4) refresh contract, deleting the old test.

    Each step is green on lint, format, test and build.
