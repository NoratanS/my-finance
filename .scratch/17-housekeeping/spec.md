# Housekeeping: remove what nothing uses, correct what is no longer true, fix three small defects

Status: ready-for-agent
Candidate: 17 — Housekeeping (unused tooling, dead code, stale text, possible bugs, duplication)
Strength: Strong. Every item was verified by search; each change is small.
Depends on: nothing has to land first. The preferred order relative to siblings:
- candidate 8's msw test setup before steps 9–10 (a fallback seam is specified);
- candidate 5 before steps 12–13;
- this candidate's step 4 before candidate 9;
- step 5 before candidate 10;
- step 6 before candidate 5.

## Problem Statement

The owner maintains a small self-hosted finance app. The LLM layer and the metrics stack were
cut on 2026-09-22. What is left has seven problems.

**Tooling nobody reads.** The build writes a backend coverage report on every `verify` and ships a
frontend coverage script. Nothing reads either: no threshold, no CI upload, no document.

**Dead code.** A contributor, human or AI, reading the code for the first time meets a 102-line
test module nothing imports, a money helper nothing calls, and a profile-list hook nothing calls
whose cache key is still invalidated four times. They also meet a private HTTP helper that still
takes a path argument three endpoints ago. Each one has to be understood before it can be
recognised as dead.

**Comments that state false things.** Examples:
- the merchant filter "is rejected until Phase 4b";
- a test points at a file that was split three weeks ago;
- a date helper warns of a validation "bounce" that the server's rule makes impossible;
- the HTTP/1.1 comment in `AnalyticsClient` blames a uvicorn parser that is not the one running;
- two comments cite a "journeys.md" that only exists in a git-ignored scratch folder.

The design document says the plan executor's clock "mirrors" the backend's, which it does not.

**An invisible time-zone setting.** A self-hosting user cannot find the `TZ` setting that decides
what "this month" means in Insights. It is in neither env template, nor either README, and nothing
says that subscriptions keep UTC regardless.

**Three defects a user can hit:**
1. A pinned Insight that matches no transactions draws an empty set of axes on the Dashboard instead
   of "No transactions match this plan". This is the defect already fixed in the explorer as J15;
   the dashboard tile kept the old check.
2. A saved plan that leaves out `filters`, `groupBy` or `interval` is valid to the plan executor, but
   crashes the frontend. Pinned, it blanks the whole Dashboard. Opened from its tile, it silently
   turns into a different question (grouped by category, currency pinned). Only a hand-crafted
   request can save one.
3. A currency code with a trailing newline passes the executor's check. The executor echoes it back,
   and the browser throws while formatting it, blanking the page. Reachable by editing the explorer's
   URL.

**Copy-paste.** Six end-to-end helpers are copied across specs. The per-currency tile arithmetic and
the signed net are written twice. The create-profile form hard-codes the currency list that
`lib/money` already exports.

## Solution

**Tooling.** The unused coverage tooling goes: the JaCoCo plugin from the backend build, and the
coverage script, dependency and configuration from the frontend. `uvicorn[standard]` stays,
because removing it would change which HTTP implementation and event loop serve every backend
request.

**Dead code.** It is deleted, together with anything its deletion orphans. `ApiError.fieldMessage`
is left to candidate 2, which owns that module.

**False comments.** Each is corrected to say what is true today. History (the done-work plans) and
labels that are merely old but still true are left alone. The frozen design-system stylesheet is
left alone even though twelve of its classes are unused.

**Time zone.** Behaviour does not change. The documents say exactly what each of the three clocks
does:
- the browser's local date drives the Transactions and Dashboard months;
- the backend's UTC drives the subscription widgets, the charge job and restore;
- the Instance time zone (`TZ`) drives Insights' date windows.

The README, both env templates and the release README document `TZ`: what it governs, what stays
UTC, which values are valid, and what an invalid one does. The design document stops implying that
the backend honours it. Making the backend honour it is recorded as a deliberate, deferred decision
with a trigger.

