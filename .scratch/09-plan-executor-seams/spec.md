# Tighten the plan executor's internal seams

Status: ready-for-agent
Candidate: 9, Tighten the plan executor's internal seams
Strength: Worth exploring
Depends on: none (recommended: land candidate 10 through its step 2 before step 5 below, so the recorded exchanges guard the validation refactor)

## Problem Statement

The plan executor's `execute` is a deep module: a caller hands over a connection, a profile id,
a raw Plan and today's date, and gets back a result envelope or a list of plan problems. Inside
it, though, four facts are carried by convention rather than by the code:

- **A Plan's validity.** Nothing about a `Plan` object proves it passed validation. The rule
  "validate first, then parse" is restated in seven comments or asserts across four modules, and
  each module defends itself differently: the SQL builder fails closed, the range module falls
  back to "year" for an unknown interval.
- **A row's column order.** The executor reads the query's five columns by position in seven
  places. The contract between the SQL builder and the executor is a column order with no name
  attached.
- **One plan rule outside the validator.** The 1,000-bucket cap is raised by the executor, so
  plan problems have three raise paths, and the validator's docstring explains the split by its
  own signature rather than by the rule.
- **A retired rollout flag.** `merchant_enabled` is threaded through two signatures although
  production always passes `True`; most tests run in a configuration production never uses.

Two consequences matter to people, not just to code:

- A self-hosting user could be shown a **wrong chart without any error**: a row whose bucket the
  executor's own calendar does not list is dropped and drawn as zero.
- The joint where that would happen is exercised end to end only for monthly and yearly
  buckets. Weekly and quarterly buckets and the year-to-date range never run through the
  executor against the database, so a calendar regression there would ship silently.

The owner, as maintainer, and any future contributor must currently know all of this by reading
four modules.

## Solution

From the user's side nothing changes: every Plan returns the same status, the same plan problems
in the same order and the same envelope as before. The one exception is deliberate: an executor
bug that would have drawn a silently wrong chart now fails the execution instead.

For the maintainer, the executor's inside becomes self-describing:

- Validation becomes the only way to obtain a Plan. It takes the raw JSON, the profile, a
  connection and today's date, and returns an executable Plan or raises the full list of plan
  problems. Every plan rule lives there; the one exception, the bucket cap for `range: all`, is
  applied again after the query because the rows decide that range's extent, and it is stated as
  such.
- Query rows carry names that match the SQL's column aliases, checked when rows are fetched.
- Every row must land on the time axis; if one does not, the execution fails loudly.
- The retired merchant flag is gone.
- Weekly, quarterly and year-to-date plans run end to end in the test suite.

The first step is three new test cases and no code change.

## User Stories

1. As a self-hosting user, I want weekly charts whose bars match my transactions, so that I can
   trust a week-by-week view of my spending.
2. As a self-hosting user, I want quarterly charts whose totals match my transactions, so that a
   quarter-over-quarter comparison is correct.
3. As a self-hosting user, I want a "year to date" chart that starts on 1 January and ends today,
   so that it neither includes last year nor stops early.
4. As a self-hosting user, I want the executor to refuse to draw a chart it cannot fill
   faithfully, so that I never act on a zero that SQL did not produce.
5. As a self-hosting user, I want every plan problem I see today to read exactly the same after
   this change, so that the explorer's messages and chip hints keep working.
6. As a self-hosting user, I want a plan with several problems to keep reporting the same
   problems as today, so that fixing one chip does not reveal a surprise.
7. As a self-hosting user, I want a plan that would draw more than 1,000 buckets to keep being
   rejected with the same message, so that I know to widen the interval or shorten the range.
8. As a self-hosting user, I want an "all time" plan at daily resolution over years of history to
   keep being rejected with the same message, so that the limit applies however the range is
   given.
9. As a self-hosting user, I want merchant filters and the merchant axis to keep working exactly
   as they do, so that retiring an internal flag costs me nothing.
