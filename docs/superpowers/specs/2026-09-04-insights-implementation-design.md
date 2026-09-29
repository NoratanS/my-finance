# Insights implementation — design delta (Phases 4, 4b, 5)

**Date:** 2026-09-04 · **Covers:** MY-29 … MY-38

## What this document is

Not a design. The design for Phases 4–5 was written and committed on
`docs/phase-4-5-design` (commit `b9146ba`) and lives in
[`INSIGHTS.md`](../../INSIGHTS.md), [`SCHEMA.md`](../../SCHEMA.md) → `insight`,
[`API.md`](../../API.md) → "Insights", and `ARCHITECTURE.md` §6. Those remain the
source of truth.

This document records only the **delta**: decisions those documents left open
or stated ambiguously, settled on 2026-09-04 before implementation began. Each
one becomes either an edit to a committed doc (listed below) or an input to the
staged implementation plans.

Where a Linear issue description and `INSIGHTS.md` disagree, **the doc wins** —
several MY-28/31/32 blurbs predate the design doc and are corrected as part of
Stage 1.

---

## Scope

All ten issues under the two umbrellas: Phase 4 core (MY-29 → MY-32), Phase 4b
(MY-33, MY-34), and Phase 5 (MY-36 → MY-38). Phase 6 (investments, MY-39…44) is
out of scope and unaffected.

Delivered as **three staged implementation plans**, not one document — each
independently executable, with stage 2 and 3 re-checked against what the
preceding stage actually taught us.

---

## Decisions

### D1 — `groupBy: "currency"` is dropped from the v1 enum

The result envelope already returns **one entry per currency present**. Grouping
by currency inside a per-currency entry yields exactly one group — degenerate.
The only non-degenerate reading (one chart with PLN and EUR bars side by side)
contradicts the project-wide "currencies never mix" rule
(`ARCHITECTURE.md` §3, `INSIGHTS.md` → Execution semantics).

Dropped per the doc's own principle, *"a small DSL beats a big one."* Recorded
in the deferred table with a trigger: add it only if a genuine cross-currency
comparison view is wanted, and only with an explicit, written exception to the
never-mix rule.

`groupBy` v1 enum is therefore: `category` | `merchant` | `null`.

### D2 — `groupBy: "merchant"` is rejected until V5, exactly like `filters.merchants`

`INSIGHTS.md` specifies rejecting the merchant *filter* until the `txn.merchant`
column lands (Phase 4b), but says nothing about the merchant *grouping axis*,
which needs the same column. Both are rejected with the same plan problem
(`merchant filtering is not available yet` → generalised to cover grouping), and
both activate together in MY-33.

Neither needs a plan `version` bump: both fields are part of the v1 schema by
design, precisely so saved plans and the AI prompt survive the column's arrival.

### D3 — `metric` is `spend | income | net`

`INSIGHTS.md` says three; MY-28's blurb says two. The doc wins. Same correction
applies to two other stale blurbs: **four** result shapes plus table-as-a-renderer
(not "five result shapes"), and there is **no `split` field** — when both
`interval` and `groupBy` are set, the categorical axis *is* the split.

No doc change; Linear descriptions are corrected.

### D4 — Zero-filled gap buckets apply per series in `timeseriesSplit`

`INSIGHTS.md` specifies zero-filling empty buckets for `timeseries` only.
Without the same treatment per series, a multi-line chart has ragged x-axes and
series of unequal length — the exact silent-gap failure the rule exists to
prevent. Every series in a `timeseriesSplit` emits a point for every bucket in
the range.

### D5 — `range: { type: "lastMonths", n }` yields **n buckets total**

The committed wording ("trailing full months + the current partial month") reads
as n+1. Settled as **n buckets**: `n − 1` complete months plus the current
partial one. `n: 12` in September 2026 → `2025-10` … `2026-09`.

Rationale: "last 12 months" draws 12 bars, which is what the template gallery's
own name promises and what every comparable tool means. Golden fixtures freeze
this, so it is stated explicitly rather than left to the first implementation.

