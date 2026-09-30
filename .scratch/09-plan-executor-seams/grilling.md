# Grilling log: candidate 9, tighten the plan executor's internal seams

Scope: `analytics/src/analytics/` (all ten modules) and `analytics/tests/` (all 16 test files,
`conftest.py`, `envelopes.py`, the 16 fixture plans, both seed files), read in full at `dev`
(`c3e20c5`, whose tree is identical to `4545810`: `git diff 4545810 c3e20c5` is empty). Governing
documents read: `docs/INSIGHTS.md` (all), `ARCHITECTURE.md` §5 and §6, `docs/API.md` "Errors" and
"Insights", `docs/SCHEMA.md` `insight` and the read-only role. Nothing was executed: no pytest,
no ruff, no mypy. Every line number below was read at that commit. Library behaviour was read
from the installed sources under `analytics/.venv` (psycopg 3.3.5); see Q9.

The owner delegated every decision to the recommended answer. Settled and not re-opened: the
plan executor stays a separate Python process; `plan.py` keeps frozen dataclasses and
hand-written checks; the exact problem strings stay; the four result shapes stay; step 1 is
three more cases through `execute` (week, quarter, yearToDate); `test_postprocess.py`'s 32
cases are not rewritten for tidiness.

## Design tree

```
Constraints (Q1) ── Dependencies (Q2)
 ├─ Step 1: three end-to-end cases (Q3) ──────────────┐
 ├─ Merchant flag: anything varying? (Q4) ── exact changes (Q14)
 ├─ Postprocess round trip / formatters: in or out? (Q5)
 ├─ A Plan only out of validation (Q6)
 │    ├─ where PlanProblems lives (Q7)
 │    ├─ parse_plan, test_plan.py, test_sql plans, KeyError (Q8)
 │    ├─ bucket cap into validation? (Q11)
 │    └─ the "validated first" restatements (Q13)
 ├─ Named rows: row factory (Q9) ── test_sql tuple assertions (Q10)
 └─ Silent zero off the axis (Q12) ◄── needs Q3 and Q9
Test inventory (Q15) · Seam discipline (Q16) · Docs (Q17) · Order (Q18)
Edge cases (Q19) · Siblings (Q20)
```

---

## Round 1: constraints and the decisions that need nothing else

Frontier: Q1, Q2, Q3, Q4, Q5. None depends on another open question.

❓ **Q1** - **What must the change not break?** The recorded decisions, wire contracts, error
shapes and CI gates that bound every later answer.

🔎 Facts:
- Problem strings are wire contract. `plan.py:4-6` and `main.py:35-38` say the docs and tests pin
  the exact wording; `test_validation.py:18-187` is a 30-row table of raw plan to exact problem
  list; `test_execute_api.py:55` and `:66` assert two strings through HTTP;
  `test_executor.py:226` and `:241-244` assert two through `execute`. The frontend matches the
  prefix `filters.categoryId` (insights review §2 Q3, `ResultsPanel.tsx:13-15`).
- Not only the strings: the *list* for a given input is observable. Unknown fields are sorted
  (`validation.py:52`), every rule appends (`:56-67`), and the bucket cap is reported alone,
  after all other rules pass (`executor.py:41-45` runs validation first, the cap at `:52-53`).
- Four result shapes, closed set (`docs/INSIGHTS.md:127-140`, ARCHITECTURE.md §6 lines 381-385).
- The envelope `{"plan", "results", "meta"}` and its echo (`executor.py:78`, `plan.py:82-104`).
- Route contract: 200 envelope, 400 `{"problems": [...]}`, 500
  `{"problems": ["an unexpected error occurred"]}` (`main.py:42-69`, `docs/INSIGHTS.md:394-405`).
- CI gate for this service: `ruff check`, `ruff format --check`, `mypy`, `pytest`
  (`.github/workflows/ci.yml:48`). mypy checks `src/analytics` only
  (`pyproject.toml:51-56`), not tests. ruff selects E, F, I, UP, B (`pyproject.toml:36`).
- Settled: separate process, dataclasses, exact strings, four shapes, three cases first, the 32
  postprocess cases untouched.

➡️ Every step must keep, for every input plan, the same HTTP status, the same problem *list*
(strings and order) and the same envelope, and must leave `ruff`, `ruff format --check`,
`mypy` and `pytest` green.

⚖️ Strongest argument against: pinning the list composition (not just the strings) forbids the
most natural improvement to the bucket cap, collecting it with the other problems (Q11).

✅ Decision: the invariant is "same status, same problem list, same envelope for every input".
Unblocks Q6, Q11, Q14.

---

❓ **Q2** - **Dependencies by category.** What does the executor depend on, and how is each
substituted in tests?

🔎 Facts:
- Postgres: *local-substitutable*. `conftest.py:84-94` starts `postgres:16-alpine` with
  testcontainers-python and applies the backend's own Flyway files in version order
  (`conftest.py:47-48`, `:90-91`), then `fixtures/seed.sql`. The `conn` fixture connects as the
  container owner with autocommit (`conftest.py:97-101`), so tests may insert private profiles
  (prior art: `test_executor_golden.py:256-293`).
- The clock: *in-process*, injected. `execute(..., today=...)` (`executor.py:38`); the route
  passes `today(settings)` (`main.py:81`, `config.py:38-42`); tests use the frozen
  `FROZEN_TODAY = date(2026, 9, 15)` (`conftest.py:56`, `:104-107`).
- psycopg 3.3.5: a library used in-process; row factories are its feature (Q9).
- `plan`, `validation`, `ranges`, `sql`, `postprocess`, `executor`: all *in-process* pure
  computation plus one connection.
- No *ports & adapters* and no *mock* dependency inside this candidate. (The HTTP seam to the
  backend is candidate 10.)

➡️ No new dependency and no new substitution: real Postgres through Testcontainers with the
real migrations, and the injected clock, remain the test setup for everything below.

⚖️ Strongest argument against: all 33 validation cases need Docker although 30 never touch the
database (insights review §2 Q2); a pure structural validator would test faster. Not this
candidate's goal, and splitting validation would add a seam nothing varies across.