10. As the owner, I want one function that turns raw plan JSON into an executable Plan or a list
    of plan problems, so that no code can run a Plan that skipped a rule.
11. As the owner, I want the rule "a Plan only comes out of validation" stated once, on the Plan
    type, so that I do not maintain seven copies of it.
12. As the owner, I want every pre-query plan rule, the bucket cap included, in the validation
    module, so that I read one file to know what a valid Plan is.
13. As the owner, I want the one rule that needs the query's rows stated where it is applied,
    with the same wording from one function, so that the two applications cannot drift.
14. As the owner, I want query rows read by name, so that reordering or renaming a column fails
    loudly instead of shifting values into the wrong field.
15. As the owner, I want the row's names and types declared next to the SQL that produces them,
    so that the type checker catches a misspelt column in the executor.
16. As the owner, I want the SQL text itself unchanged, so that the query's behaviour and its
    tests stay as they are.
17. As the owner, I want the merchant flag, its message and its branches removed, so that callers
    stop choosing a value for something that no longer varies.
18. As the owner, I want every test to run in the production configuration, so that a passing
    suite says something about the shipped behaviour.
19. As the owner, I want the executor's public interface to stay `execute` and `PlanProblems`,
    imported from the executor module, so that the route and the tests do not change their
    imports.
20. As the owner, I want each step small enough to review and to ship on its own, with lint,
    format, type checks and tests green, so that I can stop after any step.
21. As the owner, I want the hand-computed numeric specification in the postprocess tests left
    exactly as it is, so that the most delicate arithmetic is not rewritten for tidiness.
22. As a future contributor, I want the executor's pipeline to be the only production code that
    knows the order of the steps, so that the route stays a thin shell.
23. As a future contributor, I want golden cases for every range type and for week and quarter
    buckets, so that I can see a worked example of each before I change the calendar code.
24. As a future contributor, I want the golden values to reconcile with the existing monthly and
    yearly goldens, so that I can check one against the other by hand.
25. As a future contributor, I want a test that proves a calendar disagreement between Python and
    Postgres fails the execution, so that I know the guard exists and works.
26. As a future contributor, I want the comments that justify defensive lookups to state the
    real reason (a DSL value added without a mapping), so that I do not remove them as dead
    defence.
27. As a future contributor, I want the `range: all` bucket cap covered by a test, so that the
    refactor that moves the other cap cannot break it unnoticed.
28. As a future contributor, I want `docs/INSIGHTS.md` to say when the bucket cap is checked and
    what happens to a row off the axis, so that the documented behaviour matches the code.
29. As a reviewer, I want the validation table of raw plans and expected problem lists unchanged
    row for row (apart from the two retired flag-only rows), so that I can check the refactor
    preserved every message by reading one diff.
30. As a reviewer, I want deleted tests to be ones whose observable facts are covered through
    `execute`, so that "replace, don't layer" never loses a behaviour.
31. As a reviewer, I want the disappearance of the never-emitted "not available yet" strings
    called out, so that I do not read it as a broken wire contract.
32. As a reviewer, I want a fault-injection test described as such, so that I know which
    guarantee is proved black-box and which by injecting a bug.

## Implementation Decisions

**Invariant for every step.** For every input Plan: same HTTP status, same plan-problem list
(strings and order), same envelope. The four result shapes, the envelope, the route contract
and the executor's public interface (`execute`, `PlanProblems`) do not change. After every step
the analytics CI gate is green: ruff check, ruff format check, mypy, pytest.

**Modules and their new interfaces.**

- *Validation module.* `validate_plan` takes the raw plan, the profile id, a connection and
  today's date. It runs today's checks in today's order. If any problem is found it raises
  `PlanProblems` carrying exactly the list today's function returns. Otherwise it builds the
  frozen `Plan` (the former `parse_plan`, now a private final step in this module together with
  its forecast helper) and returns it. After building the Plan, and only then, it applies the
  bucket cap to bounded ranges, raising `PlanProblems` with the single cap problem, exactly as
  the executor does today. `PlanProblems` moves into this module. A public cap-check function
  (count and interval in, raises `PlanProblems` with today's wording when the count exceeds the
  limit) holds the rule's only statement of the message. The module docstring replaces "the
  signature deliberately does not take the clock" with: every plan rule lives here; the bucket
  cap is applied once more by the executor for `range: all`, because the rows decide that
  range's extent.