### D6 — The executor owns a clock, mirroring the backend's `ClockConfig`

Nothing in the design says whose "today" resolves `lastMonths` and `yearToDate`.
The analytics service gets an **injectable clock** (a FastAPI dependency, the
Python equivalent of `config/ClockConfig.java`), reading the date in the
instance's configured `TZ`. Golden tests inject a frozen date.

Local date, not UTC: `txn.occurred_on` is a plain `DATE` the user enters in their
own local time, so an instance in Europe/Warsaw must not consider a transaction
entered at 23:30 to belong to the next month.

### D7 — Only the executor validates the plan `version`

`API.md` currently has the backend check "is a JSON object with a supported
`version`" *and* the executor own deep validation. Two components that know the
version set will drift the moment 4b bumps the DSL to v2.

The backend checks only that the body **is a JSON object**. Version support,
like every other plan rule, belongs to the one validator. This is what
`API.md`'s own justification ("one validator, one source of truth — the backend
forwarding a plan it half-understands is how two validators drift") already
argues for; the version check was an inconsistency with it.

### D8 — Charts: Recharts

MY-32 deferred the choice explicitly. Recharts: one small declarative
dependency covering all four shapes (stat tile stays plain HTML; `LineChart`,
`BarChart`, multi-line `LineChart`), with axes, ticks, tooltips, legends and
responsive resizing included. Series colours are driven by the existing design
tokens through props, so `docs/design/styles.css` stays authoritative.

Cost accepted: ~100 kB gzipped and a d3 transitive tree in a frontend that
currently has three runtime dependencies. Rejected: hand-rolled SVG (scales,
tick selection, hover hit-testing and responsive `viewBox` maths across four
renderers is the largest single chunk of Phase 4's frontend work, for no
user-visible gain) and visx (same assembly effort as hand-rolling, minus the
tick maths).

Recorded in `ARCHITECTURE.md` §4, per MY-32's own instruction.

### D9 — The explorer UI gets a deliberate design pass

The insights explorer is the first screen in this app that is a *tool* rather
than a form or a list. The `frontend-design` skill is invoked before building
MY-32's chip builder and again for Phase 5's search window, rather than
defaulting to the existing card style.

### D10 — Phase 5 default model is chosen by benchmark, not by assertion

`INSIGHTS.md` says "a small instruct model ~2–4 GB, configurable" without naming
one. MY-37's sentence → plan golden fixture set **is** a benchmark, so picking
the default becomes a task: run the fixtures against 2–3 candidates (starting
from Qwen3 4B) on the author's hardware, pin the winner as the env default,
record the comparison in `LESSONS.md`.

### D11 — No model runs in CI, ever

`INSIGHTS.md` describes an `ai`-profile CI job running the Phase 5 golden tests.
Revised: **CI never pulls or runs a model at all.**

- **In CI:** the Ollama client is stubbed. Tests assert prompt assembly, JSON
  schema validation of the emission, the retry-once-then-degrade path, the
  capabilities endpoint in both states, and that narration references only
  values present in its input envelope. Fast and deterministic.
- **Local only:** the real sentence → plan golden suite runs via a script
  target before merging Phase 5 work.

Rationale: a multi-gigabyte pull plus CPU inference on every PR is minutes of
runtime, and small models are not bit-stable across releases — the classic route
to a permanently red job that everyone learns to ignore. The core pipeline's CI
requiring no model was already a design promise; this makes it absolute.

Accepted risk, recorded so it is a decision and not an oversight: a regression
caused by an Ollama or model upgrade is caught only when the local suite is run.

### D12 — Staged plans, not one document

One design-delta doc (this file) and three implementation plans:

| Stage | Issues | Gate |
|---|---|---|
| 1 — Phase 4 core | MY-29, MY-30, MY-31, MY-32 | The full question → chart → save → pin loop works with no AI |
| 2 — Phase 4b | MY-33, MY-34 | "Lidl vs Biedronka" works on real merchant data; forecasts render |
| 3 — Phase 5 | MY-36, MY-37, MY-38 | A sentence produces editable chips; removing the container removes nothing but convenience |

