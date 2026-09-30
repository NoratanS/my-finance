# One faithful double for the plan executor

Status: ready-for-agent
Candidate: 10, One faithful double for the plan executor
Strength: Worth exploring
Depends on: none (recommended: land steps 1 and 2 before candidate 9's step 5, so the recorded exchanges guard its validation refactor)

## Problem Statement

The backend reaches the plan executor over HTTP through one class, `AnalyticsClient`. Its tests,
and the execute endpoint's tests, run against a stand-in for the executor: a small JDK HTTP
server written out twice. The stand-in records requests but refuses nothing:

- it accepts any bearer token, any body and any content type;
- it tolerates an HTTP/2 cleartext upgrade offer, which the real executor does not;
- it answers with wording the executor never emits ("version: 7 is not supported" where the
  executor says "version: unsupported plan version 7");
- it answers 200 to a plan carrying a `profileId` field, which the real executor rejects.

That permissiveness has already cost users. The JDK client's default HTTP/2 upgrade offer made
every call to the real executor fail, so every Insight in the shipped stack showed "the analytics
service isn't running". The backend's tests stayed green, and only the end-to-end job, running
the real pair, found it. The regression guard added afterwards can only notice the header, not
reproduce the failure.

For the owner, any test that needs an executor answer means reading the Python code and copying
the answer into Java by hand. No backend test covers an executor 500, whose body carries a
`problems` list just like a rejected plan. And the only test that runs the real pair (the
end-to-end job) covers success paths only.

## Solution

One stand-in for the plan executor in the backend's test support, used by every test that talks
to it. It is faithful in two ways:

- **Its answers are real.** Each plan it knows is paired with the answer the real executor gives,
  stored as a recorded exchange: one file holding the plan, the status and the body. The
  analytics suite proves every recorded exchange against the real route, real validation and a
  seeded database. The backend's tests read their expected problems and envelopes from the same
  files, so a change in the executor's wording flows to both suites, and a stale copy cannot
  survive.
- **It refuses what the real executor refuses**, in the same order: an HTTP/2 upgrade offer,
  another method, a malformed body, a wrong token, a malformed request wrapper. A plan with no
  recorded answer fails the test with a message naming the plan.

Users see no change in behaviour. If the backend ever again sends something the executor would
refuse, its own test suite fails the way production would.

## User Stories

1. As a self-hosting user, I want insights to keep working after backend changes, so that a
   transport regression never again turns every insight into "the analytics service isn't
   running".
2. As a self-hosting user, I want a rejected plan to keep showing the executor's exact plan
   problems, so that the explorer's messages and chip hints stay meaningful.
3. As a self-hosting user, I want an executor failure to keep showing "the analytics service
   isn't running" rather than an "invalid plan", so that I am not told to fix a plan that is
   fine.
4. As a self-hosting user, I want a profile id smuggled into a plan to be ignored for scoping
   and rejected by the executor, so that no request can read another profile's data.
5. As the owner, I want one stand-in for the plan executor instead of two hand-written copies,
   so that I change it in one place.
6. As the owner, I want the stand-in to answer each plan with the answer the real executor
   gives, proved by the analytics suite, so that backend tests cannot rest on invented answers.
7. As the owner, I want a plan the stand-in does not know to fail the test with the plan in the
   message, so that nobody quietly adds a canned answer again.
8. As the owner, I want the stand-in to reject a wrong or missing bearer token with 401, as the
   executor does, so that a token regression fails the backend's tests.
9. As the owner, I want the stand-in to reject a request body that is not the executor's
   wrapper (an object with an integer `profileId` and a `plan`, sent as JSON), so that a wrapper
   regression fails the backend's tests.
10. As the owner, I want the stand-in to refuse an HTTP/2 upgrade offer the way the shipped
    executor did, so that reverting the HTTP/1.1 pin fails the suite by failing the call.
11. As the owner, I want one test to prove that the stand-in really refuses an upgrade offer
    from a default-configured JDK client, so that the guard cannot silently disappear.
12. As the owner, I want a test that an executor 500 carrying a `problems` list still becomes a
    503, so that the client never mistakes a failure for a rejected plan.
13. As the owner, I want the read-timeout, non-JSON and "not running" cases kept as explicit
    faults of the stand-in, so that faults no plan can produce are still tested.
14. As the owner, I want no new test dependency and no Python process inside the Java build, so
    that the backend build stays fast and self-contained.
15. As the owner, I want the analytics suite to fail, naming the file, when the executor's
    answer to a recorded plan changes, so that I update one file and both suites agree again.
16. As the owner, I want the analytics suite to fail rather than skip when it finds no recorded
    exchanges, so that a mistyped directory cannot turn the proof off.
17. As the owner, I want recorded exchanges to be independent of the date the suite runs, so
    that they never flake at a month boundary.
18. As the owner, I want the analytics suite to reject a recorded exchange whose plan depends on
    the clock, so that the rule is enforced rather than remembered.
19. As the owner, I want the controller tests to set the token the stand-in expects, so that an
    exported environment variable on my machine cannot break them.
20. As the owner, I want each step to leave both builds green and to be worth shipping alone,
    so that I can stop after any step.
21. As a future contributor, I want to add a backend test for a new executor answer by adding
    one recorded exchange, so that I never write executor wording in Java.
22. As a future contributor, I want the recorded exchanges to be readable JSON files with a
    descriptive name, so that I can see what the executor answers without running it.
23. As a future contributor, I want the tests that assert the backend's pass-through to compare
    against the exact bytes the stand-in sent, so that "verbatim" is checked, not assumed.
24. As a future contributor, I want the stand-in's refusals written in the same order as the
    executor's checks, so that I can reason about a doubly broken request the same way on both
    sides.
25. As a future contributor, I want the one production comment about the HTTP/1.1 pin to
    describe the current test stand-in truthfully, so that I do not "fix" a guard that already
    works.
26. As a reviewer, I want the smuggled-profile test to keep its security assertion (the
    forwarded profile id is the session's) while expecting the executor's real 400, so that the
    security guarantee is not weakened by fidelity.
27. As a reviewer, I want every Java assertion on executor wording to read the wording from a
    recorded exchange, so that I can check each against the analytics suite's proof.
28. As a reviewer, I want the Python tests replaced by the recorded-exchange proof listed
    explicitly, so that I can confirm no behaviour lost its test.
29. As a reviewer, I want bodies the backend never reads (401, 422, 405, the upgrade refusal)
    identified as written in the stand-in, each citing its source, so that I know which answers
    are proved and which are imitated.
30. As a reviewer, I want the decision not to run the real Python process in the backend build
    recorded with its cost, so that the question is not reopened without new facts.

## Implementation Decisions

**No production behaviour changes.** `AnalyticsClient` keeps its request wrapper, bearer token,
HTTP/1.1 pin, timeouts, 400-to-`InvalidPlanException` mapping and every-other-failure-to-503
mapping. The backend's HTTP interface for execute (`docs/API.md` "POST /api/insights/execute")
is unchanged. The only production edit is the last sentence of `AnalyticsClient`'s comment on
the HTTP/1.1 pin. It says the in-process test server tolerates the upgrade header; it will say
that the test stand-in refuses upgrade offers the way the shipped executor did.

**Recorded exchange** (term introduced in `docs/INSIGHTS.md` "Testing strategy"): one request the
backend sends to the plan executor and the answer the executor gives, stored as one JSON file.
Each file has four members:

- `database`: `seeded` or `failing`, the executor's database state during the exchange;
- `plan`: the plan as the backend forwards it;
- `status`: the HTTP status;
- `body`: the JSON body.

The file name is the exchange's name, in kebab case, describing the behaviour. The files live on
the backend's test classpath, in a directory named `plan-executor-exchanges` inside the backend's
test resources. That is Maven's default location and needs no build configuration. The analytics
suite reads the same directory across the monorepo, as it already reads the backend's Flyway
migrations.

**Rules for an exchange.**

- Matched on (database state, plan), comparing the plan as a JSON tree; never on the value of
  `profileId`.
- Independent of the date: an absolute range or no time axis, no `forecast`, and not a
  `timeseriesSplit`.
- Proved as profile 1 of the analytics suite's seed data.
- No two exchanges share a (database state, plan) key.

**The five exchanges.** The backend's tests need exactly these.

| Name | Database | Plan | Status | Body |
|---|---|---|---|---|
| executes-a-monthly-timeseries | seeded | spend; category 10 with descendants; currency PLN; no groupBy; interval month; absolute range 2026-06-01 to 2026-08-31 | 200 | the envelope: the normalized plan echo; one PLN `timeseries` with points 2026-06 → 0.0000, 2026-07 → 150.0000, 2026-08 → 200.0000; `truncatedGroups` false |
| rejects-an-unknown-category | seeded | version 1, spend, `categoryId` 999, range all | 400 | problems: `filters.categoryId: 999 does not exist in this profile` |
| rejects-an-unsupported-version | seeded | version 7, spend, range all | 400 | problems: `version: unsupported plan version 7` |
| rejects-a-profile-id-inside-the-plan | seeded | version 1, spend, range all, plus a `profileId` of 999999 | 400 | problems: `profileId: unknown field` |
| fails-when-the-database-fails | failing | the same plan as the first row | 500 | problems: `an unexpected error occurred` |

These four strings are the facts candidate 9 must keep byte-identical. The exact envelope text
is in the grilling log.

**`PlanExecutorDouble`, the stand-in.** A JUnit 5 extension in the backend's test support package
(beside `IntegrationTest` and `TestFixtures`), held by each test class in a static field
registered with `@RegisterExtension`. It is built on the JDK's `HttpServer`; no new dependency.
Its interface, everything a test must know:

- **Start.** A static factory binds loopback on a free port and loads every exchange from the
  classpath with one `JsonMapper`, used for the files and for incoming requests alike. It throws
  at once if it finds no exchange or a duplicate key. Because the static field is initialized
  before Spring builds the test context, `@DynamicPropertySource` can hand its base URL to the
  context. It stops after the test class.
- **Constants.** The token it accepts and its base URL.
- **Exchange lookup by name.** Gives the recorded plan (JSON), the status and the exact body text
  the stand-in sends: Jackson's compact form of the file's body.
- **Per-test state, reset before each test.** Database state `seeded`, no delay, no fault, no
  recorded requests.
- **Faults no plan can produce:**
  - database failing: answer from the `failing` exchanges for the rest of the test;
  - a delay before answering;
  - a non-JSON answer for the next call: a 200 with an HTML page, labelled as what a proxy in
    front of the executor might send, never an executor answer;
  - a static unreachable base URL: loopback on a port that was free a moment ago.
- **Received requests.** The wrapper bodies received during the test, in order.
- **An unrecorded plan.** The stand-in answers 500 with a `problems` body saying no exchange is
  recorded for the plan, and after the test fails it. The failure message quotes the plan and
  lists the recorded exchange names.

**The stand-in's checks, in the executor's order**, applied to every request:

1. A request carrying an `Upgrade` header is refused as the shipped executor refused it. The
   stand-in reads the body, then answers 400 with `text/plain; charset=utf-8`, the body
   `Invalid HTTP request received.` and `Connection: close`.
2. A method other than POST gets 405 with an `Allow: POST` header.
3. A JSON content type with a body that is not valid JSON gets 422.
4. A missing or wrong bearer token gets 401, body `{"detail":"Missing or invalid bearer token"}`.
5. A non-JSON content type, a body that is not an object, a `profileId` that is not a JSON
   integer, or a missing `plan` gets 422 with a `{"detail": [...]}` body. The list content is
   not reproduced.
6. Otherwise, the recorded answer for (database state, plan).

The bodies of checks 1, 2, 4 and 5 are written in the stand-in, each citing its source (uvicorn,
Starlette, the executor's token check, FastAPI), because the backend never reads them. Every body
the backend reads comes from a recorded exchange.

**The analytics suite's proof.** A new route-level test module runs one parametrized test over
the exchange files, sorted, with the file names as ids. For each exchange it:

- checks the plan against the date-independence rule and fails with a message if the plan
  breaks it;
- uses FastAPI's `TestClient` with `raise_server_exceptions=False`, so that the 500 exchange
  returns its response;
- overrides the settings with a test token and time zone UTC;
- overrides the connection with the seeded test connection, or, for `failing`, with a stand-in
  whose `cursor` accepts any arguments and raises;
- posts `{"profileId": 1, "plan": ...}` with the bearer token;
- asserts the status, and asserts that the parsed JSON body equals the file's body.

A missing or empty exchange directory is a test failure, never an empty parametrization.

**Backend test changes.** The full per-test list is in the grilling log.

- `AnalyticsClientTest`:
  - every call uses recorded plans;
  - the rejection test reads its problems from the exchange;
  - the "unexpected status" test builds a client with a wrong token and relies on the stand-in's
    real 401;
  - the h2c guard becomes two assertions: a JDK client left at its default version is refused by
    the stand-in, and `AnalyticsClient` succeeds against the same stand-in;
  - the recorded Upgrade header goes;
  - a new test switches the stand-in's database to failing and expects
    `AnalyticsUnavailableException`, not `InvalidPlanException`;
  - 9 tests become 10.
- `InsightExecuteControllerTest`:
  - `@DynamicPropertySource` also sets `analytics.token` to the stand-in's token;
  - the envelope test compares the response body with the stand-in's exact body text;
  - the forwarding test compares the forwarded plan with the posted plan and the forwarded
    `profileId` with the session's;
  - the smuggled-profile test posts the recorded plan and expects 400 `/errors/invalid-plan` with
    `profileId: unknown field`, **and** keeps asserting that the forwarded `profileId` is the
    session's;
  - the unsupported-version test reads `version: unsupported plan version 7` from the exchange;
  - "not called" is the stand-in's empty request list;
  - 8 tests stay 8.
- `InsightExecuteUnavailableTest`: unchanged behaviour; its closed-port helper is replaced by the
  stand-in's static unreachable URL.

**Analytics tests replaced by the proof:**

- the route's success test (the monthly timeseries exchange asserts a complete 200 body);
- the route's version-7 rejection (the identical exchange);
- the error-handling 500-body test (the `failing` exchange).

The profile-scoping, non-object-plan and token tests of the route stay, as do the error-handling
tests that the exception message never leaks and is logged.

**Not done.** No backend test runs the real Python process. Building the executor's image inside
`./mvnw verify` would tie the Java build to the Python toolchain and put a cold image build and
container networking on every run. The recorded exchanges prove the pairing, the stand-in's
refusals give the transport and token behaviour, and the end-to-end job remains the one run of
the real pair.

**Ordered steps** (each separately shippable; each leaves `./mvnw verify` and the analytics
gate green):

1. *One stand-in, same behaviour.* Move the two JDK server copies and the two closed-port helpers
   into `PlanExecutorDouble`, still scripted and permissive. No assertion changes. Worth on its
   own: one home for the stand-in and for "down", so every later rule is written once.
2. *Record and prove.* Add the five exchange files and the analytics suite's proof; delete the
   three replaced analytics tests. Add the clause to `ARCHITECTURE.md` §5. The backend does not
   read the files yet.
3. *Replay.* The stand-in answers from the files by (database state, plan), and an unrecorded
   plan fails the test. Switch the backend tests to recorded plans and expectations: the wording
   fix, the smuggled-profile 400, the new 500 test. Rewrite the Backend bullet of
   `docs/INSIGHTS.md` "Testing strategy".
4. *Refuse what the executor refuses.* Add the token, JSON-decoding, wrapper, method and upgrade
   checks. Set the token in the controller test, rewrite the h2c guard, update the
   `AnalyticsClient` comment, and complete the Testing strategy bullet.

**Lesson for `docs/LESSONS.md`** (git-ignored, after step 3): holding a test double to the real
thing without a contract-testing framework. The provider's own suite proves recorded exchanges,
and the consumer's double replays them (the idea behind Pact, without the framework).
Also JUnit 5's `@RegisterExtension` for a server that must exist before Spring's context. After
step 4, a short note on why the double imitates uvicorn's upgrade refusal rather than running
uvicorn.

## Testing Decisions

**What makes a good test here.** Backend tests assert what the backend's callers observe: the
returned envelope, the exception type, the Problem the controller renders, and what crossed the
wire to the executor (the forwarded wrapper, a security fact). No assertion re-types executor
wording; it is read from the exchange that the analytics suite proves. Analytics tests assert the
route's status and parsed body for a recorded request.

**The seam.** There is one: the plan executor's HTTP interface, exercised from both sides.

- From the backend, through `AnalyticsClient`'s public method and through the execute endpoint
  via MockMvc, against `PlanExecutorDouble`.
- From the analytics side, through the real route via `TestClient`, with the real app, the real
  validation and the seeded Postgres.

The recorded exchanges are the shared fact that makes the two sides one seam. The owner
delegated the check of this choice; it is the highest seam on each side, and no new seam is
added (the stand-in replaces two existing copies).

**Modules tested:** `AnalyticsClient` (plain unit test with the stand-in); the execute endpoint
through `InsightController` and `InsightService` (integration test with Spring's context,
Testcontainers Postgres and the stand-in); the executor's route (analytics route test).

**Prior art:**

- the existing JDK server stand-ins and `@DynamicPropertySource` wiring in the two backend test
  classes;
- the test support package (`IntegrationTest`, `TestFixtures`);
- the analytics harness reading the backend's Flyway files across the tree;
- the analytics route tests' dependency overrides;
- the error-handling tests' failing connection and `raise_server_exceptions=False`.

**Kept as is:** the endpoint's 409 and 401 tests (they never reach the executor), the
non-object-body test (it asserts that the executor is never called), the "not running" test
(closed port), and the analytics profile-scoping, non-object-plan, token, health and
leak-and-logging tests.

## Out of Scope

- Running the real executor process inside the backend's build or tests.
- A new test dependency (WireMock, OkHttp's MockWebServer).
- New end-to-end specs for a rejected plan, a wrong token, a 500 or a timeout through the real
  pair. Optional follow-up; the end-to-end job keeps its four success-path Insight specs.
- Any change to `AnalyticsClient`'s behaviour, to the 401/422/500-to-503 mapping (deliberate and
  documented), or to the backend's HTTP interface.
- `AnalyticsClient`'s private post method still taking a path parameter, and the unused
  analytics test helper of hand-written envelopes. Both belong to candidate 17.
- Recording exchanges for 401, 422, 405 or the upgrade refusal: the backend never reads those
  bodies.
- The executor's internals and problem strings (candidate 9 keeps them); frontend test doubles
  (candidate 8).

## Further Notes

- **Not verified by execution.** How the shipped executor treats an HTTP/2 upgrade offer was read
  from source, not run. uvicorn 0.52.4 selects httptools; httptools skips the body of an upgrade
  request and pauses; uvicorn logs "Unsupported upgrade request." and later answers
  "Invalid HTTP request received." with a plain-text 400. That agrees with the incident's commit
  message, and the locked versions are the same then and now. If headers and body arrive in one
  read, the real executor instead leaves the request hanging until the backend's 10-second
  timeout. Either way the backend reports 503, which is what the stand-in's refusal makes
  happen. The JDK server's indifference to `Upgrade` was checked on the installed JDK 21.0.12
  classes and against the jdk21u sources.
- **Not verified by execution, either.** The JUnit extension's ordering relative to Spring's
  extension, and the exact 405 body. Neither is asserted by any test.
- **Risks.** The exchange files sit under the backend's tree but change when the executor
  changes, so a Python-side pull request will touch a backend directory; that is intended,
  because the wire contract changed. The stand-in makes every backend test use a recorded plan,
  which is more ceremony than today's canned answers; that ceremony is the fidelity.
- **Relation to candidate 9.** The shared fact is the problem strings. The four strings above
  must stay byte-identical; this candidate's proof is a tripwire for candidate 9's validation
  refactor. Candidate 9's step 3 adds a row-factory argument to the executor's cursor call,
  which is why the failing-database stand-in accepts any cursor arguments. File sets are
  disjoint.
- **Relation to candidate 8.** The frontend sees the backend's interface, which passes the
  executor's envelope through verbatim; an msw handler for a successful execute could reuse the
  timeseries exchange's body. Not designed here.
- **Relation to candidate 13.** It changes the test context's containers, not anything the
  stand-in relies on.
- **Documents.** `docs/INSIGHTS.md` "Testing strategy" (Backend bullet, which defines "recorded
  exchange") and `ARCHITECTURE.md` §5 (the analytics job's description) change. `docs/API.md`
  and `docs/SCHEMA.md` do not. The texts are in the docs proposals that accompany this spec. No
  ADR: this is test infrastructure, easy to reverse, and its recorded home is the testing
  strategy.