**The three defects** are fixed test-first:
- the Dashboard tile and the explorer share one definition of an Empty answer;
- saved plans are normalized where they enter the frontend, exactly as the executor reads them;
- the executor's currency rule matches the whole string.

**Duplication.** The identical end-to-end helpers move to one support module. The create-profile
form reads the exported currency list. The per-currency tile totals move to `lib/money` (last, and
the first step to drop if contested).

**Owner-run residue.** The owner gets exact commands for the files that only a person with the
right permissions can remove: empty root-owned Grafana directories and bytecode of deleted modules.

## User Stories

1. As the owner, I want the backend build to stop instrumenting every test run and writing a
   coverage report nobody reads, so that `verify` does only work somebody uses.
2. As the owner, I want the JaCoCo removal to be its own commit, so that I can revert just that
   decision if I still want the report the way I did on 2026-09-22.
3. As the owner, I want a documented one-line command that produces the backend coverage report
   on demand, so that the 98.3% baseline in the maintenance plan stays reproducible without a
   permanent plugin.
4. As the owner, I want the frontend coverage script, its dependency and its configuration removed
   together, so that nothing points at a coverage provider that is no longer installed.
5. As a reviewer, I want the frontend lockfile change to contain only removals, so that I can confirm
   no other dependency moved.
6. As the owner, I want `uvicorn[standard]` kept, so that the plan executor keeps the same HTTP
   implementation, event loop and auto-reload it runs today.
7. As a future contributor, I want the HTTP/1.1 comment in `AnalyticsClient` to state only what is
   certain, so that I don't chase the wrong uvicorn parser when an HTTP problem appears.
8. As a future contributor, I want `AnalyticsClient` to have exactly the shape its one endpoint
   needs, so that I don't look for the other callers a `path` parameter implies.
9. As a future contributor, I want the orphaned test envelopes module gone, so that I don't assume
   some test depends on it.
10. As a future contributor, I want each Python behaviour asserted once, so that a failure points at
    one test and the suite says each thing once.
11. As the owner, I want a locally built analytics image to contain exactly what a CI-built image
    contains, so that stale bytecode from my machine never ships in a local build.
12. As a future contributor, I want `sumAmounts` gone, so that I don't reach for a display helper
    nothing else uses.
13. As a future contributor, I want `useProfiles` and the four invalidations of its key gone, so
    that I don't think the profile list is cached anywhere but the session.
14. As a future contributor, I want the plan type to stop saying merchants are rejected, so that I
    don't avoid a feature that ships.
15. As a future contributor, I want test and hook comments to point at files and functions that
    exist, so that following a reference lands somewhere.
16. As a future contributor, I want the date helper's comment to describe the server's actual
    UTC+1 rule, so that I don't "fix" a bounce that cannot happen.
17. As a future contributor, I want no comment to cite a git-ignored scratch file, so that every
    reference in the repository can be followed from a clean clone.
18. As a future contributor, I want the explorer's saved-insight test fixture to use real plan field
    names, so that the fixture doesn't teach a field that never existed.
19. As a self-hosting user, I want the README and the env templates to name `TZ`, say it is an IANA
    zone like `Europe/Warsaw`, and give its default, so that I can make Insights count months in
    my own time zone.
20. As a self-hosting user, I want the docs to say which screens follow `TZ` and which stay on UTC,
    so that a subscription widget and an Insight disagreeing near midnight doesn't look like a bug.
21. As a self-hosting user, I want the docs to say what a misspelled `TZ` does, so that "the
    analytics service isn't running" after editing `.env` points me at my typo.
22. As a self-hosting user of the release bundle, I want the bundle's own README and `.env` template
    to describe `TZ`, so that I don't need the source repository to find it.
23. As a self-hosting user with an existing `.env`, I want nothing to change unless I add `TZ`, so
    that upgrading is a no-op.
24. As the owner, I want the design document to stop saying the executor's clock mirrors the
    backend's zone, so that the recorded decision matches the code.