- *Plan module.* Keeps the frozen dataclasses, the DSL constants and limits, and the normalized
  echo. Loses the builder and the merchant flag constant. Gains `MAX_BUCKETS` (1,000) beside the
  other DSL limits. The `Plan` docstring states the guarantee once: a Plan only comes out of
  `validate_plan`, so every field holds a value validation accepted.
- *Executor module.* `execute` loses the merchant parameter; it calls `validate_plan` (which now
  also receives `today`) and works on the returned Plan; its "raw plan is a dict" assert goes.
  It declares its public names (`execute`, `PlanProblems`) so callers keep importing both from
  here. It opens its cursor with psycopg's `class_row` factory over the SQL module's row type
  and reads every column by name; its row-handling helpers are annotated with that type. For
  `range: all` it calls the validation module's cap check after the query. Where it builds the
  time axis, it checks that every row's period key is on the axis; if not, it raises a
  `RuntimeError` naming the interval and the stray keys. The route's existing catch-all turns
  that into the logged 500.
- *SQL module.* Gains a `typing.NamedTuple` row type (`TotalRow` suggested) with fields
  `currency` (text), `bucket` (date or null), `group_key` (text or null), `group_label` (text or
  null), `total` (decimal): the statement's existing column aliases. The statement text does
  not change. The module stays a builder; it still opens no cursor. The keyed lookups stay;
  their comments now say they fail closed when a DSL value is added without a mapping, not
  "when a caller skipped validation".
- *Range module.* No behaviour change. The asserts in `resolve_range` stay (they narrow optional
  fields for mypy); their comments point at the guarantee on `Plan`.
- *Route module.* Stops importing the merchant flag and stops passing it.

**The merchant flag.** The flag constant, the shared "not available yet" message, both branches
that emit it, and the parameter on `validate_plan`, its filters helper and `execute` are
removed. The two strings "groupBy: merchant filtering and grouping are not available yet" and
"filters.merchants: merchant filtering and grouping are not available yet" disappear from the
code. Production always passed `True`, so they were never emitted: no observable output
changes. The frontend's stale type comment about the merchant column belongs to candidate 17.

**Plan problems pinned by this candidate and by candidate 10.** Every existing string stays
byte-identical. In particular, the four strings candidate 10's recorded exchanges carry:
`filters.categoryId: 999 does not exist in this profile`,
`version: unsupported plan version 7`, `profileId: unknown field`, and the route's
`an unexpected error occurred`. The bucket-cap wording
`range: <count> <interval> buckets exceeds the limit of 1000; widen the interval or shorten the range`
also stays.

**The three end-to-end cases (step 1).** Golden envelopes through `execute` against the seeded
test database with the frozen date 2026-09-15. All three use metric spend, category 10
(Groceries) with descendants, currency PLN, no groupBy, plan version 1. Each result is one PLN
`timeseries`; `truncatedGroups` is false; no point carries an anomaly flag.

| Case | Interval | Range | Expected points (period → value) |
|---|---|---|---|
| Weekly | week | last 1 month | 2026-08-31 → 300.0000; 2026-09-07 → 25.0000; 2026-09-14 → 0.0000 |
| Quarterly | quarter | last 12 months | 2025-Q4 → 200.0000; 2026-Q1 → 0.0000; 2026-Q2 → 0.0000; 2026-Q3 → 675.0000 |
| Year to date | month | year to date | 2026-01 to 2026-06 → 0.0000 each; 2026-07 → 150.0000; 2026-08 → 200.0000; 2026-09 → 325.0000 |