✅ Decision: dependencies unchanged. Unblocks Q3, Q15.

---

❓ **Q3** - **Step 1: the three end-to-end cases (week, quarter, yearToDate).** Which plans,
what exact envelopes, and what prior art?

🔎 Facts:
- Coverage today through `execute` and HTTP: intervals `month` (15 plans), `year` (2), `day` (1,
  the cap rejection at `test_executor.py:229-244`, which never reaches SQL); range types
  `absolute` 8, `all` 10, `lastMonths` 18; `week`, `quarter` and `yearToDate` never run end to
  end (card; recounted from the fixture files and inline plans).
- Prior art: `test_executor_golden.py:45-209` (`EXPECTED`, a dict of fixture name to
  `(results, truncatedGroups)`), `:212-217` (one parametrized test over `sorted(EXPECTED)`
  loading `fixtures/plans/<name>.json`), the frozen clock `2026-09-15` (a Tuesday:
  `test_ranges.py:148` pins 2026-09-01 as a Tuesday).
- Seed (`fixtures/seed.sql:28-46`), profile 1, category 10 "Groceries" with children 11 "Lidl"
  and 12 "Biedronka". PLN expenses in that subtree: 101 Lidl 70.00 on 2025-10-10, 102 Biedronka
  130.00 on 2025-12-24, 103 Lidl 100.00 on 2026-07-05, 104 Biedronka 50.00 on 2026-07-20, 105
  Lidl 200.00 on 2026-08-03, 106 Biedronka 300.00 on 2026-09-01, 107 Groceries itself 25.00 on
  2026-09-10. Row 109 (Lidl, 10.00 **EUR**, 2026-08-15) is excluded by a PLN filter.
- Week truncation: Postgres puts 2026-09-01 in the week of Monday 2026-08-31
  (`test_sql.py:153-166`); `ranges.bucket_start` subtracts `weekday()` (`ranges.py:42-43`).
- Anomaly pass runs on every timeseries; below 6 points it flags nothing
  (`postprocess.py:126-127`); with MAD 0 it flags nothing (`:129-131`).
- Cross-checks already in the suite: monthly Groceries PLN = 2025-10 70, 2025-12 130, 2026-07
  150, 2026-08 200, 2026-09 325 (`test_executor_golden.py:51-57`); yearly = 2025 200, 2026 675
  (`:154-165`).

Hand-computed envelopes (frozen today 2026-09-15; all three share
`filters: {categoryId: 10, includeDescendants: true, currency: PLN}`, `metric: spend`,
`groupBy: null`, `version: 1`):

| Case | interval / range | Resolved window | Axis | Points (period → value) |
|---|---|---|---|---|
| Week | `week` / `lastMonths` n 1 | 2026-09-01 … 2026-09-15 | Mondays 2026-08-31, 2026-09-07, 2026-09-14 | 2026-08-31 → 300.0000 (row 106); 2026-09-07 → 25.0000 (row 107); 2026-09-14 → 0.0000 |
| Quarter | `quarter` / `lastMonths` n 12 | 2025-10-01 … 2026-09-15 | 2025-Q4, 2026-Q1, 2026-Q2, 2026-Q3 | 2025-Q4 → 200.0000 (70 + 130); 2026-Q1 → 0.0000; 2026-Q2 → 0.0000; 2026-Q3 → 675.0000 (100 + 50 + 200 + 300 + 25) |
| Year to date | `month` / `yearToDate` | 2026-01-01 … 2026-09-15 | 2026-01 … 2026-09 (9 buckets) | 2026-01 … 2026-06 → 0.0000; 2026-07 → 150.0000; 2026-08 → 200.0000; 2026-09 → 325.0000 |

Each result is `[{"currency": "PLN", "shape": "timeseries", "points": [...]}]` with
`truncatedGroups: false`. Why each case discriminates:
- Week: a Sunday-start calendar would key the axis 2026-08-30, 2026-09-06, 2026-09-13 and miss
  both rows; the first bucket starts *before* the range start (the week containing 1 September).
- Quarter: pins `period_key`'s `YYYY-Qn` format, the 3-month step across a year boundary
  (`ranges.py:95`) and `bucket_count`'s quarter branch (`:73-74`). The totals reconcile with the
  monthly and yearly goldens above.
- Year to date: a wrong start (for example 12 months back) would add 2025's 200.00 and three
  more buckets; the 9 points run the anomaly pass: values {0 ×6, 150, 200, 325}, median 0,
  MAD 0, so no `anomaly` key appears (`postprocess.py:129-131`). Deterministic.
- Quarter and week have 4 and 3 points, below the anomaly threshold of 6.

➡️ Three new fixture plans, three new `EXPECTED` entries, picked up by the existing
parametrized golden test. No production code changes in this step.

⚖️ Strongest argument against: golden envelopes are long and every seed change ripples into
them. Accepted: that is how the other 12 goldens work, and the numbers reconcile with two
existing goldens, so a seed change shows up consistently.

✅ Decision: as recommended; the table above is the specification. `interval: day` stays without
a data-carrying end-to-end case (settled at three). It is low risk: `date_trunc('day', d)::date`
is `d`, and `ranges.bucket_start("day", d)` returns `d` (`ranges.py:40-41`). Unblocks Q12, Q18.

---

❓ **Q4** - **The `merchant_enabled` flag: does anything still vary across it?** Options: keep
the flag; retire it.

🔎 Facts:
- `plan.py:33-35`: `MERCHANT_ENABLED = True` with the comment that MY-33 shipped the column.
- Production passes the constant: `main.py:15`, `:81`. There is no setting, no environment
  variable, no other caller (`git grep`: the only non-test references are `plan.py:35`,
  `main.py:15,81`, `executor.py:38,42`, `validation.py:39-41,46,60-61,63,132,165-166`).
- `validation.py:38-41`: the shared message is "now reachable only when the flag is explicitly
  disabled".
- Tests: 23 call sites pass the flag (`test_executor_merchant.py` 7, `test_executor_golden.py`
  10, `test_validation.py` 5, `test_executor.py` 1). 28 of the 39 `execute`-level cases and 31 of
  33 `test_validation.py` cases pass `False`, a configuration production never runs.