25. As the owner, I want "make the backend honour `TZ`" recorded as an open question with a trigger,
    so that it is decided deliberately and not by whoever touches the charge job next.
26. As a user with a pinned Insight that matches no transactions, I want the Dashboard tile to say
    "No transactions match this plan", so that an empty chart frame doesn't look like a failed load.
27. As a user with a pinned Insight that does match transactions, I want its tile unchanged, so that
    the fix only affects the empty case.
28. As a user with a pinned total that sums to zero, I want its tile to keep showing a zero value, so
    that a real zero stays an answer.
29. As a future contributor, I want one definition of "nothing matched" shared by the explorer and
    the Dashboard, so that the next change to the Empty answer cannot fix one and miss the other.
30. As a user whose saved Insight's plan leaves out `filters`, `groupBy` or `interval`, I want the
    Dashboard to render instead of going blank, so that one odd Insight cannot take the landing
    screen down.
31. As that user, I want the tile's "Open" link to reopen the same question, so that an absent
    `groupBy` doesn't silently become "by category".
32. As that user, I want the explorer's deep link to that Insight to render too, so that I can edit
    or unpin it.
33. As a future contributor, I want the design document to say that an absent `filters`, `groupBy`
    or `interval` means `{}`, `null`, `null`, so that the frontend and the executor read a plan the
    same way.
34. As a user who edits the explorer's URL, I want a currency with stray whitespace rejected as a
    plan problem, so that the page shows a message instead of going blank.
35. As the owner, I want the executor's currency rule to accept exactly what the backend's rule
    accepts, so that the two runtimes agree on one Currency code rule.
36. As a future contributor, I want the six identical end-to-end helpers defined once, so that a
    change to login or to posting JSON happens in one place.
37. As a future contributor, I want the end-to-end support module to explain once, and correctly,
    why test dates are computed in UTC, so that I don't believe compose sets `TZ` for the backend.
38. As a future contributor, I want the helpers that genuinely differ per suite to stay in their
    suites, so that consolidation doesn't change what any suite seeds.
39. As a future contributor, I want the create-profile form to read the exported currency list, so
    that adding a currency is one edit.
40. As a future contributor, I want the profile-currency tile totals and the signed net computed in
    one display helper, so that the never-mix-currencies rule on the tiles lives in one place.
41. As a user, I want the Dashboard and Transactions tiles to show exactly the same numbers and
    disclosures after that refactor, so that nothing I read changes.
42. As the owner, I want the exact commands for removing the empty root-owned Grafana directories
    and the stale bytecode, so that I can clean my machine without guessing what is safe.
43. As a reviewer, I want each step to be one small commit with a green build and a one-line reason
    in the grilling log, so that I can check every change against its evidence.
44. As the owner, I want each item that belongs to a sibling candidate left to that candidate, so
    that two specs never change the same thing two ways.

## Implementation Decisions

**Verified and changed**

- **Backend build.** Remove the JaCoCo plugin declaration (both executions: agent preparation and
  the `verify` report). No surefire `argLine` depends on it. CI and the image build neither run nor
  read it. This reverses the owner's 2026-09-22 "keep all tooling" decision, and is flagged as such
  in Further Notes.
- **Frontend tooling.** Remove the `coverage` script and the `@vitest/coverage-v8` devDependency,
  through the package manager so the lockfile prunes only packages nothing else needs. Remove the
  `coverage` block from the Vitest configuration. No document mentions the script.
- **Plan executor, test tree.**
  - Delete the orphaned envelopes module; nothing has imported it since the LLM removal.
  - Delete the two tests that repeat others:
    - the health-without-token check in the execute test module (the health test module keeps its
      own);
    - the bearer-token check in the execute-API test module (the execute test module keeps its own).
- **Plan executor, image hygiene.** Make the image's build-context ignore pattern for `__pycache__`
  match at any depth. Today it matches only at the context root, so a local build copies nested
  bytecode. The `tests/` pattern already excludes the test tree.