The weekly axis starts on the Monday before the range start. The quarterly totals equal the
monthly golden's sums and the yearly golden's values. The year-to-date series has nine points,
median 0 and MAD 0, so the anomaly pass flags nothing. The derivation is in the grilling log.

**Ordered steps** (each separately shippable, each leaving the gate green):

1. *Three end-to-end cases.* Add the weekly, quarterly and year-to-date fixture plans and their
   expected envelopes to the golden tests. No production change. Update the Executor bullet of
   "Testing strategy" in `docs/INSIGHTS.md`.
2. *Retire the merchant flag.* Production and test changes as above.
3. *Named rows.* Add the row type, read rows by name through `class_row`, annotate the helpers,
   point the SQL tests' helper at the same row factory.
4. *Fail closed off the axis.* Write the fault-injection test first (it fails: today the
   envelope comes back zero-filled), then add the single check. Update "Zero-filled buckets" in
   `docs/INSIGHTS.md`. Needs steps 1 and 3.
5. *A Plan only comes out of validation.* `validate_plan` returns a Plan or raises; builder
   private; `PlanProblems` moved and re-exported; the "validated first" comments reworded;
   `test_plan` replaced; the SQL tests' `KeyError` case deleted. Needs step 2.
6. *The bounded bucket cap joins validation.* First add the characterization test for the
   `range: all` cap. Then `validate_plan` takes `today`, `MAX_BUCKETS` moves to the plan
   module, the executor's pre-query cap goes, and the `range: all` cap uses the shared check.
   Update "Bounded output" in `docs/INSIGHTS.md`. Needs step 5.

**Lesson for `docs/LESSONS.md`** (git-ignored, written after steps 5 and 3): "parse, don't
validate" in Python, a validator that returns the object it vouches for (compare Pydantic's
`model_validate`), and why the dataclass decision survives it; and psycopg's `class_row` with a
`NamedTuple`, which gives rows that are named, typed for mypy and still tuples. Step 4 can add a
short note on failing closed instead of zero-filling silently, tied to principle 2 in
`docs/INSIGHTS.md`.

## Testing Decisions

**What makes a good test here.** It goes through the highest seam that can observe the
behaviour, `execute` against real Postgres with the injected clock. It asserts what a caller
sees: the envelope, the plan-problem list, the exception type. It never asserts dataclass
fields, positional row layouts the executor no longer uses, or private helpers. Where a
guarantee cannot be reached black-box (the axis check), the test says so and injects exactly
the bug the guarantee exists for.

**Seams, highest first. No new seam.**

1. `execute`, real Postgres through testcontainers-python with the backend's own Flyway
   migrations, frozen date. All new tests go here: the three golden cases, the moved echo
   facts, the `range: all` cap characterization, the axis fault injection.
2. `validate_plan`, the table-driven validation tests. Apart from the two flag-only rows retired
   in step 2, the table of raw plans and expected problem lists is unchanged row for row. Only
   the harness changes: it turns a raised `PlanProblems` into its list and passes a date.
3. The SQL statement, the SQL tests, kept for diagnostic locality: a failure there points at the
   SQL, not at the shaping. Their assertions stay; their helper uses the executor's row factory
   and gets Plans from `validate_plan`.
4. Pure modules (postprocess, ranges, forecast rules): unchanged.

**Chosen seam and why.** `execute` is the deep module's interface. It already carries 39 cases
(the goldens among them) and is the only seam where the SQL's buckets meet Python's calendar.
The owner delegated the check of this choice; it follows the brief's rule to use the highest
seam and add none.

**Modules tested:** executor (new and existing goldens), validation (existing table), SQL
(existing cases), plus one fault-injection test on the executor.

**Tests replaced or deleted:**

- The plan-module tests (5 cases) are deleted. Their two observable facts not yet covered
  through `execute` move there as echo assertions: a minimal plan echoes empty filters and null
  groupBy and interval; an absolute range echoes ISO `from` and `to` dates alongside a
  currency-only filter.
- The SQL tests' `KeyError` case is deleted: the state it builds is unreachable once a Plan
  only comes out of validation.