- No recorded document mentions the flag (`git grep` over `docs/INSIGHTS.md`, `docs/API.md`,
  `docs/SCHEMA.md`, `ARCHITECTURE.md`: no hits).

➡️ Retire it. One adapter, ever: a seam with nothing varying across it.

⚖️ Strongest argument against: the deferred `subscriptionsOnly` filter
(`docs/INSIGHTS.md:472`) may want a column-gated rollout again. Then it gets its own flag for
its own rollout; this one has finished.

✅ Decision: retire. The exact changes are Q14 (after Q6 settles `validate_plan`'s new shape).

---

❓ **Q5** - **The postprocess string round trip and the two money formatters: in scope or
out?**

🔎 Facts:
- `postprocess` parses the executor's formatted strings back: `Decimal(str(point["value"]))` at
  `postprocess.py:66`, `:125`, `:138`, `:168`; it formats month keys itself
  (`_month_key_after`, `:30-34`), although `ranges.py:3` claims to be the only place a bucket
  key is formatted.
- Two formatters for the same wire rule: `executor._amount` (`executor.py:119-121`, an f-string,
  which rounds half-even on a `Decimal`) and `postprocess._money` (`postprocess.py:25-27`,
  quantize with ROUND_HALF_UP). Latent only: SQL totals arrive at scale 4 (`sql.py:46-57`), and
  the "Other" aggregates sum scale-4 decimals, so `_amount` never rounds.
- `docs/INSIGHTS.md:253-254` records that enrichment is computed "from the envelope's own
  points"; the 32 cases in `test_postprocess.py` are written in wire-shaped literals with
  hand-computed arithmetic (`test_postprocess.py:1-4`).
- Settled: the 32 postprocess tests are not rewritten for tidiness.

➡️ Out of scope, explicitly. The latent rounding difference and the `ranges.py:3` claim are
recorded as notes, not changed.

⚖️ Strongest argument against: the `ranges.py:3` docstring is false today and a reader trusts
it. It is one sentence of stale text, the kind candidate 17 (housekeeping) collects; changing it
here would touch a module this candidate otherwise leaves alone.

✅ Decision: out of scope; flagged for candidate 17 in the spec's Further Notes.

---

## Round 2: the shape of the deepened module

Frontier after round 1: Q6 (needs Q1), Q9 (needs Q2). Q7, Q8, Q10 hang off them but can be
answered in the same round once Q6 and Q9 are fixed, because their options are fully determined
by those two answers.

❓ **Q6** - **How does a Plan come only out of validation, with dataclasses kept and the problem
strings byte-identical?** Options:
(A) `validate_plan(raw, …) -> Plan`, raising `PlanProblems` with the full list; the builder
becomes its private last step ("parse, don't validate").
(B) Keep `validate_plan -> list[str]` and document "call it first" once.
(C) `validate_plan` returns `(Plan | None, list[str])`.
(D) A `typing.NewType("ValidatedPlan", Plan)` produced only by the validator, checked by mypy.
(E) A private sentinel argument on `Plan.__init__` that only validation can supply.

🔎 Facts:
- Today the caller must call two functions in order: `validate_plan` then `parse_plan`
  (`executor.py:41-50`); `parse_plan` accepts any dict (`plan.py:124-148`). The ordering rule
  is restated in 7 places across 4 modules: `plan.py:111-112`, `:118`, `:125-126`;
  `ranges.py:24-25`, `:31-32`; `sql.py:59-62`; `executor.py:47-49`.
- The modules defend themselves differently: `sql.py` fails closed with keyed lookups
  (`sql.py:59-65`, `:84-92`, `:104-106`); `ranges.bucket_start`, `period_key`, `bucket_count`
  fall through to the year branch (`ranges.py:48`, `:59`, `:75`) and `resolve_range` treats an
  unknown type as `all` (`:34`), while `_advance` raises on a dict lookup (`:95`).
- `validate_plan` returns `["plan: must be a JSON object"]` for a non-dict (`validation.py:48-49`)
  and otherwise appends in a fixed order (`:51-68`).
- mypy checks `src/analytics` (`pyproject.toml:53`); tests are not type-checked, so (D) would
  not stop a test from building a bare `Plan`.
- CLAUDE.md: prefer idiomatic over clever. Pydantic's own API for "raw data in, validated
  object out" is `Model.model_validate(data) -> Model`, a validator that returns the object.

➡️ (A). `validate_plan(raw, *, profile_id, conn) -> Plan` runs exactly today's checks in
exactly today's order; if the list is non-empty it raises `PlanProblems(problems)` with that
list; otherwise it builds the frozen `Plan` with the (now private) builder and returns it. The
name stays `validate_plan`, in the Pydantic sense of "validate into an object".

⚖️ Strongest argument against: the insights review (§3 candidate 2) notes that a total
validation function plus a trivial converter is easy to reason about, and touching the
validator risks the pinned strings. The strings are not touched (the checks and their order do
not change, only what happens after them), and the 30-row table (Q15) pins every list.

✅ Decision: (A). Python cannot forbid calling a dataclass constructor, so the guarantee is
"the only public way to obtain a Plan is `validate_plan`", stated once on `Plan`; production
modules and tests obtain Plans only that way. Unblocks Q7, Q8, Q11, Q13.

---

❓ **Q7** - **Where does `PlanProblems` live, and how do callers import it?** Options: keep it in
`executor.py` (validation would then import the executor: a cycle, since the executor imports
validation); move it to `plan.py`; move it to `validation.py`. And for callers: re-export from
`executor`, or update every import.

🔎 Facts:
- `PlanProblems` is defined at `executor.py:29-34` and imported from `analytics.executor` by
  `main.py:14`, `test_executor.py:5`, `test_executor_golden.py:14`.
- Import graph today: executor → validation, plan, ranges, sql, postprocess; validation → plan;
  ranges → plan; sql → plan; postprocess → ranges. No cycles.
- The insights review counts the service's top-level interface as three names: `execute`,
  `PlanProblems`, `app` (§2 Q2).

➡️ Move `PlanProblems` to `validation.py` (the module that raises it for every structural rule
and, after Q11, for the bounded bucket cap). `executor.py` keeps it in its public interface by
declaring `__all__ = ["PlanProblems", "execute"]`, so `main.py` and the tests keep importing
both names from `analytics.executor` unchanged. `__all__` also keeps ruff's F401 quiet if the
executor stops referencing the name itself.

⚖️ Strongest argument against: a re-export is one more thing to know. It is the conventional
Python way to state a module's public names, and it keeps the deep module's interface ("import
`execute` and `PlanProblems` from the executor") exactly as it is.

✅ Decision: as recommended. No import changes in `main.py` or tests. Unblocks Q11.

---

❓ **Q8** - **What happens to `parse_plan` as a separately callable step, to `test_plan.py`,
to where `test_sql.py` gets its plans, and to the `KeyError` case?**

🔎 Facts:
- `parse_plan` callers: `executor.py:50`, `test_plan.py` (5 tests), `test_sql.py:18` and
  `:207`.
- `test_plan.py` (5 cases): `:8-26` full parse to dataclass equality; `:29-36` defaults of a
  minimal plan as dataclass values; `:39-48` `includeDescendants` defaults to true; `:51-66`
  normalized echo fills defaults; `:69-81` absolute dates echoed as ISO strings and a
  currency-only `filters` echoed as `{"currency": "EUR"}`.
- Echo coverage through `execute` today: `test_executor.py:192-211` (categoryId, default
  `includeDescendants`, lastMonths), `:172-189` (whole envelope for a categoryId plan with range
  `all`), `test_executor_golden.py:220-234` (canonical), and the `forecast` key
  (`test_executor_golden.py:344`, `:360`). **Not covered through `execute`:** the echo of a
  plan with no `filters` (`"filters": {}`, `groupBy`/`interval` null) and the echo of an
  absolute range with ISO dates plus currency-only filters.
- `test_sql.py:202-217`: builds a Plan with `groupBy: "currency"` through `parse_plan` and
  asserts `build_query` raises `KeyError`. Through validation that plan is rejected
  (`test_validation.py:68-72`: "groupBy: must be one of category, merchant, or null").

➡️
- `parse_plan` becomes the private last step inside `validation.py` (with its `_parse_forecast`
  helper); nothing outside that module calls it.
- `test_plan.py` is deleted. Its two uncovered observable facts move to `test_executor.py` as
  echo assertions through `execute`: (1) a minimal plan echoes `filters: {}`, `groupBy: null`,
  `interval: null`, `range: {"type": "all"}`; (2) an absolute range echoes `from`/`to` as ISO
  strings and a currency-only filter echoes as `{"currency": "EUR"}`. The dataclass-equality
  cases assert internal representation and go.
- `test_sql.py`'s helper obtains its Plan from `validate_plan` (it already has `conn`; any
  `today`, since its plans use range `all`).
- The `KeyError` case is deleted: the state it builds is unreachable once a Plan only comes out
  of validation. The keyed lookup in `sql.py` stays (Q13).

⚖️ Strongest argument against: `test_plan.py` runs without Docker and the replacements do not.
The whole executor suite needs Docker already, and the facts it keeps are the observable ones.

✅ Decision: as recommended ("replace, don't layer"). Unblocks Q15.

---

❓ **Q9** - **Named rows: what does psycopg 3 offer, and what is the smallest change that gives
columns names without touching the SQL's behaviour?** Options: `dict_row`; `namedtuple_row`;
`class_row` with a dataclass; `class_row` with a `typing.NamedTuple`; keep tuples and add
index constants.

🔎 Facts (how checked: read `analytics/.venv/lib/python3.12/site-packages/psycopg/rows.py` and
`connection.py`, psycopg 3.3.5 per `uv.lock:612-613`):
- `class_row(cls)` returns a factory whose row maker is `cls(**dict(zip(names, values)))`, with
  `names` the result's column names (`rows.py:151-172`, `:240-247`): "The class must support
  every output column name as a keyword parameter."
- `namedtuple_row` builds an anonymous `namedtuple("Row", names)` typed as `NamedTuple`
  (`rows.py:129-148`), so mypy cannot check attribute names.
- `dict_row` returns plain dicts (`rows.py:113-126`).
- `Connection.cursor(*, row_factory=...)` returns `Cursor[Row]` (`connection.py:200-205`).
- The SQL already names every column: `AS currency`, `AS bucket`, `AS group_key`,
  `AS group_label`, `AS total` (`sql.py:146-150`); `GROUP BY 1, 2, 3, 4` stays positional
  because two axis columns may be NULL constants (`sql.py:153-155`).
- The executor reads by index at `executor.py:65`, `:69`, `:99`, `:116`, `:127`, `:132`, and
  unpacks five names at `:146`; its helpers annotate `rows: list[tuple]` (`:91`, `:107`, `:124`,
  `:131`, `:140`). `execute`'s `conn` is unannotated (`:38`), so `fetchall()` is `Any` to mypy.
- `sql.py:1` records "builders only, nothing here opens a cursor".

➡️ A `typing.NamedTuple` row type in `sql.py`, next to the statement it describes, whose fields
are exactly the five column aliases (`currency`, `bucket`, `group_key`, `group_label`,
`total`, with types `str`, `date | None`, `str | None`, `str | None`, `Decimal`). The executor
opens its cursor with `row_factory=class_row(<that type>)` and reads every column by name; the
fetched rows and the private helpers are annotated with the new type, so mypy checks each
attribute. The SQL text does not change. `sql.py` stays a builder: the executor still opens
the cursor.

⚖️ Strongest argument against: `namedtuple_row` needs no new type at all. But its rows are
untyped to mypy, and a renamed alias would silently rename a field; with `class_row` and a
declared type, an alias that no longer matches a field fails with a `TypeError` at fetch time
in every executor test.

✅ Decision: `class_row` + `NamedTuple`, declared in `sql.py`. Unblocks Q10, Q12.

---

❓ **Q10** - **What happens to `test_sql.py`'s tuple assertions?** Options: rewrite them to the
new type; keep them.

🔎 Facts:
- 11 of 12 `test_sql.py` cases compare fetched rows with plain tuples or index them
  (`test_sql.py:31-34`, `:44`, `:59`, `:74`, `:85-86`, `:104-108`, `:124-128`, `:144-150`,
  `:166`, `:181`, `:191`, `:199`); its helper opens a plain cursor (`:17-21`).
- A `NamedTuple` instance is a `tuple` subclass; equality with a plain tuple is element-wise,
  and indexing works.
- The file's stated purpose (`test_sql.py:1-2`): "a failure here points at the SQL rather than
  at the envelope shaping built on top of it".

➡️ Keep every assertion unchanged. The helper switches to the same row factory the executor
uses, so this file also proves that the aliases and the row type agree.

⚖️ Strongest argument against: tuple literals keep asserting a positional layout the executor
no longer depends on. They still describe the statement's output, which is this file's seam,
and rewriting 11 assertions buys nothing observable.

✅ Decision: as recommended. Unblocks Q15.

---

## Round 3: rules that depend on the new shape

Frontier: Q11 (needs Q6, Q7), Q12 (needs Q3, Q9), Q13 (needs Q6), Q14 (needs Q4, Q6).

❓ **Q11** - **The bucket cap: does it move into validation now that the clock is in scope at
the call site? If so, is it reported alone (as today) or with the other problems? And how is
the `range: all` cap stated, since it needs the rows?**

🔎 Facts:
- The cap is raised from `executor.py:81-88` (`MAX_BUCKETS = 1000`, `:21`), called at `:53`
  before the query for bounded ranges and at `:103` after the query for `range: all`, whose
  extent is the first and last bucket that hold rows (`:97-104`).
- `validation.py:8-9`: range-dependent limits need the clock, "which this signature deliberately
  does not take". `today` is already a parameter of `execute` (`executor.py:38`).
- `PlanProblems` has three raise paths today: `executor.py:45`, `:53`, `:103`.
- The cap is reported alone: it is computed only after validation returned no problems.
- Tests: only the bounded case is tested (`test_executor.py:229-244`, 13150 day buckets).
  **The `range: all` cap has no test** (`git grep "exceeds the limit"` in `analytics/tests`: one
  hit).
- The other DSL limits live in `plan.py` (`MAX_FORECAST_MONTHS`, `MAX_MERCHANTS`,
  `MAX_MERCHANT_LENGTH`, `plan.py:24-46`); `MAX_BUCKETS` is only referenced inside
  `executor.py`.
- `docs/INSIGHTS.md:173-175` states the rule; `:176-179` says `all` has no window.
- `txn.occurred_on` is `DATE NOT NULL` with no range check (`V1__core_schema.sql:61`), so a test
  profile can hold rows years apart.

Options: (a) leave the cap in the executor, fix the docstring; (b) move the bounded cap into
`validate_plan`, reported alone once the plan is otherwise valid (today's lists); (c) move it
and collect it with the other problems whenever interval and range are individually valid.

➡️ (b). `validate_plan` gains `today`; once every other rule has passed and the Plan is built,
it resolves the range and, for an interval with a bounded range, applies the 1,000-bucket
limit, raising `PlanProblems` with the one cap problem, exactly as today. `MAX_BUCKETS` moves to
`plan.py` with the other limits. The check itself becomes one public function in
`validation.py` that raises `PlanProblems` with today's wording; the executor calls the same
function after the query for `range: all`. Stated in `validation.py`'s docstring and in
`docs/INSIGHTS.md` "Bounded output": every plan rule lives in validation; the bucket cap is
applied once more after the query for `range: all`, because the rows decide that extent. Before
the move, a characterization test pins the `all` cap through `execute`: a private profile with
PLN expenses on 2023-01-01 and 2026-01-05 (1,100 days apart), `interval: day`, `range: all`
must raise `["range: 1101 day buckets exceeds the limit of 1000; widen the interval or shorten
the range"]`.

⚖️ Strongest argument against: (c) would make "validation reports everything" (INSIGHTS.md
"Validation is strict and structural", `:142-147`) true without exception. It changes the list
for multi-problem plans, which Q1 forbids in a refactor; it can be its own later decision.

✅ Decision: (b), with the characterization test first. `PlanProblems` then has two raise
sites: `validate_plan`, and the shared cap check invoked by the executor for `range: all`.
Unblocks Q15, Q17, Q18.

---

❓ **Q12** - **Should the silent zero for a bucket the SQL returns but the axis does not
enumerate become an error?** Options: keep the silent zero (the three cases of Q3 prove the
calendars agree); fail closed with one check; fail closed at each lookup.

🔎 Facts:
- `executor.py:128`: `totals.get(period, ZERO)`; `:157`: `by_group[key].get(period, 0)`; the
  "Other" series `:168` likewise. A row whose `period_key` is not on the axis is dropped and its
  bucket drawn as zero, with no error.
- The axis comes from `ranges.bucket_starts` (Python's calendar); the rows' buckets come from
  Postgres `date_trunc` (`sql.py:63-65`). For bounded ranges every row lies in [start, end], so
  its bucket is on the axis whenever the two calendars agree; for `range: all` the axis is built
  from the rows' first and last bucket (`executor.py:99-104`). A disagreement is always a bug.
- The project's stated stance: "Nothing is silently ignored … a chart that quietly dropped a
  filter is a wrong chart" (`validation.py:4-6`, `docs/INSIGHTS.md:145-147`); principle 2,
  "Every number a user sees was produced by SQL against real rows" (`docs/INSIGHTS.md:37-39`).
  Precedents that fail loudly on internal contract breaks: `sql.py:59-62`, `:84-87`;
  `postprocess.detect_lead_change` raises on a wrongly shaped key rather than silently matching
  nothing (`postprocess.py:217-223`).
- The route turns any unexpected exception into 500 `{"problems": ["an unexpected error
  occurred"]}` and logs it (`main.py:49-69`); the backend then answers 503 (candidate 10).
- CLAUDE.md §2: "No error handling for impossible scenarios."
- No black-box input can make Postgres and `ranges.py` disagree; a test must inject the
  disagreement.

➡️ Fail closed, in one place: where the axis is built, the executor checks that every row's
period key is on it; if any is not, it raises a `RuntimeError` naming the interval and the
stray keys (a bug, so the route's 500, logged). Test-first, and honestly a fault-injection
test: with the module's week truncation patched to start weeks on Sunday, executing the weekly
case of Q3 raises instead of returning an envelope. It fails today (the envelope comes back
zero-filled) and passes with the check.

⚖️ Strongest argument against: "No error handling for impossible scenarios", and a hard 500
(shown as "analytics isn't running") is worse UX than a slightly wrong chart. Rebuttal: it is
not handling, it is refusing to publish a number SQL did not produce; this is a finance app
where a missing bar is a wrong figure; and the scenario is exactly the cross-implementation
drift the codebase already guards against elsewhere (`sql.py:8-10`: one formatter instead of
two "that can drift").

✅ Decision: fail closed, one check where the axis is built, `RuntimeError`, one
fault-injection test. Lands after step 1 (whose cases prove the invariant holds for week,
quarter and yearToDate before violations become fatal) and after named rows (Q9). Unblocks
Q15, Q17.

---

❓ **Q13** - **The seven "validated first" restatements: which go, which stay?**

🔎 Facts:
- `plan.py:111-112`: comment + `assert rng.start is not None and rng.end is not None` in
  `_range_to_json`. `plan.py:118`, `:125-126`: docstrings of the builder, which moves (Q8).
- `ranges.py:24-25`, `:31-32`: comments + asserts in `resolve_range`.
- `sql.py:59-62`: comment justifying the keyed lookup by "instead of trusting a caller that
  skipped validation"; `:84-87` and `:104-105` similar.
- `executor.py:47-49`: comment + `assert isinstance(raw_plan, dict)`.
- mypy: `Range.n` is `int | None` and `Range.start`/`end` are `date | None` (`plan.py:50-54`);
  `resolve_range` computes `rng.n - 1` and returns the dates, `_range_to_json` calls
  `isoformat()`. Removing those asserts makes `mypy` fail (Optional arithmetic/attribute).
- Making each range type its own dataclass would remove the Optionals, but changes `Range`'s
  shape used by `test_ranges.py` (8 cases construct `Range(...)`) and `to_json`.

➡️
- `executor.py:47-49` disappears (the executor receives a `Plan`).
- The builder's docstrings move with it and simply say it is validation's last step.
- The asserts in `plan.py` and `ranges.py` stay (they narrow types for mypy); their comments are
  reworded to cite the one guarantee stated on `Plan` ("a Plan only comes out of
  `validate_plan`").
- `sql.py`'s keyed lookups stay: they remain the one place each enum value maps to SQL, and a
  value added to the DSL without a mapping still fails with a `KeyError` instead of building a
  query that drops an axis. Their comments are reworded from "a caller that skipped validation"
  to that reason.
- `validation.py:8-9` is rewritten by Q11.

⚖️ Strongest argument against: leaving asserts means the invariant is still "restated". They are
now type narrowing with a pointer, not a defence; per-variant range dataclasses would be the
real fix and are out of scope (larger model change, `test_ranges.py` churn).

✅ Decision: as recommended. Per-variant `Range` dataclasses are recorded as considered and
rejected for this candidate.

---

❓ **Q14** - **Retiring `merchant_enabled`: which signatures, constants and tests change?**

🔎 Facts: see Q4. Also: the two flag-only validation cases are `test_validation.py:73-87`
("merchant grouping is not available yet", "merchant filtering and grouping are not available
yet"); `test_executor_merchant.py:103-109` asserts the merchant plan is valid with the flag on,
and `:112-117` that it is rejected with the flag off; `test_executor_merchant.py:37-62`
executes the same `merchant_split.json` plan successfully. `test_validation.py:199-210`
(docstring "MY-33 flips the flag") also asserts the "must be a non-empty array of merchant
names" rule, which no other test covers (`:213-239` covers only count and length).

➡️
- Production: remove `MERCHANT_ENABLED` (`plan.py`), `MERCHANT_UNAVAILABLE` and both of its
  branches (`validation.py`), the parameter from `validate_plan`, `_check_filters` and
  `execute`, and main's import and argument.
- Problem strings: `"groupBy: merchant filtering and grouping are not available yet"` and
  `"filters.merchants: merchant filtering and grouping are not available yet"` disappear from
  the code. Production passes `True` (`main.py:81`, `plan.py:35`), so it has never emitted
  them; no observable output changes. Stated explicitly so the "exact strings stay" rule is not
  read as violated.
- Tests: drop the argument at the 23 call sites; delete the two cases at
  `test_validation.py:73-87`; delete `test_executor_merchant.py:103-117` (the "rejected" case is
  flag-only; the "accepted" case is covered by `:37-62`, which executes the same plan); keep
  `test_validation.py:199-210`'s assertions, without the argument and with a docstring that no
  longer mentions the flag.
- Every remaining test now runs in the production configuration. None of their plans uses
  merchants (they would have failed validation with the flag off), so every expected value is
  unchanged.
- `frontend/src/api/types.ts:274` ("Rejected by the executor until the merchant column lands
  (Phase 4b).") is already stale since MY-33 and is candidate 17's.

⚖️ Strongest argument against: deleting the "accepted when enabled" case loses a validator-level
witness for the merchant plan. The golden witness is stronger (it runs the plan end to end).

✅ Decision: as recommended. Unblocks Q15, Q18.

---

## Round 4: tests, seams, docs, order, edges, siblings

Frontier: Q15 to Q20, all now answerable.

❓ **Q15** - **Test inventory: which tests survive unchanged, which change, which are replaced,
which are deleted, which are new?**

🔎 Facts: counts from reading each file; the review's static count (187 cases in 16 files) agrees
per file.

➡️

| File (cases today) | Fate |
|---|---|
| `test_postprocess.py` (32) | Unchanged (settled). |
| `test_ranges.py` (27) | Unchanged: pure bucket arithmetic over value objects. |
| `test_plan_v2.py` (14) | Unchanged: pure `forecast_problems` table and two constants. |
| `test_db.py` (5), `test_config.py` (3), `test_harness.py` (3), `test_health.py` (1), `test_execute.py` (3) | Unchanged. |
| `test_execute_api.py` (5) | Unchanged (route statuses and strings unchanged). |
| `test_error_handling.py` (3) | Unchanged: the failing connection raises on validation's first `cursor()` call, before the executor's (Q19). |
| `test_executor_golden.py` (21) | +3 `EXPECTED` entries and fixture plans (step 1, Q3); the flag argument goes (10 sites). |
| `test_executor.py` (13) | Flag argument goes (its `run` helper); +1 echo test with two plans (from `test_plan.py`, Q8); +1 characterization test for the `range: all` cap (Q11); +1 fault-injection test (Q12). |
| `test_executor_merchant.py` (7) | Flag argument goes; 2 cases deleted (Q14); 5 remain. |
| `test_validation.py` (33) | 2 flag cases deleted; the 28-row remaining table unchanged; the harness turns a raised `PlanProblems` into its list and passes `today`; `:199-210` keeps its assertions. |
| `test_sql.py` (12) | Helper uses the executor's row factory and gets Plans from `validate_plan`; 11 assertions unchanged; the `KeyError` case deleted. |
| `test_plan.py` (5) | Deleted; two observable facts moved (Q8). |
| `envelopes.py` | Untouched (dead helper, candidate 17). |

⚖️ Strongest argument against: the validation harness change touches every one of the table's
rows at run time. The rows themselves (raw plan, expected list) do not change, which is what
pins the problem lists.

✅ Decision: as tabled.

---

❓ **Q16** - **Seam discipline: does this candidate introduce a seam?**

🔎 Facts: the brief: one adapter means a hypothetical seam; do not introduce a seam unless
something varies across it. `merchant_enabled` is a seam with one adapter (Q4).

➡️ No new seam. The row type is a named data shape, not a place where behaviour varies; the
builder becomes private; the cap check is one function with two call sites (one rule, applied
before and after the query). One seam is removed (the flag).

⚖️ Strongest argument against: the public cap-check function is new interface in
`validation.py`. It has exactly two callers and no alternative implementation; it exists so the
rule's wording lives once.

✅ Decision: no seam added, one removed.

---

❓ **Q17** - **Which recorded-decision documents change, and how?**

🔎 Facts:
- `docs/INSIGHTS.md` "Execution semantics", "Zero-filled buckets" bullet (`:162-167`) and
  "Bounded output" bullet (`:168-175`), "`range: "all"` has no window" (`:176-179`); "Testing
  strategy", Executor and Plan validation bullets (`:451-457`). "Validation is strict and
  structural" (`:142-147`).
- `ARCHITECTURE.md` §6 and §5 (CI) say nothing about the executor's internals or the flag.
- `docs/API.md:1469` lists problem categories only; no category changes.
- `docs/SCHEMA.md`: no schema change.
- `docs/LESSONS.md` is git-ignored; the spec names the lesson.

➡️ `docs/INSIGHTS.md` only, in three places (exact text in `docs-proposals.md`): the
zero-filled-buckets bullet gains "a row the axis does not contain is an executor bug and fails
the execution"; the bounded-output bullet states when the 1,000-bucket rule is checked (with
validation, once the plan is otherwise valid, reported alone; for `range: all` after the query);
the Executor testing bullet says every range type and the week and quarter intervals run end to
end. Each lands with the step that makes it true.

⚖️ Strongest argument against: the timing of the cap is an implementation detail. It is
observable (which problems a multi-problem plan gets) and so far undocumented; writing it down
is what stops a later "tidy-up" from changing it silently.

✅ Decision: as recommended. No ADR: nothing here is hard to reverse, and INSIGHTS.md is the
recorded decision this candidate amends.

---

❓ **Q18** - **The order of steps, each leaving `pytest`, `ruff`, `ruff format --check` and
`mypy` green.**

🔎 Facts: dependencies from Q3, Q6, Q9, Q11, Q12, Q14.

➡️
1. Three end-to-end golden cases (week, quarter, yearToDate). Tests and fixtures only; docs:
   Testing strategy. Leaves: more coverage, no behaviour change.
2. Retire `merchant_enabled`. Leaves: two signatures one parameter shorter, every test in the
   production configuration.
3. Named rows (`NamedTuple` + `class_row`), executor reads by name, `test_sql.py`'s helper uses
   the same factory. Leaves: no positional reads, identical envelopes.
4. Fail closed on a row off the axis, test-first with the fault-injection test; docs:
   zero-filled buckets. Needs steps 1 and 3.
5. A Plan only comes out of validation: `validate_plan` returns a Plan or raises; builder
   private; `PlanProblems` moves and is re-exported; `test_plan.py` replaced; `test_sql.py`'s
   `KeyError` case deleted; restatements reworded. Needs step 2 (one signature change at a
   time).
6. The bounded bucket cap joins validation: characterization test for the `all` cap first, then
   `validate_plan` takes `today`, `MAX_BUCKETS` moves to `plan.py`, the executor keeps the `all`
   cap through the shared check; docs: bounded output. Needs step 5.

⚖️ Strongest argument against: steps 5 and 6 both change `validate_plan`'s signature, so the
validation harness changes twice. Kept separate because each is small and reviewable, and step
6 has its own characterization test.

✅ Decision: as listed. Steps 2, 3 are independent of each other and of 5.

---

❓ **Q19** - **Edge cases and failure modes, with concrete scenarios.**

🔎 Facts and ➡️ resolutions:
- A non-object plan (`"spend everything"`): `validate_plan` raises
  `["plan: must be a JSON object"]`, route 400 as today (`test_execute_api.py:69-74`).
- A plan with an unknown metric *and* a 13150-day range: today and after, only the metric
  problem (the cap is computed only for an otherwise valid plan).
- A bounded range over the cap with a stale categoryId: today the categoryId problem only;
  after, the same (the cap is checked after all other rules pass).
- `range: all` with rows 1,100 days apart at `interval: day`: `PlanProblems` after the query,
  wording unchanged (new characterization test).
- `range: all` with no matching rows: axis empty, nothing to check, `results: []`
  (`executor.py:100-101`, `test_executor.py:172-189`).
- Plans with no time axis: rows carry `bucket` NULL; the axis check is skipped when `interval`
  is null.
- The error-handling tests' failing connection has a `cursor()` with no parameters
  (`test_error_handling.py:38-42`). Validation calls `conn.cursor()` first (the categoryId
  check, `validation.py:189-196`), so the executor's `cursor(row_factory=...)` is never reached
  there; the 500 tests keep asserting the logged "connection lost" `RuntimeError`.
- A renamed SQL alias: `class_row` raises `TypeError` at fetch; every executor test and every
  `test_sql.py` test fails, pointing at the alias.
- A future interval added to `plan.INTERVALS` without calendar code: `ranges.bucket_start` still
  falls through to the year branch; Postgres truncates by the new unit; the axis check fails
  loudly instead of drawing zeros.
- A Postgres/Python week disagreement (the fault-injection scenario): 500, logged with the stray
  keys, backend 503. Accepted (Q12).
- The anomaly pass on the year-to-date case (9 points): MAD 0, no flags; stays deterministic.

⚖️ Strongest argument against: an edge-case list written after the design can miss a case that
should have changed a decision. Each scenario above was traced through the code path it names
(`validation.py:46-68`, `executor.py:91-104`, `test_error_handling.py:38-42`), and none needed a
new decision.

✅ Decision: all resolved by the decisions above; nothing new to design.

---

❓ **Q20** - **Cross-candidate effects.**

🔎 Facts: brief §8; candidate 10's card (problem strings are the shared fact).

➡️
- Candidate 10 (one faithful double): its recorded exchanges carry three problem strings and the
  500 string, all emitted by code this candidate touches: `filters.categoryId: 999 does not
  exist in this profile`, `version: unsupported plan version 7`, `profileId: unknown field`,
  `an unexpected error occurred`. This candidate keeps all four byte-identical (and every other
  string, Q1). If candidate 10's verifier lands first, it is an extra tripwire for steps 5 and
  6. Its failing-connection stub must accept any `cursor(...)` arguments because step 3 adds
  `row_factory=`. File-touch sets: 10 removes tests from `test_execute_api.py` and
  `test_error_handling.py` and adds a route-level module; 9 does not touch those files; 9
  changes `main.py`'s `execute` call, 10 does not touch `main.py`. Recommended order: land
  candidate 10 through its step 2 before this candidate's step 5; otherwise independent.
- Candidate 17 (housekeeping): owns `frontend/src/api/types.ts:274`, `analytics/tests/envelopes.py`,
  the stale `ranges.py:3` claim, `sql.py:79`'s "Stage 1's build_query", and the `^[A-Z]{3}$`
  `.match` newline quirk (`validation.py:43`, `:185`). None is changed here.
- Candidate 16 (fold into the backend): not being done; nothing here assumes it.
- Candidates 1–8, 11, 13–15: no contact (backend Java, frontend, compose).

⚖️ Strongest argument against: recommending an order across two candidates couples their
schedules. It is a recommendation, not a dependency: this candidate's own validation table and
goldens pin every string either way, and candidate 10's proof only adds a second tripwire.

✅ Decision: Depends on: none. Order relative to 10 as above.

Frontier after round 4: empty. Every branch of the tree visited.

---

## Decisions

1. **Invariant.** Same status, same problem list (strings and order) and same envelope for every
   input; `ruff`, `ruff format --check`, `mypy`, `pytest` green after each step (Q1).
2. **Step 1, no refactor.** Three golden cases through `execute` with the frozen clock: week
   (lastMonths 1: 2026-08-31 300.0000, 2026-09-07 25.0000, 2026-09-14 0.0000), quarter
   (lastMonths 12: 2025-Q4 200.0000, 2026-Q1 0.0000, 2026-Q2 0.0000, 2026-Q3 675.0000), year to
   date (month axis 2026-01…09: six zeros, 150.0000, 200.0000, 325.0000; no anomaly flags) (Q3).
3. **Retire `merchant_enabled`.** Constant, message, two branches, three parameters, 23 test
   arguments, four flag-bound cases go; the never-emitted "not available yet" strings go with
   no observable change (Q4, Q14).
4. **Named rows.** A `NamedTuple` row type in `sql.py` whose fields are the SQL's aliases; the
   executor reads through `class_row`; SQL unchanged; `test_sql.py`'s tuple assertions unchanged
   (Q9, Q10).
5. **Fail closed off the axis.** One check where the axis is built; a stray row raises
   `RuntimeError` (route 500); one fault-injection test with a Sunday-start week calendar
   (Q12).
6. **A Plan only comes out of validation.** `validate_plan(raw, *, profile_id, conn, today) ->
   Plan` raises `PlanProblems` with today's list; the builder is private in `validation.py`;
   `PlanProblems` moves there and `executor` re-exports it with `__all__` (Q6, Q7).
7. **Tests replaced, not layered.** `test_plan.py` deleted with two echo facts moved to
   `execute`; `test_sql.py`'s `KeyError` case deleted; the validation table unchanged (Q8, Q15).
8. **Bucket cap.** The bounded cap joins validation, still reported alone once the plan is
   otherwise valid; `MAX_BUCKETS` moves to `plan.py`; the `range: all` cap stays after the query
   through the same check; a characterization test pins it first (Q11).
9. **Restatements.** The executor's assert goes; asserts that narrow types stay with comments
   pointing at the one guarantee; `sql.py`'s lookups stay with an honest reason (Q13).
10. **Out of scope.** Postprocess string round trip, the two money formatters, the 32 postprocess
    cases, per-variant `Range` dataclasses, `day` end-to-end case (Q5, Q13, Q3).
11. **Docs.** `docs/INSIGHTS.md` only: zero-filled buckets, bounded output, testing strategy. No
    ADR (Q17).
12. **Order.** 1 cases → 2 flag → 3 named rows → 4 fail closed → 5 Plan from validation → 6 cap
    (Q18). Relative to candidate 10: its step 2 before this step 5 (Q20).