- **Plan executor, validation.** The currency rule in plan validation must match the entire value:
  the whole string is exactly three uppercase ASCII letters, and a trailing newline fails. The
  problem message is unchanged.
- **Plan executor, SQL builder.** In the comment on the merchant predicate, drop the planning label
  "Stage 1's". The sentence stays: `build_query` collects predicates in a list and joins them.
- **`AnalyticsClient`.**
  - The execute path becomes one constant, used by the request and both log lines. The private HTTP
    helper loses its `path` parameter, or is folded into `execute`; the implementer picks whichever
    reads better. Behaviour is identical.
  - The HTTP/1.1 comment is rewritten to state only what is certain:
    - the JDK client's default sends a cleartext h2c upgrade;
    - uvicorn supports no upgrade except WebSocket;
    - against the real service that request failed ("not JSON" → analytics unavailable);
    - pinning HTTP/1.1 keeps the backend independent of how uvicorn's HTTP implementation (httptools
      under `uvicorn[standard]`, h11 without it) treats an upgrade.
  - The comment names no parser as the culprit and describes no mechanism.
- **`lib/money`.**
  - Delete `sumAmounts`.
  - Rewrite the docblock of the browser-date helper: the date is the browser's local date. The
    server accepts any `occurredOn` up to UTC today + 1, so every time zone can enter its own
    "today". The warned-of bounce cannot happen.
- **Profile hooks.** Delete `useProfiles`, the four invalidations of its now-unused key, and the
  import this orphans. Session updates are unchanged. `GET /api/profiles` stays in the backend.
- **Stale frontend text.** Each change is text-only:
  - The plan filters type stops saying merchants are rejected.
  - The invalidation test points at `useInsightResults` in the insights hooks module instead of the
    pre-split file.
  - The transaction hooks' comment says `useInvalidateInsights` lives in the insights hooks module,
    not "above".
  - In the explorer's test file:
    - the saved-insight fixture uses `interval`, not `granularity`;
    - the J15 comment describes the executor's two empty shapes: no entry when no currency is
      pinned, one entry with an empty collection when one is;
    - the comment cites the design document instead of the git-ignored journeys file.

**The Empty answer (the pinned-tile defect)**

