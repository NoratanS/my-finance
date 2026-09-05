# Insights — Stage 1: Phase 4 core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the complete question → chart → save → pin loop with zero AI: a saved,
profile-scoped **Insight** (name + versioned query plan), a Python analytics service that
executes plans into four result shapes, and a React explorer that renders any of them.

**Architecture:** A third top-level service, `analytics/` (FastAPI), is a **pure plan
executor** — plan in, typed results out — holding the only Python↔DB credential, a
read-only Postgres role created by migration. It is internal-only: no published port, no
nginx route, reachable solely by the Spring backend over the compose network with a static
bearer token. The backend authenticates the session, resolves the active profile
server-side (the one place that ever happens), owns all writes, and proxies execution. The
frontend contains exactly four renderers plus a table, so every future analytics capability
is a new plan field producing an existing shape — zero frontend work.

**Tech Stack:** Java 21 / Spring Boot 4.1.0 / Spring Data JPA / Flyway · Python 3.12 /
FastAPI / psycopg / uv / ruff / pytest / testcontainers-python · PostgreSQL 16 ·
React 19 / Vite 7 / TypeScript / TanStack Query / Recharts · Docker Compose · GitHub Actions.

**Spec:** [`docs/superpowers/specs/2026-09-04-insights-implementation-design.md`](../specs/2026-09-04-insights-implementation-design.md)
— read it alongside this plan. It carries decisions D1–D12 (the DSL errata, the chart
choice, the CI policy) and assumptions A1–A7 that the tasks below depend on.

**Covers Linear:** MY-29, MY-30, MY-31, MY-32 (under umbrella MY-28).

**Stage gate:** the full question → chart → save → pin loop works with no AI present.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied
verbatim from the spec and from the committed design docs.

**Versions, pinned.** Java 21 · Spring Boot 4.1.0 (Spring Framework 7, **Jackson 3**) ·
Postgres `postgres:16-alpine` (identical tag in `docker-compose.yml`,
`deploy/release/docker-compose.yml`, `TestcontainersConfiguration.java`, and the Python
test harness) · Node 20 · React 19.2 · Vite 7 · TypeScript ~5.9.2 ·
Python 3.12+ (uv, ruff, pytest, psycopg, FastAPI) · `recharts@^3.10.1`.

**Jackson 3, not 2.** Databind is `tools.jackson.databind.json.JsonMapper` (an injectable
bean); annotations stay `com.fasterxml.jackson.annotation.*`; `JacksonException` is
`tools.jackson.core.JacksonException`. `@AutoConfigureMockMvc` lives in
`org.springframework.boot.webmvc.test.autoconfigure`. Starters are per-slice
(`spring-boot-starter-webmvc`, `-webmvc-test`, `-flyway`, `-flyway-test`, `-data-jpa-test`).

**No Lombok, anywhere.** Constructor injection with a single `final` field. DTOs are
`record`s; request records carry Bean Validation, response records carry a static
`from(entity)` factory.

**Profile scoping is a security boundary** (`ARCHITECTURE.md` §3). Never accept a
client-supplied profile id. `activeProfile.requireId()` at the top of every public
service method, including readers. Single-row access is
`findByIdAndProfileId(...).orElseThrow(...)`. A row in another profile is **404, never 403**.
Every hand-written SQL statement carries `profile_id` — in the outer query *and* in
both terms of any recursive CTE.

**Money.** `NUMERIC(19,4)` in the database, decimal **strings** on the wire, ISO 4217 code
alongside. Never floats, never client-side arithmetic. Aggregation is always per currency;
currencies never mix in one result. `COALESCE(SUM(t.amount), 0)` yields scale 0 and
serialises `"0"` — always cast `::numeric(19,4)` so an empty bucket is `"0.0000"`.

**Dates.** All ranges are inclusive on both ends. `txn.occurred_on` is a plain `DATE`.
Relative ranges resolve against an injectable clock in the instance's configured `TZ`,
never `date.today()` called inline, never `LocalDate.now()` without a `Clock`.

**TDD is mandatory** (CLAUDE.md) for anything with real logic — services, validation,
repository queries beyond trivial CRUD, hierarchy traversal, budget/plan calculations.
Failing test first, minimum code to pass, refactor green. Pure boilerplate (a bare
`@Entity`, a generated `JpaRepository` with no custom queries) may skip the cycle, and
the task says so in one line rather than silently omitting tests.

**Docs move with code** (CLAUDE.md). A change that diverges from `docs/SCHEMA.md`,
`docs/API.md`, `docs/INSIGHTS.md` or `ARCHITECTURE.md` updates that doc in the same
commit. Every non-trivial task appends a `docs/LESSONS.md` entry in the file's format —
`### lowercase-sentence title` under `## Entries`, with **What** / **Where** /
**Why it's this way** bullets, written for a Python-native reader. Repeated patterns
reference the earlier entry instead of restating it.

**Simplicity** (CLAUDE.md §2–§3). Minimum code that solves the problem. No speculative
abstraction, no unrequested configurability, no error handling for impossible states.
Touch only what the task requires; do not improve adjacent code. Match existing style
even where you would write it differently.

**Commits are conventional and frequent** — `feat(backend):`, `feat(analytics):`,
`feat(frontend):`, `test:`, `docs:`, `chore:`. One commit per task, at minimum.

---

## File Structure

Three units, each with one responsibility and a well-defined interface to the
other two. They can be built and reviewed independently, in this order.

**1. `analytics/` — a new top-level service. Plan in, typed results out.**

```
analytics/
├── pyproject.toml · uv.lock · Dockerfile · .dockerignore · README.md
├── src/analytics/
│   ├── main.py          FastAPI app and route handlers ONLY — thin, no logic
│   ├── config.py        Settings from env + today() — the injectable clock (D6)
│   ├── auth.py          require_token — the bearer dependency
│   ├── db.py            get_conn — one read-only connection per request
│   ├── plan.py          Plan dataclasses, the v1 enums, SUPPORTED_VERSIONS
│   ├── ranges.py        resolve_range / bucket_starts — the time axis
│   ├── validation.py    validate_plan -> list[str] problems; owns version support (D7)
│   ├── sql.py           SQL text builders; executes nothing
│   └── executor.py      execute() -> the result envelope; the four shapes
└── tests/               conftest (Testcontainers + the backend's own migrations), goldens
```

The split that matters: `sql.py` builds statements and `executor.py` runs them and
shapes the envelope, so the trickiest SQL — two different category CTEs, the
zero-fill cross join — is testable as text without a database, and the shaping is
testable without re-deriving SQL.

**2. `backend/` — the writer, the auth boundary, and the only door to the service.**

```
model/Insight.java · repository/InsightRepository.java
dto/InsightRequest.java · dto/InsightResponse.java
service/InsightService.java      profile scoping, CRUD, execute delegation
service/AnalyticsClient.java     the repo's FIRST outbound HTTP call (RestClient)
controller/InsightController.java
config/AnalyticsProperties.java
exception/{InsightNameTaken,AnalyticsUnavailable,InvalidPlan}Exception.java
resources/db/migration/V4__insights.sql   the insight table AND the myfinance_ro role
```

`AnalyticsClient` is deliberately separate from `InsightService`: one knows HTTP and
failure translation, the other knows profiles and persistence. That boundary is what
lets every backend test run against a stub server and never the real Python service.

**3. `frontend/src/insights/` — four renderers, a chip builder, and nothing else.**

```
screens/Insights.tsx              the explorer shell
insights/chips/*.tsx              one component per plan field; the plan is always visible
insights/renderers/
    ResultRenderer.tsx            dispatch on `shape` — the only place that switches
    ValueTile · TimeseriesChart · BreakdownChart · TimeseriesSplitChart · ResultTable
insights/templates.ts             the code-shipped gallery (doubles as fixtures)
insights/planDefaults.ts
components/PinnedInsights.tsx     dashboard tiles; existing sections untouched
```

`ResultRenderer` is the single dispatch point. Growing the DSL adds plan fields that
produce existing shapes, so it stays the only file that ever needs a new branch — and
in Stages 2 and 3 it does not get one.

**Also modified:** `docker-compose.yml`, `deploy/release/*` (compose, both launchers,
`.env.example`, README), `.github/workflows/{ci,release}.yml`, `application.properties`,
`App.tsx`, `Nav.tsx`, `Dashboard.tsx`, `api/{types,hooks}.ts`, `app.css`, and the four
design docs.

---

### Task 1: [MY-28] Doc-fix commit — apply E1..E11 to INSIGHTS.md, API.md, ARCHITECTURE.md

**Files:**
- Modify: `docs/INSIGHTS.md` (Plan DSL v1 → `filters.merchants` row, `groupBy` row, the `range` JSON block; Execution semantics → two new bullets; The AI layer (Phase 5) → opening paragraph; Testing strategy → the Phase 5 bullet; Deliberately deferred → one new table row)
- Modify: `docs/API.md` (`POST /api/insights/execute` → the validation paragraph and the `400` status row; `POST /api/insights` → the `plan` row of the request table)
- Modify: `ARCHITECTURE.md` (§4 Frontend → the `**Stack:**` line, plus a new "Why Recharts" paragraph before `## 5.`)
- Test: none — docs only. Verification is the `grep -F` assertion script in Step 6.

**Interfaces:**
- Consumes: nothing.
- Produces: no code symbols. It fixes the wording every later stage quotes, so the exact strings below are load-bearing:
  - plan problem text, shared by `filters.merchants` and `groupBy: "merchant"`: `merchant filtering and grouping are not available yet`
  - `groupBy` v1 enum: `category` | `merchant` | `null` (`currency` dropped)
  - `range: {"type":"lastMonths","n":N}` = **N buckets total** (N−1 complete months + the current partial one)
  - zero-fill applies **per series** in `timeseriesSplit`
  - "today" comes from the executor's injectable clock in the instance's configured `TZ`
  - backend plan validation is **only** "the body is a JSON object"; `version` support is the executor's check

> **No TDD cycle here** — this task edits prose in three design documents and adds no logic; per CLAUDE.md's "trivial tasks" tradeoff the test-first loop does not apply, and Step 6's `grep -F` assertion script is the verification gate instead.
>
> **No `docs/LESSONS.md` entry either** — CLAUDE.md requires an entry after *implementing* something non-trivial. Nothing is implemented here; the reasoning behind each edit already lives in `docs/superpowers/specs/2026-09-04-insights-implementation-design.md` (D1–D12). The LESSONS entries that Phase 4 does owe (DB roles as a privilege boundary, Flyway placeholders as a credential channel, `date_trunc`/`generate_series` gap-filling, `numeric` scale on the wire) belong to the tasks that write that code.

- [ ] **Step 1: Confirm the branch and a clean tree**

Run:

```bash
cd /home/chris/side-projects/my-finance && git rev-parse --abbrev-ref HEAD && git status --porcelain && echo "TREE CLEAN"
```

Expected: prints `feat/phase-4-insights-core`, then nothing from `git status --porcelain`,
then `TREE CLEAN`. If the branch is anything else, `git checkout feat/phase-4-insights-core`
first; if the tree is dirty, stop and resolve that before editing.

This branch is cut from `dev`, which already carries the Phase 4/5 design docs — PR #11
(`69a0d46`) merged them — plus the five spec/plan commits cherry-picked on top. The
`docs/phase-4-5-design` branch is history; do not switch to it. Everything in this stage is
committed **locally** and nothing is pushed.

- [ ] **Step 2: Apply E1, E3, E4 to `docs/INSIGHTS.md` → "Plan DSL v1"**

**E3 — `filters.merchants` row.** Current text (`docs/INSIGHTS.md:110`), verbatim:

```markdown
| `filters.merchants` | array of strings, optional | Restrict to these merchants. **Inert until the `merchant` column lands (Phase 4b)** — the field is part of v1 so saved plans and the AI prompt never need a version bump for it; until then the executor rejects it with a plan problem (`merchant filtering is not available yet`). |
```

Replace that whole line with:

```markdown
| `filters.merchants` | array of strings, optional | Restrict to these merchants. **Inert until the `merchant` column lands (Phase 4b)** — the field is part of v1 so saved plans and the AI prompt never need a version bump for it; until then the executor rejects it with a plan problem (`merchant filtering and grouping are not available yet`), the same problem `groupBy: "merchant"` gets, since both need the same column and both activate together. |
```

**E1 + E3 — `groupBy` row.** Current text (`docs/INSIGHTS.md:112`), verbatim:

```markdown
| `groupBy` | `category` \| `merchant` \| `currency` \| `null` | The categorical axis. `category` groups by the *children* of the filtered category (or by root categories when no filter), each child including its own subtree — matching the dashboard's rollup. `merchant` groups by merchant (`null` → `"Unspecified"`). |
```

Replace that whole line with:

```markdown
| `groupBy` | `category` \| `merchant` \| `null` | The categorical axis. `category` groups by the *children* of the filtered category (or by root categories when no filter), each child including its own subtree — matching the dashboard's rollup. `merchant` groups by merchant (`null` → `"Unspecified"`) — **inert until the `merchant` column lands (Phase 4b)**, rejected with the same plan problem as `filters.merchants` (`merchant filtering and grouping are not available yet`); neither field needs a version bump, because both are part of the v1 schema by design. |
```

**E4 — the `range` block.** Current text (`docs/INSIGHTS.md:116-123`), verbatim:

~~~markdown
`range` is one of:

```json
{ "type": "lastMonths",  "n": 12 }      // trailing full months + the current partial month
{ "type": "yearToDate" }
{ "type": "absolute", "from": "2026-01-01", "to": "2026-06-30" }
{ "type": "all" }
```
~~~

Replace that block with:

~~~markdown
`range` is one of:

```json
{ "type": "lastMonths",  "n": 12 }      // n buckets total, ending with the current partial month
{ "type": "yearToDate" }
{ "type": "absolute", "from": "2026-01-01", "to": "2026-06-30" }
{ "type": "all" }
```

`lastMonths` yields **n buckets total, not n + 1**: `n − 1` complete months
plus the current partial one. `{ "n": 12 }` run in September 2026 covers
`2025-10` … `2026-09` — "last 12 months" draws 12 bars, which is what the
template gallery's own name promises and what every comparable tool means.
~~~

- [ ] **Step 3: Apply E5, E6, E7, E8, E2 to the rest of `docs/INSIGHTS.md`**

**E5 — per-series zero-fill.** In "Execution semantics", find this bullet (`docs/INSIGHTS.md:158-159`), verbatim:

```markdown
- **`net` can be negative**; nothing clamps. `breakdown` results are sorted
  by absolute value descending; `timeseries` chronologically.
```

Insert the following bullet **directly after** it (so it lands before the `**Bounded output.**` bullet):

```markdown
- **Zero-filled buckets apply per series.** Every bucket in the range with no
  rows is emitted with value `"0.0000"`, and in `timeseriesSplit` that holds
  for *each* series independently: every series emits a point for every
  bucket in the range. Without it a multi-line chart has ragged x-axes and
  series of unequal length — the exact silent-gap failure the zero-fill rule
  exists to prevent.
```

**E6 — the executor's clock.** Find the last bullet of "Execution semantics" (`docs/INSIGHTS.md:164-166`), verbatim:

```markdown
- **Empty data is a result, not an error**: a valid plan over no rows
  returns its shape with zero values / empty series, and the explorer
  renders an empty state. Errors are for invalid *plans*, not absent data.
```

Insert the following bullet **directly after** it:

```markdown
- **"Today" is the executor's, from an injectable clock** —
  mirroring the backend's `config/ClockConfig.java`, resolving the date in
  the instance's configured `TZ` (default `UTC`), never from the database
  clock. `lastMonths` and `yearToDate` resolve against that *local* date,
  because `occurred_on` is a plain `DATE` the user enters in their own local
  time: an instance in Europe/Warsaw must not put a transaction entered at
  23:30 on the last of the month into the next one. Golden tests inject a
  frozen date.
```

**E7 — the default model.** Find the opening paragraph of "The AI layer (Phase 5)" (`docs/INSIGHTS.md:275-279`), verbatim:

```markdown
A thin, optional authoring layer on top of everything above. Compose
profile `ai` starts an `ollama` container (model configurable,
default a small instruct model ~2–4 GB; documented pull-on-first-start).
The analytics service owns the Ollama client (Python, same service that
owns the plan schema).
```

Replace it with:

```markdown
A thin, optional authoring layer on top of everything above. Compose
profile `ai` starts an `ollama` container; the model is configurable via
`OLLAMA_MODEL`, with documented pull-on-first-start. The default is
chosen by benchmark, not by assertion: the sentence → plan golden
fixture set below *is* a benchmark, so it is run against 2–3 small instruct
candidates (~2–4 GB, starting from Qwen3 4B) on the author's hardware, the
winner is pinned as the env default, and the comparison is recorded in
`LESSONS.md`. The analytics service owns the Ollama client (Python, same
service that owns the plan schema).
```

**E8 — the Phase 5 testing bullet.** Find the last bullet of "Testing strategy" (`docs/INSIGHTS.md:317-320`), verbatim:

```markdown
- **Phase 5**: sentence → plan golden tests over a fixture set (assert the
  emitted plan, tolerating field order); narration tests assert claims
  reference only values present in the input envelope. Both run only in the
  `ai`-profile CI job, so the core pipeline's CI never needs a model.
```

Replace it with:

```markdown
- **Phase 5**: **no model ever runs in CI.** In CI the Ollama client is
  stubbed, and the tests assert prompt assembly, JSON-schema validation of
  the emission, the retry-once-then-degrade path, the capabilities endpoint
  in both states, and that narration references only values present in its
  input envelope — fast and deterministic. The real sentence → plan golden
  suite (assert the emitted plan, tolerating field order) runs **locally
  only**, via a script target, before Phase 5 work is merged. A
  multi-gigabyte pull plus CPU inference on every PR is minutes of runtime,
  and small models are not bit-stable across releases — the classic route to
  a permanently red job everyone learns to ignore. Accepted risk, recorded
  as a decision rather than an oversight: a regression from an Ollama or
  model upgrade is caught only when that local suite is run.
```

**E2 — the deferred `currency` groupBy.** Find this row of the "Deliberately deferred" table (`docs/INSIGHTS.md:330`), verbatim:

```markdown
| `weekday`/`month-of-year` groupBy (seasonality) | The gallery's weekday template gets demand; cheap to add, waits for v1 to land. |
```

Insert the following row **directly after** it:

```markdown
| `groupBy: "currency"` | A genuine cross-currency comparison view is wanted — and then only with an explicit, written exception to the never-mix rule (`ARCHITECTURE.md` §3). Inside a per-currency result entry it yields exactly one group, which is degenerate; the only non-degenerate reading puts PLN and EUR bars in one chart. |
```

- [ ] **Step 4: Apply E9 and E10 to `docs/API.md` → "Insights"**

**E9 — the validation paragraph.** Current text (`docs/API.md:1130-1134`), verbatim:

```markdown
The backend checks only that the body is a JSON object with a supported
`version`; **deep validation is the executor's job** (one validator, one
source of truth — the backend forwarding a plan it half-understands is how
two validators drift). The analytics service returns either the result
envelope (`INSIGHTS.md` → Result shapes) or a problem list.
```

Replace it with:

```markdown
The backend checks only that the body **is a JSON object**. Everything else,
including whether the plan `version` is supported, is the executor's job
(one validator, one source of truth — the backend forwarding a plan it
half-understands is how two validators drift, and a second component that
knows the version set drifts the moment the DSL bumps to v2). The analytics
service returns either the result envelope (`INSIGHTS.md` → Result shapes)
or a problem list.
```

**E9 — the `400` status row.** Current text (`docs/API.md:1141`), verbatim:

```markdown
| `400` | Not a JSON object / unsupported `version` (`/errors/invalid-plan`), or executor-rejected plan (`/errors/invalid-plan` with `problems` array — dangling `categoryId`, unknown field, `merchants` before Phase 4b, ...) |
```

Replace that whole line with:

```markdown
| `400` | Not a JSON object (`/errors/invalid-plan`), or executor-rejected plan (`/errors/invalid-plan` with `problems` array — unsupported `version`, dangling `categoryId`, unknown field, `merchants` before Phase 4b, ...) |
```

**E10 — the `plan` request row.** Current text (`docs/API.md:1152`), verbatim:

```markdown
| `plan` | object | `@NotNull`; well-formed JSON object with supported `version` — deep validation stays with the executor (see above); the explorer always executes before offering save, so an unexecutable saved plan is possible only by hand-crafting, and surfaces as `400` problems at execution |
```

Replace that whole line with:

```markdown
| `plan` | object | `@NotNull`; a well-formed JSON object — deep validation, `version` support included, stays with the executor (see above); the explorer always executes before offering save, so an unexecutable saved plan is possible only by hand-crafting, and surfaces as `400` problems at execution |
```

- [ ] **Step 5: Apply E11 to `ARCHITECTURE.md` → §4 Frontend**

**The stack line.** Current text (`ARCHITECTURE.md:144-146`), verbatim:

```markdown
**Stack:** React (Vite, TypeScript), `react-router-dom` for routing, TanStack Query for
server-state caching/invalidation, plain CSS carrying the design tokens from
`docs/design/styles.css`. No UI framework.
```

Replace it with:

```markdown
**Stack:** React (Vite, TypeScript), `react-router-dom` for routing, TanStack Query for
server-state caching/invalidation, Recharts for the Phase 4 insight charts, plain CSS
carrying the design tokens from `docs/design/styles.css`. No UI framework.
```

**The new paragraph.** Find the end of the "Why Vite instead of Next.js" paragraph (`ARCHITECTURE.md:158-161`), verbatim:

```markdown
common real-world pairing for internal tools than a Next.js frontend in
front of a separate backend — and, since an existing portfolio project
already uses Next.js, a plain React setup here demonstrates a different
frontend pattern rather than repeating one.
```

Insert the following paragraph **directly after** it, separated by a blank line, so it sits between that paragraph and the `## 5. Deployment, packaging, and CI/CD (Phase 3)` heading:

```markdown
**Why Recharts for charts (Phase 4):** the insights explorer needs four
renderers — a stat tile (plain HTML), a line chart, a bar chart, and a
multi-line chart (`docs/INSIGHTS.md` → Result shapes). Recharts is one
small declarative dependency covering all three chart shapes with axes,
tick selection, tooltips, legends and responsive resizing included; series
colours are passed in from the existing design tokens through props, so
`docs/design/styles.css` stays authoritative. Cost accepted: ~100 kB
gzipped and a d3 transitive tree in a frontend that otherwise has three
runtime dependencies. Rejected: hand-rolled SVG — scales, tick selection,
hover hit-testing and responsive `viewBox` maths across four renderers is
the largest single chunk of Phase 4's frontend work, for no user-visible
gain — and visx, which is the same assembly effort minus the tick maths.
```

- [ ] **Step 6: Verify every edit landed — old wording gone, new wording present**

Run (paste the whole block; it defines two helpers and exits after printing a verdict):

```bash
cd /home/chris/side-projects/my-finance
fail=0
absent()  { grep -qF -- "$2" "$1" && { echo "STILL PRESENT in $1: $2"; fail=1; }; }
present() { grep -qF -- "$2" "$1" || { echo "MISSING from  $1: $2"; fail=1; }; }

# --- old wording must be gone ---
absent docs/INSIGHTS.md '`merchant` \| `currency` \| `null`'
absent docs/INSIGHTS.md 'merchant filtering is not available yet'
absent docs/INSIGHTS.md 'trailing full months + the current partial month'
absent docs/INSIGHTS.md 'default a small instruct model ~2–4 GB'
absent docs/INSIGHTS.md '`ai`-profile CI job'
absent docs/API.md      'a JSON object with a supported'
absent docs/API.md      'Not a JSON object / unsupported `version`'
absent docs/API.md      'well-formed JSON object with supported `version`'

# --- new wording must be present ---
present docs/INSIGHTS.md '| `groupBy` | `category` \| `merchant` \| `null` |'
present docs/INSIGHTS.md 'merchant filtering and grouping are not available yet'
present docs/INSIGHTS.md '| `groupBy: "currency"` |'
present docs/INSIGHTS.md 'n buckets total'
present docs/INSIGHTS.md 'Zero-filled buckets apply per series.'
present docs/INSIGHTS.md 'ClockConfig.java'
present docs/INSIGHTS.md 'chosen by benchmark, not by assertion'
present docs/INSIGHTS.md 'no model ever runs in CI'
present docs/API.md      'including whether the plan `version` is supported'
present docs/API.md      'unsupported `version`, dangling `categoryId`'
present docs/API.md      '`version` support included'
present ARCHITECTURE.md  'Recharts for the Phase 4 insight charts'
present ARCHITECTURE.md  'Why Recharts for charts (Phase 4)'

[ "$fail" -eq 0 ] && echo "ALL DOC ASSERTIONS PASS"
```

Expected: no `STILL PRESENT` / `MISSING from` lines, and the final line `ALL DOC ASSERTIONS PASS`.

- [ ] **Step 7: Sanity-check the diff is docs-only and touches nothing else**

Run:

```bash
cd /home/chris/side-projects/my-finance && git diff --stat
```

Expected: exactly three files — `ARCHITECTURE.md`, `docs/API.md`, `docs/INSIGHTS.md`. No file under `backend/`, `frontend/`, or `deploy/`.

- [ ] **Step 8: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add docs/INSIGHTS.md docs/API.md ARCHITECTURE.md
git commit -m "$(cat <<'EOF'
docs: apply the settled Phase 4/5 decisions to INSIGHTS, API, ARCHITECTURE

Applies E1..E11 from docs/superpowers/specs/2026-09-04-insights-implementation-design.md:
drop `currency` from the groupBy enum and record it as deferred (D1); reject
`groupBy: "merchant"` alongside `filters.merchants` with one shared plan problem
(D2); `lastMonths: n` is n buckets total (D5); zero-fill applies per series in
`timeseriesSplit` (D4); the executor owns an injectable clock in the configured
TZ (D6); the Phase 5 default model is picked by benchmark (D10); no model ever
runs in CI (D11); backend plan validation is "is a JSON object" only, version
support belongs to the one validator (D7); Recharts recorded in ARCHITECTURE §4
with the rejected alternatives (D8).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
```

---


### Task 2: [MY-28] Confirm the design docs are already on `dev`

**Files:**
- Modify: none. This task only verifies; it replaces the original "open a PR from
  `docs/phase-4-5-design` to `dev`" task, which is already done.
- Test: none. The two steps below are the verification gate.

**Interfaces:**
- Consumes: the doc-fix commit produced by Task 1 on `feat/phase-4-insights-core`.
- Produces: no code symbols. Confirms the branch this stage builds on already contains the
  committed Phase 4/5 design.

> **Why this task shrank.** The original plan assumed `docs/phase-4-5-design` was unmerged.
> It is not: PR #11 squash-merged it as `69a0d46 "Docs/phase 4 5 design + phase 6 research"`,
> so `dev` — and therefore this branch — already carries `docs/INSIGHTS.md`,
> `docs/INVESTMENTS.md`, the `insight` section of `docs/SCHEMA.md`, the Insights section of
> `docs/API.md`, and the `ARCHITECTURE.md` §6 rewrite. No PR, no `gh`, no network: work stays
> local on this branch.
>
> **No TDD cycle here** — nothing is built; the greps below are the gate.

- [ ] **Step 1: Confirm the design docs are present and carry Task 1's corrections**

```bash
cd /home/chris/side-projects/my-finance
test -f docs/INSIGHTS.md && test -f docs/INVESTMENTS.md \
  && grep -q '^## `insight`' docs/SCHEMA.md \
  && grep -q '^## Insights' docs/API.md \
  && grep -q 'Analytics & Insights (Phase 4)' ARCHITECTURE.md \
  && grep -q 'The backend checks only that the body \*\*is a JSON object\*\*' docs/API.md \
  && echo "DESIGN DOCS PRESENT AND CORRECTED"
```

Expected: `DESIGN DOCS PRESENT AND CORRECTED`. The last grep is Task 1's E9 edit — if only
that one fails, Task 1 has not been committed yet; finish it first.

- [ ] **Step 2: Confirm the branch is local-only and based on `dev`**

```bash
cd /home/chris/side-projects/my-finance
git rev-parse --abbrev-ref HEAD
git merge-base --is-ancestor dev HEAD && echo "BASED ON DEV"
git log --oneline dev..HEAD
```

Expected: `feat/phase-4-insights-core`, then `BASED ON DEV`, then the five cherry-picked
spec/plan commits plus Task 1's doc-fix commit. No upstream is set and nothing is pushed —
that is intentional for this stage.

### Task 3: [MY-28] Correct the stale Linear issue descriptions (MY-28, MY-31, MY-32)

**Files:**
- Modify: none in the repo — this task edits Linear issue descriptions through the Linear MCP connector.
- Test: none. Verification is Step 6, which re-reads all three issues and checks the corrected wording.

**Interfaces:**
- Consumes: `dev` containing the corrected docs (Task 2) — MY-28's description is updated to say the docs branch is merged, which is only true after Task 2.
- Produces: no code symbols. Corrected descriptions on Linear issues `MY-28`, `MY-31`, `MY-32` (team **My-finance-app**, id `009e8289-5d30-4669-8c93-2d29e6cef828`).

> **No TDD cycle here** — this task edits issue-tracker prose outside the repo and creates no code. Step 6 is the verification gate.

**Why `patch` and not a full `description` rewrite.** MY-28's description embeds
Linear's inline issue-mention markup, e.g.
`<issue id="700eb649-f4dc-4247-8506-2c69c924e360" href="https://linear.app/my-finance-app/issue/MY-29/analytics-service-skeleton-fastapi-read-only-db-role-compose-ci">MY-29</issue>`,
for MY-29, MY-30, MY-31, MY-32, MY-33, MY-34 and MY-35. Those tags **must be
preserved byte-for-byte** — retyping them by hand breaks the sub-issue links in
the Linear UI. `mcp__claude_ai_Linear__save_issue` accepts a `patch` array of
`{op, old_string, new_string}` operations applied atomically in place of a full
`description`, so every anchor below is chosen to sit entirely outside the
`<issue …>` tags. Also preserve verbatim, in all three issues: the `blockedBy`
ordering paragraph, the acceptance-criteria paragraphs, and every backticked
file path.

- [ ] **Step 1: Re-read the three issues and confirm every anchor still matches exactly once**

Call, one at a time:

```
mcp__claude_ai_Linear__get_issue({ id: "MY-28" })
mcp__claude_ai_Linear__get_issue({ id: "MY-31" })
mcp__claude_ai_Linear__get_issue({ id: "MY-32" })
```

Expected: each returns a `description` field. Before patching, confirm by eye that each
`old_string` used in Steps 2–4 appears in the returned description **exactly once**. A
`patch` op whose anchor is missing or ambiguous aborts the whole save, so a mismatch
means the description changed since 2026-09-04 and the anchor needs re-deriving from
what you just read.

- [ ] **Step 2: Patch MY-28 — merged docs, `spend|income|net`, no `split`, four shapes + table**

Call:

```
mcp__claude_ai_Linear__save_issue({
  id: "MY-28",
  patch: [
    {
      op: "replace",
      old_string: "**Design docs are written and committed** on branch `docs/phase-4-5-design` (PR to `dev` pending):",
      new_string: "**Design docs are written, corrected, and merged to `dev`** (branch `docs/phase-4-5-design`; the decisions those docs left open are settled in `docs/superpowers/specs/2026-09-04-insights-implementation-design.md`):"
    },
    {
      op: "replace",
      old_string: "2. **Plan DSL v1 stays deliberately small**: one metric (`spend|income`), filters (category subtree, currency, merchant), one `groupBy`, `interval`, `range`, optional `split`. Every added dimension multiplies the test matrix",
      new_string: "2. **Plan DSL v1 stays deliberately small**: one metric (`spend|income|net`), filters (category subtree, currency, merchant), one `groupBy` (`category|merchant|null` — `currency` is dropped from v1 and recorded in `INSIGHTS.md` → Deliberately deferred, since the envelope already returns one entry per currency), `interval`, `range`. There is **no `split` field**: when both `interval` and `groupBy` are set, the categorical axis *is* the split. Every added dimension multiplies the test matrix"
    },
    {
      op: "replace",
      old_string: "4. **Five result shapes** are the whole rendering contract: single value → stat tile; timeseries → line; categorical breakdown → bar/donut; timeseries×split → multi-line/grouped bars; table → table. The executor must normalize every plan result into one of these (per-currency, never mixed — no FX layer, as everywhere).",
      new_string: "4. **Four computed result shapes** are the whole rendering contract: `value` → stat tile; `timeseries` → line; `breakdown` → bar/donut; `timeseriesSplit` → multi-line/grouped bars. A **table is not a fifth shape — it is a renderer** applicable to every shape (and the explorer's honest fallback), selectable via `viz`. The executor must normalize every plan result into one of the four (per-currency, never mixed — no FX layer, as everywhere)."
    },
    {
      op: "replace",
      old_string: "First step of the next session: merge the docs branch, then pick up ",
      new_string: "The docs branch is merged into `dev`. Implementation starts with "
    }
  ]
})
```

Expected: the tool returns the updated issue. Nothing inside any `<issue …>…</issue>` tag was part of an anchor, so all seven sub-issue mentions survive unchanged.

- [ ] **Step 3: Patch MY-31 — merchant grouping, `lastMonths` bucket count, per-series zero-fill**

Call:

```
mcp__claude_ai_Linear__save_issue({
  id: "MY-31",
  patch: [
    {
      op: "replace",
      old_string: "`merchants` filter rejected with \"not available yet\" until Phase 4b",
      new_string: "the `merchants` filter **and** `groupBy: \"merchant\"` both rejected with the one shared plan problem `merchant filtering and grouping are not available yet` until Phase 4b, and both activated together in MY-33"
    },
    {
      op: "replace",
      old_string: "inclusive ranges (`lastMonths` incl. current partial month, `yearToDate`, `absolute`, `all`)",
      new_string: "inclusive ranges (`lastMonths` = **n buckets total** — `n − 1` complete months plus the current partial one, `yearToDate`, `absolute`, `all`), all resolved against an injectable clock reading the instance's configured `TZ`, never the database clock"
    },
    {
      op: "replace",
      old_string: "intervals day/week(ISO)/month/quarter/year with **zero-filled gap buckets**",
      new_string: "intervals day/week(ISO)/month/quarter/year with **zero-filled gap buckets, applied per series in `timeseriesSplit`** so every series emits a point for every bucket"
    }
  ]
})
```

Expected: the tool returns the updated issue with its acceptance paragraph untouched.

- [ ] **Step 4: Patch MY-32 — the chart layer is no longer an open decision**

Call:

```
mcp__claude_ai_Linear__save_issue({
  id: "MY-32",
  patch: [
    {
      op: "replace",
      old_string: "Decide chart layer here (hand-rolled SVG vs one small dependency — pick pragmatically, record in ARCHITECTURE §4; design-token styling either way).",
      new_string: "Chart layer is settled: **Recharts** (`recharts@^3.10.1`, peer `react ^19.0.0`), already recorded in `ARCHITECTURE.md` §4 — one small declarative dependency covering line, bar and multi-line with axes, ticks, tooltips, legends and responsive resizing included; series colours are passed in from the existing design tokens through props, so `docs/design/styles.css` stays authoritative. Hand-rolled SVG and visx were considered and rejected."
    }
  ]
})
```

Expected: the tool returns the updated issue. Leave the rest of MY-32 as it stands — "Four renderers + table" is already correct, and the e2e acceptance already says "against the compose stack", which is a local claim and therefore not stale.

- [ ] **Step 5: Confirm nothing in the repo changed**

Run:

```bash
cd /home/chris/side-projects/my-finance && git status --porcelain && git rev-parse --abbrev-ref HEAD
```

Expected: no output from `git status --porcelain`, then `dev`. This task edits Linear only — there is nothing to commit, and no commit step follows.

- [ ] **Step 6: Verify the corrections by re-reading all three issues**

Call:

```
mcp__claude_ai_Linear__get_issue({ id: "MY-28" })
mcp__claude_ai_Linear__get_issue({ id: "MY-31" })
mcp__claude_ai_Linear__get_issue({ id: "MY-32" })
```

Expected, checking the returned `description` of each:

- MY-28 contains `spend|income|net`, `no `split` field`, `Four computed result shapes`, `merged to `dev``, and still contains all seven `<issue id="…" href="…">MY-2x</issue>` mentions. It no longer contains `Five result shapes`, `(`spend|income`)`, `optional `split``, or `PR to `dev` pending`.
- MY-31 contains `merchant filtering and grouping are not available yet`, `n buckets total`, and `applied per series in `timeseriesSplit``. It no longer contains `incl. current partial month`.
- MY-32 contains `Recharts` and `recharts@^3.10.1`. It no longer contains `Decide chart layer here`.

### Task 4: [MY-29] Analytics package scaffold, `Settings`, and the unauthenticated health endpoint

**Files:**
- Create: `analytics/pyproject.toml`
- Create: `analytics/uv.lock` (generated by `uv lock`, committed)
- Create: `analytics/README.md`
- Create: `analytics/src/analytics/__init__.py`
- Create: `analytics/src/analytics/config.py`
- Create: `analytics/src/analytics/main.py`
- Modify: `.gitignore` (new `### Analytics (Phase 4) ###` block at the end, styled like the existing `### Frontend (Phase 2) ###` block)
- Test: `analytics/tests/conftest.py`, `analytics/tests/test_config.py`, `analytics/tests/test_health.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `analytics.config.Settings` — frozen dataclass with fields `database_url: str`, `analytics_token: str`, `tz: str`
  - `analytics.config.get_settings() -> Settings` — `lru_cache`d, env-driven, usable directly as a FastAPI dependency
  - `analytics.config.today(settings: Settings) -> datetime.date` — the injectable clock (spec D6)
  - `analytics.main.app` — the `FastAPI` instance
  - `GET /internal/health` → `200 {"status": "ok"}`, **no auth** (contract §2 / R4)
  - The `analytics` package is importable as `analytics.*` (src layout, installed by `uv sync`); tests run with `cd analytics && uv run pytest`.
- NOT created here, by design: `db.py`, `plan.py`, `validation.py`, `ranges.py`, `sql.py`, `executor.py` — MY-31 creates those; `backend/src/main/resources/db/migration/V4__insights.sql` and the `myfinance_ro` role — MY-30 creates those (contract A3). This fragment only wires the credential through env; nothing here opens a database connection.

- [ ] **Step 1: Scaffold the uv project (boilerplate — no test cycle, per CLAUDE.md's "trivial tasks" tradeoff)**

Create `analytics/README.md`:

````markdown
# analytics

The my-finance analytics service (`docs/INSIGHTS.md` → "The analytics
service"): a read-only executor for saved insight plans. Python 3.12,
FastAPI, `uv` for dependencies.

## Internal-only, on purpose

The service publishes no port and nginx has no route to it. The backend is
the only caller, over the compose network at `http://analytics:8000`: it
authenticates the session, resolves the active profile server-side, and
forwards the profile id with a static bearer token (`ANALYTICS_TOKEN`).
Defense in depth, so a misconfigured network still doesn't expose an
unauthenticated SQL-adjacent service. `GET /internal/health` is the one
unauthenticated route — it is the compose healthcheck, and a healthcheck
must not carry a secret.

It connects to Postgres as `myfinance_ro`, the read-only role created by the
backend's `V4__insights.sql` migration, so "analytics can't write" is a
database guarantee rather than a code convention.

## Development

```bash
cd analytics
uv sync
uv run uvicorn analytics.main:app --reload --port 8000
```

## Lint and tests

```bash
cd analytics
uv run ruff check .
uv run pytest
```
````

Create `analytics/pyproject.toml`:

```toml
[project]
name = "analytics"
version = "0.1.0"
description = "my-finance analytics service: a read-only executor for saved insight plans."
readme = "README.md"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
]

[dependency-groups]
dev = [
    "httpx>=0.27",
    "pytest>=8.0",
    "ruff>=0.6",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/analytics"]

[tool.ruff]
line-length = 100

[tool.ruff.lint]
# pycodestyle errors + pyflakes (ruff's default) plus import sorting,
# pyupgrade and bugbear — the three that catch real mistakes rather than taste.
select = ["E", "F", "I", "UP", "B"]

[tool.ruff.lint.isort]
# The service's own package, so its imports sort into a block of their own
# instead of being mistaken for a third-party distribution named "analytics".
known-first-party = ["analytics"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

Create `analytics/src/analytics/__init__.py`:

```python
"""my-finance analytics service (docs/INSIGHTS.md)."""
```

Append to `.gitignore`, after the `# local compose environment (contains the DB password)` block:

```gitignore

### Analytics (Phase 4) ###
analytics/.venv/
analytics/**/__pycache__/
analytics/.pytest_cache/
analytics/.ruff_cache/
```

Then generate the lockfile:

```bash
cd /home/chris/side-projects/my-finance/analytics && uv lock
```

- [ ] **Step 2: Write the failing tests**

Create `analytics/tests/conftest.py`:

```python
"""Fixtures shared by every analytics test."""

import pytest

from analytics.config import get_settings


@pytest.fixture(autouse=True)
def clear_settings_cache():
    """get_settings() is lru_cached, so a test that changes the environment must
    not leak its Settings into the next one."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
```

Create `analytics/tests/test_config.py`:

```python
from analytics.config import get_settings


def test_settings_come_from_the_environment(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://myfinance_ro:s3cret@postgres:5432/myfinance")
    monkeypatch.setenv("ANALYTICS_TOKEN", "token-from-env")
    monkeypatch.setenv("TZ", "Europe/Warsaw")

    settings = get_settings()

    assert settings.database_url == "postgresql://myfinance_ro:s3cret@postgres:5432/myfinance"
    assert settings.analytics_token == "token-from-env"
    assert settings.tz == "Europe/Warsaw"


def test_settings_fall_back_to_dev_defaults(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("ANALYTICS_TOKEN", raising=False)
    monkeypatch.delenv("TZ", raising=False)

    settings = get_settings()

    assert settings.database_url.startswith("postgresql://myfinance_ro:")
    assert settings.analytics_token == "dev-analytics-token"
    assert settings.tz == "UTC"
```

Create `analytics/tests/test_health.py`:

```python
from fastapi.testclient import TestClient

from analytics.main import app

client = TestClient(app)


def test_health_answers_ok_without_a_token():
    response = client.get("/internal/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest`

Expected: FAIL with

```
ImportError while loading conftest '/home/chris/side-projects/my-finance/analytics/tests/conftest.py'.
tests/conftest.py:5: in <module>
    from analytics.config import get_settings
E   ModuleNotFoundError: No module named 'analytics.config'
```

- [ ] **Step 4: Implement `config.py` and `main.py`**

Create `analytics/src/analytics/config.py`:

```python
"""Environment-driven settings and the executor's clock (docs/INSIGHTS.md)."""

import datetime
import os
from dataclasses import dataclass
from functools import lru_cache
from zoneinfo import ZoneInfo

# Dev default matching docker-compose.yml: the read-only role, its dev-default
# password, and the dev database name.
DEFAULT_DATABASE_URL = "postgresql://myfinance_ro:myfinance-ro@localhost:5432/myfinance"


@dataclass(frozen=True)
class Settings:
    """Every value has a working dev default, the same convention
    docker-compose.yml uses for the backend's DB_URL / DB_USERNAME."""

    database_url: str
    analytics_token: str
    tz: str


@lru_cache
def get_settings() -> Settings:
    return Settings(
        database_url=os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL),
        analytics_token=os.environ.get("ANALYTICS_TOKEN", "dev-analytics-token"),
        tz=os.environ.get("TZ", "UTC"),
    )


def today(settings: Settings) -> datetime.date:
    """The instance's local date, not UTC: txn.occurred_on is a plain DATE the
    user enters in their own time, so a purchase at 23:30 must not fall into
    tomorrow's bucket for an instance running east of UTC."""
    return datetime.datetime.now(ZoneInfo(settings.tz)).date()
```

Create `analytics/src/analytics/main.py`:

```python
"""FastAPI app for the analytics service (docs/INSIGHTS.md → "The analytics service")."""

from fastapi import FastAPI

app = FastAPI(title="my-finance analytics")


@app.get("/internal/health")
def health() -> dict[str, str]:
    """Liveness for the compose healthcheck. Deliberately unauthenticated, for
    the same reason as the backend's /actuator/health: it reveals liveness, not
    data, and a healthcheck command must not carry a secret."""
    return {"status": "ok"}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run ruff check . && uv run pytest`

Expected: PASS — `3 passed`, and ruff reports `All checks passed!`

- [ ] **Step 6: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/pyproject.toml analytics/uv.lock analytics/README.md \
        analytics/src analytics/tests .gitignore
git commit -m "feat(analytics): FastAPI skeleton with env settings and a health endpoint"
```

---


### Task 5: [MY-29] Static bearer auth and the `/internal/v1/execute` stub

**Files:**
- Create: `analytics/src/analytics/auth.py`
- Modify: `analytics/src/analytics/main.py` (imports + a new `execute` route below `health`)
- Test: `analytics/tests/test_execute.py`

**Interfaces:**
- Consumes: `analytics.config.Settings`, `analytics.config.get_settings()`, `analytics.main.app` (Task 4).
- Produces:
  - `analytics.auth.require_token(credentials, settings) -> None` — a FastAPI dependency raising `HTTPException(401)` when the `Authorization: Bearer <ANALYTICS_TOKEN>` header is missing or wrong. Every route except `/internal/health` declares it.
  - `POST /internal/v1/execute` — `401` without a valid token; `400 {"problems": [...]}` with one. The 400 body is the contract shape (contract §2) wired end to end from day one; MY-31 replaces the handler with the real executor call.

- [ ] **Step 1: Write the failing test**

Create `analytics/tests/test_execute.py`:

```python
from fastapi.testclient import TestClient

from analytics.main import app

client = TestClient(app)

PLAN_REQUEST = {"profileId": 3, "plan": {"version": 1, "metric": "spend"}}


def test_execute_rejects_a_request_with_no_token():
    response = client.post("/internal/v1/execute", json=PLAN_REQUEST)

    assert response.status_code == 401


def test_execute_rejects_a_wrong_token():
    response = client.post(
        "/internal/v1/execute",
        json=PLAN_REQUEST,
        headers={"Authorization": "Bearer not-the-token"},
    )

    assert response.status_code == 401


def test_execute_accepts_the_token_and_answers_with_the_problems_shape(monkeypatch):
    monkeypatch.setenv("ANALYTICS_TOKEN", "token-under-test")

    response = client.post(
        "/internal/v1/execute",
        json=PLAN_REQUEST,
        headers={"Authorization": "Bearer token-under-test"},
    )

    assert response.status_code == 400
    assert response.json() == {"problems": ["the plan executor is not implemented yet"]}


def test_health_still_needs_no_token():
    response = client.get("/internal/health")

    assert response.status_code == 200
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_execute.py`

Expected: FAIL with `assert 404 == 401` (three failures — the route does not exist yet, so FastAPI answers `404 Not Found`; `test_health_still_needs_no_token` passes).

- [ ] **Step 3: Implement the auth dependency and the stub route**

Create `analytics/src/analytics/auth.py`:

```python
"""Bearer-token authentication for the internal analytics API."""

import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from analytics.config import Settings, get_settings

# auto_error=False so a missing header arrives here as None and earns the same
# 401 as a wrong one; HTTPBearer's own error for a missing header is a 403.
bearer_scheme = HTTPBearer(auto_error=False)


def require_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    """The backend is the only caller (docs/INSIGHTS.md → "The analytics
    service"). compare_digest rather than ==, the usual constant-time habit for
    comparing a secret."""
    if credentials is None or not secrets.compare_digest(
        credentials.credentials, settings.analytics_token
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid bearer token",
        )
```

Replace the contents of `analytics/src/analytics/main.py` with:

```python
"""FastAPI app for the analytics service (docs/INSIGHTS.md → "The analytics service")."""

from fastapi import Depends, FastAPI

from analytics.auth import require_token

app = FastAPI(title="my-finance analytics")


@app.get("/internal/health")
def health() -> dict[str, str]:
    """Liveness for the compose healthcheck. Deliberately unauthenticated, for
    the same reason as the backend's /actuator/health: it reveals liveness, not
    data, and a healthcheck command must not carry a secret."""
    return {"status": "ok"}


@app.post("/internal/v1/execute", status_code=400, dependencies=[Depends(require_token)])
def execute() -> dict[str, list[str]]:
    """Placeholder for the plan executor: the contract's 400 problems shape,
    wired end to end so the backend and the explorer can be built against it.
    The request body is deliberately not modelled here — plan validation belongs
    to the executor, and a model at this layer would answer a malformed body
    with FastAPI's 422 shape instead of the contract's problems array."""
    return {"problems": ["the plan executor is not implemented yet"]}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run ruff check . && uv run pytest`

Expected: PASS — `7 passed`, ruff reports `All checks passed!`

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/src/analytics/auth.py analytics/src/analytics/main.py \
        analytics/tests/test_execute.py
git commit -m "feat(analytics): static bearer auth and the execute stub"
```

---


### Task 6: [MY-29] Dockerfile for the internal analytics image

**Files:**
- Create: `analytics/Dockerfile`
- Create: `analytics/.dockerignore`

**Interfaces:**
- Consumes: `analytics/pyproject.toml`, `analytics/uv.lock`, `analytics/README.md`, `analytics/src/` (Task 4); `analytics.main:app` serving `/internal/health` (Task 4) and `/internal/v1/execute` (Task 5).
- Produces: an image that listens on `8000`, runs as a non-root user, and answers the exact probe the compose healthcheck will use:
  `python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/internal/health')"`.
  The runtime `PATH` puts `/app/.venv/bin` first, which is what makes that bare `python` the venv's interpreter.

- [ ] **Step 1: Run the build to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && docker build -t my-finance-analytics:dev .`

Expected: FAIL with `failed to read dockerfile: open Dockerfile: no such file or directory`

- [ ] **Step 2: Write the Dockerfile and .dockerignore**

Create `analytics/.dockerignore`:

```
.venv/
__pycache__/
.pytest_cache/
.ruff_cache/
tests/
Dockerfile
.dockerignore
```

Create `analytics/Dockerfile`:

```dockerfile
# Build stage: resolve the locked dependency set into a virtualenv with uv.
# uv ships as a static binary in its own image, so getting it costs the runtime
# stage nothing.
FROM python:3.12-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.11.6 /uv /bin/uv
WORKDIR /app

# Byte-compile on install, copy instead of hardlink, and never fetch a second
# interpreter: all three make the venv self-contained enough to hand over.
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

# Manifest and lockfile first so the dependency layer stays cached until they
# change — the same reason backend/Dockerfile copies pom.xml on its own.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY README.md ./
COPY src/ src/
RUN uv sync --locked --no-dev

# Runtime stage: the interpreter plus the finished venv, no uv and no build
# cache. One Python base for both stages, unlike backend/Dockerfile's JDK to
# JRE drop: there is nothing to compile away here, only the installer.
FROM python:3.12-slim
RUN groupadd --system app && useradd --system --gid app app
WORKDIR /app
# uv installs the project itself in editable mode, so the venv points at
# /app/src — the runtime path has to match the build path, hence copying /app
# whole rather than lifting .venv out on its own.
COPY --from=build --chown=app:app /app /app
USER app
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
CMD ["uvicorn", "analytics.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 3: Build the image and probe it exactly as compose will**

Run:

```bash
cd /home/chris/side-projects/my-finance/analytics && \
docker build -t my-finance-analytics:dev . && \
docker run -d --name analytics-probe -p 18000:8000 my-finance-analytics:dev && \
sleep 3 && \
docker exec analytics-probe python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/internal/health').read().decode())" && \
docker exec analytics-probe id -un && \
curl -sS -X POST -H 'Authorization: Bearer dev-analytics-token' \
     -H 'Content-Type: application/json' -d '{"profileId":1,"plan":{}}' \
     -w ' [%{http_code}]\n' http://localhost:18000/internal/v1/execute
```

Expected: PASS —

```
{"status":"ok"}
app
{"problems":["the plan executor is not implemented yet"]} [400]
```

- [ ] **Step 4: Remove the probe container**

Run: `docker rm -f analytics-probe`

Expected: prints `analytics-probe` (the image stays; compose rebuilds it in Task 7).

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/Dockerfile analytics/.dockerignore
git commit -m "feat(analytics): Dockerfile for the internal analytics image"
```

---


### Task 7: [MY-29] Wire `analytics` into both compose stacks and both `.env.example` files

**Files:**
- Modify: `docker-compose.yml` (header comment; new `analytics:` service between `backend:` and `frontend:`; three new env entries on `backend:`)
- Modify: `deploy/release/docker-compose.yml` (same three edits, `image:` instead of `build:`)
- Modify: `.env.example` (two new variable blocks at the end)
- Modify: `deploy/release/.env.example` (header sentence + the same two blocks)

**Interfaces:**
- Consumes: `analytics/Dockerfile` (Task 6), `GET /internal/health` (Task 4), `POST /internal/v1/execute` (Task 5).
- Produces:
  - compose service `analytics` — reachable inside the compose network as `http://analytics:8000`, **no `ports:` entry**, `depends_on: postgres: service_healthy`, healthcheck per contract R4.
  - env available to the `backend` container: `ANALYTICS_URL=http://analytics:8000`, `ANALYTICS_TOKEN`, `DB_ANALYTICS_PASSWORD`. The Spring properties that read the first two (`analytics.base-url`, `analytics.token`, contract R6) land in MY-31; the Flyway placeholder that reads the third (`spring.flyway.placeholders.dbAnalyticsPassword`, contract R2) lands in MY-30. All three env names are fixed here so the plumbing is edited once.
  - env consumed by the `analytics` container: `DATABASE_URL` (as `myfinance_ro`), `ANALYTICS_TOKEN`, `TZ`.
- The backend deliberately does **not** `depends_on` analytics (contract R3): it is designed to degrade to `503 /errors/analytics-unavailable`, so gating its startup would be stricter than the design. nginx is untouched — the browser must never reach this service.
- Note: `myfinance_ro` does not exist until MY-30's `V4__insights.sql`. Nothing in this fragment opens a database connection, so the service starts and reports healthy regardless.

- [ ] **Step 1: Run the check to verify it fails**

Run: `cd /home/chris/side-projects/my-finance && docker compose config --services | grep -x analytics`

Expected: FAIL — no output, exit status 1 (the stack has three services).

- [ ] **Step 2: Add the service and env to the root compose file**

In `docker-compose.yml`, replace the header comment:

```yaml
# Full self-hosted stack (ARCHITECTURE.md §5). `docker compose up --build`
# and the app is at http://localhost:3000. Only the frontend publishes a
# port — the backend is reached exclusively through nginx's /api proxy, and
# postgres only from the backend.
```

with:

```yaml
# Full self-hosted stack (ARCHITECTURE.md §5). `docker compose up --build`
# and the app is at http://localhost:3000. Only the frontend publishes a
# port — the backend is reached exclusively through nginx's /api proxy,
# postgres only from the backend and analytics, and analytics only from the
# backend (nginx has no route to it).
```

In the same file, extend the `backend:` service's `environment:` map (it currently ends with `SESSION_COOKIE_SECURE`):

```yaml
      SESSION_COOKIE_SECURE: ${SESSION_COOKIE_SECURE:-false}
      ANALYTICS_URL: http://analytics:8000
      ANALYTICS_TOKEN: ${ANALYTICS_TOKEN:-dev-analytics-token}
      DB_ANALYTICS_PASSWORD: ${DB_ANALYTICS_PASSWORD:-myfinance-ro}
```

And insert the new service between the `backend:` block (which ends `start_period: 30s`) and `  frontend:`:

```yaml
  analytics:
    build: ./analytics
    restart: unless-stopped
    environment:
      # The read-only myfinance_ro role (docs/SCHEMA.md "The read-only analytics
      # role"), never the app's own credentials.
      DATABASE_URL: postgresql://myfinance_ro:${DB_ANALYTICS_PASSWORD:-myfinance-ro}@postgres:5432/${POSTGRES_DB:-myfinance}
      ANALYTICS_TOKEN: ${ANALYTICS_TOKEN:-dev-analytics-token}
      TZ: ${TZ:-UTC}
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      # No wget/curl in python:3.12-slim; the interpreter is the probe.
      test: ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://localhost:8000/internal/health')\""]
      interval: 5s
      timeout: 3s
      retries: 20
      start_period: 10s

```

- [ ] **Step 3: Make the same change to the release compose file**

In `deploy/release/docker-compose.yml`, extend the `backend:` service's `environment:` map exactly as above:

```yaml
      SESSION_COOKIE_SECURE: ${SESSION_COOKIE_SECURE:-false}
      ANALYTICS_URL: http://analytics:8000
      ANALYTICS_TOKEN: ${ANALYTICS_TOKEN:-dev-analytics-token}
      DB_ANALYTICS_PASSWORD: ${DB_ANALYTICS_PASSWORD:-myfinance-ro}
```

and insert between the `backend:` block and `  frontend:`:

```yaml
  analytics:
    image: ghcr.io/noratans/my-finance-analytics:latest
    restart: unless-stopped
    environment:
      # The read-only myfinance_ro role (docs/SCHEMA.md "The read-only analytics
      # role"), never the app's own credentials.
      DATABASE_URL: postgresql://myfinance_ro:${DB_ANALYTICS_PASSWORD:-myfinance-ro}@postgres:5432/${POSTGRES_DB:-myfinance}
      ANALYTICS_TOKEN: ${ANALYTICS_TOKEN:-dev-analytics-token}
      TZ: ${TZ:-UTC}
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      # No wget/curl in python:3.12-slim; the interpreter is the probe.
      test: ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://localhost:8000/internal/health')\""]
      interval: 5s
      timeout: 3s
      retries: 20
      start_period: 10s

```

- [ ] **Step 4: Add the two variables to both `.env.example` files**

Append to `.env.example` (root), after the `SESSION_COOKIE_SECURE=false` line:

```
# Password for the read-only `myfinance_ro` database role that the analytics
# service connects with. The V4 migration creates the role with this password,
# so it is one value used in two places — change it here only.
DB_ANALYTICS_PASSWORD=change-me

# Shared secret the backend sends to the analytics service, which publishes no
# port. Defense in depth rather than the only barrier.
ANALYTICS_TOKEN=change-me
```

In `deploy/release/.env.example`, replace the header sentence:

```
# start.sh / start.bat copy this file to `.env` on first run and replace
# POSTGRES_PASSWORD with a random value. Edit `.env` (not this file) to
# change settings; restart with `docker compose up -d` to apply.
```

with:

```
# start.sh / start.bat copy this file to `.env` on first run and replace every
# `change-me` with a freshly generated random value. Edit `.env` (not this
# file) to change settings; restart with `docker compose up -d` to apply.
```

and append the same two blocks after its `SESSION_COOKIE_SECURE=false` line:

```
# Password for the read-only `myfinance_ro` database role that the analytics
# service connects with. The V4 migration creates the role with this password,
# so it is one value used in two places — change it here only.
DB_ANALYTICS_PASSWORD=change-me

# Shared secret the backend sends to the analytics service, which publishes no
# port. Defense in depth rather than the only barrier.
ANALYTICS_TOKEN=change-me
```

- [ ] **Step 5: Verify the rendered stacks**

Run:

```bash
cd /home/chris/side-projects/my-finance && \
docker compose config --services | sort | tr '\n' ' ' && echo && \
for f in docker-compose.yml deploy/release/docker-compose.yml; do
  echo "--- $f ---"
  docker compose -f "$f" config --format json | python3 -c "
import json, sys
stack = json.load(sys.stdin)['services']
print('analytics ports:', stack['analytics'].get('ports'))
print('analytics depends_on:', sorted(stack['analytics'].get('depends_on', {})))
print('backend depends_on:', sorted(stack['backend'].get('depends_on', {})))
print('backend analytics env:', sorted(k for k in stack['backend']['environment'] if 'ANALYTICS' in k))
"
done
```

Expected: PASS —

```
analytics backend frontend postgres 
--- docker-compose.yml ---
analytics ports: None
analytics depends_on: ['postgres']
backend depends_on: ['postgres']
backend analytics env: ['ANALYTICS_TOKEN', 'ANALYTICS_URL', 'DB_ANALYTICS_PASSWORD']
--- deploy/release/docker-compose.yml ---
analytics ports: None
analytics depends_on: ['postgres']
backend depends_on: ['postgres']
backend analytics env: ['ANALYTICS_TOKEN', 'ANALYTICS_URL', 'DB_ANALYTICS_PASSWORD']
```

Two things are being proved at once: analytics has no `ports:` key in either rendered stack, and `backend depends_on` is still `['postgres']` alone (contract R3 — the backend degrades to `503`, it must not be gated on analytics health).

- [ ] **Step 6: Start the stack and check the service comes up healthy and unpublished**

Run:

```bash
cd /home/chris/side-projects/my-finance && \
docker compose up -d --build analytics && sleep 20 && \
docker compose ps analytics && \
curl -sS -m 3 http://localhost:8000/internal/health ; echo "curl exit=$?"
```

Expected: PASS — `docker compose ps analytics` shows `Up ... (healthy)`, and the curl line prints `Failed to connect to localhost port 8000: Connection refused` followed by `curl exit=7`.

- [ ] **Step 7: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add docker-compose.yml deploy/release/docker-compose.yml .env.example deploy/release/.env.example
git commit -m "feat(deploy): run the analytics service in both compose stacks"
```

---


### Task 8: [MY-29] Generate the analytics secrets in both launchers

**Files:**
- Modify: `deploy/release/start.sh` (secret generation block; new append-if-missing loop after it)
- Modify: `deploy/release/start.bat` (the first-run PowerShell line; new append-if-missing PowerShell line after the block) — **CRLF line endings must survive** (`deploy/.gitattributes` pins `release/start.bat text eol=crlf`)
- Modify: `deploy/release/README.md` (the stack list on line 4 and the "On first run" paragraph)

**Interfaces:**
- Consumes: `DB_ANALYTICS_PASSWORD` / `ANALYTICS_TOKEN` in `deploy/release/.env.example` (Task 7).
- Produces: a bundle whose `.env` always carries all three secrets — freshly generated on first run, and **appended if missing** when a user upgrades from a pre-analytics bundle (contract R5). Without the append, compose's `${VAR:-default}` convention would silently hand a published dev default to a bearer token, the one outcome a static token must never have.

- [ ] **Step 1: Write the failing check**

Run:

```bash
rm -rf /tmp/launcher-check && mkdir -p /tmp/launcher-check/bin && cd /tmp/launcher-check && \
cp /home/chris/side-projects/my-finance/deploy/release/.env.example . && \
cp /home/chris/side-projects/my-finance/deploy/release/start.sh . && \
cat > bin/docker <<'STUB'
#!/usr/bin/env bash
# Stands in for Docker: the launcher only asks whether compose exists, whether an
# old data volume is around, and then pulls and starts. None of that is under test.
case "$*" in
  "compose version") exit 0 ;;
  "volume inspect my-finance_postgres-data") exit 1 ;;
  *) exit 0 ;;
esac
STUB
chmod +x bin/docker start.sh && \
PATH="/tmp/launcher-check/bin:$PATH" timeout 10 ./start.sh >/dev/null 2>&1 ; \
grep -E '^(POSTGRES_PASSWORD|DB_ANALYTICS_PASSWORD|ANALYTICS_TOKEN)=' .env
```

Expected: FAIL — the database password is random but the two analytics secrets are still the template's placeholder:

```
POSTGRES_PASSWORD=<24 random characters>
DB_ANALYTICS_PASSWORD=change-me
ANALYTICS_TOKEN=change-me
```

- [ ] **Step 2: Generate all three secrets, and append what an upgrade is missing, in `start.sh`**

In `deploy/release/start.sh`, replace this block:

```bash
if [ ! -f .env ]; then
  # An existing database volume with no .env means this is an upgrade into a
  # fresh folder: generating a new password here would lock the app out of
  # its own data.
  if docker volume inspect my-finance_postgres-data >/dev/null 2>&1; then
    echo "Error: found an existing my-finance database volume but no .env here."
    echo "Copy the .env from your previous bundle folder into this one (it holds"
    echo "the database password), or run 'docker compose down -v' there first to"
    echo "deliberately wipe the old data."
    exit 1
  fi
  echo "First run: creating .env with a random database password."
  password=$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 24)
  sed "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${password}/" .env.example > .env
fi
```

with:

```bash
# 24 alphanumeric characters — one recipe, one fresh value per secret.
gen_secret() {
  LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 24
}

if [ ! -f .env ]; then
  # An existing database volume with no .env means this is an upgrade into a
  # fresh folder: generating a new password here would lock the app out of
  # its own data.
  if docker volume inspect my-finance_postgres-data >/dev/null 2>&1; then
    echo "Error: found an existing my-finance database volume but no .env here."
    echo "Copy the .env from your previous bundle folder into this one (it holds"
    echo "the database password), or run 'docker compose down -v' there first to"
    echo "deliberately wipe the old data."
    exit 1
  fi
  echo "First run: creating .env with randomly generated secrets."
  sed -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(gen_secret)/" \
      -e "s/^DB_ANALYTICS_PASSWORD=.*/DB_ANALYTICS_PASSWORD=$(gen_secret)/" \
      -e "s/^ANALYTICS_TOKEN=.*/ANALYTICS_TOKEN=$(gen_secret)/" \
      .env.example > .env
fi

# A .env written by a pre-analytics bundle has neither analytics secret, and
# compose's ${VAR:-default} convention would quietly fall back to the published
# dev defaults — never acceptable for a bearer token. Append what is missing.
for key in DB_ANALYTICS_PASSWORD ANALYTICS_TOKEN; do
  if ! grep -q "^${key}=" .env; then
    echo "Adding a generated ${key} to .env (upgrade from an older bundle)."
    printf '%s=%s\n' "$key" "$(gen_secret)" >> .env
  fi
done
```

- [ ] **Step 3: Make the same change in `start.bat` (keep CRLF)**

In `deploy/release/start.bat`, replace these two lines inside the `if not exist .env (` block:

```
  echo First run: creating .env with a random database password.
  powershell -NoProfile -Command "$p = -join ((48..57) + (97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_}); (Get-Content .env.example) -replace '^POSTGRES_PASSWORD=.*', ('POSTGRES_PASSWORD=' + $p) | Set-Content .env"
```

with:

```
  echo First run: creating .env with randomly generated secrets.
  powershell -NoProfile -Command "function New-Secret { -join ((48..57) + (97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_}) }; (Get-Content .env.example) -replace '^POSTGRES_PASSWORD=.*', ('POSTGRES_PASSWORD=' + (New-Secret)) -replace '^DB_ANALYTICS_PASSWORD=.*', ('DB_ANALYTICS_PASSWORD=' + (New-Secret)) -replace '^ANALYTICS_TOKEN=.*', ('ANALYTICS_TOKEN=' + (New-Secret)) | Set-Content .env"
```

and insert these four lines immediately after that block's closing `)`, before `echo Pulling images...`:

```
rem A .env written by a pre-analytics bundle has neither analytics secret, and
rem compose's default-value convention would quietly fall back to the published
rem dev defaults - never acceptable for a bearer token. Append what is missing.
powershell -NoProfile -Command "function New-Secret { -join ((48..57) + (97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_}) }; foreach ($k in 'DB_ANALYTICS_PASSWORD', 'ANALYTICS_TOKEN') { if (-not (Select-String -Path .env -Pattern ('^' + $k + '=') -Quiet)) { Write-Host ('Adding a generated ' + $k + ' to .env (upgrade from an older bundle).'); Add-Content .env ($k + '=' + (New-Secret)) } }"
```

- [ ] **Step 4: Update the bundle README's two now-inaccurate sentences**

In `deploy/release/README.md`, replace:

```
A self-hosted personal finance tracker. This bundle runs the whole app
(database, API, web UI) on your own machine with Docker.
```

with:

```
A self-hosted personal finance tracker. This bundle runs the whole app
(database, API, analytics service, web UI) on your own machine with Docker.
```

and replace:

```
On first run the script creates a `.env` file with a random database
password, pulls the images, and starts the stack. Re-running it later is
safe — it just restarts everything.
```

with:

```
On first run the script creates a `.env` file with randomly generated
secrets (the database password, the analytics role password, and the
analytics service token), pulls the images, and starts the stack. Re-running
it later is safe — it just restarts everything, and it fills in any secret a
`.env` from an older bundle is missing.
```

- [ ] **Step 5: Run the checks to verify they pass**

Run (fresh install, then the upgrade path, then the Windows expressions and the line endings):

```bash
rm -rf /tmp/launcher-check && mkdir -p /tmp/launcher-check/bin && cd /tmp/launcher-check && \
cp /home/chris/side-projects/my-finance/deploy/release/.env.example . && \
cp /home/chris/side-projects/my-finance/deploy/release/start.sh . && \
cat > bin/docker <<'STUB'
#!/usr/bin/env bash
case "$*" in
  "compose version") exit 0 ;;
  "volume inspect my-finance_postgres-data") exit 1 ;;
  *) exit 0 ;;
esac
STUB
chmod +x bin/docker start.sh && \
PATH="/tmp/launcher-check/bin:$PATH" timeout 10 ./start.sh >/dev/null 2>&1 ; \
echo "--- fresh install ---" && grep -c '^[A-Z_]*=change-me' .env ; \
grep -E '^(POSTGRES_PASSWORD|DB_ANALYTICS_PASSWORD|ANALYTICS_TOKEN)=' .env && \
echo "--- upgrade from a pre-analytics .env ---" && \
grep -v -E '^(DB_ANALYTICS_PASSWORD|ANALYTICS_TOKEN)=' .env > .env.old && mv .env.old .env && \
PATH="/tmp/launcher-check/bin:$PATH" timeout 10 ./start.sh >/dev/null 2>&1 ; \
grep -c -E '^(DB_ANALYTICS_PASSWORD|ANALYTICS_TOKEN)=' .env
```

Expected: PASS — `0` placeholders left, three distinct 24-character secrets, and `2` after the upgrade run re-appends both keys.

Then the Windows one-liners (this checks the exact PowerShell expressions the batch file ships, in memory; the file-level behaviour is only exercisable on Windows):

```bash
powershell.exe -NoProfile -Command "function New-Secret { -join ((48..57) + (97..122) | Get-Random -Count 24 | ForEach-Object {[char]\$_}) }; @('POSTGRES_PASSWORD=change-me','DB_ANALYTICS_PASSWORD=change-me','ANALYTICS_TOKEN=change-me') -replace '^POSTGRES_PASSWORD=.*', ('POSTGRES_PASSWORD=' + (New-Secret)) -replace '^DB_ANALYTICS_PASSWORD=.*', ('DB_ANALYTICS_PASSWORD=' + (New-Secret)) -replace '^ANALYTICS_TOKEN=.*', ('ANALYTICS_TOKEN=' + (New-Secret))"
```

Expected: three lines, each `KEY=` followed by 24 random characters, no `change-me`.

Finally, the line endings and the diff surface:

```bash
cd /home/chris/side-projects/my-finance && file deploy/release/start.bat && git diff --stat deploy/
```

Expected: `deploy/release/start.bat: DOS batch file text, with CRLF line terminators`, and the diff touching only `start.sh`, `start.bat` and `README.md`.

- [ ] **Step 6: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add deploy/release/start.sh deploy/release/start.bat deploy/release/README.md
git commit -m "feat(deploy): generate and back-fill the analytics secrets in both launchers"
```

---


### Task 9: [MY-29] CI job for analytics, and the third released image

**Files:**
- Modify: `.github/workflows/ci.yml` (new `analytics:` job, sibling to `backend:` and `frontend:`)
- Modify: `.github/workflows/release.yml` (`Build images` step, `Push images` loop, and the comment above them)

**Interfaces:**
- Consumes: `analytics/pyproject.toml`, `analytics/uv.lock`, `analytics/tests/` (Tasks 1–2), `analytics/Dockerfile` (Task 6).
- Produces: `ghcr.io/<owner>/my-finance-analytics:<version>` (and `:latest` on stable tags), which `deploy/release/docker-compose.yml` already references (Task 7). The bundle-assembly `sed "s|\(my-finance-[a-z]*\):latest|\1:$VERSION|g"` already matches `my-finance-analytics`, so it needs no change (contract R10).
- The CI job runs exactly the commands a developer runs locally, per the standing "CI as a thin wrapper over the local commands" rule. The suite is unit-only today; MY-31's testcontainers golden tests join the same `uv run pytest` command (GitHub runners ship a Docker daemon).

- [ ] **Step 1: Run the check to verify it fails**

Run: `cd /home/chris/side-projects/my-finance && grep -n analytics .github/workflows/ci.yml .github/workflows/release.yml`

Expected: FAIL — no output, exit status 1 (neither workflow knows about the service).

- [ ] **Step 2: Add the `analytics` job to `ci.yml`**

Append to `.github/workflows/ci.yml`, after the `frontend:` job:

```yaml

  analytics:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: astral-sh/setup-uv@v6
        with:
          version: '0.11.6'
          python-version: '3.12'
          enable-cache: true
          cache-dependency-glob: analytics/uv.lock
      - name: Lint and test
        run: cd analytics && uv run --locked ruff check . && uv run --locked pytest
```

- [ ] **Step 3: Build and push the third image in `release.yml`**

In `.github/workflows/release.yml`, replace:

```yaml
      # Build both images before pushing either, so a failed build on one
      # side never leaves GHCR half-updated with a mismatched pair.
      - name: Build images
        run: |
          docker build -t "$IMAGE_PREFIX/my-finance-backend:$VERSION" backend
          docker build -t "$IMAGE_PREFIX/my-finance-frontend:$VERSION" frontend

      - name: Push images
        run: |
          for img in my-finance-backend my-finance-frontend; do
```

with:

```yaml
      # Build all three images before pushing any, so a failed build on one
      # side never leaves GHCR half-updated with a mismatched set.
      - name: Build images
        run: |
          docker build -t "$IMAGE_PREFIX/my-finance-backend:$VERSION" backend
          docker build -t "$IMAGE_PREFIX/my-finance-frontend:$VERSION" frontend
          docker build -t "$IMAGE_PREFIX/my-finance-analytics:$VERSION" analytics

      - name: Push images
        run: |
          for img in my-finance-backend my-finance-frontend my-finance-analytics; do
```

- [ ] **Step 4: Run the checks to verify they pass**

Run:

```bash
cd /home/chris/side-projects/my-finance && \
uv run --no-project --with pyyaml python -c "import yaml; [yaml.safe_load(open(p)) for p in ('.github/workflows/ci.yml', '.github/workflows/release.yml')]; print('YAML OK')" && \
grep -c my-finance-analytics .github/workflows/release.yml && \
cd analytics && uv run --locked ruff check . && uv run --locked pytest
```

Expected: PASS — `YAML OK`, then `2`, then `All checks passed!` and `7 passed`.

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add .github/workflows/ci.yml .github/workflows/release.yml
git commit -m "ci: lint and test analytics, and publish its image on release"
```

---


### Task 10: [MY-29] Record the analytics service in ARCHITECTURE, README, and LESSONS

**Files:**
- Modify: `ARCHITECTURE.md` (§2 directory tree and the paragraph under it; the monorepo bullet's "(later) analytics"; the release-bundle image list, its first-run sentence, and the GHCR "two"/"both" paragraph)
- Modify: `README.md` (project-structure tree, the compose paragraph, a new "Analytics (development)" section, a new "Analytics tests" section, the Status paragraph)
- Modify: `docs/LESSONS.md` (two new entries appended at the end) — **this file is gitignored (`.gitignore` → "Private / local-only"); write it but never `git add` it**

**Interfaces:**
- Consumes: everything Tasks 1–6 produced.
- Produces: no code. Documentation only, so no red/green cycle — the verification step is a set of greps. The updated GHCR paragraph *is* the release-checklist item required by contract R10: the repo has no separate checklist file, and that paragraph is where the one-time maintainer step already lives.

- [ ] **Step 1: Update `ARCHITECTURE.md` §2**

Replace the tree:

```
my-finance/
├── backend/     Spring Boot API (Java 21)
├── frontend/    React app
├── docs/        architecture notes, schema diagrams
└── docker-compose.yml
```

with:

```
my-finance/
├── backend/     Spring Boot API (Java 21)
├── frontend/    React app
├── analytics/   plan executor (Python 3.12, FastAPI)
├── docs/        architecture notes, schema diagrams
└── docker-compose.yml
```

Replace the paragraph below it:

```
A Python `analytics/` service is planned for a later phase (see Section 6)
and will slot in alongside these without requiring changes to the backend's
schema or API.
```

with:

```
The Python `analytics/` service (Section 6) reads the same database through a
read-only role and is reached only by the backend over the compose network —
it publishes no port, and it needed no change to the backend's schema or API.
```

And in the "Why a monorepo" paragraph, replace `Backend, frontend, and (later) analytics evolve together` with `Backend, frontend, and analytics evolve together`.

- [ ] **Step 2: Update the release-bundle section of `ARCHITECTURE.md`**

Replace:

```
- versioned images to GHCR (`ghcr.io/noratans/my-finance-backend`,
  `.../my-finance-frontend`)
```

with:

```
- versioned images to GHCR (`ghcr.io/noratans/my-finance-backend`,
  `.../my-finance-frontend`, `.../my-finance-analytics`)
```

In the paragraph beginning "The point: a user who has never cloned the repo", replace:

```
that Docker is installed (the one prerequisite), generate a database password
into `.env` on first run, run `docker compose up -d`, and print the URL.
```

with:

```
that Docker is installed (the one prerequisite), generate the `.env` secrets on
first run (database password, analytics role password, analytics service
token), run `docker compose up -d`, and print the URL.
```

Replace:

```
One-time maintainer step: the first tagged release creates the two GHCR
packages **private** (that's GitHub's default for packages pushed with
`GITHUB_TOKEN`, regardless of repo visibility), so anonymous
`docker compose pull` from the bundle fails with "denied" until both
packages are flipped to public in GitHub → Packages → package settings.
There is no supported way to do this from the workflow.
```

with:

```
One-time maintainer step: the first tagged release creates the three GHCR
packages **private** (that's GitHub's default for packages pushed with
`GITHUB_TOKEN`, regardless of repo visibility), so anonymous
`docker compose pull` from the bundle fails with "denied" until all three
packages are flipped to public in GitHub → Packages → package settings.
There is no supported way to do this from the workflow, and it applies again
to `my-finance-analytics` the first time a release includes it.
```

- [ ] **Step 3: Update `README.md`**

Add one line to the project-structure listing, so it reads:

```
my-finance/
├── backend/       # Spring Boot API (+ Dockerfile)
├── frontend/      # React app (+ Dockerfile, nginx.conf)
├── analytics/     # internal plan-executor service (Python, FastAPI, + Dockerfile)
├── deploy/        # release bundle contents (compose file, launcher scripts)
├── docs/          # architecture notes, schema diagrams
├── docker-compose.yml
└── README.md
```

and delete the now-false sentence that follows the closing fence of that block:

```
`analytics/` will be added once that phase starts.
```

In "Run the whole stack (Docker Compose)", replace:

```
port — nginx proxies `/api` to the backend, so cookies stay same-origin (see
`ARCHITECTURE.md` §5).
```

with:

```
port — nginx proxies `/api` to the backend, so cookies stay same-origin (see
`ARCHITECTURE.md` §5). The analytics service is internal too: no published
port, and nginx has no route to it, so only the backend can call it.
```

Insert a new section immediately before `### Frontend (development)`:

````markdown
### Analytics (development)

Requirements: Python 3.12+ and [uv](https://docs.astral.sh/uv/). The service is
internal-only — the backend calls it, a browser never does.

```bash
cd analytics
uv sync
uv run uvicorn analytics.main:app --reload --port 8000
```

`GET http://localhost:8000/internal/health` answers without a token; every
other route needs `Authorization: Bearer $ANALYTICS_TOKEN`.
````

Insert a new section immediately after the "Backend tests" section (before `## License`):

````markdown
### Analytics tests

```bash
cd analytics && uv run ruff check . && uv run pytest
```
````

Replace the last two sentences of the Status paragraph:

```
GitHub Actions, and the downloadable release bundle. The analytics service is
next. This is an active portfolio project — expect the structure and feature
set to evolve.
```

with:

```
GitHub Actions, and the downloadable release bundle. Phase 4 is under way: the
analytics service now runs beside the backend as an internal, read-only plan
executor. This is an active portfolio project — expect the structure and
feature set to evolve.
```

- [ ] **Step 4: Append the two LESSONS entries (do not stage this file)**

Append to the end of `docs/LESSONS.md`:

```markdown

### A second service on the compose network, reachable only by the backend

- **What** — the analytics service publishes no port, requires a static
  bearer token, and still answers exactly one route unauthenticated.
- **Where** — `analytics/src/analytics/auth.py`, `analytics/src/analytics/main.py`,
  the `analytics:` service in `docker-compose.yml`.
- **Why it's this way** — profile scoping is implemented exactly once, in the
  backend: it authenticates the session, resolves the active profile, and
  forwards the id. A browser that could reach the Python service directly
  could name any profile id it liked, so the service gets no `ports:` entry
  and nginx gets no `location` for it; the token is defense in depth for the
  day the stack sits on a shared network. `secrets.compare_digest` rather than
  `==` is the same constant-time habit as a password check. `GET
  /internal/health` sits outside that check on purpose: it is the compose
  healthcheck, and a probe carrying a secret is a secret in a config file.
  Same probe-binary constraint as *"Compose readiness, `$$` escaping, and
  volume identity"* — `python:3.12-slim` ships neither `wget` nor `curl`, so
  the probe is `python -c "import urllib.request; ..."`, the one interpreter
  already in the image.

### A uv lockfile, a src layout, and why the image copies `/app` whole

- **What** — `uv sync` installs the project itself in editable mode, so the
  runtime stage has to keep the build stage's path.
- **Where** — `analytics/Dockerfile`, `analytics/pyproject.toml`.
- **Why it's this way** — `uv.lock` is Python's `package-lock.json`:
  `uv sync --locked` fails rather than quietly resolving something new, which
  is what makes both the CI cache key and the Docker dependency layer honest
  (same reasoning as copying `pom.xml` before `src/`). Because the venv holds
  a `.pth` file pointing at `/app/src` instead of a copy of the code, the
  runtime stage uses `WORKDIR /app` and copies `/app` wholesale — lifting
  `.venv` out to a different path yields an image that imports nothing. The
  `src/` layout exists for the same reason the tests run against an installed
  package: `import analytics` can then only resolve to what was installed,
  never to a stray directory in the working directory.
```

- [ ] **Step 5: Verify the documentation is consistent**

Run:

```bash
cd /home/chris/side-projects/my-finance && \
grep -c 'two GHCR' ARCHITECTURE.md ; \
grep -n 'three GHCR\|my-finance-analytics\|analytics/   plan executor' ARCHITECTURE.md && \
grep -c 'will be added once that phase starts' README.md ; \
grep -n 'Analytics (development)\|Analytics tests\|analytics/     #' README.md && \
git status --short docs/LESSONS.md
```

Expected: PASS — `0` for the stale "two GHCR" wording; four ARCHITECTURE hits (the `analytics/` tree line, the GHCR image list, "three GHCR packages", and the closing `my-finance-analytics` sentence of that paragraph); `0` for the stale README sentence; three README hits (the tree line and the two new section headings); and **no** output from `git status --short docs/LESSONS.md` — the file is gitignored, so the entries stay local by design.

- [ ] **Step 6: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add ARCHITECTURE.md README.md
git commit -m "docs: record the analytics service in ARCHITECTURE and README"
```

---


### Task 11: [MY-29] Full-stack acceptance: four services up, analytics unreachable from the host, reachable with a token from inside

**Files:**
- No files change. This task is the reviewer's gate for the whole issue: it verifies the deliverables of Tasks 1–7 together on a real stack.

**Interfaces:**
- Consumes: `docker-compose.yml` with the `analytics` service (Task 7), `analytics/Dockerfile` (Task 6), `GET /internal/health` (Task 4), `POST /internal/v1/execute` (Task 5), the CI command (Task 9).
- Produces: nothing new. It proves the four acceptance criteria: the whole stack builds and comes up, the analytics port is not reachable from the host, a token-bearing request from another container reaches `analytics:8000`, and the command CI runs is green locally.

- [ ] **Step 1: Build and start the whole stack from scratch**

Run: `cd /home/chris/side-projects/my-finance && docker compose down && docker compose up --build -d && sleep 60`

Expected: all four services created; the command returns without error.

- [ ] **Step 2: Verify every service is up, three of them reporting healthy**

Run: `cd /home/chris/side-projects/my-finance && docker compose ps`

Expected: PASS — `postgres`, `backend` and `analytics` all show `Up ... (healthy)`; `frontend` shows `Up` with `0.0.0.0:3000->80/tcp` (it declares no healthcheck of its own and is gated on the backend's). The `PORTS` column for `analytics` shows `8000/tcp` — exposed inside the network, published nowhere.

- [ ] **Step 3: Verify the analytics port is NOT reachable from the host**

Run: `curl -sS -m 3 http://localhost:8000/internal/health ; echo "curl exit=$?"`

Expected: PASS — `curl: (7) Failed to connect to localhost port 8000: Connection refused`, then `curl exit=7`.

- [ ] **Step 4: Verify the backend container can reach it over the compose network**

Run: `cd /home/chris/side-projects/my-finance && docker compose exec -T backend wget -q -O - http://analytics:8000/internal/health`

Expected: PASS — `{"status":"ok"}`

- [ ] **Step 5: Verify the token gate from inside another container**

Run:

```bash
cd /home/chris/side-projects/my-finance && docker compose run --rm --no-deps -T analytics python - <<'PY'
import json
import urllib.error
import urllib.request


def call(headers):
    request = urllib.request.Request(
        "http://analytics:8000/internal/v1/execute",
        data=json.dumps({"profileId": 1, "plan": {"version": 1}}).encode(),
        headers={"Content-Type": "application/json", **headers},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, response.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()


print("no token ->", call({}))
print("token    ->", call({"Authorization": "Bearer dev-analytics-token"}))
PY
```

Expected: PASS —

```
no token -> (401, '{"detail":"Missing or invalid bearer token"}')
token    -> (400, '{"problems":["the plan executor is not implemented yet"]}')
```

The pair is the point: the same request differs only by the header, so the 400 proves the token was accepted rather than the route being broken.

- [ ] **Step 6: Run exactly what CI runs**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run --locked ruff check . && uv run --locked pytest`

Expected: PASS — `All checks passed!` and `7 passed`.

- [ ] **Step 7: Tear the stack down and confirm nothing was left uncommitted**

Run: `cd /home/chris/side-projects/my-finance && docker compose down && git status --short`

Expected: PASS — the stack stops, and `git status --short` prints nothing (`docs/LESSONS.md` is gitignored by design; every other file from Tasks 1–7 is already committed).

### Task 12: [MY-30] `V4__insights.sql` — the `insight` table and the `myfinance_ro` role

**Files:**
- Create: `backend/src/main/resources/db/migration/V4__insights.sql`
- Modify: `backend/src/main/resources/application.properties` (add a Flyway-placeholder block right after the `spring.jpa.open-in-view=false` line)
- Modify: `docs/LESSONS.md` (append one entry at the end) — **gitignored (`.gitignore` → "Private / local-only"); write it, never `git add` it**
- Test: `backend/src/test/java/com/myfinance/backend/InsightSchemaTest.java`

**Interfaces:**
- Consumes: nothing
- Produces: SQL table `insight (id, profile_id, name, plan JSONB, viz JSONB, pinned, created_at, updated_at)` with `UNIQUE (profile_id, name)`, `CHECK (char_length(name) <= 100)` and `profile_id … ON DELETE CASCADE`; Postgres login role `myfinance_ro` holding `SELECT` on every table in schema `public` (present and future); Spring property `spring.flyway.placeholders.dbAnalyticsPassword` (env `DB_ANALYTICS_PASSWORD`, dev default `myfinance-ro`).

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/myfinance/backend/InsightSchemaTest.java`:

```java
package com.myfinance.backend;

import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * What V4__insights.sql must guarantee, asserted at the SQL level — before any entity exists to
 * map it (docs/SCHEMA.md "insight" and "The read-only analytics role").
 */
@IntegrationTest
class InsightSchemaTest {

    private static final String INSERT = "INSERT INTO insight (profile_id, name, plan) VALUES (?, ?, ?::jsonb)";
    private static final String PLAN = "{\"version\": 1, \"metric\": \"spend\"}";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private TestFixtures fixtures;

    private Long profileId() {
        User user = fixtures.user("kasia@example.com");
        Profile profile = fixtures.profile(user, "Personal", "PLN");
        return profile.getId();
    }

    @Test
    void planIsStoredAsQueryableJsonb() {
        Long profileId = profileId();

        jdbcTemplate.update(INSERT, profileId, "Groceries per month", PLAN);

        String metric = jdbcTemplate.queryForObject(
                "SELECT plan ->> 'metric' FROM insight WHERE profile_id = ?", String.class, profileId);
        assertThat(metric).isEqualTo("spend");
    }

    @Test
    void pinnedDefaultsToFalseAndVizIsOptional() {
        jdbcTemplate.update(INSERT, profileId(), "Groceries per month", PLAN);

        assertThat(jdbcTemplate.queryForObject("SELECT pinned FROM insight", Boolean.class)).isFalse();
        assertThat(jdbcTemplate.queryForObject("SELECT viz FROM insight", String.class)).isNull();
    }

    @Test
    void nameIsUniquePerProfile() {
        Long profileId = profileId();
        jdbcTemplate.update(INSERT, profileId, "Groceries per month", PLAN);

        assertThatThrownBy(() -> jdbcTemplate.update(INSERT, profileId, "Groceries per month", PLAN))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void nameOver100CharactersIsRejected() {
        Long profileId = profileId();

        assertThatThrownBy(() -> jdbcTemplate.update(INSERT, profileId, "x".repeat(101), PLAN))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void deletingAProfileCascadesToItsInsights() {
        Long profileId = profileId();
        jdbcTemplate.update(INSERT, profileId, "Groceries per month", PLAN);

        jdbcTemplate.update("DELETE FROM profile WHERE id = ?", profileId);

        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM insight", Integer.class)).isZero();
    }

    @Test
    void analyticsRoleCanLoginAndReadButNotWrite() {
        assertThat(jdbcTemplate.queryForObject(
                "SELECT rolcanlogin FROM pg_roles WHERE rolname = 'myfinance_ro'", Boolean.class)).isTrue();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT has_table_privilege('myfinance_ro', 'txn', 'SELECT')", Boolean.class)).isTrue();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT has_table_privilege('myfinance_ro', 'txn', 'INSERT')", Boolean.class)).isFalse();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT has_table_privilege('myfinance_ro', 'insight', 'SELECT')", Boolean.class)).isTrue();
    }

    @Test
    void analyticsRoleAlsoSeesTablesCreatedByLaterMigrations() {
        // ALTER DEFAULT PRIVILEGES only covers objects created by the role that ran it; the
        // migration user is also the user every future migration runs as, so this must hold.
        jdbcTemplate.execute("CREATE TABLE later_migration_table (id BIGINT)");
        Boolean granted = jdbcTemplate.queryForObject(
                "SELECT has_table_privilege('myfinance_ro', 'later_migration_table', 'SELECT')", Boolean.class);
        jdbcTemplate.execute("DROP TABLE later_migration_table");

        assertThat(granted).isTrue();
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -B test -Dtest=InsightSchemaTest`
Expected: FAIL — the five table tests error with `BadSqlGrammarException` / `PSQLException: ERROR: relation "insight" does not exist`; `analyticsRoleCanLoginAndReadButNotWrite` errors with `EmptyResultDataAccessException` (the `pg_roles` lookup returns no row); `analyticsRoleAlsoSeesTablesCreatedByLaterMigrations` errors with `PSQLException: ERROR: role "myfinance_ro" does not exist`.

- [ ] **Step 3: Add the Flyway placeholder property**

In `backend/src/main/resources/application.properties`, insert this block immediately after the existing `spring.jpa.open-in-view=false` line (keeping the blank line before the `# --- Subscription charge job` block):

```properties

# --- Analytics read-only role (docs/SCHEMA.md "The read-only analytics role") ---
# V4 creates myfinance_ro with this password; the analytics service connects with it.
# The dev default is load-bearing: tests read this same file, and a placeholder with no
# value fails every migration with Flyway's "No value provided for placeholder".
spring.flyway.placeholders.dbAnalyticsPassword=${DB_ANALYTICS_PASSWORD:myfinance-ro}
```

- [ ] **Step 4: Write the migration**

Create `backend/src/main/resources/db/migration/V4__insights.sql`:

```sql
-- Insights (docs/SCHEMA.md "insight"): a saved analytics question — a name plus a versioned
-- query plan the analytics service executes. The same migration provisions the read-only role
-- that service connects with (docs/SCHEMA.md "The read-only analytics role").

CREATE TABLE insight (
    id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    profile_id BIGINT      NOT NULL REFERENCES profile (id) ON DELETE CASCADE,
    name       TEXT        NOT NULL CHECK (char_length(name) <= 100),
    -- the plan is opaque to the schema: a categoryId inside it is deliberately not a foreign
    -- key, so deleting a category never has to sweep every profile's saved questions
    plan       JSONB       NOT NULL,
    viz        JSONB       NULL,
    pinned     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- one "Groceries per month" per profile; this index also serves the per-profile listing,
    -- and a profile holds dozens of insights at most, so there is no other index
    UNIQUE (profile_id, name)
);

-- The analytics service holds this credential and nothing else: read-only as a database
-- guarantee, in the same spirit as the composite FKs. Roles are cluster-global, so creation
-- has to be idempotent — a fresh database in a cluster that already has the role must migrate.
-- The password arrives as a Flyway placeholder (spring.flyway.placeholders.dbAnalyticsPassword).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'myfinance_ro') THEN
        CREATE ROLE myfinance_ro LOGIN PASSWORD '${dbAnalyticsPassword}';
    ELSE
        -- keep the role's password in step with the configured one rather than leaving the
        -- service unable to log in against a role someone else created
        ALTER ROLE myfinance_ro WITH LOGIN PASSWORD '${dbAnalyticsPassword}';
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO myfinance_ro;
-- Also grants on flyway_schema_history: harmless, and excluding it would need a table list
-- that goes stale with the next migration.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO myfinance_ro;
-- Covers tables added by later migrations. This only applies to objects created by the role
-- running it, which is the same role every migration runs as (spring.datasource.username).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO myfinance_ro;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -B test -Dtest=InsightSchemaTest`
Expected: PASS (7 tests).

- [ ] **Step 6: Verify V4 applies on a database that is already at V3**

Run:
```bash
cd /home/chris/side-projects/my-finance && docker compose up -d --build --wait postgres backend && \
  docker compose exec -T postgres psql -U myfinance -d myfinance \
    -c "SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank"
```
Expected: four rows, the last being `4 | insights | t`. (The compose volume already holds a V3 schema, so this is the "existing V3 database" path, not a fresh create.)

- [ ] **Step 7: Append the LESSONS entry**

Append to the end of `docs/LESSONS.md`:

```markdown

### A database role as the privilege boundary, and a credential through a migration placeholder

- **What** — `V4__insights.sql` creates the `myfinance_ro` login role with
  `SELECT` and nothing else, and its password reaches the migration as a
  Flyway placeholder rather than through a second provisioning mechanism.
- **Where** — `backend/src/main/resources/db/migration/V4__insights.sql`,
  `backend/src/main/resources/application.properties`
  (`spring.flyway.placeholders.dbAnalyticsPassword`), `docs/SCHEMA.md` → "The
  read-only analytics role".
- **Why it's this way** — the analytics service is a second process on the
  same database, so "it only runs SELECTs" is worth making a database
  guarantee rather than a code review promise — the same instinct as the
  composite FKs in *"Modelling a tree in SQL, and enforcing scoping in the
  schema"*. Three Postgres details do the work: roles are cluster-global, so
  `CREATE ROLE` has to sit inside a `DO $$ … IF NOT EXISTS` block or a fresh
  database in an old cluster fails to migrate; `GRANT SELECT ON ALL TABLES`
  covers only the tables that exist right now, so `ALTER DEFAULT PRIVILEGES`
  is what makes V5's tables readable too; and that statement applies only to
  objects created by the role that ran it, which is why it must run as the
  migration user. There are also two nested `${}` layers that resolve at
  different times: Spring expands `${DB_ANALYTICS_PASSWORD:myfinance-ro}`
  when it loads the property, Flyway expands `${dbAnalyticsPassword}` when it
  executes the file — textual substitution, closer to `str.format` than to a
  bound SQL parameter, which is exactly why the value must never contain a
  quote.
```

- [ ] **Step 8: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add backend/src/main/resources/db/migration/V4__insights.sql \
        backend/src/main/resources/application.properties \
        backend/src/test/java/com/myfinance/backend/InsightSchemaTest.java
git commit -m "feat(backend): insight table and read-only analytics role (V4)"
```

---


### Task 13: [MY-30] `Insight` entity and `InsightRepository`

**Files:**
- Create: `backend/src/main/java/com/myfinance/backend/model/Insight.java`
- Create: `backend/src/main/java/com/myfinance/backend/repository/InsightRepository.java`
- Modify: `backend/src/test/java/com/myfinance/backend/support/TestFixtures.java` (add `InsightRepository` + `JsonMapper` constructor params and an `insight(...)` builder)
- Modify: `docs/LESSONS.md` (append one entry at the end) — **gitignored (`.gitignore` → "Private / local-only"); write it, never `git add` it**
- Test: `backend/src/test/java/com/myfinance/backend/repository/InsightRepositoryTest.java`

**Interfaces:**
- Consumes: the `insight` table from Task 12.
- Produces:
  - `com.myfinance.backend.model.Insight extends AuditedEntity` with `public Insight(Profile profile, String name, JsonNode plan, JsonNode viz, boolean pinned)`, `public void update(String name, JsonNode plan, JsonNode viz, boolean pinned)`, and getters `getProfile()`, `getName()`, `getPlan()`, `getViz()`, `isPinned()` (plus `getId()`/`getCreatedAt()`/`getUpdatedAt()` from `AuditedEntity`). `JsonNode` is `tools.jackson.databind.JsonNode`.
  - `com.myfinance.backend.repository.InsightRepository extends JpaRepository<Insight, Long>` with `List<Insight> findByProfileIdOrderByPinnedDescNameAsc(Long profileId)`, `Optional<Insight> findByIdAndProfileId(Long id, Long profileId)`, `boolean existsByProfileIdAndName(Long profileId, String name)`, `boolean existsByProfileIdAndNameAndIdNot(Long profileId, String name, Long id)`.
  - `TestFixtures.insight(Profile profile, String name, String planJson, boolean pinned) -> Insight`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/myfinance/backend/repository/InsightRepositoryTest.java`:

```java
package com.myfinance.backend.repository;

import com.myfinance.backend.model.Insight;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

/** The JSONB round-trip and the four profile-scoped finders docs/API.md "Insights" needs. */
@IntegrationTest
class InsightRepositoryTest {

    private static final String PLAN = """
            {"version": 1, "metric": "spend", "filters": {}, "groupBy": null,
             "interval": "month", "range": {"type": "lastMonths", "n": 12}}
            """;

    @Autowired
    private InsightRepository insightRepository;

    @Autowired
    private TestFixtures fixtures;

    @Autowired
    private JsonMapper jsonMapper;

    private Profile profile;
    private Profile otherProfile;

    @BeforeEach
    void setUp() {
        User user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");

        User other = fixtures.user("other@example.com");
        otherProfile = fixtures.profile(other, "Other", "EUR");
    }

    @Test
    void storesAndReadsBackThePlanTree() {
        Insight saved = fixtures.insight(profile, "Groceries per month", PLAN, false);

        Insight loaded = insightRepository.findByIdAndProfileId(saved.getId(), profile.getId()).orElseThrow();

        assertThat(loaded.getPlan().path("metric").asString()).isEqualTo("spend");
        assertThat(loaded.getPlan().path("range").path("n").asInt()).isEqualTo(12);
        assertThat(loaded.getViz()).isNull();
        assertThat(loaded.isPinned()).isFalse();
    }

    @Test
    void storesTheVizOverrideWhenPresent() {
        Insight saved = insightRepository.save(new Insight(profile, "Chart override",
                jsonMapper.readTree(PLAN), jsonMapper.readTree("{\"chart\": \"bar\"}"), true));

        Insight loaded = insightRepository.findByIdAndProfileId(saved.getId(), profile.getId()).orElseThrow();

        assertThat(loaded.getViz().path("chart").asString()).isEqualTo("bar");
        assertThat(loaded.isPinned()).isTrue();
    }

    @Test
    void listsPinnedFirstThenByName() {
        fixtures.insight(profile, "Zebra spend", PLAN, false);
        fixtures.insight(profile, "Apple spend", PLAN, false);
        fixtures.insight(profile, "Pinned monthly", PLAN, true);

        assertThat(insightRepository.findByProfileIdOrderByPinnedDescNameAsc(profile.getId()))
                .extracting(Insight::getName)
                .containsExactly("Pinned monthly", "Apple spend", "Zebra spend");
    }

    @Test
    void neverReachesAnotherProfilesInsight() {
        Insight theirs = fixtures.insight(otherProfile, "Their spend", PLAN, false);

        assertThat(insightRepository.findByIdAndProfileId(theirs.getId(), profile.getId())).isEmpty();
        assertThat(insightRepository.findByProfileIdOrderByPinnedDescNameAsc(profile.getId())).isEmpty();
    }

    @Test
    void nameCollisionChecksAreScopedAndSkipTheRowItself() {
        Insight mine = fixtures.insight(profile, "Groceries per month", PLAN, false);

        assertThat(insightRepository.existsByProfileIdAndName(profile.getId(), "Groceries per month")).isTrue();
        assertThat(insightRepository.existsByProfileIdAndName(otherProfile.getId(), "Groceries per month")).isFalse();
        assertThat(insightRepository.existsByProfileIdAndNameAndIdNot(
                profile.getId(), "Groceries per month", mine.getId())).isFalse();
        assertThat(insightRepository.existsByProfileIdAndNameAndIdNot(
                profile.getId(), "Groceries per month", mine.getId() + 1)).isTrue();
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -B test -Dtest=InsightRepositoryTest`
Expected: FAIL at compilation — `cannot find symbol: class Insight`, `cannot find symbol: class InsightRepository`, `cannot find symbol: method insight(...)`.

- [ ] **Step 3: Write the entity**

Create `backend/src/main/java/com/myfinance/backend/model/Insight.java`:

```java
package com.myfinance.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import tools.jackson.databind.JsonNode;

/**
 * A saved analytics question (docs/SCHEMA.md "insight"): a name plus a versioned query plan the
 * analytics service executes. The plan stays an opaque JSON document here — the backend never
 * interprets it beyond "is this a JSON object" (docs/API.md "POST /api/insights/execute").
 */
@Entity
@Table(name = "insight")
public class Insight extends AuditedEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "profile_id", nullable = false)
    private Profile profile;

    @Column(nullable = false)
    private String name;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private JsonNode plan;

    @JdbcTypeCode(SqlTypes.JSON)
    private JsonNode viz;

    @Column(nullable = false)
    private boolean pinned;

    protected Insight() {
        // JPA
    }

    public Insight(Profile profile, String name, JsonNode plan, JsonNode viz, boolean pinned) {
        this.profile = profile;
        update(name, plan, viz, pinned);
    }

    /** Full replacement of the editable fields (PUT semantics — docs/API.md "PUT /api/insights/{id}"). */
    public void update(String name, JsonNode plan, JsonNode viz, boolean pinned) {
        this.name = name;
        this.plan = plan;
        this.viz = viz;
        this.pinned = pinned;
    }

    public Profile getProfile() {
        return profile;
    }

    public String getName() {
        return name;
    }

    public JsonNode getPlan() {
        return plan;
    }

    public JsonNode getViz() {
        return viz;
    }

    public boolean isPinned() {
        return pinned;
    }
}
```

- [ ] **Step 4: Write the repository**

Create `backend/src/main/java/com/myfinance/backend/repository/InsightRepository.java`. This is a derived-query interface with no custom SQL, so it carries no test cycle of its own — the behaviour it adds (ordering and profile scoping) is what `InsightRepositoryTest` from Step 1 asserts.

```java
package com.myfinance.backend.repository;

import com.myfinance.backend.model.Insight;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface InsightRepository extends JpaRepository<Insight, Long> {

    /** The listing docs/API.md "GET /api/insights" specifies: pinned first, then alphabetical. */
    List<Insight> findByProfileIdOrderByPinnedDescNameAsc(Long profileId);

    /** Single-row access is always scoped: another profile's row is simply not found (404). */
    Optional<Insight> findByIdAndProfileId(Long id, Long profileId);

    boolean existsByProfileIdAndName(Long profileId, String name);

    /** Rename collision check: an insight keeping its own name is not a collision. */
    boolean existsByProfileIdAndNameAndIdNot(Long profileId, String name, Long id);
}
```

- [ ] **Step 5: Add the fixture builder**

In `backend/src/test/java/com/myfinance/backend/support/TestFixtures.java`:

1. add these imports next to the existing ones:

```java
import com.myfinance.backend.model.Insight;
import com.myfinance.backend.repository.InsightRepository;
import tools.jackson.databind.json.JsonMapper;
```

2. add the two fields after `private final SubscriptionRepository subscriptionRepository;`:

```java
    private final InsightRepository insightRepository;
    private final JsonMapper jsonMapper;
```

3. replace the constructor with:

```java
    public TestFixtures(UserRepository userRepository, ProfileRepository profileRepository,
                        CategoryRepository categoryRepository, TransactionRepository transactionRepository,
                        BudgetRepository budgetRepository, SubscriptionRepository subscriptionRepository,
                        InsightRepository insightRepository, JsonMapper jsonMapper) {
        this.userRepository = userRepository;
        this.profileRepository = profileRepository;
        this.categoryRepository = categoryRepository;
        this.transactionRepository = transactionRepository;
        this.budgetRepository = budgetRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.insightRepository = insightRepository;
        this.jsonMapper = jsonMapper;
    }
```

4. add the builder immediately after the `subscription(...)` builder:

```java
    /** {@code planJson} is the raw plan document, exactly as a client would post it. No viz override. */
    public Insight insight(Profile profile, String name, String planJson, boolean pinned) {
        return insightRepository.save(new Insight(profile, name, jsonMapper.readTree(planJson), null, pinned));
    }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -B test -Dtest=InsightRepositoryTest`
Expected: PASS (5 tests). A green run also proves `spring.jpa.hibernate.ddl-auto=validate` accepts the `JsonNode` ⇄ `jsonb` mapping.

- [ ] **Step 7: Append the LESSONS entry**

Append to the end of `docs/LESSONS.md`:

```markdown

### A JSONB column maps to a `JsonNode` field, not a `String`

- **What** — `plan` and `viz` are `tools.jackson.databind.JsonNode` fields
  carrying `@JdbcTypeCode(SqlTypes.JSON)`; Hibernate converts them with its
  Jackson format mapper on the way in and out.
- **Where** — `model/Insight`,
  `backend/src/main/resources/db/migration/V4__insights.sql`.
- **Why it's this way** — `@JdbcTypeCode` overrides the JDBC type Hibernate
  would infer from the Java type; the repo's other use of it is
  `@JdbcTypeCode(Types.CHAR)` on `Transaction.currency`. On PostgreSQL,
  `SqlTypes.JSON` renders as `jsonb`, so `ddl-auto=validate` matches the
  migration's column. A `String` field would also work at the driver level,
  but then every layer above would parse and re-print the document by hand,
  and a malformed string would only fail at the database. With `JsonNode` the
  entity holds a tree the DTO can hand straight to Jackson — the Java
  equivalent of storing `dict` and letting psycopg's `Json` adapter deal with
  the wire format, rather than passing `json.dumps(...)` around. Note this
  works because Boot 4 ships Jackson 3 (`tools.jackson`) and Hibernate 7.4
  auto-selects its Jackson 3 format mapper accordingly; the annotations
  package is still `com.fasterxml.jackson.annotation`.
```

- [ ] **Step 8: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add backend/src/main/java/com/myfinance/backend/model/Insight.java \
        backend/src/main/java/com/myfinance/backend/repository/InsightRepository.java \
        backend/src/test/java/com/myfinance/backend/support/TestFixtures.java \
        backend/src/test/java/com/myfinance/backend/repository/InsightRepositoryTest.java
git commit -m "feat(backend): Insight entity and repository over the V4 JSONB columns"
```

---


### Task 14: [MY-30] The three insight error slugs

**Files:**
- Create: `backend/src/main/java/com/myfinance/backend/exception/InsightNameTakenException.java`
- Create: `backend/src/main/java/com/myfinance/backend/exception/AnalyticsUnavailableException.java`
- Create: `backend/src/main/java/com/myfinance/backend/exception/InvalidPlanException.java`
- Test: `backend/src/test/java/com/myfinance/backend/exception/GlobalExceptionHandlerTest.java` (add three test methods)

**Interfaces:**
- Consumes: `exception/ApiException.java` (existing base class).
- Produces:
  - `new InsightNameTakenException(String name)` → `409`, `type` `/errors/insight-name-taken`.
  - `new AnalyticsUnavailableException()` → `503`, `type` `/errors/analytics-unavailable`.
  - `new InvalidPlanException(List<String> problems)` → `400`, `type` `/errors/invalid-plan`, with a `problems` extension member.

Nothing has to be registered anywhere: `GlobalExceptionHandler` already handles `ApiException` and every subclass.

- [ ] **Step 1: Write the failing tests**

In `backend/src/test/java/com/myfinance/backend/exception/GlobalExceptionHandlerTest.java`, add the import

```java
import java.util.List;
```

and insert these three tests immediately after `validationFailureListsEveryFieldError`, before the `sampleEndpoint` helper:

```java
    @Test
    void insightNameTakenIs409() {
        ProblemDetail problem = handler.handleApiException(new InsightNameTakenException("Groceries per month"));

        assertThat(problem.getStatus()).isEqualTo(HttpStatus.CONFLICT.value());
        assertThat(problem.getType()).isEqualTo(URI.create("/errors/insight-name-taken"));
        assertThat(problem.getDetail())
                .isEqualTo("An insight named 'Groceries per month' already exists in this profile.");
    }

    @Test
    void analyticsUnavailableIs503() {
        ProblemDetail problem = handler.handleApiException(new AnalyticsUnavailableException());

        assertThat(problem.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE.value());
        assertThat(problem.getType()).isEqualTo(URI.create("/errors/analytics-unavailable"));
        assertThat(problem.getTitle()).isEqualTo("Analytics service unavailable");
    }

    @Test
    void invalidPlanIs400AndCarriesTheProblems() {
        ProblemDetail problem = handler.handleApiException(new InvalidPlanException(
                List.of("filters.categoryId: 999 does not exist in this profile", "interval: unknown value 'fortnight'")));

        assertThat(problem.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(problem.getType()).isEqualTo(URI.create("/errors/invalid-plan"));
        assertThat(problem.getDetail()).isEqualTo("The plan has 2 problems.");
        assertThat(problem.getProperties()).extractingByKey("problems").asInstanceOf(LIST)
                .containsExactly("filters.categoryId: 999 does not exist in this profile",
                        "interval: unknown value 'fortnight'");
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -B test -Dtest=GlobalExceptionHandlerTest`
Expected: FAIL at compilation — `cannot find symbol: class InsightNameTakenException`, `class AnalyticsUnavailableException`, `class InvalidPlanException`.

- [ ] **Step 3: Write the three exceptions**

Create `backend/src/main/java/com/myfinance/backend/exception/InsightNameTakenException.java`:

```java
package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;

public class InsightNameTakenException extends ApiException {

    public InsightNameTakenException(String name) {
        super(HttpStatus.CONFLICT, "insight-name-taken", "Insight name already used",
                "An insight named '" + name + "' already exists in this profile.");
    }
}
```

Create `backend/src/main/java/com/myfinance/backend/exception/AnalyticsUnavailableException.java`:

```java
package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;

/**
 * 503 — the analytics service did not answer. An operational state, not a bug (docs/API.md
 * "Status code summary"): the UI says "the analytics service isn't running" rather than
 * something scarier, and everything else in the app keeps working.
 */
public class AnalyticsUnavailableException extends ApiException {

    public AnalyticsUnavailableException() {
        super(HttpStatus.SERVICE_UNAVAILABLE, "analytics-unavailable", "Analytics service unavailable",
                "The analytics service is not reachable. Insights are unavailable until it is running.");
    }
}
```

Create `backend/src/main/java/com/myfinance/backend/exception/InvalidPlanException.java`:

```java
package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

import java.util.List;

/**
 * 400 — the query plan was rejected. The {@code problems} extension member lists one
 * human-readable string per problem, which the explorer shows next to the offending chip
 * (docs/API.md "POST /api/insights/execute"). Same shape as {@link BackupInvalidException}.
 */
public class InvalidPlanException extends ApiException {

    private final List<String> problems;

    public InvalidPlanException(List<String> problems) {
        super(HttpStatus.BAD_REQUEST, "invalid-plan", "Invalid plan",
                "The plan has " + problems.size() + " problem" + (problems.size() == 1 ? "" : "s") + ".");
        this.problems = List.copyOf(problems);
    }

    @Override
    protected void addExtensions(ProblemDetail problem) {
        problem.setProperty("problems", problems);
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -B test -Dtest=GlobalExceptionHandlerTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add backend/src/main/java/com/myfinance/backend/exception/InsightNameTakenException.java \
        backend/src/main/java/com/myfinance/backend/exception/AnalyticsUnavailableException.java \
        backend/src/main/java/com/myfinance/backend/exception/InvalidPlanException.java \
        backend/src/test/java/com/myfinance/backend/exception/GlobalExceptionHandlerTest.java
git commit -m "feat(backend): insight-name-taken, invalid-plan and analytics-unavailable problem types"
```

---


### Task 15: [MY-30] Insight CRUD — DTOs, service, controller

**Files:**
- Create: `backend/src/main/java/com/myfinance/backend/dto/InsightRequest.java`
- Create: `backend/src/main/java/com/myfinance/backend/dto/InsightResponse.java`
- Create: `backend/src/main/java/com/myfinance/backend/service/InsightService.java`
- Create: `backend/src/main/java/com/myfinance/backend/controller/InsightController.java`
- Test: `backend/src/test/java/com/myfinance/backend/controller/InsightControllerTest.java`

**Interfaces:**
- Consumes: `Insight`, `InsightRepository` (Task 13); `InsightNameTakenException`, `InvalidPlanException` (Task 14); the existing `ActiveProfile`, `ProfileRepository`, `ResourceNotFoundException`.
- Produces:
  - `record InsightRequest(String name, JsonNode plan, JsonNode viz, boolean pinned)`
  - `record InsightResponse(Long id, String name, JsonNode plan, JsonNode viz, boolean pinned, OffsetDateTime createdAt)` with `static InsightResponse from(Insight insight)`
  - `InsightService` with `InsightResponse create(InsightRequest)`, `List<InsightResponse> list()`, `InsightResponse get(Long id)`, `InsightResponse update(Long id, InsightRequest)`, `void delete(Long id)`
  - `InsightController` mapping `POST /api/insights`, `GET /api/insights`, `GET /api/insights/{id}`, `PUT /api/insights/{id}`, `DELETE /api/insights/{id}`

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/myfinance/backend/controller/InsightControllerTest.java`:

```java
package com.myfinance.backend.controller;

import com.myfinance.backend.model.Insight;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The 5 CRUD endpoints of docs/API.md "Insights" (execute has its own test class). */
@IntegrationTest
class InsightControllerTest {

    private static final String PLAN = """
            {"version": 1, "metric": "spend", "filters": {}, "groupBy": null,
             "interval": "month", "range": {"type": "lastMonths", "n": 12}}
            """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    private User user;
    private Profile profile;
    private Profile otherProfile;

    @BeforeEach
    void setUp() {
        user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");

        User other = fixtures.user("other@example.com");
        otherProfile = fixtures.profile(other, "Other", "EUR");
    }

    private static String body(String name, boolean pinned) {
        return """
                {"name": "%s", "plan": %s, "viz": null, "pinned": %s}
                """.formatted(name, PLAN, pinned);
    }

    // ---------------------------------------------------------------- POST

    @Test
    void createReturns201WithLocationAndBody() throws Exception {
        mockMvc.perform(post("/api/insights").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Groceries per month", true)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.name").value("Groceries per month"))
                .andExpect(jsonPath("$.plan.metric").value("spend"))
                .andExpect(jsonPath("$.plan.range.n").value(12))
                .andExpect(jsonPath("$.viz").value((Object) null))
                .andExpect(jsonPath("$.pinned").value(true))
                .andExpect(jsonPath("$.createdAt").isString())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Location", matchesPattern("/api/insights/\\d+")));
    }

    @Test
    void createDefaultsPinnedToFalseAndAcceptsAVizOverride() throws Exception {
        mockMvc.perform(post("/api/insights").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name": "Chart override", "plan": %s, "viz": {"chart": "bar"}}
                                """.formatted(PLAN)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.pinned").value(false))
                .andExpect(jsonPath("$.viz.chart").value("bar"));
    }

    @Test
    void createWithMissingFieldsIs400() throws Exception {
        mockMvc.perform(post("/api/insights").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Groceries per month\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors[0].field").value("plan"));
    }

    @Test
    void createWithANonObjectPlanIs400InvalidPlan() throws Exception {
        mockMvc.perform(post("/api/insights").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Broken\", \"plan\": [1, 2]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-plan"))
                .andExpect(jsonPath("$.problems", contains("plan: must be a JSON object")));
    }

    @Test
    void createWithTakenNameIs409() throws Exception {
        fixtures.insight(profile, "Groceries per month", PLAN, false);

        mockMvc.perform(post("/api/insights").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Groceries per month", false)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/insight-name-taken"));
    }

    @Test
    void nameTakenInAnotherProfileIsNotACollision() throws Exception {
        fixtures.insight(otherProfile, "Groceries per month", PLAN, false);

        mockMvc.perform(post("/api/insights").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Groceries per month", false)))
                .andExpect(status().isCreated());
    }

    @Test
    void createWithoutActiveProfileIs409() throws Exception {
        mockMvc.perform(post("/api/insights").with(fixtures.as(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Groceries per month", false)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }

    @Test
    void unauthenticatedIs401() throws Exception {
        mockMvc.perform(get("/api/insights"))
                .andExpect(status().isUnauthorized());
    }

    // ---------------------------------------------------------------- GET list

    @Test
    void listIsPinnedFirstThenAlphabetical() throws Exception {
        fixtures.insight(profile, "Zebra spend", PLAN, false);
        fixtures.insight(profile, "Apple spend", PLAN, false);
        fixtures.insight(profile, "Pinned monthly", PLAN, true);

        mockMvc.perform(get("/api/insights").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].name").value(contains(
                        "Pinned monthly", "Apple spend", "Zebra spend")));
    }

    @Test
    void listDoesNotLeakOtherProfiles() throws Exception {
        fixtures.insight(otherProfile, "Their spend", PLAN, false);

        mockMvc.perform(get("/api/insights").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    // ---------------------------------------------------------------- GET one

    @Test
    void getReturnsTheInsight() throws Exception {
        Insight insight = fixtures.insight(profile, "Groceries per month", PLAN, false);

        mockMvc.perform(get("/api/insights/{id}", insight.getId()).with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(insight.getId()))
                .andExpect(jsonPath("$.plan.interval").value("month"));
    }

    @Test
    void getFromAnotherProfileIs404() throws Exception {
        Insight theirs = fixtures.insight(otherProfile, "Their spend", PLAN, false);

        mockMvc.perform(get("/api/insights/{id}", theirs.getId()).with(fixtures.in(profile)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/not-found"));
    }

    // ---------------------------------------------------------------- PUT

    @Test
    void updateReplacesEveryEditableField() throws Exception {
        Insight insight = fixtures.insight(profile, "Groceries per month", PLAN, false);

        mockMvc.perform(put("/api/insights/{id}", insight.getId()).with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name": "Groceries per quarter", "plan": {"version": 1, "metric": "net",
                                 "filters": {}, "groupBy": null, "interval": "quarter",
                                 "range": {"type": "yearToDate"}}, "viz": {"chart": "line"}, "pinned": true}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Groceries per quarter"))
                .andExpect(jsonPath("$.plan.metric").value("net"))
                .andExpect(jsonPath("$.plan.range.type").value("yearToDate"))
                .andExpect(jsonPath("$.viz.chart").value("line"))
                .andExpect(jsonPath("$.pinned").value(true));
    }

    @Test
    void renamingToItsOwnNameIsNotACollision() throws Exception {
        Insight insight = fixtures.insight(profile, "Groceries per month", PLAN, false);

        mockMvc.perform(put("/api/insights/{id}", insight.getId()).with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Groceries per month", true)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pinned").value(true));
    }

    @Test
    void renamingOntoAnotherInsightIs409() throws Exception {
        fixtures.insight(profile, "Groceries per month", PLAN, false);
        Insight other = fixtures.insight(profile, "Fuel per month", PLAN, false);

        mockMvc.perform(put("/api/insights/{id}", other.getId()).with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Groceries per month", false)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/insight-name-taken"));
    }

    @Test
    void updateFromAnotherProfileIs404() throws Exception {
        Insight theirs = fixtures.insight(otherProfile, "Their spend", PLAN, false);

        mockMvc.perform(put("/api/insights/{id}", theirs.getId()).with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Renamed", false)))
                .andExpect(status().isNotFound());
    }

    // ---------------------------------------------------------------- DELETE

    @Test
    void deleteReturns204() throws Exception {
        Insight insight = fixtures.insight(profile, "Groceries per month", PLAN, false);

        mockMvc.perform(delete("/api/insights/{id}", insight.getId()).with(fixtures.in(profile)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/insights/{id}", insight.getId()).with(fixtures.in(profile)))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteFromAnotherProfileIs404() throws Exception {
        Insight theirs = fixtures.insight(otherProfile, "Their spend", PLAN, false);

        mockMvc.perform(delete("/api/insights/{id}", theirs.getId()).with(fixtures.in(profile)))
                .andExpect(status().isNotFound());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -B test -Dtest=InsightControllerTest`
Expected: FAIL — nothing is mapped under `/api/insights`, so every authenticated request returns `404` (`createReturns201WithLocationAndBody` reports `Status expected:<201> but was:<404>`). `unauthenticatedIs401` passes already — the security filter chain rejects before MVC ever routes.

- [ ] **Step 3: Write the DTOs**

Create `backend/src/main/java/com/myfinance/backend/dto/InsightRequest.java`:

```java
package com.myfinance.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import tools.jackson.databind.JsonNode;

/**
 * Body of {@code POST} and {@code PUT /api/insights} (docs/API.md "Insights"). {@code plan} is
 * only checked for being a JSON object — every other plan rule belongs to the executor, so the
 * two validators cannot drift. {@code pinned} is a primitive: absent means {@code false}.
 */
public record InsightRequest(
        @NotBlank @Size(max = 100) String name,
        @NotNull JsonNode plan,
        JsonNode viz,
        boolean pinned) {
}
```

Create `backend/src/main/java/com/myfinance/backend/dto/InsightResponse.java`:

```java
package com.myfinance.backend.dto;

import com.myfinance.backend.model.Insight;
import tools.jackson.databind.JsonNode;

import java.time.OffsetDateTime;

/** An insight as returned by every insight endpoint (docs/API.md "Insights"). */
public record InsightResponse(
        Long id,
        String name,
        JsonNode plan,
        JsonNode viz,
        boolean pinned,
        OffsetDateTime createdAt) {

    public static InsightResponse from(Insight insight) {
        return new InsightResponse(
                insight.getId(),
                insight.getName(),
                insight.getPlan(),
                insight.getViz(),
                insight.isPinned(),
                insight.getCreatedAt());
    }
}
```

- [ ] **Step 4: Write the service**

Create `backend/src/main/java/com/myfinance/backend/service/InsightService.java`:

```java
package com.myfinance.backend.service;

import com.myfinance.backend.dto.InsightRequest;
import com.myfinance.backend.dto.InsightResponse;
import com.myfinance.backend.exception.InsightNameTakenException;
import com.myfinance.backend.exception.InvalidPlanException;
import com.myfinance.backend.exception.ResourceNotFoundException;
import com.myfinance.backend.model.Insight;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.repository.InsightRepository;
import com.myfinance.backend.repository.ProfileRepository;
import com.myfinance.backend.security.ActiveProfile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

import java.util.List;

/**
 * Saved insights of the active profile (docs/API.md "Insights"). Every repository call is scoped
 * by the session's profile id, so another profile's rows are simply not found.
 */
@Service
@Transactional(readOnly = true)
public class InsightService {

    private final InsightRepository insightRepository;
    private final ProfileRepository profileRepository;
    private final ActiveProfile activeProfile;

    public InsightService(InsightRepository insightRepository, ProfileRepository profileRepository,
                          ActiveProfile activeProfile) {
        this.insightRepository = insightRepository;
        this.profileRepository = profileRepository;
        this.activeProfile = activeProfile;
    }

    @Transactional
    public InsightResponse create(InsightRequest request) {
        Long profileId = activeProfile.requireId();
        requirePlanObject(request.plan());
        // Check-then-insert; UNIQUE (profile_id, name) is the backstop for races.
        if (insightRepository.existsByProfileIdAndName(profileId, request.name())) {
            throw new InsightNameTakenException(request.name());
        }
        Profile profile = profileRepository.getReferenceById(profileId);
        Insight insight = insightRepository.save(
                new Insight(profile, request.name(), request.plan(), request.viz(), request.pinned()));
        return InsightResponse.from(insight);
    }

    public List<InsightResponse> list() {
        return insightRepository.findByProfileIdOrderByPinnedDescNameAsc(activeProfile.requireId())
                .stream().map(InsightResponse::from).toList();
    }

    public InsightResponse get(Long id) {
        return InsightResponse.from(requireInsight(id, activeProfile.requireId()));
    }

    @Transactional
    public InsightResponse update(Long id, InsightRequest request) {
        Long profileId = activeProfile.requireId();
        Insight insight = requireInsight(id, profileId);
        requirePlanObject(request.plan());
        // Renaming an insight to its own current name is not a collision.
        if (insightRepository.existsByProfileIdAndNameAndIdNot(profileId, request.name(), id)) {
            throw new InsightNameTakenException(request.name());
        }
        insight.update(request.name(), request.plan(), request.viz(), request.pinned());
        // Managed entity: the change is flushed on commit, no explicit save() needed.
        return InsightResponse.from(insight);
    }

    @Transactional
    public void delete(Long id) {
        insightRepository.delete(requireInsight(id, activeProfile.requireId()));
    }

    private Insight requireInsight(Long id, Long profileId) {
        return insightRepository.findByIdAndProfileId(id, profileId)
                .orElseThrow(() -> new ResourceNotFoundException("insight", id));
    }

    /**
     * The only plan rule the backend owns (docs/API.md "POST /api/insights/execute"): everything
     * else — the version included — belongs to the executor, so the two cannot disagree.
     */
    private static void requirePlanObject(JsonNode plan) {
        if (plan == null || !plan.isObject()) {
            throw new InvalidPlanException(List.of("plan: must be a JSON object"));
        }
    }
}
```

- [ ] **Step 5: Write the controller**

Create `backend/src/main/java/com/myfinance/backend/controller/InsightController.java`:

```java
package com.myfinance.backend.controller;

import com.myfinance.backend.dto.InsightRequest;
import com.myfinance.backend.dto.InsightResponse;
import com.myfinance.backend.service.InsightService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/insights")
public class InsightController {

    private final InsightService insightService;

    public InsightController(InsightService insightService) {
        this.insightService = insightService;
    }

    @PostMapping
    public ResponseEntity<InsightResponse> create(@Valid @RequestBody InsightRequest request) {
        InsightResponse created = insightService.create(request);
        return ResponseEntity.created(URI.create("/api/insights/" + created.id())).body(created);
    }

    /** Unpaginated: a profile holds dozens of insights at most (docs/API.md "GET /api/insights"). */
    @GetMapping
    public List<InsightResponse> list() {
        return insightService.list();
    }

    @GetMapping("/{id}")
    public InsightResponse get(@PathVariable Long id) {
        return insightService.get(id);
    }

    @PutMapping("/{id}")
    public InsightResponse update(@PathVariable Long id, @Valid @RequestBody InsightRequest request) {
        return insightService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        insightService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -B test -Dtest=InsightControllerTest`
Expected: PASS (18 tests).

- [ ] **Step 7: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add backend/src/main/java/com/myfinance/backend/dto/InsightRequest.java \
        backend/src/main/java/com/myfinance/backend/dto/InsightResponse.java \
        backend/src/main/java/com/myfinance/backend/service/InsightService.java \
        backend/src/main/java/com/myfinance/backend/controller/InsightController.java \
        backend/src/test/java/com/myfinance/backend/controller/InsightControllerTest.java
git commit -m "feat(backend): insight CRUD endpoints, profile-scoped"
```

---


### Task 16: [MY-30] `AnalyticsClient` — the backend's first outbound HTTP call

**Files:**
- Create: `backend/src/main/java/com/myfinance/backend/config/AnalyticsProperties.java`
- Create: `backend/src/main/java/com/myfinance/backend/service/AnalyticsClient.java`
- Modify: `backend/src/main/java/com/myfinance/backend/BackendApplication.java` (add `@EnableConfigurationProperties(AnalyticsProperties.class)`)
- Modify: `backend/src/main/resources/application.properties` (append an analytics block at the end of the file)
- Test: `backend/src/test/java/com/myfinance/backend/service/AnalyticsClientTest.java`

**Interfaces:**
- Consumes: `AnalyticsUnavailableException`, `InvalidPlanException` (Task 14).
- Produces:
  - `record AnalyticsProperties(String baseUrl, String token, Duration connectTimeout, Duration readTimeout)`, bound from `analytics.*`.
  - `AnalyticsClient` (a `@Service`) with constructor `AnalyticsClient(AnalyticsProperties properties, JsonMapper jsonMapper)` and `public JsonNode execute(Long profileId, JsonNode plan)` — returns the analytics envelope as a tree, throws `InvalidPlanException` on the executor's `400` and `AnalyticsUnavailableException` on anything else.
  - Properties `analytics.base-url`, `analytics.token`, `analytics.connect-timeout`, `analytics.read-timeout`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/myfinance/backend/service/AnalyticsClientTest.java`. It is a plain JUnit test — no Spring context — against a JDK `HttpServer` on a random loopback port:

```java
package com.myfinance.backend.service;

import com.myfinance.backend.config.AnalyticsProperties;
import com.myfinance.backend.exception.AnalyticsUnavailableException;
import com.myfinance.backend.exception.InvalidPlanException;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The proxy contract with the analytics service (docs/INSIGHTS.md "The analytics service"),
 * exercised against a stub HTTP server — no test ever needs the real Python process.
 */
class AnalyticsClientTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String ENVELOPE = "{\"plan\":{\"version\":1},"
            + "\"results\":[{\"currency\":\"PLN\",\"shape\":\"value\",\"value\":\"1243.5000\"}],"
            + "\"meta\":{\"truncatedGroups\":false}}";

    private static HttpServer server;
    private static String lastRequestBody;
    private static String lastAuthorization;
    private static int responseStatus;
    private static String responseBody;

    private AnalyticsClient client;

    @BeforeAll
    static void startStub() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/internal/v1/execute", exchange -> {
            lastRequestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            lastAuthorization = exchange.getRequestHeaders().getFirst("Authorization");
            byte[] out = responseBody.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(responseStatus, out.length);
            exchange.getResponseBody().write(out);
            exchange.close();
        });
        server.start();
    }

    @AfterAll
    static void stopStub() {
        server.stop(0);
    }

    @BeforeEach
    void resetStub() {
        responseStatus = 200;
        responseBody = ENVELOPE;
        lastRequestBody = null;
        lastAuthorization = null;
        client = new AnalyticsClient(properties("http://127.0.0.1:" + server.getAddress().getPort()), JSON);
    }

    private static AnalyticsProperties properties(String baseUrl) {
        return new AnalyticsProperties(baseUrl, "test-analytics-token",
                Duration.ofSeconds(2), Duration.ofSeconds(10));
    }

    private static JsonNode plan() {
        return JSON.readTree("{\"version\": 1, \"metric\": \"spend\"}");
    }

    @Test
    void wrapsThePlanWithTheProfileIdAndSendsTheBearerToken() {
        client.execute(3L, plan());

        JsonNode sent = JSON.readTree(lastRequestBody);
        assertThat(sent.path("profileId").asInt()).isEqualTo(3);
        assertThat(sent.path("plan").path("metric").asString()).isEqualTo("spend");
        assertThat(lastAuthorization).isEqualTo("Bearer test-analytics-token");
    }

    @Test
    void returnsTheEnvelopeVerbatim() {
        JsonNode envelope = client.execute(3L, plan());

        assertThat(envelope.toString()).isEqualTo(ENVELOPE);
        assertThat(envelope.path("results").path(0).path("value").asString()).isEqualTo("1243.5000");
    }

    @Test
    void mapsAnExecutorRejectionToInvalidPlanCarryingItsProblems() {
        responseStatus = 400;
        responseBody = "{\"problems\": [\"filters.categoryId: 999 does not exist in this profile\"]}";

        assertThatThrownBy(() -> client.execute(3L, plan()))
                .isInstanceOf(InvalidPlanException.class)
                .extracting(ex -> ((InvalidPlanException) ex).toProblemDetail().getProperties().get("problems"))
                .isEqualTo(List.of("filters.categoryId: 999 does not exist in this profile"));
    }

    @Test
    void mapsAnUnexpectedStatusToAnalyticsUnavailable() {
        responseStatus = 401;
        responseBody = "{\"detail\": \"Not authenticated\"}";

        assertThatThrownBy(() -> client.execute(3L, plan()))
                .isInstanceOf(AnalyticsUnavailableException.class);
    }

    @Test
    void mapsAnUnreachableServiceToAnalyticsUnavailable() throws IOException {
        AnalyticsClient offline = new AnalyticsClient(properties("http://127.0.0.1:" + closedPort()), JSON);

        assertThatThrownBy(() -> offline.execute(3L, plan()))
                .isInstanceOf(AnalyticsUnavailableException.class);
    }

    /** A port that was bound just long enough to be sure nothing else is listening on it. */
    private static int closedPort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        }
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -B test -Dtest=AnalyticsClientTest`
Expected: FAIL at compilation — `cannot find symbol: class AnalyticsProperties`, `cannot find symbol: class AnalyticsClient`.

- [ ] **Step 3: Write the configuration properties**

Create `backend/src/main/java/com/myfinance/backend/config/AnalyticsProperties.java`:

```java
package com.myfinance.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Connection settings for the analytics service (docs/INSIGHTS.md "The analytics service").
 * The timeouts are short and explicit on purpose: an outbound call with no deadline turns one
 * slow dependency into an exhausted Tomcat thread pool.
 */
@ConfigurationProperties("analytics")
public record AnalyticsProperties(String baseUrl, String token, Duration connectTimeout, Duration readTimeout) {
}
```

Then add the enabling annotation in `backend/src/main/java/com/myfinance/backend/BackendApplication.java` — the class becomes:

```java
package com.myfinance.backend;

import com.myfinance.backend.config.AnalyticsProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(AnalyticsProperties.class)
public class BackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(BackendApplication.class, args);
	}

}
```

- [ ] **Step 4: Add the properties**

Append to the end of `backend/src/main/resources/application.properties`:

```properties

# --- Analytics service (docs/INSIGHTS.md "The analytics service") ---
# Internal-only service: the compose service name in the shipped stack, localhost when both
# run on a developer's machine. Any connect/read failure becomes 503 /errors/analytics-unavailable.
analytics.base-url=${ANALYTICS_URL:http://localhost:8000}
analytics.token=${ANALYTICS_TOKEN:dev-analytics-token}
analytics.connect-timeout=2s
analytics.read-timeout=10s
```

- [ ] **Step 5: Write the client**

Create `backend/src/main/java/com/myfinance/backend/service/AnalyticsClient.java`:

```java
package com.myfinance.backend.service;

import com.myfinance.backend.config.AnalyticsProperties;
import com.myfinance.backend.exception.AnalyticsUnavailableException;
import com.myfinance.backend.exception.InvalidPlanException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.net.http.HttpClient;
import java.util.ArrayList;
import java.util.List;

/**
 * The backend's only outbound HTTP call: the analytics service (docs/INSIGHTS.md "The analytics
 * service"). Bodies are moved as raw JSON text and handed back as a tree, so the result envelope
 * reaches the browser exactly as the executor computed it — no Java types in the middle to
 * re-apply this application's own number formatting.
 */
@Service
public class AnalyticsClient {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsClient.class);

    private final RestClient restClient;
    private final JsonMapper jsonMapper;

    public AnalyticsClient(AnalyticsProperties properties, JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
        // Boot's RestClient.Builder auto-configuration is not on this project's classpath, so the
        // client is assembled here: JDK HttpClient for the connect timeout, factory for the read one.
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(properties.connectTimeout()).build());
        requestFactory.setReadTimeout(properties.readTimeout());
        this.restClient = RestClient.builder()
                .baseUrl(properties.baseUrl())
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + properties.token())
                .requestFactory(requestFactory)
                .build();
    }

    /**
     * Runs {@code plan} for {@code profileId} and returns the result envelope unchanged.
     * {@code profileId} always comes from the session — never from the request body.
     */
    public JsonNode execute(Long profileId, JsonNode plan) {
        ObjectNode request = jsonMapper.createObjectNode();
        request.put("profileId", profileId);
        request.set("plan", plan);

        ResponseEntity<String> response = post("/internal/v1/execute", request.toString());
        if (response.getStatusCode().isSameCodeAs(HttpStatus.BAD_REQUEST)) {
            throw new InvalidPlanException(problems(response.getBody()));
        }
        if (!response.getStatusCode().is2xxSuccessful()) {
            log.error("Analytics POST /internal/v1/execute answered {}", response.getStatusCode());
            throw new AnalyticsUnavailableException();
        }
        return parse(response.getBody());
    }

    private ResponseEntity<String> post(String path, String body) {
        try {
            return restClient.post()
                    .uri(path)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    // Status is inspected below instead: a 400 carries the executor's problem list.
                    .onStatus(status -> true, (request, response) -> { })
                    .toEntity(String.class);
        } catch (ResourceAccessException ex) {
            log.error("Analytics service unreachable at {}", path, ex);
            throw new AnalyticsUnavailableException();
        }
    }

    private JsonNode parse(String body) {
        try {
            return jsonMapper.readTree(body == null ? "" : body);
        } catch (JacksonException ex) {
            log.error("Analytics service returned a body that is not JSON", ex);
            throw new AnalyticsUnavailableException();
        }
    }

    /** The executor's {@code {"problems": [...]}} payload, passed through untouched. */
    private List<String> problems(String body) {
        List<String> problems = new ArrayList<>();
        parse(body).path("problems").forEach(problem -> problems.add(problem.asString()));
        if (problems.isEmpty()) {
            problems.add("The analytics service rejected the plan.");
        }
        return problems;
    }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -B test -Dtest=AnalyticsClientTest`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add backend/src/main/java/com/myfinance/backend/config/AnalyticsProperties.java \
        backend/src/main/java/com/myfinance/backend/service/AnalyticsClient.java \
        backend/src/main/java/com/myfinance/backend/BackendApplication.java \
        backend/src/main/resources/application.properties \
        backend/src/test/java/com/myfinance/backend/service/AnalyticsClientTest.java
git commit -m "feat(backend): RestClient-based analytics client with explicit timeouts"
```

---


### Task 17: [MY-30] `POST /api/insights/execute` — the proxy endpoint

**Files:**
- Modify: `backend/src/main/java/com/myfinance/backend/service/InsightService.java` (add the `AnalyticsClient` constructor parameter and the `execute` method)
- Modify: `backend/src/main/java/com/myfinance/backend/controller/InsightController.java` (add the `execute` handler)
- Verify (do **not** edit): `docs/API.md` — the D7 edits (E9/E10) are owned by Stage 1's doc-fix task; Step 7 only asserts they landed
- Modify: `docs/LESSONS.md` (append one entry at the end) — **gitignored (`.gitignore` → "Private / local-only"); write it, never `git add` it**
- Test: `backend/src/test/java/com/myfinance/backend/controller/InsightExecuteControllerTest.java`
- Test: `backend/src/test/java/com/myfinance/backend/controller/InsightExecuteUnavailableTest.java`

**Interfaces:**
- Consumes: `AnalyticsClient.execute(Long profileId, JsonNode plan)` (Task 16); `InsightService`, `InsightController` (Task 15); `InvalidPlanException` (Task 14).
- Produces: `InsightService.execute(JsonNode plan) -> JsonNode` and `POST /api/insights/execute` returning the analytics envelope verbatim.

- [ ] **Step 1: Write the failing happy/rejection-path test**

Create `backend/src/test/java/com/myfinance/backend/controller/InsightExecuteControllerTest.java`:

```java
package com.myfinance.backend.controller;

import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * POST /api/insights/execute against a stub analytics service (docs/API.md "Insights"). The stub
 * is a JDK HttpServer on a random loopback port, started before the Spring context is built and
 * pointed at by analytics.base-url — no test here needs the real Python service.
 */
@IntegrationTest
class InsightExecuteControllerTest {

    private static final String PLAN = """
            {"version": 1, "metric": "spend", "filters": {}, "groupBy": null,
             "interval": "month", "range": {"type": "lastMonths", "n": 12}}
            """;
    private static final String ENVELOPE = "{\"plan\":{\"version\":1},"
            + "\"results\":[{\"currency\":\"PLN\",\"shape\":\"timeseries\","
            + "\"points\":[{\"period\":\"2026-07\",\"value\":\"980.2100\"},"
            + "{\"period\":\"2026-08\",\"value\":\"0.0000\"}]}],"
            + "\"meta\":{\"truncatedGroups\":false}}";

    private static final HttpServer ANALYTICS = startStub();
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private static String lastRequestBody;
    private static int responseStatus;
    private static String responseBody;

    private static HttpServer startStub() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/internal/v1/execute", exchange -> {
                lastRequestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                byte[] out = responseBody.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(responseStatus, out.length);
                exchange.getResponseBody().write(out);
                exchange.close();
            });
            server.start();
            return server;
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    @DynamicPropertySource
    static void analyticsBaseUrl(DynamicPropertyRegistry registry) {
        registry.add("analytics.base-url", () -> "http://127.0.0.1:" + ANALYTICS.getAddress().getPort());
    }

    @AfterAll
    static void stopStub() {
        ANALYTICS.stop(0);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    private User user;
    private Profile profile;

    @BeforeEach
    void setUp() {
        responseStatus = 200;
        responseBody = ENVELOPE;
        lastRequestBody = null;

        user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
    }

    @Test
    void executeReturnsTheEnvelopeVerbatim() throws Exception {
        mockMvc.perform(post("/api/insights/execute").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PLAN))
                .andExpect(status().isOk())
                // Byte-for-byte: "passed through verbatim" is the contract, not "equivalent JSON".
                .andExpect(content().string(ENVELOPE))
                .andExpect(jsonPath("$.results[0].points[1].value").value("0.0000"));
    }

    @Test
    void executeForwardsTheSessionProfileAndThePlan() throws Exception {
        mockMvc.perform(post("/api/insights/execute").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PLAN))
                .andExpect(status().isOk());

        JsonNode sent = JSON.readTree(lastRequestBody);
        assertThat(sent.path("profileId").asLong()).isEqualTo(profile.getId());
        assertThat(sent.path("plan").path("interval").asString()).isEqualTo("month");
    }

    @Test
    void aProfileIdSmuggledIntoTheBodyIsIgnored() throws Exception {
        mockMvc.perform(post("/api/insights/execute").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"version\": 1, \"metric\": \"spend\", \"profileId\": 999999}"))
                .andExpect(status().isOk());

        JsonNode sent = JSON.readTree(lastRequestBody);
        assertThat(sent.path("profileId").asLong()).isEqualTo(profile.getId());
    }

    @Test
    void executeWithANonObjectBodyIs400InvalidPlanWithoutCallingAnalytics() throws Exception {
        mockMvc.perform(post("/api/insights/execute").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[1, 2]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-plan"))
                .andExpect(jsonPath("$.problems", contains("plan: must be a JSON object")));

        assertThat(lastRequestBody).isNull();
    }

    @Test
    void anExecutorRejectionIs400WithTheProblemsPassedThrough() throws Exception {
        responseStatus = 400;
        responseBody = "{\"problems\": [\"filters.categoryId: 999 does not exist in this profile\"]}";

        mockMvc.perform(post("/api/insights/execute").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PLAN))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-plan"))
                .andExpect(jsonPath("$.problems",
                        contains("filters.categoryId: 999 does not exist in this profile")));
    }

    @Test
    void anUnsupportedVersionIsTheExecutorsRejection() throws Exception {
        // D7: the backend does not know the version set; it forwards and reports what comes back.
        responseStatus = 400;
        responseBody = "{\"problems\": [\"version: 7 is not supported\"]}";

        mockMvc.perform(post("/api/insights/execute").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"version\": 7, \"metric\": \"spend\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.problems", contains("version: 7 is not supported")));
    }

    @Test
    void executeWithoutActiveProfileIs409() throws Exception {
        mockMvc.perform(post("/api/insights/execute").with(fixtures.as(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PLAN))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }

    @Test
    void unauthenticatedIs401() throws Exception {
        mockMvc.perform(post("/api/insights/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PLAN))
                .andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: Write the failing 503 test**

Create `backend/src/test/java/com/myfinance/backend/controller/InsightExecuteUnavailableTest.java`:

```java
package com.myfinance.backend.controller;

import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.ServerSocket;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The degraded path: analytics is simply not running (docs/API.md "POST /api/insights/execute").
 * analytics.base-url points at a port nothing listens on, so the connection is refused.
 */
@IntegrationTest
class InsightExecuteUnavailableTest {

    private static final String PLAN = "{\"version\": 1, \"metric\": \"spend\"}";
    private static final int CLOSED_PORT = closedPort();

    /** Bound just long enough to be sure nothing else claims it, then released. */
    private static int closedPort() {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    @DynamicPropertySource
    static void analyticsBaseUrl(DynamicPropertyRegistry registry) {
        registry.add("analytics.base-url", () -> "http://127.0.0.1:" + CLOSED_PORT);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    private Profile profile;

    @BeforeEach
    void setUp() {
        User user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
    }

    @Test
    void executeIs503WhenAnalyticsIsNotRunning() throws Exception {
        mockMvc.perform(post("/api/insights/execute").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PLAN))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.type").value("/errors/analytics-unavailable"))
                .andExpect(jsonPath("$.title").value("Analytics service unavailable"));
    }
}
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -B test -Dtest='InsightExecute*Test'`
Expected: FAIL — `POST /api/insights/execute` is not mapped, but the path still matches `GET/PUT/DELETE /api/insights/{id}` with the wrong verb, so every test expecting `200`/`400`/`503` reports `Status expected:<...> but was:<405>` (`HttpRequestMethodNotSupportedException`). `unauthenticatedIs401` passes already — the security filter chain rejects before MVC ever routes.

- [ ] **Step 4: Add the service method**

In `backend/src/main/java/com/myfinance/backend/service/InsightService.java`:

1. replace the field block and constructor with the version below (`AnalyticsClient` is in the same package, so it needs no import):

```java
    private final InsightRepository insightRepository;
    private final ProfileRepository profileRepository;
    private final ActiveProfile activeProfile;
    private final AnalyticsClient analyticsClient;

    public InsightService(InsightRepository insightRepository, ProfileRepository profileRepository,
                          ActiveProfile activeProfile, AnalyticsClient analyticsClient) {
        this.insightRepository = insightRepository;
        this.profileRepository = profileRepository;
        this.activeProfile = activeProfile;
        this.analyticsClient = analyticsClient;
    }
```

2. add this method immediately after `delete(Long id)`, before the private helpers:

```java
    /**
     * Runs a plan without saving it (docs/API.md "POST /api/insights/execute"). The profile comes
     * from the session, never from the body, and the envelope is returned exactly as received.
     */
    public JsonNode execute(JsonNode plan) {
        Long profileId = activeProfile.requireId();
        requirePlanObject(plan);
        return analyticsClient.execute(profileId, plan);
    }
```

- [ ] **Step 5: Add the controller handler**

In `backend/src/main/java/com/myfinance/backend/controller/InsightController.java`, add the import

```java
import tools.jackson.databind.JsonNode;
```

and this handler immediately after `create(...)`:

```java
    // Declared alongside "/{id}" is fine: an exact path segment always beats a path variable.
    @PostMapping("/execute")
    public JsonNode execute(@RequestBody JsonNode plan) {
        return insightService.execute(plan);
    }
```

- [ ] **Step 6: Run both tests to verify they pass**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -B test -Dtest='InsightExecute*Test'`
Expected: PASS (8 + 1 tests).

- [ ] **Step 7: Verify the D7 doc edits are already in place**

`docs/API.md`'s three D7 edits (E9 and E10 of the design delta) belong to the
**doc-fix commit** (Task 1), which lands on `feat/phase-4-insights-core` — see Stage 1's first task. This step confirms the code you just
wrote matches the doc, rather than editing it a second time.

Run:

```bash
\
  grep -q 'The backend checks only that the body \*\*is a JSON object\*\*' docs/API.md && \
  grep -q '| `400` | Not a JSON object (`/errors/invalid-plan`)' docs/API.md && \
  ! grep -q 'JSON object with a supported' docs/API.md && \
  echo "API.md MATCHES D7"
```

Expected: `API.md MATCHES D7`.

If it prints nothing, the doc-fix commit has not landed on this branch. Do **not**
hand-edit `docs/API.md` here — go back and complete Stage 1's doc-fix task first,
so the three edits have exactly one owner and one commit.

- [ ] **Step 8: Append the LESSONS entry**

Append to the end of `docs/LESSONS.md`:

```markdown

### Proxying a JSON document without letting your own serializer touch it

- **What** — `AnalyticsClient` moves the analytics request and response as raw
  JSON text and hands back a `JsonNode`, which the controller returns
  unchanged; connect and read failures become
  `503 /errors/analytics-unavailable` rather than a `500`.
- **Where** — `service/AnalyticsClient`, `service/InsightService`
  (`execute`), `controller/InsightController`, `docs/API.md` →
  "POST /api/insights/execute".
- **Why it's this way** — `RestClient` is Spring's synchronous HTTP client
  (Python's `requests`, with a fluent builder); Boot's usual auto-configured
  `RestClient.Builder` bean is not on this project's classpath, so the client
  is assembled in the constructor with an explicit connect and read timeout —
  an outbound call without a deadline is how one slow dependency exhausts the
  Tomcat thread pool. `.retrieve().onStatus(status -> true, (req, res) -> {})`
  switches off the default "4xx/5xx throws" behaviour, because a `400` here is
  data (the executor's `problems` list), not a transport failure. And the
  envelope is never deserialized into Java types: this application renders
  every `BigDecimal` as a string via `JacksonConfig`, and putting its own
  formatting rules between the executor and the browser is exactly what
  "passed through verbatim" in `API.md` forbids. Finally, `profileId` is added
  to the wrapper from the session — a plan is client-supplied data, so nothing
  inside it is ever trusted to name a profile.
```

- [ ] **Step 9: Run the full backend suite**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -B verify`
Expected: PASS — `BUILD SUCCESS`, no failures or errors, including the pre-existing test classes.

- [ ] **Step 10: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add backend/src/main/java/com/myfinance/backend/service/InsightService.java \
        backend/src/main/java/com/myfinance/backend/controller/InsightController.java \
        backend/src/test/java/com/myfinance/backend/controller/InsightExecuteControllerTest.java \
        backend/src/test/java/com/myfinance/backend/controller/InsightExecuteUnavailableTest.java \
       
git commit -m "feat(backend): POST /api/insights/execute proxying the analytics service"
```

### Task 18: [MY-31] DB-backed test harness — Testcontainers Postgres, the backend's Flyway migrations, a frozen clock and the seed fixture

**Files:**
- Modify: `analytics/tests/conftest.py` (Task 4 created it — **append** the fixtures below and keep its `clear_settings_cache` block verbatim)
- Create: `analytics/tests/fixtures/seed.sql`
- Create: `analytics/tests/test_harness.py`
- Modify: `analytics/pyproject.toml` (add `psycopg[binary]` to the runtime dependencies and `testcontainers` to the dev group)

**Interfaces:**
- Consumes: `analytics/pyproject.toml` and the `analytics/` package skeleton from MY-29; `backend/src/main/resources/db/migration/V4__insights.sql` from MY-30 (it creates the `myfinance_ro` role and is the only migration carrying the `${dbAnalyticsPassword}` placeholder — contract R2).
- Produces: pytest fixtures used by every later task in this fragment —
  `dsn` (session, `str`: a `postgresql://` DSN for a `postgres:16-alpine` container migrated with the backend's own Flyway files and loaded with `seed.sql`),
  `conn` (function, an autocommit `psycopg.Connection` to that database),
  `today` (function, `datetime.date(2026, 9, 15)` — the frozen clock every relative-range fixture is written against).
  Seed data facts later tasks assert against: profile `1` ("Main", default currency PLN) holds the fixtures; profile `2` ("Control") holds one 9999.0000 PLN expense that must never appear in a profile-1 result. Categories in profile 1: `10` Groceries (root) with children `11` Lidl and `12` Biedronka; `20` Transport (root) with child `21` Fuel; `30` Salary (root); `40` Many (root) with 30 children `401`…`430` named `Many 01`…`Many 30`.

- [ ] **Step 1: Add psycopg and the container library**

`conftest.py` below does `import psycopg` at module import time, so psycopg must be a
declared dependency *now* — nothing installs it transitively. Verified against PyPI:
`testcontainers`' `postgres` extra exists but is **empty** (it declares no requirements
at all), so `testcontainers[postgres]` would pull neither psycopg nor psycopg2, and the
whole suite would die at collection with `ModuleNotFoundError: No module named 'psycopg'`.
Plain `testcontainers` is what actually ships `testcontainers.postgres`.

psycopg goes in the **runtime** group, not `dev`: the service itself connects to Postgres
(Task 19 builds `db.py` on it).

```bash
cd /home/chris/side-projects/my-finance/analytics
uv add 'psycopg[binary]>=3.2'
uv add --dev 'testcontainers>=4.8'
```

Expected: `[project] dependencies` gains `psycopg[binary]>=3.2` alongside `fastapi` and
`uvicorn`; the dev group gains `testcontainers>=4.8`; `uv.lock` is updated.

- [ ] **Step 2: Write the failing harness smoke test**

Create `analytics/tests/test_harness.py`:

```python
"""Proves the harness itself: the backend's migrations applied, the placeholder substituted,
the seed loaded, and the clock frozen. Everything else in this suite builds on those four facts.
"""

from datetime import date


def test_seed_rows_are_loaded_and_profile_scoped(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM txn WHERE profile_id = 1")
        assert cur.fetchone()[0] == 41
        cur.execute("SELECT count(*) FROM category WHERE profile_id = 1")
        assert cur.fetchone()[0] == 37
        cur.execute("SELECT count(*) FROM txn WHERE profile_id = 2")
        assert cur.fetchone()[0] == 1


def test_v4_created_the_read_only_role(conn):
    """One query proving both that V4 ran and that ${dbAnalyticsPassword} was substituted:
    an unsubstituted placeholder is a syntax error, so the role would not exist."""
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_roles WHERE rolname = 'myfinance_ro'")
        assert cur.fetchone() is not None


def test_the_clock_is_frozen(today):
    assert today == date(2026, 9, 15)
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_harness.py -q`
Expected: FAIL with `fixture 'conn' not found`

- [ ] **Step 4: Write the seed fixture**

Create `analytics/tests/fixtures/seed.sql`:

```sql
-- Golden-test fixture data for the analytics executor (docs/INSIGHTS.md "Testing strategy").
-- Ids are explicit (OVERRIDING SYSTEM VALUE) so golden envelopes can assert exact group keys.
-- Nothing in the suite inserts without an id, so the untouched identity sequences never collide.
-- Every relative range in the fixtures is written against a frozen today of 2026-09-15.

INSERT INTO app_user (id, email, password_hash, display_name) OVERRIDING SYSTEM VALUE
VALUES (1, 'golden@example.test', 'not-a-real-hash', 'Golden');

-- Profile 1 executes every fixture plan; profile 2 exists only to prove nothing leaks across profiles.
INSERT INTO profile (id, user_id, name, default_currency) OVERRIDING SYSTEM VALUE
VALUES (1, 1, 'Main', 'PLN'),
       (2, 1, 'Control', 'PLN');

INSERT INTO category (id, profile_id, parent_id, name) OVERRIDING SYSTEM VALUE VALUES
    (10, 1, NULL, 'Groceries'),
    (11, 1, 10,   'Lidl'),
    (12, 1, 10,   'Biedronka'),
    (20, 1, NULL, 'Transport'),
    (21, 1, 20,   'Fuel'),
    (30, 1, NULL, 'Salary'),
    (40, 1, NULL, 'Many'),
    (90, 2, NULL, 'Groceries');

-- 30 children under 'Many': the group-cap fixture (docs/INSIGHTS.md "Bounded output").
INSERT INTO category (id, profile_id, parent_id, name) OVERRIDING SYSTEM VALUE
SELECT 400 + g, 1, 40, 'Many ' || to_char(g, 'FM00') FROM generate_series(1, 30) AS g;

INSERT INTO txn (id, profile_id, category_id, amount, currency, txn_type, occurred_on, description)
OVERRIDING SYSTEM VALUE VALUES
    (101, 1, 11,   70.0000, 'PLN', 'EXPENSE', DATE '2025-10-10', 'previous calendar year'),
    (102, 1, 12,  130.0000, 'PLN', 'EXPENSE', DATE '2025-12-24', 'previous calendar year'),
    (103, 1, 11,  100.0000, 'PLN', 'EXPENSE', DATE '2026-07-05', NULL),
    (104, 1, 12,   50.0000, 'PLN', 'EXPENSE', DATE '2026-07-20', NULL),
    (105, 1, 11,  200.0000, 'PLN', 'EXPENSE', DATE '2026-08-03', NULL),
    (106, 1, 12,  300.0000, 'PLN', 'EXPENSE', DATE '2026-09-01', NULL),
    (107, 1, 10,   25.0000, 'PLN', 'EXPENSE', DATE '2026-09-10', 'filed on the parent itself'),
    (108, 1, 21,  400.0000, 'PLN', 'EXPENSE', DATE '2026-09-02', NULL),
    (109, 1, 11,   10.0000, 'EUR', 'EXPENSE', DATE '2026-08-15', 'the multi-currency row'),
    (110, 1, 30, 4000.0000, 'PLN', 'INCOME',  DATE '2026-08-05', NULL),
    (111, 1, 30, 5000.0000, 'PLN', 'INCOME',  DATE '2026-09-05', NULL),
    (190, 2, 90, 9999.0000, 'PLN', 'EXPENSE', DATE '2026-09-01', 'never in a profile-1 result');

-- One 1.00 … 30.00 PLN expense per 'Many' child, all on the same day.
INSERT INTO txn (id, profile_id, category_id, amount, currency, txn_type, occurred_on)
OVERRIDING SYSTEM VALUE
SELECT 400 + g, 1, 400 + g, g, 'PLN', 'EXPENSE', DATE '2026-09-03' FROM generate_series(1, 30) AS g;
```

- [ ] **Step 5: Write the harness**

Task 4 already created `analytics/tests/conftest.py` with an autouse
`clear_settings_cache` fixture. That fixture is load-bearing — `get_settings()` is
`lru_cache`d, and `test_config.py` and `test_execute.py` both mutate the environment
before calling it, so dropping it makes `test_settings_fall_back_to_dev_defaults` read
a cached `token-from-env` and the whole suite goes red from here on.

**Extend the file; do not overwrite it.** The result should read exactly as below —
Task 4's import and fixture at the top, the new container fixtures appended:

```python
"""Shared fixtures for the analytics test suite.

The executor is only ever trusted against the schema the backend actually ships, so the
container is migrated with the backend's own Flyway files (spec assumption A5) rather than a
hand-written copy that can drift. Flyway is a Java tool; applying the same .sql files in version
order with the one placeholder substituted gives the same schema without a JVM.
"""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path

import psycopg
import pytest
from testcontainers.postgres import PostgresContainer

from analytics.config import get_settings


@pytest.fixture(autouse=True)
def clear_settings_cache():
    """From Task 4, unchanged. get_settings() is lru_cached, so a test that changes
    the environment must not leak its Settings into the next one."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = REPO_ROOT / "backend" / "src" / "main" / "resources" / "db" / "migration"
SEED = Path(__file__).parent / "fixtures" / "seed.sql"

# V4__insights.sql carries ${dbAnalyticsPassword} (docs/INSIGHTS.md "Read-only role"). Flyway
# substitutes it from spring.flyway.placeholders.*; this harness must supply the same value or
# the migration fails on a syntax error.
PLACEHOLDERS = {"dbAnalyticsPassword": "myfinance-ro"}

FROZEN_TODAY = date(2026, 9, 15)


def _version(path: Path) -> int:
    """V10__x.sql sorts after V9__x.sql only if the number is compared as a number."""
    return int(re.match(r"V(\d+)__", path.name).group(1))


# seed.sql supplies every id explicitly with OVERRIDING SYSTEM VALUE, which leaves the
# GENERATED ALWAYS identity sequences sitting at 1. Any later test that inserts WITHOUT an
# id would then generate 1 and collide with the seed's own row. Push the sequences past the
# fixture range once, here, so both styles of insert can coexist.
SEEDED_TABLES = ("app_user", "profile", "category", "txn", "budget", "subscription", "insight")


def _advance_identity_sequences(cur) -> None:
    for table in SEEDED_TABLES:
        cur.execute(
            "SELECT setval(pg_get_serial_sequence(%s, 'id'), 10000, false)", (table,)
        )


def _apply(cur, script: str) -> None:
    for key, value in PLACEHOLDERS.items():
        script = script.replace("${" + key + "}", value)
    # No parameters, so psycopg uses the simple query protocol and accepts a multi-statement
    # script — including V4's dollar-quoted DO block — in one round trip.
    cur.execute(script)


@pytest.fixture(scope="session")
def dsn() -> str:
    # Same tag as docker-compose.yml and the backend's TestcontainersConfiguration (contract R13).
    with PostgresContainer("postgres:16-alpine", driver=None) as container:
        url = container.get_connection_url()
        with psycopg.connect(url, autocommit=True) as conn, conn.cursor() as cur:
            for migration in sorted(MIGRATIONS.glob("V*__*.sql"), key=_version):
                _apply(cur, migration.read_text(encoding="utf-8"))
            _apply(cur, SEED.read_text(encoding="utf-8"))
            _advance_identity_sequences(cur)
        yield url


@pytest.fixture
def conn(dsn: str):
    """A fresh connection per test. The executor only reads, so there is nothing to clean up."""
    with psycopg.connect(dsn, autocommit=True) as connection:
        yield connection


@pytest.fixture
def today() -> date:
    """The injectable clock, frozen (spec D6/A7) so relative ranges are reproducible."""
    return FROZEN_TODAY
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_harness.py -q`
Expected: PASS (3 passed)

- [ ] **Step 7: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/pyproject.toml analytics/uv.lock analytics/tests/conftest.py \
        analytics/tests/fixtures/seed.sql analytics/tests/test_harness.py
git commit -m "test(analytics): golden-test harness — Testcontainers Postgres migrated by the backend's Flyway files"
```

---


### Task 19: [MY-31] The read-only database connection — `db.py` and the `get_conn` dependency

> **Gap task.** MY-29 deliberately did not create `db.py` (nothing in the skeleton
> opened a connection, and `myfinance_ro` did not exist until `V4`), while MY-31
> assumed MY-29 had. Without this task nothing in the repo defines `get_conn`, and
> the executor route in Task 27 would not import. It also lands the only test that
> proves the headline read-only guarantee — that the analytics credential *cannot*
> write — which no other task covers.

**Files:**
- Create: `analytics/src/analytics/db.py`
- Create: `analytics/tests/test_db.py`

**Interfaces:**
- Consumes: `Settings` and `get_settings()` from `analytics/src/analytics/config.py` (MY-29 — fields `database_url: str`, `analytics_token: str`, `tz: str`); the `dsn` session fixture from Task 18.
- Produces:
  - `analytics/src/analytics/db.py` exporting
    `get_conn(settings: Annotated[Settings, Depends(get_settings)]) -> Iterator[psycopg.Connection]`
    — the FastAPI dependency every route that touches Postgres declares as `Depends(get_conn)`,
    and the object tests override with `app.dependency_overrides[get_conn]`.
  - `read_only_dsn(dsn: str) -> str` in `analytics/tests/test_db.py`, re-exported for later suites
    that want to assert against the restricted role rather than the container superuser.

> **Deliberate simplification, recorded rather than silent.** This opens **one
> connection per request** instead of a `psycopg_pool.ConnectionPool`. A personal
> instance issues a handful of executions a minute, and a per-request connect costs
> single-digit milliseconds against a container on the same Docker network — a pool
> would be speculative machinery (CLAUDE.md §2). Add the pool when a real profile's
> execute latency is measurably annoying, the same trigger `docs/INSIGHTS.md` →
> "Deliberately deferred" already records for result caching.

- [ ] **Step 1: Write the failing test**

Create `analytics/tests/test_db.py`:

```python
"""The analytics service's only database credential, and the guarantee behind it.

docs/INSIGHTS.md principle 4: "read-only as a database guarantee" — the same
philosophy as the composite FKs, a rule the schema enforces so code cannot forget
it. This file is where that claim is actually checked.
"""

import psycopg
import pytest
from psycopg.conninfo import make_conninfo

from analytics.config import Settings
from analytics.db import get_conn

# V4__insights.sql creates this role with the password Flyway substitutes into
# ${dbAnalyticsPassword}; tests/conftest.py substitutes the same dev default.
RO_USER = "myfinance_ro"
RO_PASSWORD = "myfinance-ro"


def read_only_dsn(dsn: str) -> str:
    """The container's DSN, re-pointed at the restricted role."""
    return make_conninfo(dsn, user=RO_USER, password=RO_PASSWORD)


def _settings(dsn: str) -> Settings:
    return Settings(database_url=dsn, analytics_token="test-token", tz="UTC")


def test_get_conn_yields_a_usable_connection_and_closes_it(dsn):
    generator = get_conn(_settings(read_only_dsn(dsn)))
    connection = next(generator)

    with connection.cursor() as cur:
        cur.execute("SELECT 1")
        assert cur.fetchone()[0] == 1

    with pytest.raises(StopIteration):
        next(generator)
    assert connection.closed


def test_the_connection_is_marked_read_only(dsn):
    generator = get_conn(_settings(read_only_dsn(dsn)))
    connection = next(generator)
    try:
        assert connection.read_only is True
    finally:
        generator.close()


def test_the_analytics_role_can_read_every_table_it_needs(dsn):
    with psycopg.connect(read_only_dsn(dsn), autocommit=True) as conn, conn.cursor() as cur:
        for table in ("txn", "category", "profile", "budget", "subscription", "insight"):
            cur.execute(f"SELECT count(*) FROM {table}")
            assert cur.fetchone()[0] >= 0


def test_the_analytics_role_cannot_write(dsn):
    """The guarantee. If this ever passes an INSERT, the grant in V4 has regressed."""
    with psycopg.connect(read_only_dsn(dsn), autocommit=True) as conn, conn.cursor() as cur:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            cur.execute(
                "INSERT INTO txn (profile_id, category_id, amount, currency, txn_type, occurred_on)"
                " VALUES (1, 10, 1.0000, 'PLN', 'EXPENSE', DATE '2026-09-15')"
            )


def test_the_analytics_role_cannot_delete_or_update(dsn):
    with psycopg.connect(read_only_dsn(dsn), autocommit=True) as conn, conn.cursor() as cur:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            cur.execute("UPDATE txn SET amount = 0 WHERE profile_id = 1")
    with psycopg.connect(read_only_dsn(dsn), autocommit=True) as conn, conn.cursor() as cur:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            cur.execute("DELETE FROM txn WHERE profile_id = 1")
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_db.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'analytics.db'`

- [ ] **Step 3: Write the connection module**

Create `analytics/src/analytics/db.py`:

```python
"""The analytics service's database access — read-only, one connection per request.

The credential is `myfinance_ro`, created by the backend's V4__insights.sql with
SELECT and nothing else (docs/SCHEMA.md "The read-only analytics role"). The
connection is *also* marked read-only at the session level: the grant is the real
guarantee, this is the belt-and-braces half, and it makes an accidental write fail
here rather than at the server with a less obvious message.
"""

from collections.abc import Iterator
from typing import Annotated

import psycopg
from fastapi import Depends

from analytics.config import Settings, get_settings


def get_conn(
    settings: Annotated[Settings, Depends(get_settings)],
) -> Iterator[psycopg.Connection]:
    """One connection per request, closed when the request ends.

    No pool: a personal instance issues a handful of executions a minute and the
    connect cost is milliseconds on the compose network. Add one when execute
    latency is measurably annoying, not before (CLAUDE.md section 2).
    """
    with psycopg.connect(settings.database_url, autocommit=True) as connection:
        connection.read_only = True
        yield connection
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_db.py -q`
Expected: PASS (5 passed)

If `test_the_analytics_role_can_read_every_table_it_needs` fails with
`InsufficientPrivilege` on `insight`, V4's `GRANT SELECT ON ALL TABLES` ran *before*
the `CREATE TABLE insight` statement in the same migration — reorder V4 so the grant
comes last, and re-run. That ordering trap is precisely why this test enumerates
tables rather than checking one.

- [ ] **Step 5: Append the LESSONS entry**

Append to the end of `docs/LESSONS.md`:

```markdown

### A database role is a privilege boundary that code cannot argue with

- **What** — the analytics service holds a `SELECT`-only Postgres login
  (`myfinance_ro`), so "analytics never writes" is enforced by the database, not
  by reviewer discipline.
- **Where** — `backend/src/main/resources/db/migration/V4__insights.sql`,
  `analytics/src/analytics/db.py`, `analytics/tests/test_db.py`.
- **Why it's this way** — same instinct as the composite foreign keys already
  described in "Modelling a tree in SQL, and enforcing scoping in the schema": put
  the rule where it cannot be forgotten. In Python you would reach for a wrapper
  class that refuses writes, which protects you only as long as everyone goes
  through the wrapper; a `GRANT` protects you even from a psql session. The
  connection is additionally opened `read_only`, which is defence in depth rather
  than the guarantee — `test_the_analytics_role_cannot_write` asserts against the
  grant, because that is the half an attacker or a mistake cannot bypass.
```

- [ ] **Step 6: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/src/analytics/db.py analytics/tests/test_db.py
git commit -m "feat(analytics): read-only database connection and the get_conn dependency"
```

---

### Task 20: [MY-31] Plan model — DSL v1 dataclasses, enums, and the normalized plan echo

**Files:**
- Create: `analytics/src/analytics/plan.py`
- Create: `analytics/tests/test_plan.py`

**Interfaces:**
- Consumes: nothing.
- Produces (`analytics.plan`):
  `SUPPORTED_VERSIONS: frozenset[int]` (`{1}`), `METRICS = ("spend", "income", "net")`,
  `GROUP_BYS = ("category", "merchant")`, `INTERVALS = ("day", "week", "month", "quarter", "year")`,
  `RANGE_TYPES = ("lastMonths", "yearToDate", "absolute", "all")`, `MERCHANT_ENABLED: bool` (`False`);
  `@dataclass(frozen=True) Range(type: str, n: int | None, start: date | None, end: date | None)`
  (`start`/`end` are the plan's `from`/`to`; `from` is a Python keyword);
  `@dataclass(frozen=True) Filters(category_id: int | None, include_descendants: bool, merchants: tuple[str, ...] | None, currency: str | None)`;
  `@dataclass(frozen=True) Plan(version: int, metric: str, filters: Filters, group_by: str | None, interval: str | None, range: Range)` with `Plan.to_json() -> dict`;
  `parse_plan(raw: dict) -> Plan`.

- [ ] **Step 1: Write the failing test**

Create `analytics/tests/test_plan.py`:

```python
"""The DSL object model: parsing an already-validated body, and the normalized echo."""

from datetime import date

from analytics.plan import Filters, Plan, Range, parse_plan


def test_parses_a_full_plan():
    plan = parse_plan({
        "version": 1,
        "metric": "spend",
        "filters": {"categoryId": 10, "includeDescendants": False, "currency": "PLN"},
        "groupBy": "category",
        "interval": "month",
        "range": {"type": "absolute", "from": "2026-01-01", "to": "2026-06-30"},
    })
    assert plan == Plan(
        version=1,
        metric="spend",
        filters=Filters(category_id=10, include_descendants=False, merchants=None, currency="PLN"),
        group_by="category",
        interval="month",
        range=Range(type="absolute", n=None, start=date(2026, 1, 1), end=date(2026, 6, 30)),
    )


def test_defaults_a_minimal_plan():
    plan = parse_plan({"version": 1, "metric": "net", "range": {"type": "all"}})
    assert plan.filters == Filters(category_id=None, include_descendants=True,
                                   merchants=None, currency=None)
    assert plan.group_by is None
    assert plan.interval is None
    assert plan.range == Range(type="all", n=None, start=None, end=None)


def test_include_descendants_defaults_to_true_when_a_category_is_filtered():
    plan = parse_plan({"version": 1, "metric": "spend", "filters": {"categoryId": 10},
                       "range": {"type": "lastMonths", "n": 12}})
    assert plan.filters.include_descendants is True


def test_normalized_echo_fills_in_the_defaults_that_were_applied():
    raw = {"version": 1, "metric": "spend", "filters": {"categoryId": 10},
           "interval": "month", "range": {"type": "lastMonths", "n": 12}}
    assert parse_plan(raw).to_json() == {
        "version": 1,
        "metric": "spend",
        "filters": {"categoryId": 10, "includeDescendants": True},
        "groupBy": None,
        "interval": "month",
        "range": {"type": "lastMonths", "n": 12},
    }


def test_normalized_echo_renders_absolute_dates_back_as_iso_strings():
    raw = {"version": 1, "metric": "net", "filters": {"currency": "EUR"},
           "range": {"type": "absolute", "from": "2026-01-01", "to": "2026-06-30"}}
    assert parse_plan(raw).to_json()["range"] == {
        "type": "absolute", "from": "2026-01-01", "to": "2026-06-30"}
    assert parse_plan(raw).to_json()["filters"] == {"currency": "EUR"}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_plan.py -q`
Expected: FAIL at collection with `ModuleNotFoundError: No module named 'analytics.plan'`

- [ ] **Step 3: Write the plan model**

Create `analytics/src/analytics/plan.py`:

```python
"""The plan DSL v1 object model (docs/INSIGHTS.md "Plan DSL v1").

Frozen dataclasses rather than Pydantic models: the wire body is validated by
`validation.validate_plan`, which returns a *list* of problems, and Pydantic's fail-fast
exceptions would collapse that list into whichever error it hit first.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

SUPPORTED_VERSIONS: frozenset[int] = frozenset({1})
METRICS = ("spend", "income", "net")
GROUP_BYS = ("category", "merchant")  # "currency" dropped from the v1 enum (spec D1)
INTERVALS = ("day", "week", "month", "quarter", "year")
RANGE_TYPES = ("lastMonths", "yearToDate", "absolute", "all")

# txn.merchant lands as V5 in Phase 4b. Until then filters.merchants and groupBy: "merchant" are
# both rejected with one shared message (spec D2); flipping this to True is MY-33's switch.
MERCHANT_ENABLED = False


@dataclass(frozen=True)
class Range:
    type: str
    n: int | None = None
    start: date | None = None  # the plan's "from" — `from` is a Python keyword
    end: date | None = None  # the plan's "to"


@dataclass(frozen=True)
class Filters:
    category_id: int | None = None
    include_descendants: bool = True
    merchants: tuple[str, ...] | None = None
    currency: str | None = None


@dataclass(frozen=True)
class Plan:
    version: int
    metric: str
    filters: Filters
    group_by: str | None
    interval: str | None
    range: Range

    def to_json(self) -> dict:
        """The "normalized plan as executed" echoed in the envelope (docs/INSIGHTS.md → Result
        shapes). Defaults the executor applied are spelled out, so the explorer's chips show
        what actually ran rather than what was typed."""
        filters: dict = {}
        if self.filters.category_id is not None:
            filters["categoryId"] = self.filters.category_id
            filters["includeDescendants"] = self.filters.include_descendants
        if self.filters.merchants is not None:
            filters["merchants"] = list(self.filters.merchants)
        if self.filters.currency is not None:
            filters["currency"] = self.filters.currency
        return {
            "version": self.version,
            "metric": self.metric,
            "filters": filters,
            "groupBy": self.group_by,
            "interval": self.interval,
            "range": _range_to_json(self.range),
        }


def _range_to_json(rng: Range) -> dict:
    if rng.type == "lastMonths":
        return {"type": "lastMonths", "n": rng.n}
    if rng.type == "absolute":
        return {"type": "absolute", "from": rng.start.isoformat(), "to": rng.end.isoformat()}
    return {"type": rng.type}


def parse_plan(raw: dict) -> Plan:
    """Builds a Plan from a body `validation.validate_plan` already accepted, so every field is
    known to be present and well-typed here."""
    filters = raw.get("filters") or {}
    merchants = filters.get("merchants")
    rng = raw["range"]
    return Plan(
        version=raw["version"],
        metric=raw["metric"],
        filters=Filters(
            category_id=filters.get("categoryId"),
            include_descendants=filters.get("includeDescendants", True),
            merchants=tuple(merchants) if merchants is not None else None,
            currency=filters.get("currency"),
        ),
        group_by=raw.get("groupBy"),
        interval=raw.get("interval"),
        range=Range(
            type=rng["type"],
            n=rng.get("n"),
            start=date.fromisoformat(rng["from"]) if "from" in rng else None,
            end=date.fromisoformat(rng["to"]) if "to" in rng else None,
        ),
    )
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_plan.py -q`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/src/analytics/plan.py analytics/tests/test_plan.py
git commit -m "feat(analytics): plan DSL v1 object model and normalized plan echo"
```

---


### Task 21: [MY-31] Range resolution and gap-free bucket keys

**Files:**
- Create: `analytics/src/analytics/ranges.py`
- Create: `analytics/tests/test_ranges.py`

**Interfaces:**
- Consumes: `analytics.plan.Range`.
- Produces (`analytics.ranges`):
  `resolve_range(rng: Range, today: date) -> tuple[date, date]` — inclusive on both ends;
  `bucket_start(interval: str, day: date) -> date` — the start of the bucket containing `day`;
  `period_key(interval: str, start: date) -> str` — the wire format (`2026-07-13` for day/week, `2026-07` for month, `2026-Q3` for quarter, `2026` for year);
  `bucket_count(interval: str, start: date, end: date) -> int` — arithmetic, allocates nothing;
  `bucket_starts(interval: str, start: date, end: date) -> list[str]` — every key from the bucket containing `start` to the bucket containing `end`, gap-free;
  `ALL_START`/`ALL_END` — the sentinel bounds `range: {"type": "all"}` resolves to.

- [ ] **Step 1: Write the failing test**

Create `analytics/tests/test_ranges.py`:

```python
"""Table-driven range and bucket-key tests. lastMonths yields n buckets total (spec D5) and the
clock is injected (spec D6), so the two subtle cases are the year boundary and yearToDate."""

from datetime import date

import pytest

from analytics.plan import Range
from analytics.ranges import (
    ALL_END,
    ALL_START,
    bucket_count,
    bucket_start,
    bucket_starts,
    period_key,
    resolve_range,
)

RANGES = [
    # spec D5: n buckets total — n-1 complete months plus the current partial one.
    ("12 months from mid-September", Range("lastMonths", n=12), date(2026, 9, 15),
     (date(2025, 10, 1), date(2026, 9, 15))),
    ("1 month is the current month only", Range("lastMonths", n=1), date(2026, 1, 31),
     (date(2026, 1, 1), date(2026, 1, 31))),
    ("3 months crossing the year boundary", Range("lastMonths", n=3), date(2026, 2, 10),
     (date(2025, 12, 1), date(2026, 2, 10))),
    ("24 months", Range("lastMonths", n=24), date(2026, 9, 15),
     (date(2024, 10, 1), date(2026, 9, 15))),
    ("year to date", Range("yearToDate"), date(2026, 9, 15),
     (date(2026, 1, 1), date(2026, 9, 15))),
    ("year to date on 1 January", Range("yearToDate"), date(2026, 1, 1),
     (date(2026, 1, 1), date(2026, 1, 1))),
    ("absolute is passed through", Range("absolute", start=date(2026, 1, 1), end=date(2026, 6, 30)),
     date(2026, 9, 15), (date(2026, 1, 1), date(2026, 6, 30))),
    ("all resolves to the sentinels", Range("all"), date(2026, 9, 15), (ALL_START, ALL_END)),
]


@pytest.mark.parametrize("name, rng, today, expected", RANGES, ids=[r[0] for r in RANGES])
def test_resolve_range(name, rng, today, expected):
    assert resolve_range(rng, today) == expected


BUCKETS = [
    ("months over a year boundary", "month", date(2025, 10, 1), date(2026, 9, 15),
     ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
      "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]),
    ("ISO weeks start on Monday, including the one before 1 January",
     "week", date(2026, 1, 1), date(2026, 1, 20),
     ["2025-12-29", "2026-01-05", "2026-01-12", "2026-01-19"]),
    ("days across a month end", "day", date(2026, 2, 27), date(2026, 3, 2),
     ["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]),
    ("quarters", "quarter", date(2026, 2, 1), date(2026, 8, 31),
     ["2026-Q1", "2026-Q2", "2026-Q3"]),
    ("years", "year", date(2024, 6, 1), date(2026, 3, 1), ["2024", "2025", "2026"]),
    ("a single bucket when both ends fall inside it", "month", date(2026, 5, 3), date(2026, 5, 29),
     ["2026-05"]),
]


@pytest.mark.parametrize(
    "name, interval, start, end, expected", BUCKETS, ids=[b[0] for b in BUCKETS]
)
def test_bucket_starts(name, interval, start, end, expected):
    assert bucket_starts(interval, start, end) == expected


@pytest.mark.parametrize(
    "name, interval, start, end, expected", BUCKETS, ids=[b[0] for b in BUCKETS]
)
def test_bucket_count_agrees_with_bucket_starts(name, interval, start, end, expected):
    assert bucket_count(interval, start, end) == len(expected)


def test_bucket_count_does_not_build_the_list():
    """The executor's cap must be checkable before a pathological range allocates anything."""
    assert bucket_count("day", date(1, 1, 1), date(9999, 12, 31)) == 3652059


def test_bucket_start_truncates_like_date_trunc():
    assert bucket_start("week", date(2026, 9, 1)) == date(2026, 8, 31)  # a Tuesday -> its Monday
    assert bucket_start("month", date(2026, 9, 15)) == date(2026, 9, 1)
    assert bucket_start("quarter", date(2026, 9, 15)) == date(2026, 7, 1)
    assert bucket_start("year", date(2026, 9, 15)) == date(2026, 1, 1)
    assert bucket_start("day", date(2026, 9, 15)) == date(2026, 9, 15)


def test_period_key_formats_match_the_result_shape_contract():
    assert period_key("day", date(2026, 7, 13)) == "2026-07-13"
    assert period_key("week", date(2026, 7, 13)) == "2026-07-13"
    assert period_key("month", date(2026, 7, 1)) == "2026-07"
    assert period_key("quarter", date(2026, 7, 1)) == "2026-Q3"
    assert period_key("year", date(2026, 1, 1)) == "2026"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_ranges.py -q`
Expected: FAIL at collection with `ModuleNotFoundError: No module named 'analytics.ranges'`

- [ ] **Step 3: Write the range module**

Create `analytics/src/analytics/ranges.py`:

```python
"""Range resolution and bucket keys (docs/INSIGHTS.md "Plan DSL v1" → range, "Result shapes").

This module is the *only* place a bucket key is formatted. The SQL returns the truncated bucket
as a plain date and the executor formats it here, so the keys rows carry and the keys empty
buckets are filled with can never drift apart.
"""

from __future__ import annotations

from datetime import date, timedelta

from analytics.plan import Range

# range: "all" has no bounds. These sentinels keep one code path in the SQL builder: Postgres
# DATE spans 4713 BC … 5874897 AD, so BETWEEN over them matches every row.
ALL_START = date.min
ALL_END = date.max


def resolve_range(rng: Range, today: date) -> tuple[date, date]:
    """Inclusive [from, to] over txn.occurred_on. `today` is the injectable clock (spec D6),
    read in the instance's timezone — never the database's."""
    if rng.type == "lastMonths":
        # n buckets total (spec D5): n-1 complete months plus the current partial one.
        return _shift_months(today.replace(day=1), -(rng.n - 1)), today
    if rng.type == "yearToDate":
        return date(today.year, 1, 1), today
    if rng.type == "absolute":
        return rng.start, rng.end
    return ALL_START, ALL_END


def bucket_start(interval: str, day: date) -> date:
    """The start of the bucket containing `day`, matching Postgres date_trunc exactly —
    including its ISO/Monday-start weeks."""
    if interval == "day":
        return day
    if interval == "week":
        return day - timedelta(days=day.weekday())
    if interval == "month":
        return day.replace(day=1)
    if interval == "quarter":
        return date(day.year, (day.month - 1) // 3 * 3 + 1, 1)
    return date(day.year, 1, 1)


def period_key(interval: str, start: date) -> str:
    """A bucket's wire format (docs/INSIGHTS.md → Result shapes)."""
    if interval in ("day", "week"):
        return start.isoformat()
    if interval == "month":
        return f"{start.year:04d}-{start.month:02d}"
    if interval == "quarter":
        return f"{start.year:04d}-Q{(start.month - 1) // 3 + 1}"
    return f"{start.year:04d}"


def bucket_count(interval: str, start: date, end: date) -> int:
    """How many buckets `bucket_starts` would produce, without producing them — the executor's
    cap has to be checkable before a pathological range allocates a list."""
    first, last = bucket_start(interval, start), bucket_start(interval, end)
    if interval == "day":
        return (last - first).days + 1
    if interval == "week":
        return (last - first).days // 7 + 1
    months = (last.year - first.year) * 12 + (last.month - first.month)
    if interval == "month":
        return months + 1
    if interval == "quarter":
        return months // 3 + 1
    return last.year - first.year + 1


def bucket_starts(interval: str, start: date, end: date) -> list[str]:
    """Every bucket key from the one containing `start` to the one containing `end`, gap-free.
    This is the x-axis every timeseries — and every series of a timeseriesSplit (spec D4) —
    emits a point for."""
    keys: list[str] = []
    current, last = bucket_start(interval, start), bucket_start(interval, end)
    while current <= last:
        keys.append(period_key(interval, current))
        current = _advance(interval, current)
    return keys


def _advance(interval: str, start: date) -> date:
    if interval == "day":
        return start + timedelta(days=1)
    if interval == "week":
        return start + timedelta(days=7)
    return _shift_months(start, {"month": 1, "quarter": 3, "year": 12}[interval])


def _shift_months(first_of_month: date, months: int) -> date:
    """Month arithmetic on a first-of-month date, which never needs end-of-month clamping."""
    total = first_of_month.year * 12 + (first_of_month.month - 1) + months
    return date(total // 12, total % 12 + 1, 1)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_ranges.py -q`
Expected: PASS (23 passed)

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/src/analytics/ranges.py analytics/tests/test_ranges.py
git commit -m "feat(analytics): range resolution and gap-free bucket keys"
```

---


### Task 22: [MY-31] Strict plan validation returning a problem list

**Files:**
- Create: `analytics/src/analytics/validation.py`
- Create: `analytics/tests/test_validation.py`

**Interfaces:**
- Consumes: `analytics.plan` (`SUPPORTED_VERSIONS`, `METRICS`, `GROUP_BYS`, `INTERVALS`, `RANGE_TYPES`); the `conn` and `dsn` fixtures from Task 18 (profile 1 owns category `10`; profile 2 owns category `90`).
- Produces (`analytics.validation`):
  `validate_plan(raw: object, *, profile_id: int, conn, merchant_enabled: bool) -> list[str]` — empty list means executable;
  `MERCHANT_UNAVAILABLE: str` — the one message shared by `filters.merchants` and `groupBy: "merchant"` (spec D2).

- [ ] **Step 1: Write the failing test**

Create `analytics/tests/test_validation.py`:

```python
"""Table-driven plan-problem tests, backup-validator style: every violation is one string that
pinpoints the field, and nothing is silently ignored."""

import pytest

from analytics.validation import MERCHANT_UNAVAILABLE, validate_plan

VALID = {
    "version": 1,
    "metric": "spend",
    "filters": {"categoryId": 10, "includeDescendants": True, "currency": "PLN"},
    "groupBy": "category",
    "interval": "month",
    "range": {"type": "lastMonths", "n": 12},
}

CASES = [
    ("a minimal plan is valid",
     {"version": 1, "metric": "net", "range": {"type": "all"}}, []),
    ("not an object", [1, 2, 3], ["plan: must be a JSON object"]),
    ("unknown top-level field",
     {"version": 1, "metric": "spend", "range": {"type": "all"}, "split": "merchant"},
     ["split: unknown field"]),
    ("missing version",
     {"metric": "spend", "range": {"type": "all"}}, ["version: is required"]),
    ("unsupported version",
     {"version": 2, "metric": "spend", "range": {"type": "all"}},
     ["version: unsupported plan version 2"]),
    ("true is not version 1",
     {"version": True, "metric": "spend", "range": {"type": "all"}},
     ["version: must be an integer"]),
    ("missing metric", {"version": 1, "range": {"type": "all"}}, ["metric: is required"]),
    ("unknown metric",
     {"version": 1, "metric": "savings", "range": {"type": "all"}},
     ["metric: must be one of spend, income, net"]),
    ("unknown groupBy",
     {"version": 1, "metric": "spend", "groupBy": "currency", "range": {"type": "all"}},
     ["groupBy: must be one of category, merchant, or null"]),
    ("merchant grouping is not available yet",
     {"version": 1, "metric": "spend", "groupBy": "merchant", "range": {"type": "all"}},
     [f"groupBy: {MERCHANT_UNAVAILABLE}"]),
    ("merchant filtering and grouping are not available yet",
     {"version": 1, "metric": "spend", "filters": {"merchants": ["Lidl"]},
      "range": {"type": "all"}},
     [f"filters.merchants: {MERCHANT_UNAVAILABLE}"]),
    ("unknown interval",
     {"version": 1, "metric": "spend", "interval": "fortnight", "range": {"type": "all"}},
     ["interval: must be one of day, week, month, quarter, year, or null"]),
    ("unknown filter field",
     {"version": 1, "metric": "spend", "filters": {"minAmount": 5}, "range": {"type": "all"}},
     ["filters.minAmount: unknown field"]),
    ("categoryId from another profile is not in this one",
     {"version": 1, "metric": "spend", "filters": {"categoryId": 90}, "range": {"type": "all"}},
     ["filters.categoryId: 90 does not exist in this profile"]),
    ("stale categoryId",
     {"version": 1, "metric": "spend", "filters": {"categoryId": 999}, "range": {"type": "all"}},
     ["filters.categoryId: 999 does not exist in this profile"]),
    ("categoryId must be an integer",
     {"version": 1, "metric": "spend", "filters": {"categoryId": "10"}, "range": {"type": "all"}},
     ["filters.categoryId: must be an integer"]),
    ("includeDescendants must be a boolean",
     {"version": 1, "metric": "spend", "filters": {"includeDescendants": "yes"},
      "range": {"type": "all"}},
     ["filters.includeDescendants: must be true or false"]),
    ("lowercase currency",
     {"version": 1, "metric": "spend", "filters": {"currency": "pln"},
      "range": {"type": "all"}},
     ["filters.currency: must be a three-letter ISO 4217 code"]),
    ("missing range", {"version": 1, "metric": "spend"}, ["range: is required"]),
    ("unknown range type",
     {"version": 1, "metric": "spend", "range": {"type": "sinceForever"}},
     ["range.type: must be one of lastMonths, yearToDate, absolute, all"]),
    ("lastMonths needs a positive n",
     {"version": 1, "metric": "spend", "range": {"type": "lastMonths", "n": 0}},
     ["range.n: must be a positive integer"]),
    ("true is not a bucket count",
     {"version": 1, "metric": "spend", "range": {"type": "lastMonths", "n": True}},
     ["range.n: must be a positive integer"]),
    ("a field that belongs to another range type",
     {"version": 1, "metric": "spend", "range": {"type": "yearToDate", "n": 3}},
     ["range.n: unknown field for a yearToDate range"]),
    ("absolute needs both ends",
     {"version": 1, "metric": "spend", "range": {"type": "absolute", "from": "2026-01-01"}},
     ["range.to: is required, as an ISO date like 2026-01-31"]),
    ("from after to",
     {"version": 1, "metric": "spend",
      "range": {"type": "absolute", "from": "2026-06-30", "to": "2026-01-01"}},
     ["range: from must not be after to"]),
    ("several problems are reported together",
     {"version": 9, "metric": "savings", "range": {"type": "all"}, "zoom": 2},
     ["zoom: unknown field",
      "version: unsupported plan version 9",
      "metric: must be one of spend, income, net"]),
]


@pytest.mark.parametrize("name, raw, expected", CASES, ids=[c[0] for c in CASES])
def test_validate_plan(name, raw, expected, conn):
    assert validate_plan(raw, profile_id=1, conn=conn, merchant_enabled=False) == expected


def test_the_canonical_plan_is_valid(conn):
    assert validate_plan(VALID, profile_id=1, conn=conn, merchant_enabled=False) == []


def test_merchants_are_accepted_once_the_column_lands(conn):
    """MY-33 flips the flag; this pins that nothing else about the field changes."""
    raw = {"version": 1, "metric": "spend", "filters": {"merchants": ["Lidl", "Biedronka"]},
           "range": {"type": "all"}}
    assert validate_plan(raw, profile_id=1, conn=conn, merchant_enabled=True) == []
    assert validate_plan({**raw, "filters": {"merchants": []}}, profile_id=1, conn=conn,
                         merchant_enabled=True) == [
        "filters.merchants: must be a non-empty array of merchant names"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_validation.py -q`
Expected: FAIL at collection with `ModuleNotFoundError: No module named 'analytics.validation'`

- [ ] **Step 3: Write the validator**

Create `analytics/src/analytics/validation.py`:

```python
"""Strict structural validation of a plan (docs/INSIGHTS.md "Plan DSL v1").

Every violation becomes one human-readable string pinpointing the field — the same style as the
backend's BackupValidator — and an empty list means the plan is executable. Nothing is silently
ignored: a field the executor does not understand is a rejection, because a chart that quietly
dropped a filter is a wrong chart.

Range-dependent limits (the bucket cap) need the clock, which this signature deliberately does
not take; they live in `executor.execute`.
"""

from __future__ import annotations

import re
from datetime import date

from analytics.plan import (
    GROUP_BYS,
    INTERVALS,
    METRICS,
    RANGE_TYPES,
    SUPPORTED_VERSIONS,
)

TOP_LEVEL_FIELDS = ("version", "metric", "filters", "groupBy", "interval", "range")
FILTER_FIELDS = ("categoryId", "includeDescendants", "merchants", "currency")
RANGE_FIELDS = {
    "lastMonths": ("type", "n"),
    "yearToDate": ("type",),
    "absolute": ("type", "from", "to"),
    "all": ("type",),
}

# spec D2: the merchant filter and the merchant grouping axis need the same V5 column, so they
# are rejected with the same message until MY-33 flips plan.MERCHANT_ENABLED.
MERCHANT_UNAVAILABLE = "merchant filtering and grouping are not available yet"

CURRENCY = re.compile(r"^[A-Z]{3}$")


def validate_plan(raw: object, *, profile_id: int, conn, merchant_enabled: bool) -> list[str]:
    """Returns a list of problem strings; empty means valid."""
    if not isinstance(raw, dict):
        return ["plan: must be a JSON object"]

    problems: list[str] = []
    for field in sorted(raw):
        if field not in TOP_LEVEL_FIELDS:
            problems.append(f"{field}: unknown field")

    _check_version(raw, problems)
    _check_enum(raw, "metric", METRICS, required=True, problems=problems)
    _check_enum(raw, "groupBy", GROUP_BYS, required=False, problems=problems)
    _check_enum(raw, "interval", INTERVALS, required=False, problems=problems)
    if raw.get("groupBy") == "merchant" and not merchant_enabled:
        problems.append(f"groupBy: {MERCHANT_UNAVAILABLE}")

    _check_filters(raw.get("filters"), profile_id, conn, merchant_enabled, problems)
    _check_range(raw.get("range"), problems)
    return problems


def _is_int(value: object) -> bool:
    """`isinstance(True, int)` is True and `1.0 == 1`, so neither an id nor a bucket count can
    be checked with isinstance. Python's bool-is-an-int is the trap; SQL has no such thing."""
    return type(value) is int


def _check_version(raw: dict, problems: list[str]) -> None:
    if "version" not in raw:
        problems.append("version: is required")
    elif not _is_int(raw["version"]):
        problems.append("version: must be an integer")
    elif raw["version"] not in SUPPORTED_VERSIONS:
        # Saved insights outlive the DSL; an unknown version is rejected, never guessed at.
        problems.append(f"version: unsupported plan version {raw['version']}")


def _check_enum(raw: dict, field: str, allowed: tuple[str, ...], *, required: bool,
                problems: list[str]) -> None:
    value = raw.get(field)
    if value is None:
        if required:
            problems.append(f"{field}: is required")
        return
    if not isinstance(value, str) or value not in allowed:
        options = ", ".join(allowed) + ("" if required else ", or null")
        problems.append(f"{field}: must be one of {options}")


def _check_filters(filters: object, profile_id: int, conn, merchant_enabled: bool,
                   problems: list[str]) -> None:
    if filters is None:
        return
    if not isinstance(filters, dict):
        problems.append("filters: must be a JSON object")
        return

    for field in sorted(filters):
        if field not in FILTER_FIELDS:
            problems.append(f"filters.{field}: unknown field")

    category_id = filters.get("categoryId")
    if category_id is not None:
        if not _is_int(category_id):
            problems.append("filters.categoryId: must be an integer")
        elif not _category_exists(conn, profile_id, category_id):
            problems.append(f"filters.categoryId: {category_id} does not exist in this profile")

    include = filters.get("includeDescendants")
    if include is not None and not isinstance(include, bool):
        problems.append("filters.includeDescendants: must be true or false")

    merchants = filters.get("merchants")
    if merchants is not None:
        if not merchant_enabled:
            problems.append(f"filters.merchants: {MERCHANT_UNAVAILABLE}")
        elif not (isinstance(merchants, list) and merchants
                  and all(isinstance(m, str) and m.strip() for m in merchants)):
            problems.append("filters.merchants: must be a non-empty array of merchant names")

    currency = filters.get("currency")
    if currency is not None and not (isinstance(currency, str) and CURRENCY.match(currency)):
        problems.append("filters.currency: must be a three-letter ISO 4217 code")


def _category_exists(conn, profile_id: int, category_id: int) -> bool:
    """Profile-scoped by construction: another profile's category is simply not found, which is
    the same answer a deleted one gets (docs/INSIGHTS.md "Plans are loosely coupled")."""
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM category WHERE id = %s AND profile_id = %s",
                    (category_id, profile_id))
        return cur.fetchone() is not None


def _check_range(rng: object, problems: list[str]) -> None:
    if rng is None:
        problems.append("range: is required")
        return
    if not isinstance(rng, dict):
        problems.append("range: must be a JSON object")
        return

    kind = rng.get("type")
    if not isinstance(kind, str) or kind not in RANGE_TYPES:
        problems.append(f"range.type: must be one of {', '.join(RANGE_TYPES)}")
        return

    for field in sorted(rng):
        if field not in RANGE_FIELDS[kind]:
            problems.append(f"range.{field}: unknown field for a {kind} range")

    if kind == "lastMonths":
        n = rng.get("n")
        if not _is_int(n) or n < 1:
            problems.append("range.n: must be a positive integer")
    elif kind == "absolute":
        start = _parse_date(rng.get("from"), "range.from", problems)
        end = _parse_date(rng.get("to"), "range.to", problems)
        if start is not None and end is not None and start > end:
            problems.append("range: from must not be after to")


def _parse_date(value: object, at: str, problems: list[str]) -> date | None:
    if not isinstance(value, str):
        problems.append(f"{at}: is required, as an ISO date like 2026-01-31")
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        problems.append(f"{at}: is not an ISO date like 2026-01-31")
        return None
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_validation.py -q`
Expected: PASS (28 passed)

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/src/analytics/validation.py analytics/tests/test_validation.py
git commit -m "feat(analytics): strict plan validation with a problem list"
```

---


### Task 23: [MY-31] Profile-scoped SQL builder — the two category CTEs, metric expressions, bucketing

**Files:**
- Create: `analytics/src/analytics/sql.py`
- Create: `analytics/tests/test_sql.py`
- Modify: `docs/INSIGHTS.md` (the `groupBy` row of the "Plan DSL v1" table — one sentence)

**Interfaces:**
- Consumes: `analytics.plan.Plan` / `parse_plan`; the `conn` fixture from Task 18.
- Produces (`analytics.sql`):
  `build_query(plan: Plan, profile_id: int, start: date, end: date) -> tuple[str, dict]` — SQL text plus a named-parameter dict; the statement always returns exactly five columns in this order: `currency` (`char(3)`), `bucket` (`date` or `NULL` when `interval` is null), `group_key` (`text` or `NULL` when `groupBy` is null), `group_label` (`text` or `NULL`), `total` (`numeric(19,4)`).
  Nothing here opens a cursor.

- [ ] **Step 1: Write the failing test**

Create `analytics/tests/test_sql.py`:

```python
"""The SQL layer, executed against the seeded container: assertions are on raw rows, so a
failure here points at the SQL rather than at the envelope shaping built on top of it."""

from datetime import date
from decimal import Decimal

from analytics import sql
from analytics.plan import parse_plan

JULY = (date(2026, 7, 1), date(2026, 7, 31))
SEPTEMBER = (date(2026, 9, 1), date(2026, 9, 30))
EVERYTHING = (date(2025, 1, 1), date(2026, 12, 31))


def run(conn, raw, profile_id, window):
    query, params = sql.build_query(parse_plan(raw), profile_id, *window)
    with conn.cursor() as cur:
        cur.execute(query, params)
        return cur.fetchall()


def test_value_shape_returns_one_row_per_currency(conn):
    rows = run(conn, {"version": 1, "metric": "spend",
                      "filters": {"categoryId": 10}, "range": {"type": "all"}},
               1, (date(2026, 8, 1), date(2026, 8, 31)))
    assert sorted(rows) == [
        ("EUR", None, None, None, Decimal("10.0000")),
        ("PLN", None, None, None, Decimal("200.0000")),
    ]


def test_totals_keep_scale_four(conn):
    rows = run(conn, {"version": 1, "metric": "spend", "filters": {"currency": "PLN"},
                      "range": {"type": "all"}}, 1, JULY)
    assert str(rows[0][4]) == "150.0000"


def test_the_subtree_filter_rolls_up_descendants(conn):
    rows = run(conn, {"version": 1, "metric": "spend",
                      "filters": {"categoryId": 10, "includeDescendants": True,
                                  "currency": "PLN"},
                      "range": {"type": "all"}}, 1, SEPTEMBER)
    assert rows == [("PLN", None, None, None, Decimal("325.0000"))]


def test_include_descendants_false_takes_only_direct_transactions(conn):
    rows = run(conn, {"version": 1, "metric": "spend",
                      "filters": {"categoryId": 10, "includeDescendants": False,
                                  "currency": "PLN"},
                      "range": {"type": "all"}}, 1, SEPTEMBER)
    assert rows == [("PLN", None, None, None, Decimal("25.0000"))]


def test_nothing_from_another_profile_leaks_in(conn):
    """Profile 2 holds a 9999.00 PLN September expense; profile 1's total must not see it."""
    plan = {"version": 1, "metric": "spend", "filters": {"currency": "PLN"},
            "range": {"type": "all"}}
    assert run(conn, plan, 1, SEPTEMBER)[0][4] == Decimal("1190.0000")
    assert run(conn, plan, 2, SEPTEMBER)[0][4] == Decimal("9999.0000")


def test_group_by_category_under_a_filter_keeps_the_parent_s_own_transactions(conn):
    """Children each carry their own subtree; the filtered category itself is one more group,
    so the groups partition the filtered set instead of quietly dropping row 107."""
    rows = run(conn, {"version": 1, "metric": "spend",
                      "filters": {"categoryId": 10, "currency": "PLN"},
                      "groupBy": "category", "range": {"type": "all"}}, 1, EVERYTHING)
    assert sorted(rows, key=lambda r: r[2]) == [
        ("PLN", None, "10", "Groceries", Decimal("25.0000")),
        ("PLN", None, "11", "Lidl", Decimal("370.0000")),
        ("PLN", None, "12", "Biedronka", Decimal("480.0000")),
    ]


def test_group_by_category_without_a_filter_groups_by_roots(conn):
    rows = run(conn, {"version": 1, "metric": "spend", "filters": {"currency": "PLN"},
                      "groupBy": "category", "range": {"type": "all"}}, 1, SEPTEMBER)
    assert sorted(rows, key=lambda r: r[2]) == [
        ("PLN", None, "10", "Groceries", Decimal("325.0000")),
        ("PLN", None, "20", "Transport", Decimal("400.0000")),
        ("PLN", None, "40", "Many", Decimal("465.0000")),
    ]


def test_month_buckets_come_back_as_truncated_dates(conn):
    rows = run(conn, {"version": 1, "metric": "spend",
                      "filters": {"categoryId": 10, "currency": "PLN"},
                      "interval": "month", "range": {"type": "all"}}, 1, EVERYTHING)
    assert sorted(rows, key=lambda r: r[1]) == [
        ("PLN", date(2025, 10, 1), None, None, Decimal("70.0000")),
        ("PLN", date(2025, 12, 1), None, None, Decimal("130.0000")),
        ("PLN", date(2026, 7, 1), None, None, Decimal("150.0000")),
        ("PLN", date(2026, 8, 1), None, None, Decimal("200.0000")),
        ("PLN", date(2026, 9, 1), None, None, Decimal("325.0000")),
    ]


def test_week_buckets_start_on_monday(conn):
    rows = run(conn, {"version": 1, "metric": "spend",
                      "filters": {"categoryId": 12, "currency": "PLN"},
                      "interval": "week", "range": {"type": "all"}}, 1, SEPTEMBER)
    assert rows == [("PLN", date(2026, 8, 31), None, None, Decimal("300.0000"))]


def test_income_metric_selects_the_other_direction(conn):
    rows = run(conn, {"version": 1, "metric": "income", "filters": {"currency": "PLN"},
                      "range": {"type": "all"}}, 1, SEPTEMBER)
    assert rows == [("PLN", None, None, None, Decimal("5000.0000"))]


def test_net_is_income_minus_spend_and_may_be_negative(conn):
    rows = run(conn, {"version": 1, "metric": "net", "filters": {"currency": "PLN"},
                      "range": {"type": "all"}}, 1, JULY)
    assert rows == [("PLN", None, None, None, Decimal("-150.0000"))]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_sql.py -q`
Expected: FAIL at collection with `ModuleNotFoundError: No module named 'analytics.sql'`

- [ ] **Step 3: Write the SQL builder**

Create `analytics/src/analytics/sql.py`. Two notes for the reader of this diff, both deliberate:
the builder does **not** use `generate_series` to fill gap buckets (the executor fills them in
Python so that one formatter — `ranges.period_key` — produces both the keys rows carry and the
keys empty buckets get); and the `groupBy: "category"` CTE makes the filtered category its own
group, which the survey sketch did not (see the doc edit in Step 5).

```python
"""SQL text for the executor — builders only, nothing here opens a cursor.

Every statement is parameterized and carries profile_id in the outer query *and* in both terms
of any recursive CTE (docs/SCHEMA.md "Hierarchy queries"): the composite FKs already make a
cross-profile subtree impossible, so this is belt-and-braces on a security boundary, and it
keeps each query correct in isolation — hand-written SQL bypasses JPA's usual guardrails.

Gap buckets are not filled here. The SQL returns the truncated bucket as a plain date and
`ranges.period_key` formats it, so the keys rows carry and the keys the executor zero-fills with
come from one formatter instead of two (a `to_char` and its Python twin) that can drift.
"""

from __future__ import annotations

from datetime import date

from analytics.plan import Plan

# filters.categoryId is a *filter* over a subtree (docs/SCHEMA.md query 1).
_SUBTREE_CTE = """subtree AS (
    SELECT id FROM category WHERE id = %(category_id)s AND profile_id = %(profile_id)s
    UNION ALL
    SELECT c.id FROM category c JOIN subtree s ON c.parent_id = s.id
     WHERE c.profile_id = %(profile_id)s
)"""

# groupBy: "category" is a different CTE: it carries a group key down the tree so every
# category maps to the top-level group it rolls up into.
_GROUP_MAP_CTE = """group_map AS (
    -- Anchor: the filtered category itself, or every root when there is no filter. Each anchor
    -- is its own group, so transactions filed directly on the filtered category are not lost.
    SELECT id, id AS group_id
      FROM category
     WHERE profile_id = %(profile_id)s
       AND (%(category_id)s::bigint IS NULL AND parent_id IS NULL
            OR id = %(category_id)s)
    UNION ALL
    -- A direct child of the filtered category opens its own group; anything deeper inherits.
    SELECT c.id,
           CASE WHEN %(category_id)s::bigint IS NOT NULL AND g.id = %(category_id)s
                THEN c.id ELSE g.group_id END
      FROM category c JOIN group_map g ON c.parent_id = g.id
     WHERE c.profile_id = %(profile_id)s
)"""

# SUM over NUMERIC(19,4) keeps scale 4, so a bucket serialises as "243.5000" for free. The
# explicit cast is what keeps net's subtraction — and COALESCE's integer 0 fallback — at that
# same scale instead of serialising "0" and breaking the wire contract.
_METRIC_EXPRESSIONS = {
    "spend": "SUM(t.amount)::numeric(19,4)",
    "income": "SUM(t.amount)::numeric(19,4)",
    "net": ("(COALESCE(SUM(t.amount) FILTER (WHERE t.txn_type = 'INCOME'), 0)"
            " - COALESCE(SUM(t.amount) FILTER (WHERE t.txn_type = 'EXPENSE'), 0))"
            "::numeric(19,4)"),
}


def build_query(plan: Plan, profile_id: int, start: date, end: date) -> tuple[str, dict]:
    """The one statement every shape is computed from: five columns, always grouped by currency
    because currencies never mix (ARCHITECTURE.md §3)."""
    params: dict = {
        "profile_id": profile_id,
        "from_date": start,
        "to_date": end,
        "category_id": plan.filters.category_id,
    }
    ctes: list[str] = []
    where = ["t.profile_id = %(profile_id)s",
             "t.occurred_on BETWEEN %(from_date)s AND %(to_date)s"]

    if plan.metric == "spend":
        where.append("t.txn_type = 'EXPENSE'")
    elif plan.metric == "income":
        where.append("t.txn_type = 'INCOME'")

    if plan.filters.currency is not None:
        params["currency"] = plan.filters.currency
        where.append("t.currency = %(currency)s")

    if plan.filters.category_id is not None:
        if not plan.filters.include_descendants:
            where.append("t.category_id = %(category_id)s")
        elif plan.group_by != "category":
            # With groupBy: "category" the group join already restricts to the subtree, so the
            # filter CTE would only repeat the work.
            ctes.append(_SUBTREE_CTE)
            where.append("t.category_id IN (SELECT id FROM subtree)")

    if plan.group_by == "category":
        ctes.append(_GROUP_MAP_CTE)
        join = ("\n       JOIN group_map g ON g.id = t.category_id"
                "\n       JOIN category gc ON gc.id = g.group_id")
        group_key, group_label = "gc.id::text", "gc.name"
    else:
        join, group_key, group_label = "", "NULL::text", "NULL::text"

    # plan.interval is one of the validated INTERVALS, so it is safe to interpolate; every
    # value that came from the user travels as a bound parameter.
    bucket = (f"date_trunc('{plan.interval}', t.occurred_on)::date"
              if plan.interval is not None else "NULL::date")

    prefix = "WITH RECURSIVE " + ",\n".join(ctes) + "\n" if ctes else ""
    return prefix + (
        f"SELECT t.currency AS currency,\n"
        f"       {bucket} AS bucket,\n"
        f"       {group_key} AS group_key,\n"
        f"       {group_label} AS group_label,\n"
        f"       {_METRIC_EXPRESSIONS[plan.metric]} AS total\n"
        f"  FROM txn t{join}\n"
        f" WHERE " + "\n   AND ".join(where) + "\n"
        # By position, because two of the four axis columns are NULL constants when the plan
        # does not use that axis.
        " GROUP BY 1, 2, 3, 4"
    ), params
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_sql.py -q`
Expected: PASS (11 passed)

- [ ] **Step 5: Record the grouping semantics in the design doc**

In `docs/INSIGHTS.md`, "Plan DSL v1" table, the `groupBy` row: replace the sentence

> each child including its own subtree — matching the dashboard's rollup.

with

> each child including its own subtree, plus the filtered category itself as one more group
> holding the transactions filed directly on it — so the groups partition the filtered set
> exactly rather than silently dropping those rows, matching the dashboard's rollup.

- [ ] **Step 6: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/src/analytics/sql.py analytics/tests/test_sql.py docs/INSIGHTS.md
git commit -m "feat(analytics): profile-scoped SQL builder for the plan DSL"
```

---


### Task 24: [MY-31] Executor — the four result shapes, zero-filled buckets, and the bucket cap

**Files:**
- Create: `analytics/src/analytics/executor.py`
- Create: `analytics/tests/test_executor.py`
- Modify: `docs/INSIGHTS.md` ("Execution semantics" — extend the "Bounded output" bullet, add one bullet about `range: all`)

**Interfaces:**
- Consumes: `analytics.validation.validate_plan`, `analytics.plan.parse_plan` / `Plan.to_json`, `analytics.ranges.resolve_range` / `bucket_starts` / `bucket_count` / `period_key`, `analytics.sql.build_query`; the `conn` and `today` fixtures from Task 18.
- Produces (`analytics.executor`):
  `execute(conn, profile_id: int, raw_plan: object, *, today: date, merchant_enabled: bool) -> dict` — the envelope `{"plan": …, "results": [...], "meta": {"truncatedGroups": bool}}`;
  `class PlanProblems(Exception)` with a `problems: list[str]` attribute;
  constants `ZERO = "0.0000"`, `MAX_BUCKETS = 1000`.

- [ ] **Step 1: Write the failing test**

Create `analytics/tests/test_executor.py`:

```python
"""Envelope shaping: the four shapes, zero-filled buckets, and the limits."""

import pytest

from analytics.executor import PlanProblems, execute


def run(conn, raw, today, profile_id=1):
    return execute(conn, profile_id, raw, today=today, merchant_enabled=False)


def test_value_shape(conn, today):
    envelope = run(conn, {"version": 1, "metric": "net", "filters": {"currency": "PLN"},
                          "range": {"type": "lastMonths", "n": 1}}, today)
    assert envelope["results"] == [
        {"currency": "PLN", "shape": "value", "value": "3810.0000"}]
    assert envelope["meta"] == {"truncatedGroups": False}


def test_timeseries_zero_fills_every_bucket_in_the_range(conn, today):
    envelope = run(conn, {"version": 1, "metric": "spend",
                          "filters": {"categoryId": 10, "currency": "PLN"},
                          "interval": "month",
                          "range": {"type": "lastMonths", "n": 12}}, today)
    assert envelope["results"] == [{
        "currency": "PLN", "shape": "timeseries", "points": [
            {"period": "2025-10", "value": "70.0000"},
            {"period": "2025-11", "value": "0.0000"},
            {"period": "2025-12", "value": "130.0000"},
            {"period": "2026-01", "value": "0.0000"},
            {"period": "2026-02", "value": "0.0000"},
            {"period": "2026-03", "value": "0.0000"},
            {"period": "2026-04", "value": "0.0000"},
            {"period": "2026-05", "value": "0.0000"},
            {"period": "2026-06", "value": "0.0000"},
            {"period": "2026-07", "value": "150.0000"},
            {"period": "2026-08", "value": "200.0000"},
            {"period": "2026-09", "value": "325.0000"},
        ]}]


def test_breakdown_is_sorted_by_absolute_value(conn, today):
    envelope = run(conn, {"version": 1, "metric": "spend", "filters": {"currency": "PLN"},
                          "groupBy": "category",
                          "range": {"type": "lastMonths", "n": 1}}, today)
    assert envelope["results"] == [{
        "currency": "PLN", "shape": "breakdown", "groups": [
            {"key": "40", "label": "Many", "value": "465.0000"},
            {"key": "20", "label": "Transport", "value": "400.0000"},
            {"key": "10", "label": "Groceries", "value": "325.0000"},
        ]}]


def test_timeseries_split_zero_fills_per_series(conn, today):
    envelope = run(conn, {"version": 1, "metric": "spend", "filters": {"currency": "PLN"},
                          "groupBy": "category", "interval": "month",
                          "range": {"type": "lastMonths", "n": 2}}, today)
    assert envelope["results"] == [{
        "currency": "PLN", "shape": "timeseriesSplit", "series": [
            {"key": "10", "label": "Groceries", "points": [
                {"period": "2026-08", "value": "200.0000"},
                {"period": "2026-09", "value": "325.0000"}]},
            {"key": "40", "label": "Many", "points": [
                {"period": "2026-08", "value": "0.0000"},
                {"period": "2026-09", "value": "465.0000"}]},
            {"key": "20", "label": "Transport", "points": [
                {"period": "2026-08", "value": "0.0000"},
                {"period": "2026-09", "value": "400.0000"}]},
        ]}]


def test_one_result_per_currency_sorted_by_code(conn, today):
    envelope = run(conn, {"version": 1, "metric": "spend", "filters": {"categoryId": 10},
                          "range": {"type": "absolute", "from": "2026-08-01",
                                    "to": "2026-08-31"}}, today)
    assert [r["currency"] for r in envelope["results"]] == ["EUR", "PLN"]
    assert [r["value"] for r in envelope["results"]] == ["10.0000", "200.0000"]


def test_range_all_spans_only_the_buckets_that_hold_rows(conn, today):
    envelope = run(conn, {"version": 1, "metric": "spend",
                          "filters": {"categoryId": 10, "currency": "PLN"},
                          "interval": "year", "range": {"type": "all"}}, today)
    assert envelope["results"] == [{
        "currency": "PLN", "shape": "timeseries", "points": [
            {"period": "2025", "value": "200.0000"},
            {"period": "2026", "value": "675.0000"},
        ]}]


def test_empty_data_is_a_result_not_an_error(conn, today):
    envelope = run(conn, {"version": 1, "metric": "income", "filters": {"categoryId": 20},
                          "range": {"type": "all"}}, today)
    assert envelope == {"plan": {"version": 1, "metric": "income",
                                 "filters": {"categoryId": 20, "includeDescendants": True},
                                 "groupBy": None, "interval": None, "range": {"type": "all"}},
                        "results": [], "meta": {"truncatedGroups": False}}


def test_the_envelope_echoes_the_normalized_plan(conn, today):
    envelope = run(conn, {"version": 1, "metric": "spend", "filters": {"categoryId": 10},
                          "interval": "month", "range": {"type": "lastMonths", "n": 2}}, today)
    assert envelope["plan"] == {
        "version": 1, "metric": "spend",
        "filters": {"categoryId": 10, "includeDescendants": True},
        "groupBy": None, "interval": "month", "range": {"type": "lastMonths", "n": 2}}


def test_an_invalid_plan_raises_the_problem_list(conn, today):
    with pytest.raises(PlanProblems) as caught:
        run(conn, {"version": 1, "metric": "spend", "filters": {"categoryId": 999},
                   "range": {"type": "all"}}, today)
    assert caught.value.problems == [
        "filters.categoryId: 999 does not exist in this profile"]


def test_a_range_that_would_draw_too_many_buckets_is_a_plan_problem(conn, today):
    with pytest.raises(PlanProblems) as caught:
        run(conn, {"version": 1, "metric": "spend", "interval": "day",
                   "range": {"type": "absolute", "from": "1990-01-01",
                             "to": "2026-01-01"}}, today)
    assert caught.value.problems == [
        "range: 13150 day buckets exceeds the limit of 1000; "
        "widen the interval or shorten the range"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_executor.py -q`
Expected: FAIL at collection with `ModuleNotFoundError: No module named 'analytics.executor'`

- [ ] **Step 3: Write the executor**

Create `analytics/src/analytics/executor.py`:

```python
"""Runs a validated plan and shapes the rows into the result envelope
(docs/INSIGHTS.md "Result shapes").

The shape is derived, never declared: interval × groupBy pick one of four.
"""

from __future__ import annotations

from datetime import date

from analytics import sql
from analytics.plan import Plan, parse_plan
from analytics.ranges import bucket_count, bucket_starts, period_key, resolve_range
from analytics.validation import validate_plan

ZERO = "0.0000"

# Same reasoning as BackupValidator's MAX_PROBLEMS and BillingPeriod's bounded loop:
# authenticated input must not choose how many objects the server builds.
MAX_BUCKETS = 1000


class PlanProblems(Exception):
    """A plan that cannot be executed. The route turns `problems` into the 400 body."""

    def __init__(self, problems: list[str]) -> None:
        super().__init__("; ".join(problems))
        self.problems = problems


def execute(conn, profile_id: int, raw_plan: object, *, today: date,
            merchant_enabled: bool) -> dict:
    """Raises PlanProblems(list[str]) on an invalid plan; returns the envelope dict."""
    problems = validate_plan(raw_plan, profile_id=profile_id, conn=conn,
                             merchant_enabled=merchant_enabled)
    if problems:
        raise PlanProblems(problems)

    plan = parse_plan(raw_plan)
    start, end = resolve_range(plan.range, today)
    if plan.interval is not None and plan.range.type != "all":
        _check_bucket_cap(bucket_count(plan.interval, start, end), plan.interval)

    query, params = sql.build_query(plan, profile_id, start, end)
    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()

    periods = _periods(plan, rows, start, end)
    results = [{"currency": currency,
                **_shape(plan, [row for row in rows if row[0] == currency], periods)}
               for currency in sorted({row[0] for row in rows})]
    return {"plan": plan.to_json(), "results": results,
            "meta": {"truncatedGroups": False}}


def _check_bucket_cap(count: int, interval: str) -> None:
    if count > MAX_BUCKETS:
        raise PlanProblems([f"range: {count} {interval} buckets exceeds the limit of "
                            f"{MAX_BUCKETS}; widen the interval or shorten the range"])


def _periods(plan: Plan, rows: list[tuple], start: date, end: date) -> list[str]:
    """The gap-free x-axis every timeseries — and every series of a split (spec D4) — emits a
    point for. A bounded range fills its whole window; `all` has no window, so its extent runs
    from the first bucket that holds a row to the last."""
    if plan.interval is None:
        return []
    if plan.range.type != "all":
        return bucket_starts(plan.interval, start, end)
    buckets = [row[1] for row in rows]
    if not buckets:
        return []
    first, last = min(buckets), max(buckets)
    _check_bucket_cap(bucket_count(plan.interval, first, last), plan.interval)
    return bucket_starts(plan.interval, first, last)


def _shape(plan: Plan, rows: list[tuple], periods: list[str]) -> dict:
    if plan.interval is not None and plan.group_by is not None:
        return _timeseries_split(plan, rows, periods)
    if plan.interval is not None:
        return {"shape": "timeseries", "points": _points(plan, rows, periods)}
    if plan.group_by is not None:
        return _breakdown(rows)
    return {"shape": "value", "value": _amount(rows[0][4])}


def _amount(value) -> str:
    """Decimal in, decimal string at scale 4 out — never a float, never client arithmetic."""
    return f"{value:.4f}"


def _points(plan: Plan, rows: list[tuple], periods: list[str]) -> list[dict]:
    totals = {period_key(plan.interval, row[1]): _amount(row[4]) for row in rows}
    return [{"period": period, "value": totals.get(period, ZERO)} for period in periods]


def _breakdown(rows: list[tuple]) -> dict:
    groups = _rank([(row[2], row[3], row[4]) for row in rows])
    return {"shape": "breakdown",
            "groups": [{"key": key, "label": label, "value": _amount(total)}
                       for key, label, total in groups]}


def _timeseries_split(plan: Plan, rows: list[tuple], periods: list[str]) -> dict:
    by_group: dict[str, dict[str, object]] = {}
    labels: dict[str, str] = {}
    totals: dict[str, object] = {}
    for _currency, bucket, key, label, total in rows:
        labels[key] = label
        by_group.setdefault(key, {})[period_key(plan.interval, bucket)] = total
        totals[key] = totals.get(key, 0) + total
    series = [{"key": key, "label": label,
               "points": [{"period": period,
                           "value": _amount(by_group[key].get(period, 0))}
                          for period in periods]}
              for key, label, _total in _rank([(k, labels[k], totals[k]) for k in totals])]
    return {"shape": "timeseriesSplit", "series": series}


def _rank(totals: list[tuple]) -> list[tuple]:
    """Largest absolute value first; the key breaks ties so the order is reproducible."""
    return sorted(totals, key=lambda item: (-abs(item[2]), item[0]))
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_executor.py -q`
Expected: PASS (10 passed)

- [ ] **Step 5: Record the two new execution rules in the design doc**

In `docs/INSIGHTS.md`, "Execution semantics":

Append to the end of the **Bounded output** bullet:

> The time axis is bounded the same way: a plan whose range and interval would draw more than
> 1,000 buckets is a plan problem (`range: … exceeds the limit of 1000`), not a 40,000-point
> chart.

Add a new bullet immediately after it:

> - **`range: "all"` has no window to fill.** A bounded range emits a point for every bucket
>   between its ends; `all` emits buckets from the first that holds a row to the last, interior
>   gaps still zero-filled, and nothing at all when no row matches.

- [ ] **Step 6: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/src/analytics/executor.py analytics/tests/test_executor.py docs/INSIGHTS.md
git commit -m "feat(analytics): plan executor with the four result shapes and zero-filled buckets"
```

---


### Task 25: [MY-31] Bounded output — top 25 groups, an "Other" aggregate, and `meta.truncatedGroups`

**Files:**
- Modify: `analytics/src/analytics/executor.py` (`execute`, `_shape`, `_breakdown`, `_timeseries_split`; add `_rank_and_cap`)
- Modify: `analytics/tests/test_executor.py` (append two tests)
- Modify: `docs/INSIGHTS.md` (Execution semantics → the "Bounded output" bullet — the cap now covers *both* categorical axes)

**Interfaces:**
- Consumes: `analytics.executor.execute` from the previous task; the `conn` / `today` fixtures.
- Produces: `analytics.executor.MAX_GROUPS = 25` and `OTHER_KEY = "__other__"`; `_shape` now returns `tuple[dict, bool]` (the envelope entry and whether that currency was truncated), and `execute` reports the union in `meta.truncatedGroups`.

- [ ] **Step 1: Write the failing test**

Append to `analytics/tests/test_executor.py`:

```python
def test_breakdown_caps_at_25_groups_plus_an_other_row(conn, today):
    """The 'Many' subtree has 30 children with 1.00 … 30.00 PLN, so the tail is 5+4+3+2+1."""
    envelope = run(conn, {"version": 1, "metric": "spend",
                          "filters": {"categoryId": 40, "currency": "PLN"},
                          "groupBy": "category",
                          "range": {"type": "lastMonths", "n": 1}}, today)
    groups = envelope["results"][0]["groups"]
    assert len(groups) == 26
    assert groups[0] == {"key": "430", "label": "Many 30", "value": "30.0000"}
    assert groups[24] == {"key": "406", "label": "Many 06", "value": "6.0000"}
    assert groups[25] == {"key": "__other__", "label": "Other", "value": "15.0000"}
    assert envelope["meta"] == {"truncatedGroups": True}


def test_timeseries_split_collapses_the_tail_into_one_other_series(conn, today):
    envelope = run(conn, {"version": 1, "metric": "spend",
                          "filters": {"categoryId": 40, "currency": "PLN"},
                          "groupBy": "category", "interval": "month",
                          "range": {"type": "lastMonths", "n": 2}}, today)
    series = envelope["results"][0]["series"]
    assert len(series) == 26
    assert series[25] == {"key": "__other__", "label": "Other", "points": [
        {"period": "2026-08", "value": "0.0000"},
        {"period": "2026-09", "value": "15.0000"}]}
    assert envelope["meta"] == {"truncatedGroups": True}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_executor.py -q -k caps`
Expected: FAIL with `assert 30 == 26`

- [ ] **Step 3: Add the cap**

In `analytics/src/analytics/executor.py`, add the constants next to `MAX_BUCKETS`:

```python
# docs/INSIGHTS.md "Bounded output": a pathological description history must not produce a
# 3,000-series chart. The key is namespaced so a real group can never collide with it.
MAX_GROUPS = 25
OTHER_KEY = "__other__"
```

Replace `execute`'s result assembly and the three shaping functions with:

```python
    periods = _periods(plan, rows, start, end)
    results = []
    truncated = False
    for currency in sorted({row[0] for row in rows}):
        entry, cut = _shape(plan, [row for row in rows if row[0] == currency], periods)
        results.append({"currency": currency, **entry})
        truncated = truncated or cut
    return {"plan": plan.to_json(), "results": results,
            "meta": {"truncatedGroups": truncated}}
```

```python
def _shape(plan: Plan, rows: list[tuple], periods: list[str]) -> tuple[dict, bool]:
    if plan.interval is not None and plan.group_by is not None:
        return _timeseries_split(plan, rows, periods)
    if plan.interval is not None:
        return {"shape": "timeseries", "points": _points(plan, rows, periods)}, False
    if plan.group_by is not None:
        return _breakdown(rows)
    return {"shape": "value", "value": _amount(rows[0][4])}, False


def _breakdown(rows: list[tuple]) -> tuple[dict, bool]:
    kept, other, truncated = _rank_and_cap([(row[2], row[3], row[4]) for row in rows])
    groups = [{"key": key, "label": label, "value": _amount(total)}
              for key, label, total in kept]
    if truncated:
        groups.append({"key": OTHER_KEY, "label": "Other", "value": _amount(other)})
    return {"shape": "breakdown", "groups": groups}, truncated


def _timeseries_split(plan: Plan, rows: list[tuple], periods: list[str]) -> tuple[dict, bool]:
    by_group: dict[str, dict[str, object]] = {}
    labels: dict[str, str] = {}
    totals: dict[str, object] = {}
    for _currency, bucket, key, label, total in rows:
        labels[key] = label
        by_group.setdefault(key, {})[period_key(plan.interval, bucket)] = total
        totals[key] = totals.get(key, 0) + total

    kept, _other, truncated = _rank_and_cap([(k, labels[k], totals[k]) for k in totals])
    series = [{"key": key, "label": label,
               "points": [{"period": period,
                           "value": _amount(by_group[key].get(period, 0))}
                          for period in periods]}
              for key, label, _total in kept]
    if truncated:
        dropped = set(totals) - {key for key, _label, _total in kept}
        series.append({"key": OTHER_KEY, "label": "Other", "points": [
            {"period": period,
             "value": _amount(sum(by_group[key].get(period, 0) for key in dropped))}
            for period in periods]})
    return {"shape": "timeseriesSplit", "series": series}, truncated


def _rank_and_cap(totals: list[tuple]) -> tuple[list[tuple], object, bool]:
    """Largest absolute value first (the key breaks ties, so the order is reproducible), then
    the top MAX_GROUPS with the tail's sum alongside."""
    ranked = sorted(totals, key=lambda item: (-abs(item[2]), item[0]))
    if len(ranked) <= MAX_GROUPS:
        return ranked, 0, False
    return ranked[:MAX_GROUPS], sum(item[2] for item in ranked[MAX_GROUPS:]), True
```

Delete the now-unused `_rank`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_executor.py -q`
Expected: PASS (12 passed)

- [ ] **Step 5: Bring `docs/INSIGHTS.md` in line with the cap that was just built**

The committed bullet bounds only the merchant axis. This task caps **every** categorical
axis — its own fixture is 30 *category* children under `Many` — so the doc and the code
now disagree, and CLAUDE.md requires them to move together.

Current text (`docs/INSIGHTS.md`, "Execution semantics" → Bounded output), verbatim:

```markdown
- **Bounded output.** `groupBy: category` is bounded by the tree (≤ 5 deep,
  small in practice); `merchant` is bounded to the top 25 groups by
  absolute value plus an `"Other"` aggregate row (flagged in `meta`), so a
  pathological description-history can't produce a 3,000-series chart.
```

Replace it with:

```markdown
- **Bounded output.** Every categorical axis — `category` as well as `merchant` — is
  bounded to the top 25 groups by absolute value plus an `"Other"` aggregate row
  (flagged in `meta.truncatedGroups`), so neither a wide tree nor a pathological
  description-history can produce a 3,000-series chart. The tree's own depth limit
  (≤ 5) bounds nesting, but not sibling count: a profile may hold hundreds of
  children under one parent, so the cap is applied uniformly rather than trusting
  the shape of the data.
```

Verify:

```bash
cd /home/chris/side-projects/my-finance
grep -q 'Every categorical axis' docs/INSIGHTS.md && \
  ! grep -q 'bounded by the tree' docs/INSIGHTS.md && echo "BOUNDED OUTPUT UPDATED"
```

Expected: `BOUNDED OUTPUT UPDATED`.

- [ ] **Step 6: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/src/analytics/executor.py analytics/tests/test_executor.py docs/INSIGHTS.md
git commit -m "feat(analytics): cap results at 25 groups plus an Other aggregate"
```

---


### Task 26: [MY-31] Golden envelope tests over the template gallery and the edge cases

**Files:**
- Create: `analytics/tests/fixtures/plans/monthly_spend_in_category.json`
- Create: `analytics/tests/fixtures/plans/top_categories_this_month.json`
- Create: `analytics/tests/fixtures/plans/groceries_split_monthly.json`
- Create: `analytics/tests/fixtures/plans/this_vs_last_month_by_category.json`
- Create: `analytics/tests/fixtures/plans/income_monthly.json`
- Create: `analytics/tests/fixtures/plans/net_this_month.json`
- Create: `analytics/tests/fixtures/plans/net_july_negative.json`
- Create: `analytics/tests/fixtures/plans/all_time_yearly.json`
- Create: `analytics/tests/fixtures/plans/multi_currency_breakdown.json`
- Create: `analytics/tests/fixtures/plans/many_children_breakdown.json`
- Create: `analytics/tests/fixtures/plans/empty_with_currency_filter.json`
- Create: `analytics/tests/fixtures/plans/stale_category.json`
- Create: `analytics/tests/test_executor_golden.py`
- Modify: `analytics/src/analytics/executor.py` (`execute` — the currency list)

**Interfaces:**
- Consumes: `analytics.executor.execute` / `PlanProblems`; the `conn` / `today` fixtures.
- Produces: the rule that a plan carrying `filters.currency` always returns exactly one result
  for that currency, empty-shaped when no row matches; without the filter, no rows means
  `results: []`. No new names.

- [ ] **Step 1: Write the fixture plans**

`analytics/tests/fixtures/plans/monthly_spend_in_category.json` — gallery template 1, and the
v1 form of template 6 (subscription cost, approximated by a category filter):

```json
{
  "version": 1,
  "metric": "spend",
  "filters": { "categoryId": 10, "includeDescendants": true, "currency": "PLN" },
  "groupBy": null,
  "interval": "month",
  "range": { "type": "lastMonths", "n": 12 }
}
```

`analytics/tests/fixtures/plans/top_categories_this_month.json` — gallery template 2:

```json
{
  "version": 1,
  "metric": "spend",
  "filters": { "currency": "PLN" },
  "groupBy": "category",
  "interval": null,
  "range": { "type": "lastMonths", "n": 1 }
}
```

`analytics/tests/fixtures/plans/groceries_split_monthly.json` — the canonical Lidl/Biedronka
plan with `filters.merchants` / `groupBy: "merchant"` replaced by the category axis until MY-33:

```json
{
  "version": 1,
  "metric": "spend",
  "filters": { "categoryId": 10, "includeDescendants": true, "currency": "PLN" },
  "groupBy": "category",
  "interval": "month",
  "range": { "type": "lastMonths", "n": 12 }
}
```

`analytics/tests/fixtures/plans/this_vs_last_month_by_category.json` — gallery template 3:

```json
{
  "version": 1,
  "metric": "spend",
  "filters": { "currency": "PLN" },
  "groupBy": "category",
  "interval": "month",
  "range": { "type": "lastMonths", "n": 2 }
}
```

`analytics/tests/fixtures/plans/income_monthly.json` — gallery template 4, income half:

```json
{
  "version": 1,
  "metric": "income",
  "filters": { "currency": "PLN" },
  "groupBy": null,
  "interval": "month",
  "range": { "type": "lastMonths", "n": 3 }
}
```

`analytics/tests/fixtures/plans/net_this_month.json`:

```json
{
  "version": 1,
  "metric": "net",
  "filters": { "currency": "PLN" },
  "groupBy": null,
  "interval": null,
  "range": { "type": "lastMonths", "n": 1 }
}
```

`analytics/tests/fixtures/plans/net_july_negative.json`:

```json
{
  "version": 1,
  "metric": "net",
  "filters": { "currency": "PLN" },
  "groupBy": null,
  "interval": null,
  "range": { "type": "absolute", "from": "2026-07-01", "to": "2026-07-31" }
}
```

`analytics/tests/fixtures/plans/all_time_yearly.json`:

```json
{
  "version": 1,
  "metric": "spend",
  "filters": { "categoryId": 10, "includeDescendants": true, "currency": "PLN" },
  "groupBy": null,
  "interval": "year",
  "range": { "type": "all" }
}
```

`analytics/tests/fixtures/plans/multi_currency_breakdown.json`:

```json
{
  "version": 1,
  "metric": "spend",
  "filters": { "categoryId": 10, "includeDescendants": true },
  "groupBy": "category",
  "interval": null,
  "range": { "type": "absolute", "from": "2026-08-01", "to": "2026-08-31" }
}
```

`analytics/tests/fixtures/plans/many_children_breakdown.json`:

```json
{
  "version": 1,
  "metric": "spend",
  "filters": { "categoryId": 40, "includeDescendants": true, "currency": "PLN" },
  "groupBy": "category",
  "interval": null,
  "range": { "type": "lastMonths", "n": 1 }
}
```

`analytics/tests/fixtures/plans/empty_with_currency_filter.json`:

```json
{
  "version": 1,
  "metric": "spend",
  "filters": { "categoryId": 20, "includeDescendants": true, "currency": "EUR" },
  "groupBy": null,
  "interval": "month",
  "range": { "type": "lastMonths", "n": 2 }
}
```

`analytics/tests/fixtures/plans/stale_category.json`:

```json
{
  "version": 1,
  "metric": "spend",
  "filters": { "categoryId": 999 },
  "groupBy": null,
  "interval": null,
  "range": { "type": "all" }
}
```

- [ ] **Step 2: Write the failing golden test**

Create `analytics/tests/test_executor_golden.py`:

```python
"""Golden envelopes: every gallery template that v1 can express, plus the edge cases
(empty data with and without a currency filter, multi-currency, truncation, a stale categoryId,
a negative net, all four shapes). Fixture plans are files so the same JSON can be pasted into
the explorer; the expected envelopes live here so the arithmetic sits next to the assertion.
"""

import json
from pathlib import Path

import pytest

from analytics.executor import PlanProblems, execute

PLANS = Path(__file__).parent / "fixtures" / "plans"

ZERO = "0.0000"


def load(name):
    return json.loads((PLANS / f"{name}.json").read_text(encoding="utf-8"))


def months(*pairs):
    """Twelve monthly buckets, 2025-10 … 2026-09, zero unless named."""
    values = dict(pairs)
    keys = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
            "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]
    return [{"period": key, "value": values.get(key, ZERO)} for key in keys]


EXPECTED = {
    "monthly_spend_in_category": ([{
        "currency": "PLN", "shape": "timeseries",
        "points": months(("2025-10", "70.0000"), ("2025-12", "130.0000"),
                         ("2026-07", "150.0000"), ("2026-08", "200.0000"),
                         ("2026-09", "325.0000")),
    }], False),

    "top_categories_this_month": ([{
        "currency": "PLN", "shape": "breakdown", "groups": [
            {"key": "40", "label": "Many", "value": "465.0000"},
            {"key": "20", "label": "Transport", "value": "400.0000"},
            {"key": "10", "label": "Groceries", "value": "325.0000"},
        ]}], False),

    "groceries_split_monthly": ([{
        "currency": "PLN", "shape": "timeseriesSplit", "series": [
            {"key": "12", "label": "Biedronka",
             "points": months(("2025-12", "130.0000"), ("2026-07", "50.0000"),
                              ("2026-09", "300.0000"))},
            {"key": "11", "label": "Lidl",
             "points": months(("2025-10", "70.0000"), ("2026-07", "100.0000"),
                              ("2026-08", "200.0000"))},
            {"key": "10", "label": "Groceries", "points": months(("2026-09", "25.0000"))},
        ]}], False),

    "this_vs_last_month_by_category": ([{
        "currency": "PLN", "shape": "timeseriesSplit", "series": [
            {"key": "10", "label": "Groceries", "points": [
                {"period": "2026-08", "value": "200.0000"},
                {"period": "2026-09", "value": "325.0000"}]},
            {"key": "40", "label": "Many", "points": [
                {"period": "2026-08", "value": ZERO},
                {"period": "2026-09", "value": "465.0000"}]},
            {"key": "20", "label": "Transport", "points": [
                {"period": "2026-08", "value": ZERO},
                {"period": "2026-09", "value": "400.0000"}]},
        ]}], False),

    "income_monthly": ([{
        "currency": "PLN", "shape": "timeseries", "points": [
            {"period": "2026-07", "value": ZERO},
            {"period": "2026-08", "value": "4000.0000"},
            {"period": "2026-09", "value": "5000.0000"},
        ]}], False),

    "net_this_month": ([{"currency": "PLN", "shape": "value", "value": "3810.0000"}], False),

    "net_july_negative": ([{"currency": "PLN", "shape": "value", "value": "-150.0000"}], False),

    "all_time_yearly": ([{
        "currency": "PLN", "shape": "timeseries", "points": [
            {"period": "2025", "value": "200.0000"},
            {"period": "2026", "value": "675.0000"},
        ]}], False),

    "multi_currency_breakdown": ([
        {"currency": "EUR", "shape": "breakdown",
         "groups": [{"key": "11", "label": "Lidl", "value": "10.0000"}]},
        {"currency": "PLN", "shape": "breakdown",
         "groups": [{"key": "11", "label": "Lidl", "value": "200.0000"}]},
    ], False),

    "many_children_breakdown": ([{
        "currency": "PLN", "shape": "breakdown",
        "groups": [{"key": str(400 + n), "label": f"Many {n:02d}", "value": f"{n}.0000"}
                   for n in range(30, 5, -1)]
                  + [{"key": "__other__", "label": "Other", "value": "15.0000"}],
    }], True),

    "empty_with_currency_filter": ([{
        "currency": "EUR", "shape": "timeseries", "points": [
            {"period": "2026-08", "value": ZERO},
            {"period": "2026-09", "value": ZERO},
        ]}], False),
}


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_golden_envelope(name, conn, today):
    results, truncated = EXPECTED[name]
    envelope = execute(conn, 1, load(name), today=today, merchant_enabled=False)
    assert envelope["results"] == results
    assert envelope["meta"] == {"truncatedGroups": truncated}


def test_the_canonical_plan_echoes_itself_verbatim(conn, today):
    """The full envelope for the acceptance case, plan echo included."""
    envelope = execute(conn, 1, load("groceries_split_monthly"), today=today,
                       merchant_enabled=False)
    assert envelope["plan"] == {
        "version": 1, "metric": "spend",
        "filters": {"categoryId": 10, "includeDescendants": True, "currency": "PLN"},
        "groupBy": "category", "interval": "month",
        "range": {"type": "lastMonths", "n": 12},
    }
    assert envelope["results"] == EXPECTED["groceries_split_monthly"][0]
    assert envelope["meta"] == {"truncatedGroups": False}


def test_a_stale_category_is_a_plan_problem(conn, today):
    with pytest.raises(PlanProblems) as caught:
        execute(conn, 1, load("stale_category"), today=today, merchant_enabled=False)
    assert caught.value.problems == [
        "filters.categoryId: 999 does not exist in this profile"]


def test_no_rows_and_no_currency_filter_returns_no_results(conn, today):
    plan = {"version": 1, "metric": "income",
            "filters": {"categoryId": 20, "includeDescendants": True},
            "groupBy": None, "interval": None, "range": {"type": "all"}}
    envelope = execute(conn, 1, plan, today=today, merchant_enabled=False)
    assert envelope["results"] == []
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_executor_golden.py -q`
Expected: FAIL on `test_golden_envelope[empty_with_currency_filter]` with
`assert [] == [{'currency': 'EUR', 'shape': 'timeseries', 'points': [...]}]`

- [ ] **Step 4: Make a currency-filtered plan always return that currency**

In `analytics/src/analytics/executor.py`, inside `execute`, replace the currency list with:

```python
    # A plan that pins one currency answers about that currency even when no row matched;
    # without the filter there is no currency to report an empty result for.
    currencies = sorted({row[0] for row in rows})
    if not currencies and plan.filters.currency is not None:
        currencies = [plan.filters.currency]
```

and iterate `for currency in currencies:` instead of over the set comprehension.

Then make `_shape`'s `value` branch tolerate an empty row list:

```python
    return {"shape": "value", "value": _amount(rows[0][4]) if rows else ZERO}, False
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest -q`
Expected: PASS (the whole suite: harness, plan, ranges, validation, sql, executor, golden)

- [ ] **Step 6: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/src/analytics/executor.py analytics/tests/test_executor_golden.py \
        analytics/tests/fixtures/plans
git commit -m "test(analytics): golden result envelopes for the template gallery and edge cases"
```

---


### Task 27: [MY-31] Wire the executor into `POST /internal/v1/execute`

**Files:**
- Modify: `analytics/src/analytics/main.py` (replace MY-29's stubbed `/internal/v1/execute` handler; add the `PlanProblems` exception handler)
- Create: `analytics/tests/test_execute_api.py`
- Modify: `analytics/tests/test_execute.py` (retire the stub-era assertion — see Step 5)
- Modify: `analytics/pyproject.toml` (dev dependency group — add `httpx`, which `fastapi.testclient` needs)

**Interfaces:**
- Consumes, from MY-29: `analytics.main.app` (the `FastAPI` instance), `analytics.db.get_conn` (a dependency yielding a psycopg connection), `analytics.config.get_settings` / `Settings` / `today(settings) -> date`, and `analytics.auth.require_token` (the bearer dependency, which reads `settings.analytics_token` and answers `401` when the header is missing or wrong). From this fragment: `analytics.executor.execute` / `PlanProblems`, `analytics.plan.MERCHANT_ENABLED`.
- Produces: the live contract `POST /internal/v1/execute` → `200` with the result envelope, `400` `{"problems": [...]}`, `401` without a valid bearer token.

- [ ] **Step 1: Add the HTTP test client dependency**

```bash
cd /home/chris/side-projects/my-finance/analytics
uv add --dev httpx
```

- [ ] **Step 2: Write the failing test**

Create `analytics/tests/test_execute_api.py`:

```python
"""The route. Absolute ranges only: a handler that reads its own clock would otherwise make
these assertions change on the first of every month."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from analytics.config import get_settings
from analytics.db import get_conn
from analytics.main import app

HEADERS = {"Authorization": "Bearer test-token"}

AUGUST_GROCERIES = {
    "version": 1,
    "metric": "spend",
    "filters": {"categoryId": 10, "includeDescendants": True, "currency": "PLN"},
    "groupBy": None,
    "interval": None,
    "range": {"type": "absolute", "from": "2026-08-01", "to": "2026-08-31"},
}


@pytest.fixture
def client(conn):
    app.dependency_overrides[get_conn] = lambda: conn
    app.dependency_overrides[get_settings] = lambda: SimpleNamespace(
        tz="UTC", analytics_token="test-token")
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_executes_a_plan_and_returns_the_envelope(client):
    response = client.post("/internal/v1/execute", headers=HEADERS,
                           json={"profileId": 1, "plan": AUGUST_GROCERIES})
    assert response.status_code == 200
    assert response.json()["results"] == [
        {"currency": "PLN", "shape": "value", "value": "200.0000"}]
    assert response.json()["meta"] == {"truncatedGroups": False}


def test_the_profile_id_scopes_the_query(client):
    """Profile 2 owns no category 10, so the same plan is a plan problem there — the id the
    backend forwards is the only thing that decides what is visible."""
    response = client.post("/internal/v1/execute", headers=HEADERS,
                           json={"profileId": 2, "plan": AUGUST_GROCERIES})
    assert response.status_code == 400
    assert response.json() == {
        "problems": ["filters.categoryId: 10 does not exist in this profile"]}


def test_a_rejected_plan_is_a_400_with_problems(client):
    response = client.post("/internal/v1/execute", headers=HEADERS,
                           json={"profileId": 1,
                                 "plan": {"version": 7, "metric": "spend",
                                          "range": {"type": "all"}}})
    assert response.status_code == 400
    assert response.json() == {"problems": ["version: unsupported plan version 7"]}


def test_a_body_that_is_not_a_plan_object_is_a_400_with_problems(client):
    response = client.post("/internal/v1/execute", headers=HEADERS,
                           json={"profileId": 1, "plan": "spend everything"})
    assert response.status_code == 400
    assert response.json() == {"problems": ["plan: must be a JSON object"]}


def test_the_bearer_token_is_required(client):
    response = client.post("/internal/v1/execute",
                           json={"profileId": 1, "plan": AUGUST_GROCERIES})
    assert response.status_code == 401
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_execute_api.py -q`
Expected: FAIL — MY-29's stub is declared `@app.post(..., status_code=400)` and answers
*every* well-formed body with the same fixed payload, so the first red is
`test_executes_a_plan_and_returns_the_envelope` reporting `assert 400 == 200`; the
remaining tests fail on the body comparison against the stub's placeholder problem
string (`"the plan executor is not implemented yet"`), not on their status codes.

- [ ] **Step 4: Replace the stub handler**

In `analytics/src/analytics/main.py`, make sure these imports are present (MY-29 already has
some of them; add only what is missing, and do not duplicate a name):

```python
from typing import Any

from fastapi import Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from analytics.auth import require_token
from analytics.config import Settings, get_settings, today
from analytics.db import get_conn
from analytics.executor import PlanProblems, execute
from analytics.plan import MERCHANT_ENABLED
```

Delete MY-29's stubbed `/internal/v1/execute` handler and its request model, and put this in
its place:

```python
class ExecuteRequest(BaseModel):
    profile_id: int = Field(alias="profileId")
    # Any, not a model: the plan's own validator owns every rule about its shape (spec D7), and
    # Pydantic would collapse a list of problems into whichever one it hit first.
    plan: Any


@app.exception_handler(PlanProblems)
async def plan_problems_handler(request: Request, exc: PlanProblems) -> JSONResponse:
    """A rejected plan is a 400 problem list, which the backend re-raises as
    /errors/invalid-plan (docs/API.md → POST /api/insights/execute)."""
    return JSONResponse(status_code=400, content={"problems": exc.problems})


@app.post("/internal/v1/execute", dependencies=[Depends(require_token)])
def execute_plan(body: ExecuteRequest,
                 conn=Depends(get_conn),
                 settings: Settings = Depends(get_settings)) -> dict:
    # The profile id is trusted precisely because nothing but the backend can reach this
    # service (docs/INSIGHTS.md, principle 3); every statement it reaches still carries it.
    return execute(conn, body.profile_id, body.plan,
                   today=today(settings), merchant_enabled=MERCHANT_ENABLED)
```

- [ ] **Step 5: Retire the stub-era test**

`analytics/tests/test_execute.py` (Task 5) still asserts the stub's contract:

```python
def test_execute_accepts_the_token_and_answers_with_the_problems_shape(client):
    response = client.post("/internal/v1/execute", json={...}, headers=AUTH)
    assert response.status_code == 400
    assert response.json() == {"problems": ["the plan executor is not implemented yet"]}
```

With the real handler in place that request reaches `Depends(get_conn)` and tries to
connect to the default `DATABASE_URL` — a port compose never publishes — so it raises
`psycopg.OperationalError` and returns `500`, not `400`. **Delete that one test function.**

Keep the other three: they still hold and are the only coverage of the auth boundary —
`test_execute_rejects_a_request_with_no_token`, `test_execute_rejects_a_wrong_token`,
and `test_health_still_needs_no_token`. The real 200/400 behaviour is now owned by
`tests/test_execute_api.py`, which supplies a database through `app.dependency_overrides`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest -q`
Expected: PASS (the whole suite)

- [ ] **Step 7: Verify the canonical plan against the running stack**

A local check, not a CI one: the compose database holds the operator's own data rather than the
golden seed, so there is nothing for CI to assert against. Sign in at http://localhost:3000
first and create a `Groceries` category with `Lidl` and `Biedronka` beneath it and a few PLN
expenses in each, then note the profile's id and the category's id from the app.

```bash
cd /home/chris/side-projects/my-finance
docker compose up --build -d
TOKEN=$(grep '^ANALYTICS_TOKEN=' .env | cut -d= -f2)
# The analytics service publishes no port, so the call is made from inside the compose network,
# with busybox wget from the backend's alpine JRE image.
docker compose exec -T backend sh -c "wget -q -O - \
  --header='Content-Type: application/json' \
  --header='Authorization: Bearer $TOKEN' \
  --post-data='{\"profileId\":1,\"plan\":{\"version\":1,\"metric\":\"spend\",\"filters\":{\"categoryId\":1,\"includeDescendants\":true,\"currency\":\"PLN\"},\"groupBy\":\"category\",\"interval\":\"month\",\"range\":{\"type\":\"lastMonths\",\"n\":12}}}' \
  http://analytics:8000/internal/v1/execute"
```

Expected: a `200` body whose `results[0].shape` is `timeseriesSplit`, carrying one series per
`Groceries` child (plus the parent's own group if anything is filed directly on it), each with
12 points. Substitute the real `profileId` and `categoryId`. The same plan through the backend's
`POST /api/insights/execute` needs a session and an XSRF token, so it is exercised from the
browser once MY-32's explorer exists rather than by hand here.

- [ ] **Step 8: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/src/analytics/main.py analytics/tests/test_execute_api.py analytics/tests/test_execute.py \
        analytics/pyproject.toml analytics/uv.lock
git commit -m "feat(analytics): run real plans on POST /internal/v1/execute"
```

---


### Task 28: [MY-31] Run the DB-backed analytics tests in CI

**Files:**
- Modify: `.github/workflows/ci.yml` (the `analytics` job's test step — MY-29 added the job as a unit-only run)
- Modify: `analytics/README.md` ("how to run the tests")
- Modify: `README.md` (add an "Analytics tests" section beside "Backend tests")

**Interfaces:**
- Consumes: the `analytics` job added by MY-29; the full pytest suite from Tasks 1–9.
- Produces: nothing importable. This task carries no unit test of its own — it is configuration,
  verified by running the exact command CI runs.

- [ ] **Step 1: Extend the CI job to run the whole suite**

In `.github/workflows/ci.yml`, the `analytics` job's final step becomes:

```yaml
      - name: Lint and test
        # The executor's tests start a postgres:16-alpine container through
        # testcontainers-python and apply the backend's own migrations. GitHub's runners
        # ship a Docker daemon, so there is nothing to install — the same reasoning as the
        # backend's Testcontainers tests.
        run: cd analytics && uv run --locked ruff check . && uv run --locked pytest -q
```

- [ ] **Step 2: Run exactly what CI runs**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run ruff check . && uv run pytest -q`
Expected: PASS — ruff clean, every test green, and the pytest header showing the container tests
actually ran rather than being skipped.

- [ ] **Step 3: Document how to run them**

In `analytics/README.md`, under the tests heading, add:

```markdown
The executor's tests are DB-backed: `testcontainers-python` starts a `postgres:16-alpine`
container, applies the backend's own Flyway migrations (`backend/src/main/resources/db/migration`)
so the executor is never tested against a hand-written schema, and loads
`tests/fixtures/seed.sql`. Docker must be running; nothing else needs setting up.

    uv run pytest
```

In `README.md`, immediately after the "Backend tests" section, add (the inner fence is a real
` ```bash ` fence in the file):

~~~markdown
### Analytics tests

```bash
cd analytics
uv run pytest
```

Requires a running Docker daemon: the executor's golden tests start a Postgres container and
migrate it with the backend's own Flyway files, so the SQL is exercised against the real schema.
~~~

- [ ] **Step 4: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add .github/workflows/ci.yml analytics/README.md README.md
git commit -m "ci: run the DB-backed analytics tests in the analytics job"
```

---


### Task 29: [MY-31] Record the lesson

**Files:**
- Modify: `docs/LESSONS.md` (append one entry at the end, under `## Entries`) — **gitignored (`.gitignore` → "Private / local-only"); write it, never `git add` it**

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. Documentation only — no test cycle, per CLAUDE.md's "trivial tasks" tradeoff.

- [ ] **Step 1: Append the entry**

At the end of `docs/LESSONS.md`, after the `ChronoUnit.between` entry, append exactly:

```markdown
### Filling gaps in a time series, and keeping `numeric` scale on the wire

- **What** — the executor aggregates in SQL but zero-fills empty buckets in
  Python, and every money value is cast back to `numeric(19,4)` before it
  leaves Postgres.
- **Where** — `analytics/src/analytics/sql.py` and
  `analytics/src/analytics/executor.py`, with every bucket key formatted by
  `analytics/src/analytics/ranges.py` (`period_key`).
- **Why it's this way** —

  `GROUP BY date_trunc('month', occurred_on)` returns a row only for months
  that have transactions, so a month with no spending simply isn't there and a
  chart draws a straight line across it — the silent gap the design forbids.
  Postgres can fill those gaps itself: `generate_series` over `::timestamp`
  bounds with an `interval` step, `LEFT JOIN`ed to the aggregate (and cross
  joined with the group keys first, or a multi-line chart ends up with series
  of unequal length). We deliberately don't. The executor already needs a
  Python function that lists the buckets in a range, because that same list is
  the x-axis every series is padded to — so filling in SQL would mean two
  formatters for one wire format, `to_char(b, 'YYYY-MM')` and its Python twin,
  which is a drift waiting to happen. The SQL returns the truncated bucket as a
  plain `date`; `period_key` is the only place a period string is made. The
  recursive CTE that carries a group key down the category tree is the same
  adjacency-list pattern as *Modelling a tree in SQL, and enforcing scoping in
  the schema* — with `profile_id` in both terms for the same reason.

  The scale trap is worth internalising. `SUM` over `NUMERIC(19,4)` keeps scale
  4, so a real bucket serialises as `"243.5000"` for free — but
  `COALESCE(SUM(amount), 0)` falls back to an *integer* `0`, scale 0, which
  serialises as `"0"` and breaks the contract for exactly the empty buckets
  this is all about. Hence `::numeric(19,4)` on every metric expression.
  Python's `Decimal` behaves the same way: it carries its scale as data, so
  `str(Decimal("0"))` is `"0"` and not `"0.0000"` — which is why the zero-fill
  formats through `f"{value:.4f}"` rather than `str`. A `float` would have made
  both problems invisible and one of them wrong.
```

- [ ] **Step 2: Confirm the entry stays local — there is nothing to commit**

`docs/LESSONS.md` is gitignored (`.gitignore` → "Private / local-only"), exactly as
Task 10's Files list records. `git add` on an ignored path exits `1` and stages
nothing, so this task has no commit: the entry is written and left in the working
tree by design.

Run:

```bash
git status --short docs/LESSONS.md && echo "LOCAL BY DESIGN"
```

Expected: `git status --short` prints nothing (the file is ignored, so it is not
even reported as untracked), then `LOCAL BY DESIGN`.

### Task 30: [MY-32] Visual design pass for the insights explorer

The explorer is the first screen in this app that is a *tool* rather than a form
or a list (spec D9), so its look is decided before any chip or chart is built.
Deliverable: a design note plus the CSS classes the later tasks consume.

**No TDD cycle here** — the deliverable is a design document and a block of CSS,
not logic. The verification step is a runnable token audit (every colour the new
CSS mentions must already exist in `styles.css`) plus `npm run build`.

**Files:**
- Create: `docs/design/insights-explorer.md`
- Modify: `frontend/src/app.css` (append one `/* — Insights explorer — */` block at the end of the file)

**Interfaces:**
- Consumes: nothing
- Produces: CSS class names used by later tasks — `.ins-chips` (the chip row),
  `.ins-chip` (one chip pill), `.ins-chip-label` (the chip's uppercase kicker),
  `.ins-chip-input` (the `<select>` inside a chip), `.ins-template` (a gallery
  card button), `.ins-problems` (the plan-problem `<ul>` inside `.error-box`).

- [ ] **Step 1: Run the `frontend-design` skill with this brief**

Invoke the `frontend-design` skill and give it exactly this brief:

```
Screen: the my-finance insights explorer (/insights) — the first "tool" screen
in an app that is otherwise forms and lists.

Screens to design:
  1. Explorer, main column: an always-visible row of editable plan chips
     (metric > category > group by > interval > range > currency), a Run
     button, and below it one result card per currency, each with a
     chart/table toggle.
  2. Explorer, sidebar column: "Save this insight" (name + Save), the saved
     list (name, pin toggle, delete), and the template gallery.
  3. Dashboard: pinned insights as a row of chart tiles, additive below the
     existing sections.

States to design: loading (a run in flight), empty (a valid plan over no
rows), a rejected plan (a list of executor problems with a "edit a chip"
nudge), and the analytics service being down.

Hard constraints:
  - Dark-only theme. No light palette, no prefers-color-scheme, no
    [data-theme] — the single :root block in frontend/src/styles.css IS the
    theme.
  - Consume the existing tokens only; invent no colour, radius or spacing
    value. Token list: --color-bg/-surface/-text/-accent/-accent-2/-divider,
    --color-neutral-100..900, --color-accent-100..900,
    --color-accent-2-100..900, --font-heading/-body, --space-1..8,
    --radius-sm/-md/-lg, --shadow-sm/-md/-lg.
  - Reuse the existing component classes rather than inventing parallels:
    .blueprint (via <Card>), .btn/.btn-primary/.btn-secondary, .input, .seg +
    .seg-btn, .tag*, .table, .kicker, .kpi-value, .tnum, .error-box,
    .text-muted.
  - New CSS goes in frontend/src/app.css and NOWHERE else:
    frontend/src/styles.css is a byte-identical copy of docs/design/styles.css
    and must not drift.
  - Layout is inline style={{...}} objects (the repo's idiom); only genuinely
    repeated component surfaces earn a class.

Output: a short design note (screen anatomy, chip anatomy, the four states,
chart styling) plus the minimal set of new classes, named with an `ins-`
prefix.
```

- [ ] **Step 2: Write the design note**

Create `docs/design/insights-explorer.md`:

````markdown
# Insights explorer — visual design

The explorer is the first screen in `my-finance` that is a *tool*: the user
assembles a question and looks at the answer, instead of filling a form or
scanning a list. This note records how it looks and why, so the components
built for MY-32 don't each invent their own version.

Theme is dark-only — `frontend/src/styles.css` is the whole palette, and it is
a byte-identical copy of `docs/design/styles.css`. Nothing here defines a
colour; everything consumes a token.

## Anatomy

```
┌─ Insights ──────────────────────────── one question at a time · Personal ─┐
│ ┌── Card ───────────────────────────────────┐  ┌── Card ───────────────┐ │
│ │ PLAN                                      │  │ Save this insight     │ │
│ │ (metric spend) (category all) (by cat…)   │  │ [name        ] [Save] │ │
│ │ (per —) (range this month) (currency PLN) │  └───────────────────────┘ │
│ │ spend · all categories · by category · …  │  ┌── Card ───────────────┐ │
│ │ [ Run ]                                   │  │ Saved  · pin/delete   │ │
│ └───────────────────────────────────────────┘  └───────────────────────┘ │
│ ┌── Card ──────────────────────── PLN ── (chart|table) ─┐  ┌── Card ───┐ │
│ │  ▇▇▇  ▇▇   ▇                                          │  │ Templates │ │
│ └───────────────────────────────────────────────────────┘  └───────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

Two columns, `3fr 2fr` with `gap: 24` — the same split the Subscriptions
screen already uses, so the app keeps one tool layout rather than two.

## Chips

A chip is a pill: `1px solid var(--color-divider)`, fully rounded, sitting on
`--color-neutral-100` so it reads as an input without looking like a text box.
Inside it, an uppercase 10px kicker in `--color-accent` names the axis and a
borderless `<select>` carries the value. The chip lights its border to
`--color-accent-500` on `:focus-within` — the only hover/focus affordance,
because six chips with six hover backgrounds would be noise.

The chips are **always visible and always editable**. There is no "edit plan"
mode: the plan *is* the chip row, and a one-line sentence under it
(`spend · all categories · by category · this month · PLN`) reads the same plan
back in prose so a user can check it at a glance.

Order is fixed and reads left to right as the sentence does: metric, category,
group by, interval, range, currency.

## Result cards

One `<Card>` per currency entry in the envelope — never a mixed chart, per the
project-wide currency rule. The currency is the card's kicker; the
chart/table toggle is the existing `.seg` / `.seg-btn` segmented control on the
same line, right-aligned.

Charts are Recharts components styled entirely through props from tokens:
grid `var(--color-divider)`, axis line `var(--color-neutral-500)`, tick text
`var(--color-neutral-700)`, tooltip on `var(--color-surface)` with a
`--color-divider` border and `--radius-md`. Series colours come from the
category tree's own effective colour (so a chart matches the dots the user
already knows) and fall back to the eight-colour `PALETTE` in
`lib/categoryColor.ts`. No Recharts default colour is ever used.

Axis ticks are bare numbers; the currency is named once, on the card. Charts
are a fixed 280px tall — a `ResponsiveContainer` with no explicit height
inside a card renders as a 0px-tall blank.

## The four states

| State | What the user sees |
|---|---|
| Loading | The Run button reads "Running…" and is disabled; previously rendered cards stay on screen rather than blanking. |
| Empty | A valid plan over no rows is a result, not an error: `results: []` gets a muted sentence in a card ("No transactions match this plan…"), and an all-zero series still draws its chart with a muted note under it. |
| Rejected plan | The executor's `problems` list, rendered as a bulleted list inside the existing `.error-box`, under one line of instruction: "edit a chip and run again". The category chip keeps a dangling id visible as `unknown category #999` rather than silently snapping to "all categories". |
| Analytics down | One sentence in the `.error-box`: "The analytics service isn't running" — an operational state, deliberately worded so it doesn't read as a crash. |

## Template gallery

Whole-card buttons (`.ins-template`), styled after `.profile-card`: left
aligned, a name, a muted blurb, hover raising the border to
`--color-accent-500` with a 9% accent wash. Clicking one loads its plan into
the chips; it does not run automatically, because the point of the gallery is
to *teach the chip vocabulary* — the user should see what changed.

## Pinned tiles

On the dashboard, pinned insights render below the existing sections in a
two-column grid of cards: the insight name, its plan sentence in muted text,
and the chart. The section renders nothing at all when nothing is pinned, so
the dashboard of a user who never opens Insights is unchanged.
````

- [ ] **Step 3: Add the classes to `app.css`**

Append at the end of `frontend/src/app.css`:

```css
/* — Insights explorer — the plan chips, the template gallery, plan problems.
   Consumes tokens from styles.css; defines none. */
.ins-chips {
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
}
.ins-chip {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 3px 8px 3px 12px; border-radius: 999px;
  border: 1px solid var(--color-divider);
  background: var(--color-neutral-100);
}
.ins-chip:focus-within { border-color: var(--color-accent-500); }
.ins-chip-label {
  font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--color-accent);
}
.ins-chip-input {
  background: none; border: none; color: var(--color-text);
  font: inherit; font-size: 13px; padding: 3px 2px; cursor: pointer;
}
.ins-chip-input:focus { outline: none; }

/* Template gallery card — a whole-card button, like .profile-card. */
.ins-template {
  display: flex; flex-direction: column; gap: 4px;
  text-align: left; cursor: pointer; padding: 12px 14px;
  font: inherit; color: inherit; background: none;
  border: 1px solid var(--color-divider); border-radius: var(--radius-md);
}
.ins-template:hover {
  border-color: var(--color-accent-500);
  background: color-mix(in srgb, var(--color-accent) 9%, var(--color-surface));
}

/* Executor plan problems, listed inside .error-box. */
.ins-problems { margin: 0; padding-left: 18px; }
.ins-problems li { margin-top: 2px; }
```

- [ ] **Step 4: Audit the tokens and build**

Run, from `/home/chris/side-projects/my-finance`:

```bash
grep -oh 'var(--[a-z0-9-]*)' docs/design/insights-explorer.md frontend/src/app.css \
  | sort -u | sed 's/var(//; s/)//' \
  | while read -r token; do
      grep -q -- "$token:" frontend/src/styles.css || echo "MISSING $token"
    done
cd frontend && npm run build
```

Expected: the first command prints **nothing** (no invented token), and
`npm run build` exits 0.

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add docs/design/insights-explorer.md frontend/src/app.css
git commit -m "feat(frontend): insights explorer design pass — design note + chip/gallery CSS"
```

---


### Task 31: [MY-32] Recharts dependency, insight DTO types, and the React Query hooks

**No test-first cycle** — the DTO block mirrors `docs/API.md` / `docs/INSIGHTS.md`
verbatim and the hooks are one-liners over the existing `api<T>()` wrapper, i.e.
the boilerplate CLAUDE.md exempts. Verification is `tsc -b` (via `npm run build`,
which runs with `strict`, `noUnusedLocals` and `verbatimModuleSyntax`).

**ARCHITECTURE.md is deliberately not touched here.** Recording Recharts and its
reasoning in `ARCHITECTURE.md` §4 is edit **E11** of the design delta, which
lands in the single doc-fix commit on `feat/phase-4-insights-core` (see
`docs/superpowers/specs/2026-09-04-insights-implementation-design.md` →
"Required edits to committed docs"). This task adds the dependency only.

**Files:**
- Modify: `frontend/package.json` (the `dependencies` block)
- Modify: `frontend/package-lock.json` (regenerated by `npm install`)
- Modify: `frontend/src/api/types.ts` (append a `// — Insights —` section at the end of the file)
- Modify: `frontend/src/api/hooks.ts` (add four names to the `import type { … } from './types'` list; append a `// — Insights —` section at the end of the file)

**Interfaces:**
- Consumes: nothing
- Produces, from `frontend/src/api/types.ts`:
  - `type Metric = 'spend' | 'income' | 'net'`
  - `type GroupBy = 'category' | 'merchant'`
  - `type Interval = 'day' | 'week' | 'month' | 'quarter' | 'year'`
  - `type PlanRange = { type: 'lastMonths'; n: number } | { type: 'yearToDate' } | { type: 'absolute'; from: string; to: string } | { type: 'all' }`
  - `interface PlanFilters { categoryId?: number; includeDescendants?: boolean; merchants?: string[]; currency?: string }`
  - `interface Plan { version: number; metric: Metric; filters: PlanFilters; groupBy: GroupBy | null; interval: Interval | null; range: PlanRange; forecast?: { months: number } }`
  - `interface Point { period: string; value: string; projected?: boolean }`
  - `interface Group { key: string; label: string; value: string }`
  - `interface Series { key: string; label: string; points: Point[] }`
  - `type CurrencyResult` — a discriminated union on `shape`, with members
    `{ currency; shape: 'value'; value: string }`,
    `{ currency; shape: 'timeseries'; points: Point[] }`,
    `{ currency; shape: 'breakdown'; groups: Group[] }`,
    `{ currency; shape: 'timeseriesSplit'; series: Series[] }`
  - `interface ResultEnvelope { plan: Plan; results: CurrencyResult[]; meta: { truncatedGroups: boolean } }`
  - `interface Viz { chart?: 'line' | 'bar' | 'donut' | 'table' }`
  - `interface Insight { id: number; name: string; plan: Plan; viz: Viz | null; pinned: boolean; createdAt: string }`
  - `interface InsightRequest { name: string; plan: Plan; viz?: Viz | null; pinned?: boolean }`
- Produces, from `frontend/src/api/hooks.ts`:
  - `useInsights(): UseQueryResult<Insight[]>` — key `['insights', profileId]`
  - `useInsight(id: number): UseQueryResult<Insight>` — key `['insight', profileId, id]`; disabled when `id <= 0`
  - `useCreateInsight(): UseMutationResult<Insight, Error, InsightRequest>`
  - `useUpdateInsight(): UseMutationResult<Insight, Error, { id: number; body: InsightRequest }>`
  - `useDeleteInsight(): UseMutationResult<void, Error, number>`
  - `useExecutePlan(): UseMutationResult<ResultEnvelope, Error, Plan>`
  - `useInsightResults(insights: Insight[] | undefined)` — a `useQueries` fan-out, one execute per insight, key `['insight-result', profileId, insight.id]`
- Produces, from `package.json`: the runtime dependency `recharts@^3.10.1`,
  importable as `import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'`.

- [ ] **Step 1: Install Recharts**

Run, from `/home/chris/side-projects/my-finance/frontend`:

```bash
npm install recharts@^3.10.1
npm ls recharts
```

Expected: `npm ls` prints `└── recharts@3.10.x` with no `UNMET PEER DEPENDENCY`
line (Recharts 3 declares `react ^19.0.0`; this app is on React 19.2).

- [ ] **Step 2: Add the DTO types**

Append to `frontend/src/api/types.ts`:

```ts
// — Insights —
// The plan DSL v1 and the executor's result envelope, mirroring
// docs/INSIGHTS.md → "Plan DSL v1" / "Result shapes". Every amount is a
// decimal string at scale 4 ("243.5000"), like the rest of the API.

export type Metric = 'spend' | 'income' | 'net';
export type GroupBy = 'category' | 'merchant';
export type Interval = 'day' | 'week' | 'month' | 'quarter' | 'year';

export type PlanRange =
  | { type: 'lastMonths'; n: number }
  | { type: 'yearToDate' }
  | { type: 'absolute'; from: string; to: string }
  | { type: 'all' };

export interface PlanFilters {
  categoryId?: number;
  /** Default true: a filter on Groceries means its whole subtree. */
  includeDescendants?: boolean;
  /** Rejected by the executor until the merchant column lands (Phase 4b). */
  merchants?: string[];
  currency?: string;
}

export interface Plan {
  version: number;
  metric: Metric;
  filters: PlanFilters;
  groupBy: GroupBy | null;
  interval: Interval | null;
  range: PlanRange;
  /** Phase 4b (plan version 2); absent in v1 plans. */
  forecast?: { months: number };
}

/** One time bucket. `period` is the bucket's ISO start ("2026-07", "2026-Q3"). */
export interface Point {
  period: string;
  value: string;
  projected?: boolean;
}

/** One categorical group. `key` is machine-stable, `label` is for humans. */
export interface Group {
  key: string;
  label: string;
  value: string;
}

export interface Series {
  key: string;
  label: string;
  points: Point[];
}

/** The shape is derived by the executor from interval × groupBy, not declared. */
export type CurrencyResult =
  | { currency: string; shape: 'value'; value: string }
  | { currency: string; shape: 'timeseries'; points: Point[] }
  | { currency: string; shape: 'breakdown'; groups: Group[] }
  | { currency: string; shape: 'timeseriesSplit'; series: Series[] };

export interface ResultEnvelope {
  plan: Plan;
  /** One entry per currency present — currencies never mix. */
  results: CurrencyResult[];
  meta: { truncatedGroups: boolean };
}

/** Optional render overrides stored with a saved Insight. */
export interface Viz {
  chart?: 'line' | 'bar' | 'donut' | 'table';
}

export interface Insight {
  id: number;
  name: string;
  plan: Plan;
  viz: Viz | null;
  pinned: boolean;
  createdAt: string;
}

export interface InsightRequest {
  name: string;
  plan: Plan;
  viz?: Viz | null;
  pinned?: boolean;
}
```

- [ ] **Step 3: Add the hooks**

In `frontend/src/api/hooks.ts`, add four names to the existing
`import type { … } from './types';` list, keeping it alphabetical — `Insight`
and `InsightRequest` go after `CreateTransactionRequest`, `Plan` after
`Page`, `ResultEnvelope` after `RestoreBackupResponse`:

```ts
  CreateTransactionRequest,
  Insight,
  InsightRequest,
  LoginRequest,
  Page,
  Plan,
  ProfileResponse,
  RegisterRequest,
  RestoreBackupResponse,
  ResultEnvelope,
  SessionResponse,
```

Then append at the end of the file:

```ts
// — Insights —

export function useInsights() {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: ['insights', profileId],
    queryFn: () => api<Insight[]>('/api/insights'),
    enabled: profileId !== null,
  });
}

/** One saved insight — the explorer's ?insight=<id> deep link. */
export function useInsight(id: number) {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: ['insight', profileId, id],
    queryFn: () => api<Insight>(`/api/insights/${id}`),
    // Callers pass 0 when nothing is open, so this stays a plain hook call.
    enabled: profileId !== null && id > 0,
  });
}

/** Saving, renaming, pinning or deleting all change the dashboard's tiles. */
function useInvalidateInsights() {
  const queryClient = useQueryClient();
  const profileId = useActiveProfileId();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['insights', profileId] });
    // Query keys match element by element, so 'insight' and 'insights' are
    // different caches: without this line a pin toggle leaves the open
    // insight stale and the next rename silently unpins it.
    queryClient.invalidateQueries({ queryKey: ['insight', profileId] });
    queryClient.invalidateQueries({ queryKey: ['insight-result', profileId] });
  };
}

export function useCreateInsight() {
  const invalidate = useInvalidateInsights();
  return useMutation({
    mutationFn: (body: InsightRequest) =>
      api<Insight>('/api/insights', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useUpdateInsight() {
  const invalidate = useInvalidateInsights();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: InsightRequest }) =>
      api<Insight>(`/api/insights/${id}`, { method: 'PUT', body }),
    onSuccess: invalidate,
  });
}

export function useDeleteInsight() {
  const invalidate = useInvalidateInsights();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/insights/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

/**
 * POST /api/insights/execute — the explorer's Run button. A mutation rather
 * than a query: the user triggers it deliberately, and an unsaved plan has no
 * identity worth caching under.
 */
export function useExecutePlan() {
  return useMutation({
    mutationFn: (plan: Plan) =>
      api<ResultEnvelope>('/api/insights/execute', { method: 'POST', body: plan }),
  });
}

/**
 * One POST /api/insights/execute per insight — the dashboard's pinned tiles.
 * Same fan-out shape as useBudgetStatuses; fine at this scale (dozens at most).
 */
export function useInsightResults(insights: Insight[] | undefined) {
  const profileId = useActiveProfileId();
  return useQueries({
    queries: (insights ?? []).map((insight) => ({
      queryKey: ['insight-result', profileId, insight.id],
      queryFn: () =>
        api<ResultEnvelope>('/api/insights/execute', { method: 'POST', body: insight.plan }),
      enabled: profileId !== null,
    })),
  });
}
```

- [ ] **Step 4: Type-check**

Run, from `/home/chris/side-projects/my-finance/frontend`:

```bash
npm run build
```

Expected: PASS (exits 0). `tsc -b` type-checks the new union and hooks; a
mis-shaped `CurrencyResult` or a stale import name fails here.

- [ ] **Step 5: Commit**

R8: the lockfile is both the CI npm cache key (`.github/workflows/ci.yml`,
`cache-dependency-path: frontend/package-lock.json`) and the Docker dependency
layer (`frontend/Dockerfile` runs `npm ci`) — it must be committed with the
dependency, never after it.

```bash
cd /home/chris/side-projects/my-finance
git add frontend/package.json frontend/package-lock.json frontend/src/api/types.ts frontend/src/api/hooks.ts
git commit -m "feat(frontend): recharts dependency, insight plan/result DTO types, insight hooks"
```

---


### Task 32: [MY-32] The `/insights` route, plan defaults, and the table renderer

Delivers a working screen end to end at the smallest possible size: `/insights`
shows the default plan as a sentence, Run executes it through the backend proxy,
and the envelope renders as a table (the shape-independent fallback that
`INSIGHTS.md` calls the explorer's honest renderer). Chips and charts replace
parts of this in the next tasks; nothing here is thrown away.

**Files:**
- Create: `frontend/src/insights/planDefaults.ts`
- Create: `frontend/src/insights/renderers/ResultTable.tsx`
- Create: `frontend/src/screens/Insights.tsx`
- Modify: `frontend/src/App.tsx` (one screen import + one `<Route>` inside `<Route element={<AppLayout />}>`)
- Modify: `frontend/src/components/Nav.tsx` (one entry appended to the `LINKS` array)

**Interfaces:**
- Consumes, from Task 31: `useActiveProfile()`, `useExecutePlan()` (mutation over
  `Plan`, resolving to `ResultEnvelope`), and the types `Plan`, `PlanRange`,
  `Metric`, `Interval`, `CurrencyResult`, `ResultEnvelope` from `../api/types`.
  Also the existing `ApiError` (fields `status: number`, `type: string`,
  `detail: string`, `extra: Record<string, unknown>`) from `../api/client`, and
  `formatAmount(decimalString, currency)` from `../lib/money`.
- Produces, from `frontend/src/insights/planDefaults.ts`:
  - `const PLAN_VERSION = 1`
  - `const METRICS: Metric[]`, `const INTERVALS: Interval[]`
  - `interface RangeOption { value: string; label: string; range: PlanRange }`
  - `const RANGE_OPTIONS: RangeOption[]`
  - `rangeOptionValue(range: PlanRange): string`
  - `describeRange(range: PlanRange): string`
  - `defaultPlan(currency: string): Plan`
  - `describePlan(plan: Plan, categoryName?: string): string`
  - `planToSearch(plan: Plan): string`
  - `planFromSearch(raw: string | null, currency: string): Plan`
- Produces: `ResultTable({ result }: { result: CurrencyResult })` from
  `frontend/src/insights/renderers/ResultTable.tsx`
- Produces: `Insights()` — a named export from `frontend/src/screens/Insights.tsx`,
  mounted at `/insights`.

- [ ] **Step 1: Write the failing check — wire the route to a screen that does not exist**

In `frontend/src/App.tsx`, add the import alphabetically among the screen
imports (after `Dashboard`, before `ProfilePicker`):

```tsx
import { Insights } from './screens/Insights';
```

and the route, inside `<Route element={<AppLayout />}>`, after the
`/subscriptions` line:

```tsx
          <Route path="/insights" element={<Insights />} />
```

In `frontend/src/components/Nav.tsx`, append to `LINKS`:

```tsx
const LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/categories', label: 'Categories' },
  { to: '/budgets', label: 'Budgets' },
  { to: '/subscriptions', label: 'Subscriptions' },
  { to: '/insights', label: 'Insights' },
];
```

- [ ] **Step 2: Run the type-check to verify it fails**

Run, from `/home/chris/side-projects/my-finance/frontend`:

```bash
npm run build
```

Expected: FAIL with
`error TS2307: Cannot find module './screens/Insights' or its corresponding type declarations.`

- [ ] **Step 3: Write the plan module, the table renderer, and the screen**

Create `frontend/src/insights/planDefaults.ts`:

```ts
// The explorer's plan state: the default plan, the chip vocabulary, the URL
// encoding that makes an exploration linkable, and the one-line description
// reused by the gallery and by the pinned dashboard tiles.
//
// The DSL itself is specified in docs/INSIGHTS.md → "Plan DSL v1". This module
// only builds and describes plans — it never validates them, because the
// analytics executor is the one validator.

import type { Interval, Metric, Plan, PlanRange } from '../api/types';

export const PLAN_VERSION = 1;

export const METRICS: Metric[] = ['spend', 'income', 'net'];
export const INTERVALS: Interval[] = ['day', 'week', 'month', 'quarter', 'year'];

export interface RangeOption {
  /** A flat <option> value, because PlanRange is a union of objects. */
  value: string;
  label: string;
  range: PlanRange;
}

/** What the range chip offers. `absolute` stays URL- and template-only in v1. */
export const RANGE_OPTIONS: RangeOption[] = [
  { value: 'lastMonths-1', label: 'this month', range: { type: 'lastMonths', n: 1 } },
  { value: 'lastMonths-3', label: 'last 3 months', range: { type: 'lastMonths', n: 3 } },
  { value: 'lastMonths-6', label: 'last 6 months', range: { type: 'lastMonths', n: 6 } },
  { value: 'lastMonths-12', label: 'last 12 months', range: { type: 'lastMonths', n: 12 } },
  { value: 'yearToDate', label: 'year to date', range: { type: 'yearToDate' } },
  { value: 'all', label: 'all time', range: { type: 'all' } },
];

export function rangeOptionValue(range: PlanRange): string {
  return range.type === 'lastMonths' ? `lastMonths-${range.n}` : range.type;
}

export function describeRange(range: PlanRange): string {
  switch (range.type) {
    case 'lastMonths':
      // n buckets in total, the last one being the current partial month.
      return range.n === 1 ? 'this month' : `last ${range.n} months`;
    case 'yearToDate':
      return 'year to date';
    case 'absolute':
      return `${range.from} → ${range.to}`;
    case 'all':
      return 'all time';
  }
}

/**
 * Opens on something that draws on the very first Run: this month's spend by
 * category — which is the gallery's "Top categories this month" for free.
 */
export function defaultPlan(currency: string): Plan {
  return {
    version: PLAN_VERSION,
    metric: 'spend',
    // includeDescendants stays true throughout the explorer: a filter on
    // Groceries means groceries *including* its subtree, the rule budgets use.
    filters: { includeDescendants: true, currency },
    groupBy: 'category',
    interval: null,
    range: { type: 'lastMonths', n: 1 },
  };
}

/** The plan read back as a sentence, under the chips and on gallery cards. */
export function describePlan(plan: Plan, categoryName?: string): string {
  const parts: string[] = [plan.metric, categoryName ? `in ${categoryName}` : 'all categories'];
  if (plan.groupBy) parts.push(`by ${plan.groupBy}`);
  if (plan.interval) parts.push(`per ${plan.interval}`);
  parts.push(describeRange(plan.range));
  parts.push(plan.filters.currency ?? 'every currency');
  return parts.join(' · ');
}

/** The whole plan travels in one ?plan= param, so an exploration is linkable. */
export function planToSearch(plan: Plan): string {
  return JSON.stringify(plan);
}

/**
 * Plans come back out of the URL, which a user can hand-edit. Anything that is
 * not recognisably a plan falls back to the default instead of throwing — the
 * same spirit as Transactions.tsx clamping its URL-borne `page` param.
 */
export function planFromSearch(raw: string | null, currency: string): Plan {
  if (!raw) return defaultPlan(currency);
  try {
    const parsed = JSON.parse(raw) as Partial<Plan>;
    if (typeof parsed !== 'object' || parsed === null) return defaultPlan(currency);
    if (typeof parsed.metric !== 'string' || !parsed.range) return defaultPlan(currency);
    return { ...defaultPlan(currency), ...parsed } as Plan;
  } catch {
    return defaultPlan(currency);
  }
}
```

Create `frontend/src/insights/renderers/ResultTable.tsx`:

```tsx
import type { CurrencyResult } from '../../api/types';
import { formatAmount } from '../../lib/money';

/**
 * Every shape also renders as a table — the explorer's honest fallback, and
 * the only renderer that can't lose a digit (docs/INSIGHTS.md → Result shapes).
 */
export function ResultTable({ result }: { result: CurrencyResult }) {
  if (result.shape === 'value') {
    return (
      <table className="table">
        <tbody>
          <tr>
            <td>total</td>
            <td className="tnum" style={{ textAlign: 'right' }}>
              {formatAmount(result.value, result.currency)}
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  if (result.shape === 'timeseries') {
    return (
      <table className="table">
        <thead>
          <tr>
            <th>Period</th>
            <th style={{ textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {result.points.map((point) => (
            <tr key={point.period}>
              <td>{point.period}</td>
              <td className="tnum" style={{ textAlign: 'right' }}>
                {formatAmount(point.value, result.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (result.shape === 'breakdown') {
    return (
      <table className="table">
        <thead>
          <tr>
            <th>Group</th>
            <th style={{ textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {result.groups.map((group) => (
            <tr key={group.key}>
              <td>{group.label}</td>
              <td className="tnum" style={{ textAlign: 'right' }}>
                {formatAmount(group.value, result.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // timeseriesSplit: a row per bucket, a column per series. The executor
  // zero-fills every series over every bucket, so the first series' periods
  // are the row keys.
  const periods = result.series[0]?.points.map((point) => point.period) ?? [];
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Period</th>
          {result.series.map((series) => (
            <th key={series.key} style={{ textAlign: 'right' }}>
              {series.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {periods.map((period, index) => (
          <tr key={period}>
            <td>{period}</td>
            {result.series.map((series) => (
              <td key={series.key} className="tnum" style={{ textAlign: 'right' }}>
                {formatAmount(series.points[index]?.value ?? '0', result.currency)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Create `frontend/src/screens/Insights.tsx`:

```tsx
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useActiveProfile, useExecutePlan } from '../api/hooks';
import { Card } from '../components/Card';
import { describePlan, planFromSearch } from '../insights/planDefaults';
import { ResultTable } from '../insights/renderers/ResultTable';

export function Insights() {
  const profile = useActiveProfile();
  const [searchParams] = useSearchParams();
  const execute = useExecutePlan();

  if (!profile) return null;
  const plan = planFromSearch(searchParams.get('plan'), profile.defaultCurrency);
  const envelope = execute.data;
  const error = execute.error;

  return (
    <main>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          margin: '26px 0 18px',
        }}
      >
        <h2 style={{ margin: 0 }}>Insights</h2>
        <span className="text-muted" style={{ fontSize: 13 }}>
          one question at a time · {profile.name}
        </span>
      </div>
      <Card style={{ padding: '18px 20px' }}>
        <div className="kicker">Plan</div>
        <div style={{ fontSize: 14, margin: '6px 0 14px' }}>{describePlan(plan)}</div>
        <button
          className="btn btn-primary"
          onClick={() => execute.mutate(plan)}
          disabled={execute.isPending}
        >
          {execute.isPending ? 'Running…' : 'Run'}
        </button>
        {error && (
          <div className="error-box" style={{ marginTop: 12 }}>
            {error instanceof ApiError
              ? `${error.status} ${error.type.replace('/errors/', '')} — ${error.detail}`
              : 'Could not run the plan — is the backend running?'}
          </div>
        )}
      </Card>
      {envelope?.results.map((result) => (
        <Card key={result.currency} style={{ padding: '18px 20px', marginTop: 24 }}>
          <div className="kicker">{result.currency}</div>
          <ResultTable result={result} />
        </Card>
      ))}
    </main>
  );
}
```

- [ ] **Step 4: Run the type-check to verify it passes**

Run, from `/home/chris/side-projects/my-finance/frontend`:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add frontend/src/insights/planDefaults.ts frontend/src/insights/renderers/ResultTable.tsx frontend/src/screens/Insights.tsx frontend/src/App.tsx frontend/src/components/Nav.tsx
git commit -m "feat(frontend): /insights route, plan defaults, and the table renderer"
```

---


### Task 33: [MY-32] The chip builder — the plan is always visible and editable

Six chips in a fixed order that reads as the plan's sentence: metric, category,
group by, interval, range, currency. The profile's default currency is
preselected. The plan lives in `?plan=` so an exploration is linkable and
survives a reload, exactly as `Transactions.tsx` keeps its filters in the URL.

**Files:**
- Create: `frontend/src/insights/chips/MetricChip.tsx`
- Create: `frontend/src/insights/chips/CategoryChip.tsx`
- Create: `frontend/src/insights/chips/GroupByChip.tsx`
- Create: `frontend/src/insights/chips/IntervalChip.tsx`
- Create: `frontend/src/insights/chips/RangeChip.tsx`
- Create: `frontend/src/insights/chips/CurrencyChip.tsx`
- Create: `frontend/src/insights/chips/ChipBar.tsx`
- Modify: `frontend/src/screens/Insights.tsx` (replace the static plan sentence with `<ChipBar>` + the sentence beneath it; add the `setPlan` URL writer)

**Interfaces:**
- Consumes, from Task 31: the types `CategoryNode`, `GroupBy`, `Interval`,
  `Metric`, `Plan`, `PlanRange` from `../../api/types`, and `useCategories()`.
- Consumes, from Task 32: `METRICS: Metric[]`, `INTERVALS: Interval[]`,
  `RANGE_OPTIONS: { value: string; label: string; range: PlanRange }[]`,
  `rangeOptionValue(range: PlanRange): string`,
  `describePlan(plan: Plan, categoryName?: string): string`,
  `planFromSearch(raw: string | null, currency: string): Plan`,
  `planToSearch(plan: Plan): string` — all from `../insights/planDefaults`.
- Consumes, existing: `categoryOptions(tree: CategoryNode[]): { id: number; label: string; depth: number }[]`
  and `flattenTree(tree: CategoryNode[]): Map<number, CategoryNode>` from `../../lib/categoryColor`.
- Consumes, from Task 30: the CSS classes `.ins-chips`, `.ins-chip`,
  `.ins-chip-label`, `.ins-chip-input`.
- Produces:
  - `MetricChip({ value: Metric; onChange: (metric: Metric) => void })`
  - `CategoryChip({ categories: CategoryNode[]; value: number | undefined; onChange: (categoryId: number | undefined) => void })`
  - `GroupByChip({ value: GroupBy | null; onChange: (groupBy: GroupBy | null) => void })`
  - `IntervalChip({ value: Interval | null; onChange: (interval: Interval | null) => void })`
  - `RangeChip({ value: PlanRange; onChange: (range: PlanRange) => void })`
  - `CurrencyChip({ defaultCurrency: string; value: string | undefined; onChange: (currency: string | undefined) => void })`
  - `ChipBar({ plan: Plan; categories: CategoryNode[]; defaultCurrency: string; onChange: (plan: Plan) => void })`
  - Accessible names for the e2e, all via `aria-label`: `Metric`, `Category`,
    `Group by`, `Interval`, `Range`, `Currency`.

- [ ] **Step 1: Write the failing check — have the screen import the chip bar**

In `frontend/src/screens/Insights.tsx`, add the import:

```tsx
import { ChipBar } from '../insights/chips/ChipBar';
```

- [ ] **Step 2: Run the type-check to verify it fails**

Run, from `/home/chris/side-projects/my-finance/frontend`:

```bash
npm run build
```

Expected: FAIL with
`error TS2307: Cannot find module '../insights/chips/ChipBar' or its corresponding type declarations.`

- [ ] **Step 3: Write the six chips and the bar**

Create `frontend/src/insights/chips/MetricChip.tsx`:

```tsx
import type { Metric } from '../../api/types';
import { METRICS } from '../planDefaults';

export function MetricChip({
  value,
  onChange,
}: {
  value: Metric;
  onChange: (metric: Metric) => void;
}) {
  return (
    <div className="ins-chip">
      <span className="ins-chip-label">metric</span>
      <select
        className="ins-chip-input"
        value={value}
        onChange={(e) => onChange(e.target.value as Metric)}
        aria-label="Metric"
      >
        {METRICS.map((metric) => (
          <option key={metric} value={metric}>
            {metric}
          </option>
        ))}
      </select>
    </div>
  );
}
```

Create `frontend/src/insights/chips/CategoryChip.tsx`:

```tsx
import type { CategoryNode } from '../../api/types';
import { categoryOptions } from '../../lib/categoryColor';

export function CategoryChip({
  categories,
  value,
  onChange,
}: {
  categories: CategoryNode[];
  value: number | undefined;
  onChange: (categoryId: number | undefined) => void;
}) {
  const options = categoryOptions(categories);
  // A saved plan can carry a category that has since been deleted. Showing it
  // as "unknown category #999" keeps the stale chip visible instead of
  // silently snapping the plan to "all categories" behind the user's back.
  const dangling = value !== undefined && !options.some((option) => option.id === value);

  return (
    <div className="ins-chip">
      <span className="ins-chip-label">category</span>
      <select
        className="ins-chip-input"
        value={value === undefined ? 'all' : String(value)}
        onChange={(e) => onChange(e.target.value === 'all' ? undefined : Number(e.target.value))}
        aria-label="Category"
      >
        <option value="all">all categories</option>
        {dangling && <option value={value}>unknown category #{value}</option>}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
```

Create `frontend/src/insights/chips/GroupByChip.tsx`:

```tsx
import type { GroupBy } from '../../api/types';

export function GroupByChip({
  value,
  onChange,
}: {
  value: GroupBy | null;
  onChange: (groupBy: GroupBy | null) => void;
}) {
  // `merchant` is deliberately not offered: the executor rejects it until the
  // txn.merchant column lands in Phase 4b (docs/INSIGHTS.md → Plan DSL v1), and
  // an option that always errors is not a choice.
  return (
    <div className="ins-chip">
      <span className="ins-chip-label">group by</span>
      <select
        className="ins-chip-input"
        value={value ?? 'none'}
        onChange={(e) => onChange(e.target.value === 'none' ? null : (e.target.value as GroupBy))}
        aria-label="Group by"
      >
        <option value="none">nothing</option>
        <option value="category">category</option>
      </select>
    </div>
  );
}
```

Create `frontend/src/insights/chips/IntervalChip.tsx`:

```tsx
import type { Interval } from '../../api/types';
import { INTERVALS } from '../planDefaults';

export function IntervalChip({
  value,
  onChange,
}: {
  value: Interval | null;
  onChange: (interval: Interval | null) => void;
}) {
  return (
    <div className="ins-chip">
      <span className="ins-chip-label">per</span>
      <select
        className="ins-chip-input"
        value={value ?? 'none'}
        onChange={(e) => onChange(e.target.value === 'none' ? null : (e.target.value as Interval))}
        aria-label="Interval"
      >
        <option value="none">one total</option>
        {INTERVALS.map((interval) => (
          <option key={interval} value={interval}>
            {interval}
          </option>
        ))}
      </select>
    </div>
  );
}
```

Create `frontend/src/insights/chips/RangeChip.tsx`:

```tsx
import type { PlanRange } from '../../api/types';
import { RANGE_OPTIONS, rangeOptionValue } from '../planDefaults';

export function RangeChip({
  value,
  onChange,
}: {
  value: PlanRange;
  onChange: (range: PlanRange) => void;
}) {
  const selected = rangeOptionValue(value);
  const known = RANGE_OPTIONS.some((option) => option.value === selected);

  return (
    <div className="ins-chip">
      <span className="ins-chip-label">range</span>
      <select
        className="ins-chip-input"
        value={selected}
        onChange={(e) => {
          const option = RANGE_OPTIONS.find((candidate) => candidate.value === e.target.value);
          if (option) onChange(option.range);
        }}
        aria-label="Range"
      >
        {/* A template or hand-edited URL may carry a range the chip doesn't
            offer (an absolute window, say); keep it visible rather than
            rewriting the plan on render. */}
        {!known && <option value={selected}>{selected}</option>}
        {RANGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
```

Create `frontend/src/insights/chips/CurrencyChip.tsx`:

```tsx
export function CurrencyChip({
  defaultCurrency,
  value,
  onChange,
}: {
  defaultCurrency: string;
  value: string | undefined;
  onChange: (currency: string | undefined) => void;
}) {
  return (
    <div className="ins-chip">
      <span className="ins-chip-label">currency</span>
      <select
        className="ins-chip-input"
        value={value ?? 'all'}
        onChange={(e) => onChange(e.target.value === 'all' ? undefined : e.target.value)}
        aria-label="Currency"
      >
        <option value={defaultCurrency}>{defaultCurrency}</option>
        {value !== undefined && value !== defaultCurrency && <option value={value}>{value}</option>}
        {/* Clearing the filter shows one chart per currency present, rather
            than a meaningless mixed total (ARCHITECTURE.md §3). */}
        <option value="all">every currency</option>
      </select>
    </div>
  );
}
```

Create `frontend/src/insights/chips/ChipBar.tsx`:

```tsx
import type { CategoryNode, GroupBy, Interval, Metric, Plan, PlanRange } from '../../api/types';
import { CategoryChip } from './CategoryChip';
import { CurrencyChip } from './CurrencyChip';
import { GroupByChip } from './GroupByChip';
import { IntervalChip } from './IntervalChip';
import { MetricChip } from './MetricChip';
import { RangeChip } from './RangeChip';

/**
 * The plan, always visible and always editable. The order reads left to right
 * as the plan's own sentence does: metric, category, grouping, interval,
 * range, currency.
 */
export function ChipBar({
  plan,
  categories,
  defaultCurrency,
  onChange,
}: {
  plan: Plan;
  categories: CategoryNode[];
  defaultCurrency: string;
  onChange: (plan: Plan) => void;
}) {
  const set = (patch: Partial<Plan>) => onChange({ ...plan, ...patch });
  const setFilter = (patch: Partial<Plan['filters']>) =>
    set({ filters: { ...plan.filters, ...patch } });

  return (
    <div className="ins-chips">
      <MetricChip value={plan.metric} onChange={(metric: Metric) => set({ metric })} />
      <CategoryChip
        categories={categories}
        value={plan.filters.categoryId}
        onChange={(categoryId) => setFilter({ categoryId })}
      />
      <GroupByChip value={plan.groupBy} onChange={(groupBy: GroupBy | null) => set({ groupBy })} />
      <IntervalChip
        value={plan.interval}
        onChange={(interval: Interval | null) => set({ interval })}
      />
      <RangeChip value={plan.range} onChange={(range: PlanRange) => set({ range })} />
      <CurrencyChip
        defaultCurrency={defaultCurrency}
        value={plan.filters.currency}
        onChange={(currency) => setFilter({ currency })}
      />
    </div>
  );
}
```

Now rewrite `frontend/src/screens/Insights.tsx` so the chips drive the URL:

```tsx
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useActiveProfile, useCategories, useExecutePlan } from '../api/hooks';
import type { Plan } from '../api/types';
import { Card } from '../components/Card';
import { ChipBar } from '../insights/chips/ChipBar';
import { describePlan, planFromSearch, planToSearch } from '../insights/planDefaults';
import { ResultTable } from '../insights/renderers/ResultTable';
import { flattenTree } from '../lib/categoryColor';

export function Insights() {
  const profile = useActiveProfile();
  const { data: categories } = useCategories();
  const [searchParams, setSearchParams] = useSearchParams();
  const execute = useExecutePlan();

  if (!profile) return null;
  const currency = profile.defaultCurrency;
  const byId = flattenTree(categories ?? []);
  const plan = planFromSearch(searchParams.get('plan'), currency);
  const categoryName =
    plan.filters.categoryId !== undefined ? byId.get(plan.filters.categoryId)?.name : undefined;

  // The plan lives in the URL so an exploration is linkable and survives a
  // reload — the same idiom as the Transactions filters.
  const setPlan = (next: Plan) => {
    const params = new URLSearchParams(searchParams);
    params.set('plan', planToSearch(next));
    setSearchParams(params, { replace: true });
  };

  const envelope = execute.data;
  const error = execute.error;

  return (
    <main>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          margin: '26px 0 18px',
        }}
      >
        <h2 style={{ margin: 0 }}>Insights</h2>
        <span className="text-muted" style={{ fontSize: 13 }}>
          one question at a time · {profile.name}
        </span>
      </div>
      <Card style={{ padding: '18px 20px' }}>
        <div className="kicker" style={{ marginBottom: 10 }}>
          Plan
        </div>
        <ChipBar
          plan={plan}
          categories={categories ?? []}
          defaultCurrency={currency}
          onChange={setPlan}
        />
        <div className="text-muted" style={{ fontSize: 12, margin: '10px 0 14px' }}>
          {describePlan(plan, categoryName)}
        </div>
        <button
          className="btn btn-primary"
          onClick={() => execute.mutate(plan)}
          disabled={execute.isPending}
        >
          {execute.isPending ? 'Running…' : 'Run'}
        </button>
        {error && (
          <div className="error-box" style={{ marginTop: 12 }}>
            {error instanceof ApiError
              ? `${error.status} ${error.type.replace('/errors/', '')} — ${error.detail}`
              : 'Could not run the plan — is the backend running?'}
          </div>
        )}
      </Card>
      {envelope?.results.map((result) => (
        <Card key={result.currency} style={{ padding: '18px 20px', marginTop: 24 }}>
          <div className="kicker">{result.currency}</div>
          <ResultTable result={result} />
        </Card>
      ))}
    </main>
  );
}
```

- [ ] **Step 4: Run the type-check to verify it passes**

Run, from `/home/chris/side-projects/my-finance/frontend`:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add frontend/src/insights/chips frontend/src/screens/Insights.tsx
git commit -m "feat(frontend): insights chip builder — the plan as six editable chips in the URL"
```

---


### Task 34: [MY-32] The four renderers, dispatched by shape

Stat tile for `value`, line for `timeseries`, bars for `breakdown`, multi-line
for `timeseriesSplit` — bars instead of lines when a split has three or fewer
buckets. Every shape keeps its table, now behind a per-card chart/table toggle.
Series colours come from the category tree and the design palette; no Recharts
default colour is used anywhere.

**Files:**
- Create: `frontend/src/insights/renderers/chartTheme.ts`
- Create: `frontend/src/insights/renderers/ValueTile.tsx`
- Create: `frontend/src/insights/renderers/TimeseriesChart.tsx`
- Create: `frontend/src/insights/renderers/BreakdownChart.tsx`
- Create: `frontend/src/insights/renderers/TimeseriesSplitChart.tsx`
- Create: `frontend/src/insights/renderers/ResultRenderer.tsx`
- Modify: `frontend/src/screens/Insights.tsx` (add the `view` state, swap `ResultTable` for `ResultRenderer` in the result cards, add the `.seg` toggle)
- Modify: `docs/LESSONS.md` (append one entry at the end) — **gitignored (`.gitignore` → "Private / local-only"); write it, never `git add` it**

**Interfaces:**
- Consumes, from Task 31: the types `CurrencyResult`, `Group`, `Point`, `Series`,
  `CategoryNode` from `../../api/types`; the `recharts` package.
- Consumes, from Task 32: `ResultTable({ result }: { result: CurrencyResult })`
  from `./ResultTable`.
- Consumes, existing: `KpiTile({ label, value, sub?, compact? })` from
  `../../components/Card`; `formatAmount(decimalString: string | number, currency: string): string`
  from `../../lib/money`; `PALETTE: ReadonlyArray<readonly [name: string, hex: string]>`
  and `effectiveColor(byId: Map<number, CategoryNode>, id: number): string` from
  `../../lib/categoryColor`.
- Produces:
  - `const CHART_HEIGHT = 280`, `AXIS_PROPS`, `GRID_PROPS`, `TOOLTIP_PROPS`,
    `formatTick(value: number): string`, and
    `seriesColors(byId: Map<number, CategoryNode>, groupBy: string | null): (key: string, index: number) => string`
    — all from `frontend/src/insights/renderers/chartTheme.ts`
  - `ValueTile({ currency: string; value: string; label: string })`
  - `TimeseriesChart({ currency: string; points: Point[]; color: string })`
  - `BreakdownChart({ currency: string; groups: Group[]; colorFor: (key: string, index: number) => string })`
  - `TimeseriesSplitChart({ currency: string; series: Series[]; colorFor: (key: string, index: number) => string })`
  - `ResultRenderer({ result: CurrencyResult; colorFor: (key: string, index: number) => string; view: 'chart' | 'table' })`

- [ ] **Step 1: Write the failing check — have the screen import the dispatcher**

In `frontend/src/screens/Insights.tsx`, add the import:

```tsx
import { ResultRenderer } from '../insights/renderers/ResultRenderer';
```

- [ ] **Step 2: Run the type-check to verify it fails**

Run, from `/home/chris/side-projects/my-finance/frontend`:

```bash
npm run build
```

Expected: FAIL with
`error TS2307: Cannot find module '../insights/renderers/ResultRenderer' or its corresponding type declarations.`

- [ ] **Step 3: Write the chart theme, the four renderers, and the dispatcher**

Create `frontend/src/insights/renderers/chartTheme.ts`:

```ts
// Recharts styling, driven entirely by the design tokens: SVG accepts
// `var(--…)` in stroke and fill, so the tokens go straight through as props and
// docs/design/styles.css stays authoritative (spec D8).

import type { CategoryNode } from '../../api/types';
import { PALETTE, effectiveColor } from '../../lib/categoryColor';

/**
 * Explicit, because a ResponsiveContainer with no height inside a card with no
 * intrinsic height renders a 0px-tall blank chart.
 */
export const CHART_HEIGHT = 280;

export const AXIS_PROPS = {
  stroke: 'var(--color-neutral-500)',
  tick: { fill: 'var(--color-neutral-700)', fontSize: 11 },
  tickLine: false,
};

export const GRID_PROPS = {
  stroke: 'var(--color-divider)',
  strokeDasharray: '3 3',
  vertical: false,
};

export const TOOLTIP_PROPS = {
  contentStyle: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)',
    borderRadius: 12,
    fontSize: 12,
  },
  labelStyle: { color: 'var(--color-text)' },
  cursor: { fill: 'color-mix(in srgb, var(--color-text) 8%, transparent)' },
};

const axisNumber = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });

/** Axis ticks stay bare numbers — the currency is named once, on the card. */
export function formatTick(value: number): string {
  return axisNumber.format(value);
}

/**
 * Series colours: category groups reuse the tree's effective colour, so a chart
 * matches the dots the user already sees elsewhere; anything else cycles the
 * design palette. Never Recharts' own defaults.
 */
export function seriesColors(byId: Map<number, CategoryNode>, groupBy: string | null) {
  return (key: string, index: number): string => {
    if (groupBy === 'category') {
      const id = Number(key);
      if (Number.isInteger(id) && byId.has(id)) return effectiveColor(byId, id);
    }
    return PALETTE[index % PALETTE.length][1];
  };
}
```

Create `frontend/src/insights/renderers/ValueTile.tsx`:

```tsx
import { KpiTile } from '../../components/Card';
import { formatAmount } from '../../lib/money';

/** The `value` shape: a single number, rendered as the app's existing KPI tile. */
export function ValueTile({
  currency,
  value,
  label,
}: {
  currency: string;
  value: string;
  label: string;
}) {
  return <KpiTile label={label} value={formatAmount(value, currency)} sub={currency} />;
}
```

Create `frontend/src/insights/renderers/TimeseriesChart.tsx`:

```tsx
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Point } from '../../api/types';
import { formatAmount } from '../../lib/money';
import { AXIS_PROPS, CHART_HEIGHT, GRID_PROPS, TOOLTIP_PROPS, formatTick } from './chartTheme';

/** The `timeseries` shape: one line over gap-free, zero-filled buckets. */
export function TimeseriesChart({
  currency,
  points,
  color,
}: {
  currency: string;
  points: Point[];
  color: string;
}) {
  // parseFloat is display-only, exactly as lib/money.ts sanctions: nothing here
  // is ever sent back to the API.
  const data = points.map((point) => ({
    period: point.period,
    value: parseFloat(point.value) || 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="period" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} width={64} tickFormatter={formatTick} />
        <Tooltip
          {...TOOLTIP_PROPS}
          formatter={(value) => formatAmount(value as string | number, currency)}
        />
        <Line
          type="monotone"
          dataKey="value"
          name={currency}
          stroke={color}
          strokeWidth={2}
          dot={{ r: 2, fill: color }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

Create `frontend/src/insights/renderers/BreakdownChart.tsx`:

```tsx
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Group } from '../../api/types';
import { formatAmount } from '../../lib/money';
import { AXIS_PROPS, CHART_HEIGHT, GRID_PROPS, TOOLTIP_PROPS, formatTick } from './chartTheme';

/** The `breakdown` shape: one bar per group, each in the group's own colour. */
export function BreakdownChart({
  currency,
  groups,
  colorFor,
}: {
  currency: string;
  groups: Group[];
  colorFor: (key: string, index: number) => string;
}) {
  const data = groups.map((group, index) => ({
    key: group.key,
    label: group.label,
    value: parseFloat(group.value) || 0,
    color: colorFor(group.key, index),
  }));

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} width={64} tickFormatter={formatTick} />
        <Tooltip
          {...TOOLTIP_PROPS}
          formatter={(value) => formatAmount(value as string | number, currency)}
        />
        <Bar dataKey="value" name={currency} radius={[6, 6, 0, 0]} isAnimationActive={false}>
          {data.map((row) => (
            <Cell key={row.key} fill={row.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
```

Create `frontend/src/insights/renderers/TimeseriesSplitChart.tsx`:

```tsx
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Series } from '../../api/types';
import { formatAmount } from '../../lib/money';
import { AXIS_PROPS, CHART_HEIGHT, GRID_PROPS, TOOLTIP_PROPS, formatTick } from './chartTheme';

/**
 * The `timeseriesSplit` shape: one line per series — or grouped bars when there
 * are three or fewer buckets, because a line joining two dots is a worse chart
 * than two bars (docs/INSIGHTS.md → Result shapes).
 *
 * Every series carries a point for every bucket (the executor zero-fills per
 * series), so the first series' periods drive the rows.
 */
export function TimeseriesSplitChart({
  currency,
  series,
  colorFor,
}: {
  currency: string;
  series: Series[];
  colorFor: (key: string, index: number) => string;
}) {
  const periods = series[0]?.points.map((point) => point.period) ?? [];
  const data = periods.map((period, index) => {
    const row: Record<string, string | number> = { period };
    for (const one of series) {
      row[one.key] = parseFloat(one.points[index]?.value ?? '0') || 0;
    }
    return row;
  });
  const margin = { top: 8, right: 12, left: 4, bottom: 0 };

  if (periods.length <= 3) {
    return (
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={data} margin={margin}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="period" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} width={64} tickFormatter={formatTick} />
          <Tooltip
            {...TOOLTIP_PROPS}
            formatter={(value) => formatAmount(value as string | number, currency)}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((one, index) => (
            <Bar
              key={one.key}
              dataKey={one.key}
              name={one.label}
              fill={colorFor(one.key, index)}
              radius={[6, 6, 0, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <LineChart data={data} margin={margin}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="period" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} width={64} tickFormatter={formatTick} />
        <Tooltip
          {...TOOLTIP_PROPS}
          formatter={(value) => formatAmount(value as string | number, currency)}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((one, index) => (
          <Line
            key={one.key}
            type="monotone"
            dataKey={one.key}
            name={one.label}
            stroke={colorFor(one.key, index)}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
```

Create `frontend/src/insights/renderers/ResultRenderer.tsx`:

```tsx
import type { CurrencyResult } from '../../api/types';
import { BreakdownChart } from './BreakdownChart';
import { ResultTable } from './ResultTable';
import { TimeseriesChart } from './TimeseriesChart';
import { TimeseriesSplitChart } from './TimeseriesSplitChart';
import { ValueTile } from './ValueTile';

/**
 * The whole frontend contract with the executor: four shapes, one renderer
 * each, plus a table that applies to all of them. New analytics capability
 * that normalizes into these shapes costs no frontend work at all.
 */
export function ResultRenderer({
  result,
  colorFor,
  view,
}: {
  result: CurrencyResult;
  colorFor: (key: string, index: number) => string;
  view: 'chart' | 'table';
}) {
  if (view === 'table') return <ResultTable result={result} />;

  switch (result.shape) {
    case 'value':
      return <ValueTile currency={result.currency} value={result.value} label="total" />;
    case 'timeseries':
      return (
        <TimeseriesChart
          currency={result.currency}
          points={result.points}
          color="var(--color-accent)"
        />
      );
    case 'breakdown':
      return (
        <BreakdownChart currency={result.currency} groups={result.groups} colorFor={colorFor} />
      );
    case 'timeseriesSplit':
      return (
        <TimeseriesSplitChart
          currency={result.currency}
          series={result.series}
          colorFor={colorFor}
        />
      );
  }
}
```

In `frontend/src/screens/Insights.tsx`: add `import { useState } from 'react';`
as the first import, add `import { seriesColors } from '../insights/renderers/chartTheme';`,
**remove** the now-unused `import { ResultTable } from '../insights/renderers/ResultTable';`
(`noUnusedLocals` fails the build otherwise), add the view state next to the
other hooks:

```tsx
  const [view, setView] = useState<'chart' | 'table'>('chart');
```

and replace the result-card block at the bottom of the JSX with:

```tsx
      {envelope?.results.map((result) => (
        <Card key={result.currency} style={{ padding: '18px 20px', marginTop: 24 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <div className="kicker">{result.currency}</div>
            <span className="seg">
              {(['chart', 'table'] as const).map((mode) => (
                <button
                  key={mode}
                  className={`seg-btn${view === mode ? ' active' : ''}`}
                  aria-pressed={view === mode}
                  onClick={() => setView(mode)}
                >
                  {mode}
                </button>
              ))}
            </span>
          </div>
          <ResultRenderer
            result={result}
            colorFor={seriesColors(byId, plan.groupBy)}
            view={view}
          />
        </Card>
      ))}
```

Finally, append this entry to the end of `docs/LESSONS.md`:

```markdown
### A closed set of result shapes, and declarative charts instead of a plot call

- **What** — the executor tags every result with a `shape`, and the frontend has
  exactly one renderer per shape plus a table, each composed from Recharts
  components rather than produced by a plotting call.
- **Where** — `frontend/src/insights/renderers/` (`ResultRenderer.tsx` and the
  four renderers), designed in [`INSIGHTS.md`](./INSIGHTS.md) → "Result shapes".
- **Why it's this way** — In Python you draw a chart by *calling* a library:
  `ax.bar(...)`, then a run of mutations on a figure object you hold. Recharts
  inverts that — `<BarChart>` is a React component tree, so the chart re-renders
  from props like any other UI and there is no figure to mutate. That is what
  lets the design tokens be passed straight through as
  `stroke="var(--color-accent)"`, keeping `docs/design/styles.css` authoritative
  instead of duplicating a palette in chart code. The bigger decision is
  upstream: because the plan DSL can only ever produce four shapes, adding a
  plan field is *zero* frontend work. A renderer-per-question design would have
  grown a component per feature instead — the difference between a bounded
  promise and a BI product.
```

- [ ] **Step 4: Run the type-check to verify it passes**

Run, from `/home/chris/side-projects/my-finance/frontend`:

```bash
npm run build
```

Expected: PASS. This also proves the Recharts import surface resolves against
its bundled types — the first place in the repo that imports the package.

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add frontend/src/insights/renderers frontend/src/screens/Insights.tsx
git commit -m "feat(frontend): four insight renderers dispatched by result shape, with the table toggle"
```

---


### Task 35: [MY-32] Explorer states — rejected plans, analytics down, empty data

Four things the explorer must say clearly instead of showing a stack trace or a
blank card: a plan the executor rejected (with its problem list and a nudge to
edit a chip), the analytics service being down, an empty result, and a truncated
group list.

**There is no compiler-level red step here** — this task refines an existing
screen rather than crossing a module boundary, so Step 1 reproduces the state in
the running app and Step 2 records what it looks like *before* the fix. Both
states are then re-checked in Step 4.

**Files:**
- Modify: `frontend/src/screens/Insights.tsx` (replace the inline `error-box` with an `ExecutionError` component; add the empty / all-zero / truncated notes)

**Interfaces:**
- Consumes, from Task 31: `ResultEnvelope` (fields `plan`, `results`,
  `meta.truncatedGroups`) and `CurrencyResult` from `../api/types`.
- Consumes, existing: `ApiError` from `../api/client`, whose fields are
  `status: number`, `type: string` (the stable slug, e.g.
  `/errors/analytics-unavailable`), `detail: string`, and
  `extra: Record<string, unknown>` (the whole problem+json body, which is where
  the executor's `problems` array arrives).
- Consumes, from Task 30: the CSS class `.ins-problems`.
- Produces: `ExecutionError({ error }: { error: unknown })` — a module-local
  component in `Insights.tsx`, not exported (the same shape as
  `EmptyProfileHint` in `Dashboard.tsx`).

- [ ] **Step 1: Reproduce the rejected-plan state**

With the backend on :8080 and the analytics service on :8000, run the dev
server and open a plan pointing at a category id that does not exist:

```bash
cd /home/chris/side-projects/my-finance/frontend && npm run dev
# then open, in a logged-in browser session:
# http://localhost:5173/insights?plan=%7B%22version%22%3A1%2C%22metric%22%3A%22spend%22%2C%22filters%22%3A%7B%22categoryId%22%3A999999%2C%22includeDescendants%22%3Atrue%2C%22currency%22%3A%22PLN%22%7D%2C%22groupBy%22%3A%22category%22%2C%22interval%22%3Anull%2C%22range%22%3A%7B%22type%22%3A%22lastMonths%22%2C%22n%22%3A1%7D%7D
```

Click **Run**.

- [ ] **Step 2: Record the pre-fix behaviour**

Expected, before this task's change: the error box shows the single generic line
`400 invalid-plan — <detail>`, the executor's `problems` array is nowhere on
screen, and there is no hint that editing the category chip is the fix. The
category chip does already read `unknown category #999999` (Task 33). Stopping
the analytics service and clicking Run again shows
`503 analytics-unavailable — <detail>`, which reads like a crash rather than an
operational state.

- [ ] **Step 3: Add the state handling**

In `frontend/src/screens/Insights.tsx`, replace the inline error box

```tsx
        {error && (
          <div className="error-box" style={{ marginTop: 12 }}>
            {error instanceof ApiError
              ? `${error.status} ${error.type.replace('/errors/', '')} — ${error.detail}`
              : 'Could not run the plan — is the backend running?'}
          </div>
        )}
```

with

```tsx
        {error && <ExecutionError error={error} />}
```

replace the results block's opening so empty results are a sentence rather than
nothing at all:

```tsx
      {envelope && envelope.results.length === 0 && (
        <Card style={{ padding: 40, textAlign: 'center', marginTop: 24 }}>
          <p className="text-muted" style={{ margin: 0 }}>
            No transactions match this plan — an empty answer is still an answer.
            Widen the range or clear the category chip.
          </p>
        </Card>
      )}
      {envelope?.meta.truncatedGroups && (
        <p className="text-muted" style={{ fontSize: 12, margin: '14px 0 0' }}>
          Only the top 25 groups are charted; the rest are aggregated as “Other”.
        </p>
      )}
```

and add, inside each result card, under the `<ResultRenderer …/>`:

```tsx
          {isAllZero(result) && (
            <p className="text-muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
              Every bucket in this range is zero.
            </p>
          )}
```

Then add these two module-local helpers at the end of the file, after the
`Insights` component:

```tsx
/** Execute failures the explorer has something specific to say about. */
function ExecutionError({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) {
    return (
      <div className="error-box" style={{ marginTop: 12 }}>
        Could not run the plan — is the backend running?
      </div>
    );
  }

  if (error.type === '/errors/analytics-unavailable') {
    return (
      <div className="error-box" style={{ marginTop: 12 }}>
        The analytics service isn&apos;t running, so insights can&apos;t be computed right now.
        Everything else in the app keeps working.
      </div>
    );
  }

  const problems = Array.isArray(error.extra.problems) ? (error.extra.problems as string[]) : [];
  if (problems.length > 0) {
    return (
      <div className="error-box" style={{ marginTop: 12 }}>
        <div style={{ marginBottom: 6 }}>
          The analytics service rejected this plan — edit a chip and run again:
        </div>
        <ul className="ins-problems">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="error-box" style={{ marginTop: 12 }}>
      {error.status} {error.type.replace('/errors/', '')} — {error.detail}
    </div>
  );
}

/**
 * A zero-filled chart is a correct answer, not an empty state — but saying so
 * beats letting the user wonder whether the chart failed to load.
 */
function isAllZero(result: CurrencyResult): boolean {
  switch (result.shape) {
    case 'value':
      return parseFloat(result.value) === 0;
    case 'timeseries':
      return result.points.every((point) => parseFloat(point.value) === 0);
    case 'breakdown':
      return result.groups.every((group) => parseFloat(group.value) === 0);
    case 'timeseriesSplit':
      return result.series.every((series) =>
        series.points.every((point) => parseFloat(point.value) === 0),
      );
  }
}
```

Add `CurrencyResult` to the type import at the top of the file:

```tsx
import type { CurrencyResult, Plan } from '../api/types';
```

- [ ] **Step 4: Verify all four states**

Run, from `/home/chris/side-projects/my-finance/frontend`:

```bash
npm run build && npm run dev
```

Expected: the build exits 0, and in the running app —
1. the stale-category URL from Step 1 now shows the bulleted problem list under
   "edit a chip and run again";
2. with the analytics service stopped, Run shows "The analytics service isn't
   running…" and no status code;
3. a plan over a fresh, empty profile shows the "No transactions match this
   plan" card;
4. a plan over a range with rows but zero amounts still draws its chart, with
   the "Every bucket in this range is zero." note under it.

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add frontend/src/screens/Insights.tsx
git commit -m "feat(frontend): explorer states — plan problems, analytics-unavailable, empty and zero results"
```

---


### Task 36: [MY-32] Save, rename, delete and pin an insight

An exploration becomes an Insight by getting a name. The sidebar holds the save
form and the saved list; `?insight=<id>` opens a saved insight, which is what
makes a saved question linkable and what the dashboard tiles link to.

**No compiler-level red step** — no new module is crossed; the task adds a
panel to an existing screen using hooks delivered in Task 31. Step 1 records the
missing affordance, Step 4 walks the full save → rename → pin → delete loop.

**Files:**
- Modify: `frontend/src/screens/Insights.tsx` (whole-file rewrite: two-column layout, save form, saved list)

**Interfaces:**
- Consumes, from Task 31: `useInsights()` (list, sorted `pinned DESC, name ASC`
  by the server), `useInsight(id: number)` (disabled when `id <= 0`),
  `useCreateInsight()` (`mutate(body: InsightRequest)`),
  `useUpdateInsight()` (`mutate({ id, body })`), `useDeleteInsight()`
  (`mutate(id)`), `useExecutePlan()` (`mutate(plan)`); types `Insight`,
  `InsightRequest`, `CurrencyResult`, `Plan`.
- Consumes, from Task 32: `describePlan`, `planFromSearch`, `planToSearch`.
- Consumes, from Task 33: `ChipBar`.
- Consumes, from Task 34: `ResultRenderer`, `seriesColors`.
- Consumes, existing: `TrashIcon({ size?: number })` from `../components/icons`;
  `flattenTree` from `../lib/categoryColor`; `Card` from `../components/Card`.
- Produces: accessible names the e2e depends on — the text input
  `aria-label="Insight name"`, the buttons `Save` (exact) / `Save changes`,
  `Pin <name>`, `Unpin <name>`, `Delete <name>`, `New insight`.

- [ ] **Step 1: Record the missing affordance**

Run, from `/home/chris/side-projects/my-finance/frontend`:

```bash
grep -c "Insight name" src/screens/Insights.tsx
```

Expected: `0` — a run can be looked at but not kept, and nothing on the screen
lists what has already been saved.

- [ ] **Step 2: Confirm the endpoints the panel will call**

Run, from `/home/chris/side-projects/my-finance`:

```bash
grep -n "POST /api/insights\|PUT /api/insights\|DELETE /api/insights\|GET /api/insights" docs/API.md
```

Expected: the five insight endpoints listed — `POST /api/insights/execute`,
`POST /api/insights`, `GET /api/insights`, `GET /api/insights/{id}`,
`PUT /api/insights/{id}`, `DELETE /api/insights/{id}`. `PUT` is a full
replacement, so every update sends `name`, `plan`, `viz` and `pinned` together;
a rename that omitted `pinned` would silently unpin.

- [ ] **Step 3: Rewrite the screen with the save/pin sidebar**

Replace `frontend/src/screens/Insights.tsx` entirely with:

```tsx
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  useActiveProfile,
  useCategories,
  useCreateInsight,
  useDeleteInsight,
  useExecutePlan,
  useInsight,
  useInsights,
  useUpdateInsight,
} from '../api/hooks';
import type { CurrencyResult, Insight as SavedInsight, Plan } from '../api/types';
import { Card } from '../components/Card';
import { TrashIcon } from '../components/icons';
import { ChipBar } from '../insights/chips/ChipBar';
import { describePlan, planFromSearch, planToSearch } from '../insights/planDefaults';
import { ResultRenderer } from '../insights/renderers/ResultRenderer';
import { seriesColors } from '../insights/renderers/chartTheme';
import { flattenTree } from '../lib/categoryColor';

export function Insights() {
  const profile = useActiveProfile();
  const { data: categories } = useCategories();
  const [searchParams, setSearchParams] = useSearchParams();
  const execute = useExecutePlan();
  const insights = useInsights();
  const createInsight = useCreateInsight();
  const updateInsight = useUpdateInsight();
  const deleteInsight = useDeleteInsight();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  // null = "follow the open insight's name"; a string = the user is typing.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');

  // ?insight=<id> opens a saved insight; editing a chip then writes ?plan=,
  // which takes precedence so an edit is never lost on a re-render.
  const rawId = Number(searchParams.get('insight') ?? '0');
  const openId = Number.isInteger(rawId) && rawId > 0 ? rawId : 0;
  const saved = useInsight(openId);

  if (!profile) return null;
  const currency = profile.defaultCurrency;
  const byId = flattenTree(categories ?? []);
  const planParam = searchParams.get('plan');
  const plan = planParam
    ? planFromSearch(planParam, currency)
    : (saved.data?.plan ?? planFromSearch(null, currency));
  const categoryName =
    plan.filters.categoryId !== undefined ? byId.get(plan.filters.categoryId)?.name : undefined;
  const name = nameDraft ?? saved.data?.name ?? '';
  const list = insights.data ?? [];

  // The plan lives in the URL so an exploration is linkable and survives a
  // reload — the same idiom as the Transactions filters.
  const setPlan = (next: Plan) => {
    const params = new URLSearchParams(searchParams);
    params.set('plan', planToSearch(next));
    setSearchParams(params, { replace: true });
  };

  const onSaveError = (err: unknown) => {
    setSaveError(
      err instanceof ApiError
        ? `${err.status} ${err.type.replace('/errors/', '')} — ${err.detail}`
        : 'Could not save the insight.',
    );
  };

  const openSaved = (insight: SavedInsight) => {
    setNameDraft(null);
    setSaveError('');
    // Both params: until useInsight resolves, ?plan= keeps the chips on this
    // insight's plan instead of flashing back to the default one.
    setSearchParams({ insight: String(insight.id), plan: planToSearch(insight.plan) });
  };

  const startNew = () => {
    setNameDraft(null);
    setSaveError('');
    setSearchParams({});
  };

  /** Save creates, or replaces the open insight (which is also the rename). */
  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setSaveError('Give the insight a name first.');
      return;
    }
    setSaveError('');
    if (saved.data) {
      updateInsight.mutate(
        {
          id: saved.data.id,
          body: { name: trimmed, plan, viz: saved.data.viz, pinned: saved.data.pinned },
        },
        { onSuccess: () => setNameDraft(null), onError: onSaveError },
      );
    } else {
      createInsight.mutate(
        { name: trimmed, plan },
        {
          onSuccess: (created) => {
            setNameDraft(null);
            setSearchParams(
              { insight: String(created.id), plan: planToSearch(plan) },
              { replace: true },
            );
          },
          onError: onSaveError,
        },
      );
    }
  };

  const togglePin = (insight: SavedInsight) => {
    setSaveError('');
    updateInsight.mutate(
      {
        id: insight.id,
        body: {
          name: insight.name,
          plan: insight.plan,
          viz: insight.viz,
          pinned: !insight.pinned,
        },
      },
      { onError: onSaveError },
    );
  };

  const remove = (insight: SavedInsight) => {
    setSaveError('');
    deleteInsight.mutate(insight.id, {
      onSuccess: () => {
        if (openId === insight.id) setSearchParams({});
      },
      onError: onSaveError,
    });
  };

  const envelope = execute.data;
  const error = execute.error;
  const busy = createInsight.isPending || updateInsight.isPending;

  return (
    <main>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          margin: '26px 0 18px',
        }}
      >
        <h2 style={{ margin: 0 }}>Insights</h2>
        <span className="text-muted" style={{ fontSize: 13 }}>
          one question at a time · {profile.name}
        </span>
      </div>
      <div
        style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 24, alignItems: 'start' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Card style={{ padding: '18px 20px' }}>
            <div className="kicker" style={{ marginBottom: 10 }}>
              Plan
            </div>
            <ChipBar
              plan={plan}
              categories={categories ?? []}
              defaultCurrency={currency}
              onChange={setPlan}
            />
            <div className="text-muted" style={{ fontSize: 12, margin: '10px 0 14px' }}>
              {describePlan(plan, categoryName)}
            </div>
            <button
              className="btn btn-primary"
              onClick={() => execute.mutate(plan)}
              disabled={execute.isPending}
            >
              {execute.isPending ? 'Running…' : 'Run'}
            </button>
            {error && <ExecutionError error={error} />}
          </Card>

          {envelope && envelope.results.length === 0 && (
            <Card style={{ padding: 40, textAlign: 'center' }}>
              <p className="text-muted" style={{ margin: 0 }}>
                No transactions match this plan — an empty answer is still an answer. Widen the
                range or clear the category chip.
              </p>
            </Card>
          )}
          {envelope?.results.map((result) => (
            <Card key={result.currency} style={{ padding: '18px 20px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}
              >
                <div className="kicker">{result.currency}</div>
                <span className="seg">
                  {(['chart', 'table'] as const).map((mode) => (
                    <button
                      key={mode}
                      className={`seg-btn${view === mode ? ' active' : ''}`}
                      aria-pressed={view === mode}
                      onClick={() => setView(mode)}
                    >
                      {mode}
                    </button>
                  ))}
                </span>
              </div>
              <ResultRenderer
                result={result}
                colorFor={seriesColors(byId, plan.groupBy)}
                view={view}
              />
              {isAllZero(result) && (
                <p className="text-muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
                  Every bucket in this range is zero.
                </p>
              )}
            </Card>
          ))}
          {envelope?.meta.truncatedGroups && (
            <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
              Only the top 25 groups are charted; the rest are aggregated as “Other”.
            </p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Card style={{ padding: '18px 20px' }}>
            <h4 style={{ margin: '0 0 12px' }}>
              {saved.data ? 'Saved insight' : 'Save this insight'}
            </h4>
            <div className="field">
              <label htmlFor="insight-name">Name</label>
              <input
                id="insight-name"
                className="input"
                value={name}
                onChange={(e) => {
                  setNameDraft(e.target.value);
                  setSaveError('');
                }}
                placeholder="e.g. Groceries, monthly"
                aria-label="Insight name"
              />
            </div>
            {saveError && (
              <div className="error-box" style={{ marginTop: 10 }}>
                {saveError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={save} disabled={busy}>
                {saved.data ? 'Save changes' : 'Save'}
              </button>
              {saved.data && (
                <button className="btn btn-secondary" onClick={startNew}>
                  New insight
                </button>
              )}
            </div>
          </Card>

          <Card style={{ padding: '18px 20px' }}>
            <h4 style={{ margin: '0 0 12px' }}>Saved</h4>
            {list.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {list.map((insight) => (
                  <div
                    key={insight.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
                  >
                    <button
                      className="btn btn-ghost"
                      style={{ padding: 0, flex: 1, justifyContent: 'flex-start' }}
                      onClick={() => openSaved(insight)}
                    >
                      {insight.name}
                    </button>
                    {insight.pinned && <span className="tag tag-accent-2">pinned</span>}
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '2px 8px' }}
                      onClick={() => togglePin(insight)}
                      disabled={updateInsight.isPending}
                      aria-label={`${insight.pinned ? 'Unpin' : 'Pin'} ${insight.name}`}
                    >
                      {insight.pinned ? 'unpin' : 'pin'}
                    </button>
                    <button
                      className="btn btn-icon"
                      onClick={() => remove(insight)}
                      disabled={deleteInsight.isPending}
                      aria-label={`Delete ${insight.name}`}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
                Nothing saved yet. Build a plan with the chips, run it, then give it a name.
              </p>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}

/** Execute failures the explorer has something specific to say about. */
function ExecutionError({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) {
    return (
      <div className="error-box" style={{ marginTop: 12 }}>
        Could not run the plan — is the backend running?
      </div>
    );
  }

  if (error.type === '/errors/analytics-unavailable') {
    return (
      <div className="error-box" style={{ marginTop: 12 }}>
        The analytics service isn&apos;t running, so insights can&apos;t be computed right now.
        Everything else in the app keeps working.
      </div>
    );
  }

  const problems = Array.isArray(error.extra.problems) ? (error.extra.problems as string[]) : [];
  if (problems.length > 0) {
    return (
      <div className="error-box" style={{ marginTop: 12 }}>
        <div style={{ marginBottom: 6 }}>
          The analytics service rejected this plan — edit a chip and run again:
        </div>
        <ul className="ins-problems">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="error-box" style={{ marginTop: 12 }}>
      {error.status} {error.type.replace('/errors/', '')} — {error.detail}
    </div>
  );
}

/**
 * A zero-filled chart is a correct answer, not an empty state — but saying so
 * beats letting the user wonder whether the chart failed to load.
 */
function isAllZero(result: CurrencyResult): boolean {
  switch (result.shape) {
    case 'value':
      return parseFloat(result.value) === 0;
    case 'timeseries':
      return result.points.every((point) => parseFloat(point.value) === 0);
    case 'breakdown':
      return result.groups.every((group) => parseFloat(group.value) === 0);
    case 'timeseriesSplit':
      return result.series.every((series) =>
        series.points.every((point) => parseFloat(point.value) === 0),
      );
  }
}
```

- [ ] **Step 4: Walk the loop**

Run, from `/home/chris/side-projects/my-finance/frontend`:

```bash
npm run build && npm run dev
```

Expected: the build exits 0, and in the running app, with a profile that has
transactions —
1. Run, type "Groceries, monthly", **Save** → the row appears under "Saved" and
   the URL becomes `/insights?insight=<id>`;
2. change the name to "Groceries" and press **Save changes** → the row renames,
   with no second row created;
3. **pin** → the `pinned` tag appears; **unpin** → it disappears;
4. saving a second insight under the same name → the error box reads
   `409 insight-name-taken — …`;
5. **Delete** → the row goes and the form resets to "Save this insight".

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add frontend/src/screens/Insights.tsx
git commit -m "feat(frontend): save, rename, pin and delete insights from the explorer"
```

---


### Task 37: [MY-32] The template gallery

Code-shipped templates, not DB rows: they version with the DSL in the same
commit, they teach the chip vocabulary by example, and they give an empty
install something to click. Opening one pre-fills the chips; it does not
auto-run, because the point is to *see* what changed.

**Files:**
- Create: `frontend/src/insights/templates.ts`
- Modify: `frontend/src/screens/Insights.tsx` (a third Card in the sidebar column)

**Interfaces:**
- Consumes, from Task 31: the type `Plan` from `../api/types`.
- Consumes, from Task 32: `PLAN_VERSION` and `describePlan(plan, categoryName?)`
  from `./planDefaults` / `../insights/planDefaults`, and
  `planToSearch(plan: Plan): string`.
- Consumes, from Task 30: the CSS class `.ins-template`.
- Produces, from `frontend/src/insights/templates.ts`:
  - `interface InsightTemplate { id: string; name: string; blurb: string; plan: (currency: string) => Plan }`
  - `const TEMPLATES: InsightTemplate[]`

- [ ] **Step 1: Write the failing check — have the screen import the templates**

In `frontend/src/screens/Insights.tsx`, add the import:

```tsx
import { TEMPLATES } from '../insights/templates';
```

- [ ] **Step 2: Run the type-check to verify it fails**

Run, from `/home/chris/side-projects/my-finance/frontend`:

```bash
npm run build
```

Expected: FAIL with
`error TS2307: Cannot find module '../insights/templates' or its corresponding type declarations.`

- [ ] **Step 3: Write the templates and the gallery card**

Create `frontend/src/insights/templates.ts`:

```ts
// The template gallery — docs/INSIGHTS.md → "Template gallery". Code-shipped,
// not DB rows: they version with the DSL in the same commit, they teach the
// chip vocabulary by example, and they give an empty install something to
// click. Opening one pre-fills the chips; the user tweaks, runs, saves.

import type { Plan } from '../api/types';
import { PLAN_VERSION } from './planDefaults';

export interface InsightTemplate {
  id: string;
  name: string;
  /** One line on the gallery card: what the chart answers, and what to tweak. */
  blurb: string;
  plan: (currency: string) => Plan;
}

export const TEMPLATES: InsightTemplate[] = [
  {
    id: 'monthly-in-category',
    name: 'Monthly spending in a category',
    blurb: 'Pick a category with the chip, then run — twelve monthly points.',
    plan: (currency) => ({
      version: PLAN_VERSION,
      metric: 'spend',
      filters: { includeDescendants: true, currency },
      groupBy: null,
      interval: 'month',
      range: { type: 'lastMonths', n: 12 },
    }),
  },
  {
    id: 'top-categories',
    name: 'Top categories this month',
    blurb: 'Where the money went, one bar per top-level category.',
    plan: (currency) => ({
      version: PLAN_VERSION,
      metric: 'spend',
      filters: { includeDescendants: true, currency },
      groupBy: 'category',
      interval: null,
      range: { type: 'lastMonths', n: 1 },
    }),
  },
  {
    id: 'this-vs-last-month',
    name: 'This month vs last month, by category',
    blurb: 'Two buckets, so it draws as grouped bars rather than stubby lines.',
    plan: (currency) => ({
      version: PLAN_VERSION,
      metric: 'spend',
      filters: { includeDescendants: true, currency },
      groupBy: 'category',
      interval: 'month',
      range: { type: 'lastMonths', n: 2 },
    }),
  },
  // "Income vs spending, monthly" is two insights shown side by side — one
  // metric per plan is a design rule (INSIGHTS.md → Plan DSL v1), so the
  // gallery ships both halves and the user pins them next to each other.
  {
    id: 'income-monthly',
    name: 'Income, monthly — last 12 months',
    blurb: 'Half of the income-vs-spending pair; pin it beside the other half.',
    plan: (currency) => ({
      version: PLAN_VERSION,
      metric: 'income',
      filters: { includeDescendants: true, currency },
      groupBy: null,
      interval: 'month',
      range: { type: 'lastMonths', n: 12 },
    }),
  },
  {
    id: 'spending-monthly',
    name: 'Spending, monthly — last 12 months',
    blurb: 'The other half of the pair, on the same buckets and scale.',
    plan: (currency) => ({
      version: PLAN_VERSION,
      metric: 'spend',
      filters: { includeDescendants: true, currency },
      groupBy: null,
      interval: 'month',
      range: { type: 'lastMonths', n: 12 },
    }),
  },
  // Gallery entry 5, "Weekday pattern: average daily spend", is deliberately
  // absent: it needs a `weekday` groupBy the DSL does not have. It is recorded
  // in INSIGHTS.md → "Deliberately deferred" with its trigger (demand for the
  // weekday template), so the gallery grows when the DSL does.
  {
    id: 'subscription-cost',
    name: 'Subscription cost over time',
    blurb:
      'Approximate: pick the category your subscriptions are booked to. Exact once a subscriptionsOnly filter exists.',
    plan: (currency) => ({
      version: PLAN_VERSION,
      metric: 'spend',
      filters: { includeDescendants: true, currency },
      groupBy: null,
      interval: 'month',
      range: { type: 'lastMonths', n: 12 },
    }),
  },
];
```

In `frontend/src/screens/Insights.tsx`, add a handler next to `openSaved`:

```tsx
  /** Templates land in the chips, unrun: the point is to see what changed. */
  const openTemplate = (plan: Plan) => {
    setNameDraft(null);
    setSaveError('');
    setSearchParams({ plan: planToSearch(plan) });
  };
```

and add a third Card at the end of the sidebar column, after the "Saved" card:

```tsx
          <Card style={{ padding: '18px 20px' }}>
            <h4 style={{ margin: '0 0 4px' }}>Start from a template</h4>
            <p className="text-muted" style={{ fontSize: 12, margin: '0 0 12px' }}>
              Each one fills the chips — tweak, run, save.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  className="ins-template"
                  onClick={() => openTemplate(template.plan(currency))}
                >
                  <span style={{ fontSize: 13 }}>{template.name}</span>
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    {template.blurb}
                  </span>
                </button>
              ))}
            </div>
          </Card>
```

- [ ] **Step 4: Run the type-check and click through the gallery**

Run, from `/home/chris/side-projects/my-finance/frontend`:

```bash
npm run build && npm run dev
```

Expected: the build exits 0, and clicking "Top categories this month" sets the
chips to `spend · all categories · by category · this month · PLN`, while "This
month vs last month, by category" sets `per month` and `last 2 months` — each
loading into the chips without running.

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add frontend/src/insights/templates.ts frontend/src/screens/Insights.tsx
git commit -m "feat(frontend): insight template gallery, pre-filling the chips"
```

---


### Task 38: [MY-32] Pinned insights as dashboard tiles

Pinned insights execute on load and render as chart tiles below the dashboard's
existing sections. Strictly additive: the section renders nothing at all when
nothing is pinned, so a user who never opens Insights sees an unchanged
dashboard.

**Files:**
- Create: `frontend/src/components/PinnedInsights.tsx`
- Modify: `frontend/src/screens/Dashboard.tsx` (one import; one `<PinnedInsights />` between the main grid and `<EmptyProfileHint …/>`)

**Interfaces:**
- Consumes, from Task 31: `useInsights()`, `useInsightResults(insights: Insight[] | undefined)`
  (a `useQueries` fan-out returning one query result per insight, in order, each
  with `.data?: ResultEnvelope`, `.isError`), `useCategories()`; the type `Insight`.
- Consumes, from Task 32: `describePlan(plan, categoryName?)`, `planToSearch(plan)`.
- Consumes, from Task 34: `ResultRenderer({ result, colorFor, view })`,
  `seriesColors(byId, groupBy)`.
- Consumes, existing: `Card` from `./Card`; `flattenTree` from `../lib/categoryColor`;
  `Link` from `react-router-dom`.
- Produces: `PinnedInsights()` — a named export rendering `null` when nothing is
  pinned.

- [ ] **Step 1: Write the failing check — have the dashboard import the section**

In `frontend/src/screens/Dashboard.tsx`, add the import after the `CategoryDot`
import:

```tsx
import { PinnedInsights } from '../components/PinnedInsights';
```

and mount it just before `<EmptyProfileHint …/>` at the end of the `<main>`:

```tsx
      <PinnedInsights />
      <EmptyProfileHint hasTxns={recent.length > 0} loaded={recentTxns.isSuccess} />
```

- [ ] **Step 2: Run the type-check to verify it fails**

Run, from `/home/chris/side-projects/my-finance/frontend`:

```bash
npm run build
```

Expected: FAIL with
`error TS2307: Cannot find module '../components/PinnedInsights' or its corresponding type declarations.`

- [ ] **Step 3: Write the pinned section**

Create `frontend/src/components/PinnedInsights.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { useCategories, useInsightResults, useInsights } from '../api/hooks';
import { describePlan, planToSearch } from '../insights/planDefaults';
import { ResultRenderer } from '../insights/renderers/ResultRenderer';
import { seriesColors } from '../insights/renderers/chartTheme';
import { flattenTree } from '../lib/categoryColor';
import { Card } from './Card';

/**
 * Pinned insights, executed on load, as dashboard tiles. Additive by design:
 * with nothing pinned this renders nothing and the dashboard is unchanged.
 */
export function PinnedInsights() {
  const { data: categories } = useCategories();
  const insights = useInsights();
  // The server already sorts pinned first; filtering keeps the tile order.
  const pinned = (insights.data ?? []).filter((insight) => insight.pinned);
  const results = useInsightResults(pinned);

  if (pinned.length === 0) return null;
  const byId = flattenTree(categories ?? []);

  return (
    <div style={{ marginTop: 28 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 14,
        }}
      >
        <h4 style={{ margin: 0 }}>Pinned insights</h4>
        <Link to="/insights" style={{ fontSize: 13 }}>
          Explore
        </Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
        {pinned.map((insight, index) => {
          const query = results[index];
          const envelope = query?.data;
          const categoryName =
            insight.plan.filters.categoryId !== undefined
              ? byId.get(insight.plan.filters.categoryId)?.name
              : undefined;
          return (
            <Card key={insight.id} style={{ padding: '18px 20px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 14 }}>{insight.name}</span>
                <Link
                  to={`/insights?insight=${insight.id}&plan=${encodeURIComponent(planToSearch(insight.plan))}`}
                  style={{ fontSize: 12, whiteSpace: 'nowrap' }}
                >
                  Open
                </Link>
              </div>
              <div className="text-muted" style={{ fontSize: 12, margin: '2px 0 12px' }}>
                {describePlan(insight.plan, categoryName)}
              </div>
              {envelope ? (
                envelope.results.map((result) => (
                  <ResultRenderer
                    key={result.currency}
                    result={result}
                    colorFor={seriesColors(byId, insight.plan.groupBy)}
                    view="chart"
                  />
                ))
              ) : (
                <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
                  {query?.isError ? 'Could not run this insight.' : '…'}
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the type-check and look at the dashboard**

Run, from `/home/chris/side-projects/my-finance/frontend`:

```bash
npm run build && npm run dev
```

Expected: the build exits 0; with nothing pinned the dashboard is byte-for-byte
the screen it was before; after pinning an insight in the explorer, a "Pinned
insights" section appears below the budgets grid with the chart already drawn
(no extra click), and its "Open" link returns to the explorer with the chips
pre-filled.

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add frontend/src/components/PinnedInsights.tsx frontend/src/screens/Dashboard.tsx
git commit -m "feat(frontend): render pinned insights as dashboard tiles"
```

---


### Task 39: [MY-32] End-to-end acceptance — chips → chart → save → pin → tile

The acceptance test for MY-32: a chip-built plan runs, its chart renders, it
saves, it pins, and the tile shows up on the dashboard.

**This runs locally, against a running stack — not in CI.** `frontend/package.json`
has `"e2e": "playwright test"`, and `.github/workflows/ci.yml` runs only
`npm ci && npm run build` for the frontend. That is pre-existing and this plan
does not change it (R9): the e2e is a local verification step, and claiming it
as CI coverage would be false.

**Prerequisites, all on the host:** Postgres up (compose), the analytics service
listening on `:8000` (started per `analytics/README.md` from MY-29 — the
backend's `analytics.base-url` defaults to `http://localhost:8000`), and the
backend on `:8080` (`cd backend && ./mvnw spring-boot:run`). Playwright starts
or reuses the Vite dev server itself, which proxies `/api` to `:8080`.

**This is an acceptance test, not a TDD cycle** — by the time it runs the
feature exists, so it is expected to pass on first execution. Its job is to
prove the whole loop end to end and to leave a screenshot behind.

**Files:**
- Modify: `frontend/e2e/smoke.spec.ts` (append one `test(…)` block at the end; it reuses the file's existing `registerAndLogin`, `createProfile`, `addCategory`, `isoToday`, `PASSWORD` and `SHOTS` helpers)

**Interfaces:**
- Consumes: the accessible names produced by earlier tasks — `aria-label`s
  `Metric`, `Category`, `Group by`, `Interval`, `Range`, `Currency`,
  `Insight name`; buttons `Run`, `Save` (exact), `Pin <name>`; the `.seg-btn`
  toggle labelled `table`; and the nav links `Insights` and `Dashboard`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the acceptance test**

Append to `frontend/e2e/smoke.spec.ts`:

```ts
test('insights: chips build a plan, it charts, saves, pins, and lands on the dashboard', async ({
  page,
}) => {
  const email = `e2e-insights-${Date.now()}@example.com`;
  await registerAndLogin(page, email, 'E2E Insights');
  await createProfile(page, 'Personal');
  await page.getByRole('button', { name: /Personal/ }).click();

  await page.getByRole('link', { name: 'Categories', exact: true }).click();
  await addCategory(page, 'Groceries', 'Mint');

  // Three months of expenses, seeded through the API with the browser's own
  // session + CSRF cookie — the chart needs dated rows the UI would be slow to
  // enter one at a time.
  // Offsets chosen so all three rows land inside "last 3 months" whatever the
  // day of the month is when the suite runs.
  const dates = [isoToday(0), isoToday(-20), isoToday(-35)];
  await page.evaluate(async (occurredOn) => {
    const xsrf = document.cookie
      .split('; ')
      .find((c) => c.startsWith('XSRF-TOKEN='))!
      .split('=')[1];
    const cats: Array<{ id: number; name: string }> = await (
      await fetch('/api/categories', { credentials: 'include' })
    ).json();
    const groceries = cats.find((c) => c.name === 'Groceries')!;
    for (const date of occurredOn) {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-XSRF-TOKEN': decodeURIComponent(xsrf),
        },
        body: JSON.stringify({
          categoryId: groceries.id,
          amount: '120.00',
          currency: 'PLN',
          type: 'EXPENSE',
          occurredOn: date,
          description: 'Seeded for insights',
        }),
      });
      if (!res.ok) throw new Error(`txn seed failed: ${res.status} ${await res.text()}`);
    }
  }, dates);

  // — build the plan with the chips: monthly spend, no grouping, last 3 months —
  await page.getByRole('link', { name: 'Insights', exact: true }).click();
  await page.getByLabel('Metric').selectOption('spend');
  await page.getByLabel('Group by').selectOption('none');
  await page.getByLabel('Interval').selectOption('month');
  await page.getByLabel('Range').selectOption('lastMonths-3');
  await page.getByLabel('Currency').selectOption('PLN');
  // The plan is linkable: the chips wrote it into the URL.
  await expect(page).toHaveURL(/plan=/);
  await expect(page.getByText('spend · all categories · per month · last 3 months · PLN')).toBeVisible();

  await page.getByRole('button', { name: 'Run' }).click();

  // — the chart renders (Recharts mounts .recharts-wrapper) —
  // Scoped by the chart/table segmented control rather than by "PLN": the plan
  // card's currency chip contains that text too.
  const resultCard = page.locator('.blueprint').filter({ has: page.locator('.seg') }).first();
  await expect(resultCard.locator('.recharts-wrapper')).toBeVisible();

  // — the same result as a table, in pl-PL formatting —
  await page.getByRole('button', { name: 'table', exact: true }).click();
  await expect(resultCard).toContainText('120,00');
  await page.getByRole('button', { name: 'chart', exact: true }).click();

  // — save, then pin —
  await page.getByLabel('Insight name').fill('Groceries, monthly');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/insight=\d+/);
  await page.getByRole('button', { name: 'Pin Groceries, monthly' }).click();
  await expect(page.getByRole('button', { name: 'Unpin Groceries, monthly' })).toBeVisible();

  // — the pinned tile executes on the dashboard, with no extra click —
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  const tile = page.locator('.blueprint', { hasText: 'Groceries, monthly' }).first();
  await expect(tile).toBeVisible();
  await expect(tile.locator('.recharts-wrapper')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/06-insights.png`, fullPage: true });
});
```

- [ ] **Step 2: Confirm the stack is up before running**

Run, from `/home/chris/side-projects/my-finance`:

```bash
curl -s -o /dev/null -w 'backend %{http_code}\n' http://localhost:8080/actuator/health
curl -s -o /dev/null -w 'analytics %{http_code}\n' http://localhost:8000/internal/health
```

Expected: `backend 200` and `analytics 200`. Anything else means the e2e will
fail on the execute call rather than on the UI, so fix that first.

- [ ] **Step 3: Run the acceptance test**

Run, from `/home/chris/side-projects/my-finance/frontend`:

```bash
npm run e2e -- -g "insights: chips build a plan"
```

Expected: PASS — 1 passed. On failure Playwright writes a screenshot
(`screenshot: 'only-on-failure'`), and `/root/fe-shots/06-insights.png` is
written on success.

- [ ] **Step 4: Run the whole suite, to prove nothing regressed**

Run, from `/home/chris/side-projects/my-finance/frontend`:

```bash
npm run e2e
npm run build
```

Expected: 5 passed (the four pre-existing tests plus this one), and the build
exits 0.

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add frontend/e2e/smoke.spec.ts
git commit -m "test(frontend): e2e for the insights loop — chips, chart, save, pin, dashboard tile"
```