Stage 3's tasks would otherwise be written against a Phase 4 that does not yet
exist, and would need rewriting regardless.

---

## Required edits to committed docs

All land in a **single doc-fix commit on `docs/phase-4-5-design`, before the PR
to `dev`** — per CLAUDE.md, a design that turns out to be underspecified gets
updated in the same change rather than left to drift from the code.

| # | File | Section | Edit |
|---|---|---|---|
| E1 | `INSIGHTS.md` | Plan DSL v1 → `groupBy` row | Remove `currency` from the enum (D1) |
| E2 | `INSIGHTS.md` | Deliberately deferred | New row: `currency` groupBy, with its trigger (D1) |
| E3 | `INSIGHTS.md` | Plan DSL v1 → `groupBy` + `filters.merchants` rows | Both rejected until V5; shared problem message (D2) |
| E4 | `INSIGHTS.md` | Plan DSL v1 → `range` | `lastMonths: n` = n buckets, ending with the current partial month (D5) |
| E5 | `INSIGHTS.md` | Execution semantics | Zero-fill applies per series in `timeseriesSplit` (D4) |
| E6 | `INSIGHTS.md` | Execution semantics | New bullet: the executor's clock and timezone rule (D6) |
| E7 | `INSIGHTS.md` | The AI layer (Phase 5) | Default model selected by benchmark; env-configurable (D10) |
| E8 | `INSIGHTS.md` | Testing strategy | Phase 5 bullet rewritten: stubbed client in CI, real golden suite local-only (D11) |
| E9 | `API.md` | `POST /api/insights/execute` | Backend validates "is a JSON object" only; version rejection is the executor's; `400` row updated (D7) |
| E10 | `API.md` | `POST /api/insights` request table | `plan` validation drops "with supported `version`" (D7) |
| E11 | `ARCHITECTURE.md` | §4 Frontend | Record Recharts and the reasoning (D8) |

Plus, outside the repo: correct the stale MY-28 description (four shapes + table,
no `split` field, `spend | income | net`) and any matching wording in MY-31/MY-32.

`ARCHITECTURE.md` §2's tree gains `analytics/` as part of MY-29 itself, not this
commit — the directory does not exist yet.

---

## Assumptions carried into planning

Stated so they are visible and objectionable, not discovered mid-implementation.

- **A1** — Phase 4b's `forecast` field bumps the plan DSL to **version 2**. The
  executor accepts `{1, 2}`; a v2 plan is a v1 plan plus `forecast`. Every saved
  v1 plan keeps executing unchanged — that is what the version field is for.
- **A2** — Merchant activation (MY-33) needs **no** version bump (D2).
- **A3** — `V4__insights.sql` is **owned by MY-30** (the `insight` table *and*
  the `myfinance_ro` role, one file, as `SCHEMA.md` specifies). MY-29 consumes
  the role. MY-30 therefore lands the migration even though MY-29 needs it —
  both issues already flag the coordination.
- **A4** — Backend → analytics calls use Spring's `RestClient` (Boot 4.1, already
  on the classpath) with an explicit short timeout; any connect/read failure maps
  to `503 /errors/analytics-unavailable`.
- **A5** — `analytics/` uses `uv` + `pyproject.toml`, `ruff` for lint, `pytest`
  for tests, and `testcontainers-python` for the DB-backed golden tests (which
  apply the backend's own Flyway migrations, so the executor is never tested
  against a hand-written schema that can drift).
- **A6** — Recharts at a version supporting React 19 (the frontend is on 19.2).
- **A7** — Golden fixtures seed via SQL loaded into the Testcontainers Postgres,
  with the clock frozen (D6) so relative ranges are reproducible.

---

## Explicitly out of scope

Phase 6 (MY-39…44, investments) and every row already recorded in
`INSIGHTS.md` → "Deliberately deferred" that this delta does not activate:
result caching, a second metric axis or custom formulas, `weekday` /
`month-of-year` groupBy, the `subscriptionsOnly` filter, and scheduled or
emailed digests. Each keeps its recorded trigger.