- A new, small, non-component function in the insights folder, **`nothingMatched(envelope)`**.
  - It answers true when the result envelope has no result entry, or when every entry's collection
    is empty.
  - A `value` result is never empty; its zero is an answer.
  - A zero-filled bounded timeseries is not empty.
  - It has no other parameters, no error modes, and no ordering constraints.
  - It must not be exported from a component module (the project's react-refresh lint rule).
- `ResultsPanel` and `PinnedInsights` both use it.
  - The tile renders its existing "No transactions match this plan." whenever the envelope is an
    Empty answer. Its loading and error texts are unchanged.
  - `ResultsPanel`'s zero-note helper stays private to it.
- The moved docblock states the rule correctly (both empty shapes) and cites the design document.

**Normalized saved plans (the minimal-plan defect)**

- The insights hooks (`useInsights`, `useInsight`) return Insights whose `plan` is a **Normalized
  plan**. An absent `filters` becomes an empty object; an absent `groupBy` or `interval` becomes
  null. Nothing else is added, removed or validated: unknown fields, version, metric, range and
  forecast pass through untouched. This is exactly how the executor reads and echoes a plan, so
  the plan the tile runs means the same thing to both.
- The normalization lives inside the insights hooks module, at the only place saved plans enter
  the frontend. No consumer guards individually. No backend or executor change: the backend stays a
  pass-through, and the executor stays the one validator.
- The `Insight` type's comment says its plan is normalized on read.
- Consequence: the explorer's URL decoder, which fills absent fields with the explorer's own
  defaults, now receives explicit nulls from a saved Insight. So "Open" reopens the same question.

**Instance time zone (documentation only, no code change)**

- **INSIGHTS.md, "Execution semantics", the "today" bullet.** The executor uses an injectable clock,
  the same pattern as the backend's `ClockConfig`, and resolves the date in the Instance time zone.
  Unlike the executor, the backend stays on UTC: the subscription dashboard's `asOf` and the charge
  job (API.md). So near midnight, subscription widgets and Insights can disagree about "today" when
  `TZ` is not UTC.
- **README, both env templates, and the release bundle's README** document `TZ`:
  - it is optional, defaults to UTC, and takes an IANA zone name;
  - what it governs: Insights' "last N months" and "year to date" windows, and which month counts as
    still in progress for drift and forecasts;
  - what stays UTC:
    - the daily subscription charge job at 00:05;
    - the subscriptions dashboard's `asOf` and its "charged this month", "upcoming" and "overdue";
    - backup restore's date re-basing;
  - the transaction date rule accepts up to UTC today + 1 in every zone;
  - an unknown name makes every Insight fail with "the analytics service isn't running";
  - compose reads `TZ` from the shell environment before `.env`.
- **API.md, "Open questions for implementation tickets."** A new entry, "backend clock and the
  Instance time zone". It records that the backend is UTC while Insights follow `TZ`, what making the
  backend follow `TZ` would change (the charge job's firing time, `asOf`, restore re-basing, and the
  JVM default zone if passed as `TZ`), and the trigger: a user reports subscription widgets and
  Insights disagreeing near midnight.
- **Acceptance check before merging:** on a real stack with `TZ=Europe/Warsaw`, a plan executes.
  This proves the analytics image has zone data; the lockfile installs the `tzdata` wheel only on
  Windows. Then, with a misspelled zone, the explorer shows the documented message.

**Other recorded-decision updates**

- **INSIGHTS.md, "Empty data is a result" bullet.** One clause: a pinned Dashboard tile shows the
  same Empty answer as the explorer.
- **INSIGHTS.md, "Plan DSL v1" (the validation paragraph).** `filters`, `groupBy` and `interval` may
  be omitted. The executor treats an absent one exactly like `{}` or `null`, and spells it out in the
  envelope's normalized plan. The frontend normalizes a saved plan the same way when it reads it back.
- **Unchanged:** ARCHITECTURE.md and SCHEMA.md. No ADR.

**Duplication**

- **End-to-end support module.** One plain module next to the Playwright specs, not named as a spec
  so the runner does not collect it. It exports:
  - `registerAndLogin`;
  - `apiPost`;
  - `currentMonthBounds`;
  - `isoToday` (with its optional day offset);
  - `createProfileAndCategory`;
  - `monthStart` (and its month-key helper if a spec still needs it).

  It carries one comment on why dates are UTC: compose defaults the executor's `TZ` to UTC, and the
  backend is UTC in code. `registerPickAndGo`, `seedData` and `verifySeeded` stay in their specs,
  because their copies differ in behaviour.
- **Create-profile form.** Its currency options come from `CURRENCY_OPTIONS`.
- **`lib/money`: one display helper for the profile-currency totals.**
  - It takes the per-currency summary rows and the profile currency.
  - It returns expense, income, net and the profile currency's count, as display numbers, plus the
    count of rows in other currencies.
  - A signed-net formatter sits beside `formatSigned`. `formatSigned` signs by transaction type, so it
    cannot be reused for a net.
  - `Dashboard` and `Transactions` use both. No visible change.

**Ordered steps.** Each step is one commit and leaves CI green. Steps are independent unless
stated.

1. **Remove JaCoCo from the backend build.** Verify: `./mvnw verify` green; no coverage report is
   written.
2. **Remove the frontend coverage tooling.** Verify: lint, format check, tests, build and the
   Storybook build all green; the lockfile diff only removes entries.
3. **Executor hygiene.** Delete the envelopes module and the two duplicate tests; fix the image's
   `__pycache__` ignore pattern. Verify: ruff, mypy and pytest green; the collected test count
   drops by exactly two.
4. **Currency full-match, test-first; drop the SQL comment's label.** Before candidate 9.
5. **`AnalyticsClient`: constant path, no path parameter, corrected HTTP/1.1 comment.**
   `AnalyticsClientTest` unchanged and green. Before candidate 10.
6. **Frontend dead code.** `sumAmounts`; `useProfiles`, its invalidations and the orphaned import.
   Before candidate 5.
7. **Frontend stale text.** Plan filters type, invalidation test, transaction hooks, date-helper
   docblock, explorer test fixture and its J15 comment.
8. **Instance time zone documentation**, with the acceptance check.
9. **Pinned-tile Empty answer, test-first.** Preferably after candidate 8's msw setup.
10. **Normalized saved plans, test-first.** Same condition as step 9.
11. **End-to-end support module.**
12. **Create-profile currency options.** After candidate 5.
13. **Profile-currency tile totals.** After candidate 5. The first step to drop if contested.

## Testing Decisions

- **What makes a good test here.** Assert what a user or caller observes through the module's
  interface:
  - the tile's text;
  - the link a user can follow;
  - the plan problem string;
  - the hook's returned data.

  Never assert internal state or which helper was called. A test that mocks the hooks module
  wholesale cannot see a fix made inside the hooks, which is the exact trap the invalidation test's
  own comment describes. So the new frontend tests run the real hooks.
- **The seam for the two frontend defects is the network.** It is one seam, the highest that still
  runs the hooks where the normalization lives. The four exchanges:
  - `GET /api/auth/me` (a session with an active profile; it gates every query);
  - `GET /api/insights` (one pinned Insight);
  - `GET /api/categories`;
  - `POST /api/insights/execute`.
- **Preferred adapter:** msw handlers, per candidate 8's settled decision that new tests for untested
  modules use the network seam.
- **Fallback if candidate 8 has not landed:** stub the frontend's `api` function by path, the prior
  art in the invalidation test. The shared test render helper creates its own query client, so the
  session cannot be seeded through the cache; the stub must answer `/api/auth/me`.
- **The one internal substitution:** the result renderer is replaced by a marker element, as the
  explorer's tests already do, because the charting library needs real layout that jsdom lacks.
- **Pinned tile (step 9), failing test first.** Render `PinnedInsights` with one pinned Insight
  whose plan pins PLN, and an execute answer holding one PLN breakdown entry with no groups.
  Expected: "No transactions match this plan." is shown and no renderer marker. It fails today:
  the tile renders the marker.
  - Guard: one group → marker shown, no message.
  - Guard: no result entries → message (passes today, kept as a guard).
- **Normalized saved plans (step 10), failing tests first, same file and seam.**
  - Tile path: a pinned Insight whose saved plan has only version, metric and an "all time" range.
    Expected:
    - the tile renders without throwing;
    - its description reads "spend · all categories · all time · every currency";
    - its "Open" link's `plan` parameter carries a null `groupBy`.

    It fails today with a TypeError during render.
  - Deep-link path: `useInsight(id)` rendered as a hook at the same seam returns that plan with
    `filters` `{}`, and `groupBy` and `interval` null.
- **Currency rule (step 4), failing test first.** One more row in the table-driven plan-validation
  test: a currency with a trailing newline → the existing "must be a three-letter ISO 4217 code"
  problem. This is the design document's stated strategy for validation (table-driven problem
  lists). It runs against the Testcontainers Postgres fixture like its neighbours.