- Two flag-only validation cases and the two merchant cases that call `validate_plan` with the
  flag are deleted. The golden merchant split already executes the "accepted" plan end to end.
- The merchant flag argument goes from 23 call sites. The remaining expected values do not
  change, because none of those plans uses merchants.
- Unchanged: the 32 postprocess cases, the range, forecast-rule, database, config, harness,
  health, route and error-handling tests.

**Characterization before refactor.** The `range: all` bucket cap has no test today. Step 6
adds one first: a private profile with two PLN expenses 1,100 days apart (2023-01-01 and
2026-01-05), interval day, range all. It must raise exactly
`range: 1101 day buckets exceeds the limit of 1000; widen the interval or shorten the range`.
It passes before and after the move.

**Fault-injection test (step 4).** The range module's week truncation is patched so weeks start
on Sunday. Executing the weekly golden plan must then raise a `RuntimeError` instead of
returning a zero-filled envelope.

**Prior art.** The golden tests' `EXPECTED` table with one parametrized test over fixture plan
files. Their private-profile seed helpers (forecast, anomaly, drift) for data that must not
disturb the shared seed. The validation table's style (raw plan, exact problem list). The SQL
tests' raw-row assertions.

## Out of Scope

- The postprocess string round trip (re-parsing formatted values, its own month-key
  formatting) and the two money formatters with different rounding: latent only, and the 32
  postprocess tests are not rewritten.
- Drift's inference of the interval from a key's shape; where `OTHER_KEY` and `MAX_GROUPS`
  live.
- A range type per dataclass (removing the optional fields and their narrowing asserts). It was
  considered and rejected here as a larger model change.
- Pydantic, or any change to the dataclass decision; any change to a problem string; collecting
  the bucket cap together with other problems. That last one is a behaviour change and a
  possible later decision of its own.
- An end-to-end case for `interval: day` (the owner settled on three cases).
- The backend, its double for the executor and the recorded exchanges (candidate 10).
- Housekeeping items candidate 17 owns: the frontend comment on the merchant column, the unused
  test helper module of envelopes, the stale claim in the range module's docstring that it is
  the only place a bucket key is formatted, the planning-era phrase "Stage 1's build_query" in
  the SQL module, and the currency regex's trailing-newline match.
- A connection pool, result caching, statement timeouts.

## Further Notes

- **Not verified by execution.** Nothing was run: the golden values, the characterization count
  and the anomaly outcome were computed by hand from the seed and the code. The implementer
  confirms them by running the suite; a mismatch means the derivation in the grilling log is
  wrong, not the rule.
- **Fault-injection target.** The test patches the range module's own truncation function. The
  axis builder resolves it inside the module at call time, which is why patching there reaches
  both the axis and the bucket count. If that function is renamed, the test must follow.
- **The error-handling tests are unaffected by named rows.** Their failing connection accepts no
  cursor arguments, but validation's category lookup calls it first, without arguments, before
  the executor's row-factory cursor is reached.
- **Relation to candidate 10.** That candidate's recorded exchanges carry four strings emitted
  by code touched here (listed under Implementation Decisions). Its route-level verifier becomes
  an extra tripwire for steps 5 and 6 if it lands first. Its failing-connection stub must accept
  any cursor arguments because of step 3. The two candidates touch disjoint files, except that
  both read the route module. Recommended order: candidate 10 through its step 2, then steps 5
  and 6 here; everything else in either order.
- **Relation to candidate 17.** The merchant flag's frontend comment has been stale since the
  column shipped; retiring the flag here does not make it staler, so it stays with the
  housekeeping candidate.
- **Documents.** Only `docs/INSIGHTS.md` changes, in three bullets, each with the step that
  makes it true. `ARCHITECTURE.md`, `docs/API.md` and `docs/SCHEMA.md` are unaffected.
  The proposed texts are in the docs proposals that accompany this spec. No ADR: nothing here
  is hard to reverse, and the amended decision lives in `docs/INSIGHTS.md`.
