# Insights design (Phases 4–5)

The design for the analytics service, the Insight entity, the query-plan DSL,
and the optional local-AI layer — settled before any code exists, in the same
spirit as [`SCHEMA.md`](./SCHEMA.md) and [`API.md`](./API.md). Those two
documents own the concrete table shape (`SCHEMA.md` → `insight`) and the REST
contract (`API.md` → "Insights"); this one owns everything they reference:
the plan DSL, the result shapes, the analytics service contract, and the
principles that keep the AI layer optional.

**Status of this document.** Once the executor and controllers exist they are
the source of truth for behavior; this file explains the reasoning. Update it
alongside any change that alters a decision recorded here.

---

## Contents

- [Principles](#principles)
- [The Insight](#the-insight)
- [Plan DSL v1](#plan-dsl-v1)
- [Execution semantics](#execution-semantics)
- [Result shapes](#result-shapes)
- [Forecast, anomalies and drift](#forecast-anomalies-and-drift)
- [The analytics service](#the-analytics-service)
- [Template gallery](#template-gallery)
- [The AI layer (Phase 5)](#the-ai-layer-phase-5)
- [Testing strategy](#testing-strategy)
- [Deliberately deferred](#deliberately-deferred)

---

## Principles

1. **The Insight is the product; AI is one way of authoring it.** Everything
   a user can do with natural language must be expressible — and visible —
   as a structured plan. A machine that can't run the AI container loses
   convenience, never capability.
2. **The LLM never queries data and never does arithmetic.** It translates
   language into a validated plan and narrates computed results. Every
   number a user sees was produced by SQL against real rows. (This refines
   the original "narration-only" rule in `ARCHITECTURE.md` §6: same
   principle — deterministic, testable analysis — honestly extended to
   cover translation.)
3. **Profile scoping is implemented exactly once.** The analytics service is
   never reachable from the browser. The backend authenticates the session,
   resolves the active profile server-side (as everywhere), and forwards the
   profile id over the internal network. The analytics service trusts that
   id precisely because nothing but the backend can reach it.
4. **Read-only as a database guarantee.** The analytics service connects as
   a Postgres role with `SELECT` only — the same philosophy as the
   composite FKs: a rule the schema enforces can't be forgotten in code.
5. **A small DSL beats a big one.** Every dimension added to the plan
   multiplies the executor's test matrix and the explorer's UI surface.
   v1 covers one metric axis and two grouping axes; anything more waits for
   a real question that can't be asked.

## The Insight

A saved, profile-scoped question:

```
Insight
├── name      "Lidl vs Biedronka, monthly"     (unique per profile)
├── plan      versioned JSON — see below
├── viz       optional render override — {"chart": "table"} pins the table
└── pinned    boolean — pinned insights render as dashboard tiles
```

A one-off exploration in the UI is simply an *unsaved* Insight: the same
plan object, executed through the same endpoint. "Save" adds a name.

Table design: `SCHEMA.md` → `insight`. Endpoints: `API.md` → "Insights".

**Plans are loosely coupled to categories.** `plan` is JSONB; a
`categoryId` inside it is not a foreign key. Deleting a category does *not*
block on insights (they are saved questions, not financial records — the
`category-in-use` 409 keeps its current meaning). Executing a plan whose
category no longer exists returns a `400` plan problem (`unknown
categoryId`), and the explorer offers to edit the stale chip. This is a
deliberate trade: referential looseness in exchange for keeping category
deletion painless.

## Plan DSL v1

A plan is a JSON object. Canonical example — the motivating query, "monthly
grocery spend, Lidl vs Biedronka, last 12 months":

```json
{
  "version": 1,
  "metric": "spend",
  "filters": {
    "categoryId": 12,
    "includeDescendants": true,
    "merchants": ["Lidl", "Biedronka"],
    "currency": "PLN"
  },
  "groupBy": "merchant",
  "interval": "month",
  "range": { "type": "lastMonths", "n": 12 }
}
```

| Field | Values | Meaning |
|---|---|---|
| `version` | `1` \| `2` | Plan schema version. Unknown versions are rejected (`unsupported plan version`), never guessed at — saved Insights outlive the DSL, and a version bump turns growth into a migration instead of silently broken tiles. v2 adds exactly one optional field, `forecast`; every saved v1 plan still executes unchanged, and a v1 plan carrying `forecast` is rejected. |
| `metric` | `spend` \| `income` \| `net` | What is summed. `spend`/`income` filter by `txn_type`; `net` is `income − spend` over the same rows. One metric per plan — comparing metrics is two insights side by side, not a second axis. |
| `filters.categoryId` | id, optional | Restrict to one category. Omitted = the whole profile. |
| `filters.includeDescendants` | boolean, default `true` | With `categoryId`: include the subtree (budget-status semantics — a filter on `Groceries` means groceries *including* `Groceries > Lidl`). The recursive CTE from `SCHEMA.md` query 1, same as everywhere. |
| `filters.merchants` | array of strings, optional | Restrict to these merchants. Literal equality on `txn.merchant` (`V5`, Phase 4b): a transaction with no merchant never matches, so `"Unspecified"` is a display label and never a filter value. At most 25 merchants, each at most 100 characters — the `txn.merchant` CHECK, so a longer value could match nothing anyway. |
| `filters.currency` | ISO 4217, optional | Restrict to one currency. See [currency rules](#execution-semantics). |
| `groupBy` | `category` \| `merchant` \| `null` | The categorical axis. `category` groups by the *children* of the filtered category (or by root categories when no filter), each child including its own subtree, plus the filtered category itself as one more group holding the transactions filed directly on it — so the groups partition the filtered set exactly rather than silently dropping those rows, matching the dashboard's rollup. `merchant` groups by the merchant string, with `null` collected under `"Unspecified"`. |
| `interval` | `day` \| `week` \| `month` \| `quarter` \| `year` \| `null` | The time axis, bucketing `occurred_on` (ISO weeks; buckets in the range with no rows are emitted with value `"0.0000"` so charts don't silently skip gaps). |
| `range` | see below | The time window over `occurred_on`, inclusive on both ends like every range in this project. |
| `forecast` | `{ "months": 1–12 }`, optional, **v2 only** | Appends a seasonal-naive projection to the time axis. Requires `interval: "month"`. See [Forecast, anomalies and drift](#forecast-anomalies-and-drift). |

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

**The result shape is derived, not declared** — `interval` × `groupBy`
decide it:

| `interval` | `groupBy` | Shape |
|---|---|---|
| `null` | `null` | `value` (single number) |
| set | `null` | `timeseries` |
| `null` | set | `breakdown` |
| set | set | `timeseriesSplit` ← the Lidl/Biedronka case |

There is no separate `split` field: when both axes are present, the
categorical axis *is* the split. A table is not a fifth computed shape — it
is a renderer applicable to every shape (and the explorer's honest
fallback), selectable via `viz`.

Validation is strict and structural: unknown fields, unknown enum values,
`from > to`, or a `categoryId` not in the executing profile are plan
problems returned as a list (`problems: [...]`), mirroring the backup
validator's style. Nothing is silently ignored — a
field the executor doesn't understand is a rejection, because a chart that
quietly dropped a filter is a wrong chart.

## Execution semantics

- **Currencies never mix** — the project-wide rule (`ARCHITECTURE.md` §3).
  The executor computes independently per currency and returns one result
  *per currency present* (see envelope below). With `filters.currency` set,
  that's exactly one. The explorer preselects the profile's default
  currency as a chip; removing it shows one chart per currency rather than
  a meaningless mixed total.
- **Amounts are decimal strings** at scale 4 (`"243.5000"`), computed by
  Postgres `SUM` over `NUMERIC(19,4)` — never floats, never client-side
  arithmetic. Same wire rule as the whole API.
- **`net` can be negative**; nothing clamps. `breakdown` results are sorted
  by absolute value descending; `timeseries` chronologically.
- **Zero-filled buckets apply per series.** Every bucket in the range with no
  rows is emitted with value `"0.0000"`, and in `timeseriesSplit` that holds
  for *each* series independently: every series emits a point for every
  bucket in the range. Without it a multi-line chart has ragged x-axes and
  series of unequal length — the exact silent-gap failure the zero-fill rule
  exists to prevent.
- **Bounded output.** Every categorical axis can produce more groups than a
  chart should render — a category with many children, or a merchant axis
  with a long history — so each is capped at the top 25
  groups by absolute value plus one aggregate row, keyed `"__other__"` (a
  real group can never collide with it) with label `"Other"`, flagged in
  `meta.truncatedGroups`. The time axis is bounded the same way: a plan
  whose range and interval would draw more than 1,000 buckets is a plan
  problem (`range: … exceeds the limit of 1000`), not a 40,000-point chart.
- **`range: "all"` has no window to fill.** A bounded range emits a point
  for every bucket between its ends; `all` emits buckets from the first
  that holds a row to the last, interior gaps still zero-filled, and
  nothing at all when no row matches.
- **Empty data is a result, not an error**: a valid plan over no rows
  returns `"results": []` — no shape entry at all, since there is no
  currency to key one on — unless the plan pinned `filters.currency`, in
  which case there *is* a currency to answer for and the executor returns
  exactly one zero-shaped entry for it rather than an empty array. Either
  way the explorer renders from that array, empty or not. Errors are for
  invalid *plans*, not absent data.
- **"Today" is the executor's, from an injectable clock** —
  mirroring the backend's `config/ClockConfig.java`, resolving the date in
  the instance's configured `TZ` (default `UTC`), never from the database
  clock. `lastMonths` and `yearToDate` resolve against that *local* date,
  because `occurred_on` is a plain `DATE` the user enters in their own local
  time: an instance in Europe/Warsaw must not put a transaction entered at
  23:30 on the last of the month into the next one. Golden tests inject a
  frozen date.

## Result shapes

The executor's whole contract with the frontend. Envelope:

```json
{
  "plan": { ...normalized plan as executed... },
  "results": [
    { "currency": "PLN", "shape": "timeseriesSplit", ... }
  ],
  "meta": { "truncatedGroups": false }
}
```

One entry per currency; each entry is one of four shapes:

```json
{ "currency": "PLN", "shape": "value",
  "value": "1243.5000" }

{ "currency": "PLN", "shape": "timeseries",
  "points": [ { "period": "2026-07", "value": "980.2100" }, ... ] }

{ "currency": "PLN", "shape": "breakdown",
  "groups": [ { "key": "14", "label": "Lidl", "value": "540.0000" }, ... ] }

{ "currency": "PLN", "shape": "timeseriesSplit",
  "series": [
    { "key": "14", "label": "Lidl",
      "points": [ { "period": "2026-07", "value": "243.5000" }, ... ] },
    { "key": "15", "label": "Biedronka", "points": [ ... ] }
  ] }
```

`period` is the bucket's ISO start (`2026-07` for months, `2026-07-13` for
days/weeks, `2026-Q3` for quarters, `2026` for years). `key` is stable and
machine-usable (category id, merchant string, currency code); `label` is for
humans. A point may additionally carry `"projected": true` or `"anomaly": true`
— see [Forecast, anomalies and drift](#forecast-anomalies-and-drift). Default rendering per shape — stat tile, line, bars, multi-line
(bars when ≤ 3 observed buckets and no forecast, since only the line branch
can draw a dashed projection) — lives in the frontend, and every shape also renders
as a table. What the Insight's `viz` overrides in v1 is exactly that one
choice: `{"chart": "table"}` pins the table renderer, an absent `viz` means
the shape's default chart. Selecting *which* chart (line/bar/donut) is
deferred — see "Deliberately deferred".

Why this matters: **the frontend contains exactly four renderers plus a
table, and anything the DSL will ever express must normalize into one of
these shapes.** New analytics capability = new plan fields producing
existing shapes = zero frontend work. This is what makes "a default view
that can show anything" a bounded promise instead of a BI product.

## Forecast, anomalies and drift

Phase 4b. All three are computed **after** the SQL, from the envelope's own
points: no extra query, no stored state, nothing to migrate. The analytics
service holds a `SELECT`-only role, so anything it "remembered" would have to
become a backend write path — re-deriving costs microseconds over a few dozen
points.

### Forecast (plan v2)

`forecast: { "months": 3 }` is the only thing v2 adds to v1.

| Rule | Value |
|---|---|
| Accepted versions | `1`, `2`. `forecast` on a v1 plan is a plan problem. |
| Required axis | `interval: "month"`; anything else is a plan problem. |
| Horizon | `months`, an integer 1–12. |
| Applies to | `timeseries`, and each series of a `timeseriesSplit`. |

**Seasonal-naive.** Projected bucket *h* (1-based, appended after the last
observed bucket) takes the value of the observed bucket **12 buckets earlier** —
this September looks like last September. When the series is too short to reach
back that far, every projected bucket falls back to the **mean of the last three
observed buckets** (all of them, if there are fewer than three), rounded
half-up to four decimal places. No trend term, no smoothing: the honest naive
baseline, so a dashed line never implies more confidence than "last year,
again".

Projected points are appended to `points` carrying `"projected": true`; the
frontend draws them as a dashed continuation of the same line. This is a
`timeseries` **variant, not a fifth shape** — the four renderers stay four.

```json
{ "currency": "PLN", "shape": "timeseries",
  "points": [ { "period": "2026-09", "value": "980.2100" },
              { "period": "2026-10", "value": "1012.0000", "projected": true } ] }
```

### Anomaly flags

An observed point is flagged `"anomaly": true` when it is an outlier by the
**median / MAD** rule (Iglewicz & Hoaglin). With `median` the series median and
`MAD` the median absolute deviation from it:

```
z = 0.6745 × (value − median) / MAD        flagged when |z| > 3.5
```

Median-based, not mean-based: a mean drags itself toward the outlier it is
supposed to expose. Two guards keep it quiet — a series shorter than **6**
points is never flagged, and a series with `MAD == 0` (flat, or the common
mostly-zero-filled one) is never flagged either, so a single purchase in an
otherwise empty year is not an "anomaly".

Projected points are never flagged: the flag is a statement about recorded data,
and the anomaly pass runs before the projection is appended.

This is **result enrichment, not DSL.** It needs no plan field and runs for every
plan version, so a saved v1 insight gains it without being edited — which is
also why it does not (and must not) become a second meaning for `version`. The
frontend marks flagged buckets on the single-series `timeseries` chart; the
multi-line chart leaves them unmarked, where N sets of rings would be noise.

### Drift on pinned insights

"Biedronka overtook Lidl." A `timeseriesSplit` result carries an optional
`drift` array describing a **lead change**:

```json
"drift": [ { "kind": "leadChange", "period": "2026-08", "previousPeriod": "2026-07",
             "leader":         { "key": "Biedronka", "label": "Biedronka", "value": "512.0000" },
             "previousLeader": { "key": "Lidl",      "label": "Lidl",      "value": "480.0000" } } ]
```

- **Comparison window** — the last two buckets that are neither projections nor
  the bucket containing the executor's `today` (the clock from Execution
  semantics). A partial current month always looks like a collapse, so including
  it would announce a lead change every time a month rolls over.
- **Strict winners only** — a tie for the lead in either bucket, or a bucket
  whose leader is `<= 0`, yields nothing. "Overtook" needs a winner on both
  sides. The `"__other__"` aggregate row is never eligible to be that winner
  either: it sums the entire truncated tail, so it tends to lead by
  construction, and a change in its total is often just cap membership
  shifting rather than real spending — "Other overtook Lidl" isn't a merchant
  anyone can act on, and letting it win would routinely mask the real change
  underneath it.
- **The current bucket is a contract** — the caller passes a period key of the
  result's own interval (`ranges.period_key`), and a key of the wrong shape is
  rejected rather than silently matching nothing, which would quietly reinstate
  the partial bucket. A well-formed key outside the range is fine: an `absolute`
  range ending in the past has no current bucket, so every bucket in it is
  already complete.
- **Stateless** — nothing is remembered between executions and nothing is
  written: the analytics role holds `SELECT` and the backend owns every write in
  this system. Drift is re-derived from the same envelope on every run, which is
  why it needs no table, no migration and no dismissal state.
- **Where it surfaces** — pinned insights render as dashboard tiles, and a tile
  whose envelope carries `drift` shows it as a one-line badge under the chart.
  Unpinned exploration returns the same field; nothing else reads it yet.
- **Shape** — `timeseriesSplit` only. `breakdown` has no time axis to drift
  along, and a single-series `timeseries` has no rival to lose to.

## The analytics service

`analytics/` — Python 3.12+, FastAPI, psycopg. Third top-level service in
the monorepo, exactly as `ARCHITECTURE.md` §2 anticipated.

- **Internal-only.** No published port in compose; nginx has no route to
  it. The backend calls `http://analytics:8000` over the compose network.
  Defense in depth: requests carry a static bearer token
  (`ANALYTICS_TOKEN`, generated into `.env` like the DB password) so even a
  misconfigured network doesn't expose an unauthenticated SQL-adjacent
  service.
- **Read-only role.** Flyway migration `V4__insights.sql` (shared with the
  `insight` table) creates role `myfinance_ro` with `SELECT` on all tables
  (+ `ALTER DEFAULT PRIVILEGES` for future ones), password injected via a
  Flyway placeholder
  from env (`DB_ANALYTICS_PASSWORD`) with a dev-only default. The role
  creation is idempotent (`DO $$ ... IF NOT EXISTS`). Trade-off noted: a
  credential flows through a migration placeholder; acceptable on a
  self-hosted single-DB instance, and it keeps provisioning inside the
  existing migration story instead of adding a second init mechanism.
- **Contract** (internal, versioned by path):
  - `POST /internal/v1/execute` — body `{ "profileId": 3, "plan": { ... } }`
    → `200` with the result envelope, or `400` with
    `{ "problems": ["filters.categoryId: 999 does not exist in this profile", ...] }`.
    Every SQL statement is parameterized and includes `profile_id = %s` —
    the same discipline as the backend's repositories.
  - `GET /internal/health` — for the compose healthcheck.
  - `GET /internal/v1/capabilities` — `200 {"interpret": bool, "model": str | null}`. `interpret` is false when `OLLAMA_URL` is unset or the configured model is not pulled, and the frontend then offers templates and chips instead of free text — no capability exists only behind the model.
- **Stateless.** No writes, no cache in v1 (a personal profile's queries
  are milliseconds; caching is a deferred decision, recorded below).
- The backend surfaces the service through `POST /api/insights/execute`
  (contract in `API.md`), translating analytics failures into
  `503 /errors/analytics-unavailable` — the frontend's cue to say "the
  analytics service isn't running" rather than something scarier.

## Template gallery

Code-shipped, not DB rows: a curated list in
`frontend/src/insights/templates.ts`, each entry a name + a plan with
explicit parameter slots (category picker, month choice). Opening one lands
in the explorer with chips pre-filled; the user tweaks, runs, saves.

Initial set (each must execute green in CI — they double as fixtures):

1. Monthly spending in ⟨category⟩ — last 12 months (`timeseries`)
2. Top categories this month (`breakdown`)
3. This month vs last month, by category (two-bucket `timeseriesSplit`)
4. Income vs spending, monthly — last 12 months (two insights, shown as a pair)
5. Two merchants compared, monthly — last 12 months (`timeseriesSplit`, Phase 4b: needs
   `txn.merchant`)
6. Weekday pattern: average daily spend (`breakdown` — deferred until a
   `weekday` groupBy exists; recorded so the gallery grows with the DSL)
7. Subscription cost over time (`timeseries` over the charge job's
   transactions, via `filters` on the subscription-linked flag — v1 keeps
   this as a category-filter template until a `subscriptionsOnly` filter
   is added)

Why code-shipped: instant value on an empty install, they *teach* the chip
vocabulary by example, they version with the DSL in the same commit, and
they're a free regression suite.

## The AI layer (Phase 5)

A thin, optional authoring layer on top of everything above. Compose
profile `ai` starts an `ollama` container; the model is configurable via
`OLLAMA_MODEL`, with documented pull-on-first-start. The default is
chosen by benchmark, not by assertion: the sentence → plan golden
fixture set below *is* a benchmark, so it is run against 2–3 small instruct
candidates (~2–4 GB, starting from Qwen3 4B) on the author's hardware, the
winner is pinned as the env default, and the comparison is recorded in
`LESSONS.md`. The analytics service owns the Ollama client (Python, same
service that owns the plan schema).

- **NL → draft insight.** `POST /api/insights/interpret` (backend →
  analytics → Ollama): free text in, `{ plan, notes }` out. The model is
  prompted with the plan JSON schema, the profile's category names (ids +
  names only — no amounts, no transactions), and few-shot examples drawn
  from the templates; output is schema-validated, and an invalid emission
  is retried once then surfaced as "couldn't interpret — here are the
  chips" (the explorer opens anyway). The draft lands as *editable chips*,
  runs through the normal executor, and saves like any hand-built insight.
- **Refinement edits structured state.** "And only this year?" sends the
  *current plan* plus the follow-up; the model returns the modified plan.
  Editing a JSON object is dramatically more reliable for a small model
  than re-deriving from scratch — and every intermediate state stays
  visible as chips.
- **Narration is grounded.** The narration endpoint receives the executed
  result envelope (numbers already computed) and produces a caption
  ("Biedronka averaged 212 PLN/month, 24% below Lidl"). It never receives
  raw rows and has nothing to compute with — a hallucinated number can't
  enter the pipeline, only a wrong sentence about right numbers, which the
  chart beside it contradicts.
- **Capability detection.** `GET /api/insights/capabilities` reports
  whether interpretation is available; the search window offers free text
  when it is and templates + chips when it isn't. No feature exists only
  behind the AI.

## Testing strategy

- **Executor**: golden tests — fixture plans (every template + edge cases:
  empty data, multi-currency, truncated groups, stale categoryId, every
  shape) against a seeded Postgres (Testcontainers-equivalent:
  `testcontainers-python` or a compose test DB), asserting exact result
  envelopes. Pure-SQL layer, no LLM anywhere.
- **Plan validation**: table-driven problem-list tests, backup-validator
  style.
- **Backend**: the usual controller integration tests — CRUD scoping
  (404 cross-profile, 409 name-taken), execute proxying, 503 when
  analytics is down (stub server).
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

## Deliberately deferred

Recorded so each is a decision with a trigger, not an omission:

| Deferred | Add it when |
|---|---|
| Result caching in the analytics service | A real profile's execute latency is measurably annoying. |
| Second metric axis / custom formulas / multi-plan joins | A genuine question can't be expressed as two side-by-side insights. |
| `weekday`/`month-of-year` groupBy (seasonality) | The gallery's weekday template gets demand; cheap to add, waits for v1 to land. |
| `groupBy: "currency"` | A genuine cross-currency comparison view is wanted — and then only with an explicit, written exception to the never-mix rule (`ARCHITECTURE.md` §3). Inside a per-currency result entry it yields exactly one group, which is degenerate; the only non-degenerate reading puts PLN and EUR bars in one chart. |
| `subscriptionsOnly` filter | The subscription-cost template needs to be exact rather than category-approximated. |
| Scheduled/emailed digests | Someone asks. Self-hosted ≠ background mailer by default. |
| Chart-type selection in `viz` (`line`/`bar`/`donut`) | A shape's default chart is the wrong one often enough to be worth a control. v1's `viz` chooses table vs. chart only; a donut renderer does not exist at all. |