- **Refactors add no new tests; the existing tests are the net.**
  - `AnalyticsClientTest` pins `AnalyticsClient` (step 5).
  - The Dashboard and Transactions screen tests pin the tile values and the "foreign-currency txns
    excluded" disclosure (step 13).
  - The create-profile test (step 12).
  - The whole Playwright suite in CI (step 11).
- **Instance time zone (step 8).** No automated test; nothing in code changes. The executor's
  zone handling stays pinned by its config tests, and the backend's UTC by its fixed-clock tests.
  The real-stack check in Implementation Decisions is the acceptance gate.
- **Survive unchanged:**
  - the explorer's J15 tests (only comments and one fixture field change);
  - the invalidation test (only its comment changes);
  - all Python tests except the two deleted duplicates;
  - every backend test.
- **Deleted:** the two duplicate Python tests. **Replaced:** none.
- **Prior art:**
  - the invalidation test (real query client, only the HTTP function stubbed);
  - the explorer's screen tests (result renderer as a marker; the J15 pair of empty and non-empty
    runs);
  - the analytics validation table;
  - `renderWithProviders`.

## Out of Scope

- **Handed over to sibling candidates:**
  - `ApiError.fieldMessage` → candidate 2, which owns turning a Problem into messages;
  - the comma in a Budget amount → candidate 5;
  - the re-declared session and active-profile test fixtures → candidate 8;
  - the twice-written JDK `HttpServer` double → candidate 10.
- **`uvicorn[standard]`.** Kept. Dropping it switches httptools → h11 and uvloop → asyncio behind
  every backend request, and removes the file watcher the README's `--reload` relies on. That is a
  behaviour change, not housekeeping.
- **The twelve unused CSS classes** in the frontend design-system stylesheet. The file is a
  deliberately frozen copy of `docs/design/styles.css`, and the design note says new classes go in
  `app.css`, never in it.
- **Done-work plans and specs under `docs/superpowers/`**, including the reference to the deleted
  timeout-budget test. They are history the owner chose to keep.
- **Planning labels that are still true** ("Stage 1" in the timeseries chart, "Phase 4b" in the plan
  module and SQL builder, "Step 4b" in the invalidation test, the "Phase 3 TODO" in the frozen
  stylesheet). They mislead no one about what the code does.
- **Making the backend honour `TZ`.** A feature: it moves the charge job and changes `asOf`. Recorded
  in API.md's open questions with a trigger.
- **Failing fast on an unknown `TZ` at executor startup.** Today it fails on each execute with a
  misleading message, which the docs now name.
- **The hard-coded "rose" colour** repeated in the Budgets, Dashboard and timeseries-chart modules, a
  Storybook story and the category palette. Its proper home would be a design token, and the
  design-system file is frozen. That is a design decision.
- **An application-wide error boundary.** Its absence is why the two defects blank the page instead
  of breaking one tile. Adding one is a feature.
- **A saved plan whose `filters` is present but not an object.** Normalization completes only
  *absent* fields; only a hand-crafted request can do this.
- **The explorer's "Every bucket in this range is zero." note on Dashboard tiles.** The tile keeps
  drawing a flat line, as today.
- **Commit messages and the owner's git-ignored `docs/LESSONS.md`.** Not edited by this change. See
  Further Notes for suggested LESSONS additions.

## Further Notes

- **Reversal of an owner decision.** On 2026-09-22 the owner kept "all tooling (Storybook, ArchUnit,
  MapStruct, JaCoCo, Testcontainers)" (owner memory, cleanup note). The brief's settled list protects
  Storybook, ArchUnit, Testcontainers and Flyway but not JaCoCo, and the report recommends removal.
  Step 1 is isolated so it can be vetoed alone.
  - To reproduce the baseline on demand without the plugin:
    `./mvnw org.jacoco:jacoco-maven-plugin:0.8.15:prepare-agent verify org.jacoco:jacoco-maven-plugin:0.8.15:report`.
    This is standard Maven behaviour (a plugin invoked by coordinates, with `prepare-agent` handing
    surefire its `argLine`) but **was not executed** here.
  - The adjacent build block that candidate 14 deletes means whichever lands second rebases one hunk.
- **Owner-only housekeeping.** None of this is committed; git tracks none of it.
  - Empty root-owned Grafana directories, left by the removed container. First confirm they hold
    nothing, then remove as root:

    ```bash
    find deploy/observability -type f       # must print nothing
    sudo rm -r deploy/observability
    ```

  - Bytecode of deleted modules: six files for the removed `llm` package, 12 `test_llm_*` files, and
    three scratch-test orphans (`test_review_probe`, `test_zz_scratch_edge`,
    `test_zzz_repro_before`). The test cache is regenerated by the next pytest run:

    ```bash
    rm -r analytics/src/analytics/llm analytics/tests/__pycache__
    ```

  - The owner's memory also records the Docker volumes `my-finance_prometheus-data` and
    `my-finance_grafana-data` as left behind. **Not verified** here. Check with `docker volume ls`,
    then remove with `docker volume rm` if they are still there.
- **Facts not verified by execution:**
  - Whether httptools drops the body of an h2c-upgrade request. It follows from llhttp's documented
    callback contract; llhttp is compiled into the `.so`. This is why the new comment asserts no
    mechanism.
  - That Docker copies nested `__pycache__` in a local build, from its documented root-anchored
    matching.
  - That the analytics base image ships zone data (hence the acceptance check).
  - That `Intl.NumberFormat` throws for `"PLN\n"` (ECMA-402).
  - That React unmounts the tree on an uncaught render error.
  - That Python's `$` matches before a trailing newline; the documented `re` semantics, confirmed by
    the insights review outside the repo.
  - The J15 screenshot comes from a git-ignored local journal.
  - Neither frontend defect was reproduced on the Dashboard tile itself. Both are read from code; the
    first failing test is the proof.
- **Candidate 1 note.** Its grilling log suggests a profile-scoping "ledger residual" might be one of
  this candidate's possible bugs. It is not: the possible bugs here are the ones listed above, and
  candidate 1 designs that residual itself.
- **Candidate 10 note.** After step 5, the sentence in `AnalyticsClient`'s comment about the
  in-process test double tolerating the upgrade becomes candidate 10's to keep true when it replaces
  that double.
- **Candidate 15 note.** If candidate 15 regenerates or replaces the hand-written API types, step 7's
  one-line fix to the plan filters type travels with it.
- **Lessons (docs/LESSONS.md, git-ignored), written after the relevant steps:**
  - new, "Which 'today'? Three clocks in one app" (step 8);
  - new, "A Maven plugin can run without a POM entry" (step 1);
  - new, "Normalize at the boundary, not in every consumer" (step 10), with a Python comparison to
    parsing JSON into a dataclass once;
  - for step 9, "same pattern as" the existing wrong-level-gate entry, adding one line that the
    Dashboard tile carried the same gate;
  - the owner may also correct the existing HTTP/1.1 entry, which repeats the h11 attribution.
- **Risk.** Low overall. The largest single risk is step 11. The end-to-end suite runs only in CI
  with the stack up, so the helper move is verified by that job, not locally.

**Added when the specs were cross-checked (2026-09-30).**

- **Findings reported by candidate 4 after this spec was written — not verified by this
  candidate's grilling.** (1) Backup restore rejects dates with a year outside 1–9999 that the
  write endpoints accept, so a Budget ending in year 10000 can be exported but not restored.
  (2) Backup restore does not apply the "not in the future" rule that a Transaction's date has on
  the write endpoint. (3) An example in the API document's validation-failure section says
  "fields" where the backend says "field(s)". Each needs the treatment section E's items got:
  verify by reading, decide the intended behaviour from the documents, then a failing test first.
  They are not part of the ordered steps above until verified.
- **Step 12, reconciled with candidate 5.** Candidate 5 asks for the create-profile currency
  options to be fixed before its last step (G3-13), which wraps the same block in a form; this
  spec's header prefers "after candidate 5". Resolved: land step 12 before G3-13. It is a four-line
  change and the larger edit rebases over it. Step 13 (tile totals) stays after candidate 5.
- **`ApiError.fieldMessage`** is deleted by candidate 2 (its step G3-4); it is not part of step 6.
- **JaCoCo (step 1).** Removing it reverses the owner's 2026-09-22 decision to keep the tooling.
  The owner asked on 2026-09-29 what could be removed and for the review's recommendations to be
  applied; this step is kept separate so that it can be dropped on its own if the owner prefers
  to keep the report.
