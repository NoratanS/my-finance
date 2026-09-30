# Docs proposals: candidate 9, tighten the plan executor's internal seams

## (a) Proposed glossary terms

**Plan problem**:
One human-readable string naming a field of a Plan and what is wrong with it, for example
`version: unsupported plan version 7`. The plan executor reports every plan problem it finds, as
a list, and the backend carries that list in the `problems` member of an `invalid-plan` Problem.
_Avoid_: error, validation error, message, problem (alone, which means the RFC 9457 Problem)

> Why: the seed list's **Problem** is the RFC 9457 document, but `docs/INSIGHTS.md` already says
> "plan problem" (lines 74, 143-144) for the executor's strings, and both candidates 9 and 10
> turn on those strings. Naming them separately removes a real ambiguity. The executor's `500`
> body reuses the `problems` member for `an unexpected error occurred`; that string is not a
> plan problem. Candidate 10 proposes the same term with the same text.

**Bucket**:
One step of a Plan's time axis: a day, an ISO week starting on Monday, a month, a quarter or a
year, as chosen by the Plan's `interval`. Every bucket in a Plan's range appears on the axis,
with value `0.0000` when no transaction falls in it.
_Avoid_: bin, slot, period (the wire field that names a bucket), interval (the Plan field that
chooses the bucket size)

**Period key**:
The text that names a bucket on the wire: `2026-07-13` for a day or a week (the week's Monday),
`2026-07` for a month, `2026-Q3` for a quarter, `2026` for a year.
_Avoid_: bucket key, label, date

> The code uses both "bucket key" (range module docstring) and "period key" (the formatting
> function's name, and the wire field `period`). Pick "period key".

**Bucket cap**:
The limit of 1,000 buckets a Plan's time axis may draw. A Plan over the limit is rejected with a
plan problem rather than drawn.
_Avoid_: bucket limit, max buckets, bounded output (that section also covers the 25-group cap)

## (b) Proposed ADRs

None. Nothing in this candidate is hard to reverse: all of it is internal structure plus one
failure mode, and every step is a small revertable commit. The behaviour it pins down (when the
bucket cap is checked, what happens to a row off the axis) belongs in `docs/INSIGHTS.md`, the
recorded decision this candidate amends. Under the repo rule that forbids a second source of
truth, it goes there and not into an ADR.

Considered and not proposed: "a Plan only comes out of validation" (idiomatic, easy to reverse,
not surprising once stated on the `Plan` type), and "fail closed off the axis" (recorded in
`docs/INSIGHTS.md`, see c.1).

## (c) Required updates to recorded-decision documents

All three land in `docs/INSIGHTS.md`, each in the same change as the step that makes it true.

### c.1 `docs/INSIGHTS.md` → "Execution semantics" → the "Zero-filled buckets apply per series" bullet (step 4)

Keep the bullet as it is and append:

> The reverse never happens silently: a row whose bucket is not on the axis can only mean that
> the executor's calendar and Postgres's `date_trunc` disagree. That is an executor bug, and the
> execution fails (the route's `500`, logged server-side) rather than drawing that bucket as
> zero. A chart with a missing bar is a wrong chart.

### c.2 `docs/INSIGHTS.md` → "Execution semantics" → the "Bounded output" bullet (step 6)

Keep the bullet as it is and append after "…not a 40,000-point chart.":

> The limit is checked with the rest of validation, once the plan is otherwise valid (it needs
> a well-formed range and interval to count buckets), so it is reported on its own. A
> `range: "all"` plan has no extent until its rows are known, so the same rule, with the same
> wording, is applied to it after the query.

### c.3 `docs/INSIGHTS.md` → "Testing strategy" → the "Executor" bullet (step 1)

Replace the parenthesis "(every template + edge cases: empty data, multi-currency, truncated
groups, stale categoryId, every shape)" with:

> (every template + edge cases: empty data, multi-currency, truncated groups, stale categoryId,
> every shape, every range type, and week and quarter buckets, where the executor's calendar
> must agree with Postgres's `date_trunc`)

The rest of the bullet stays.

> Note, not a change: this bullet's claim that templates "double as fixtures" (line 420, and the
> gallery list) does not match the code (insights review §2 Q3: no template is identical to a
> fixture plan). That is outside this candidate. It is recorded here so that nobody reads c.3
> as endorsing it.

### Documents that do not change, and why

- `ARCHITECTURE.md`: §6 describes the executor as "a pure plan executor: plan in, typed results
  out", which stays true. §5's CI description of the analytics job does not change here
  (candidate 10 adds a clause).
- `docs/API.md`: "POST /api/insights/execute" lists categories of plan problems (unsupported
  `version`, dangling `categoryId`, unknown field, unknown enum value, `from` after `to`, …).
  None is added or removed. The removed merchant "not available yet" strings were never
  emitted.
- `docs/SCHEMA.md`: no schema change; the read-only role is untouched.
- `CONTEXT.md` and `docs/adr/`: not created here (brief rule); the glossary terms above are for
  the orchestrator to merge.

### Code comments that change with the code (implementation, listed for completeness)

- The validation module's docstring: "Range-dependent limits … need the clock, which this
  signature deliberately does not take; they live in `executor.execute`" becomes: every plan
  rule lives here; the bucket cap is applied once more by the executor for `range: "all"`,
  whose extent the rows decide.
- The `Plan` dataclass docstring gains the one statement of the guarantee.
- The "validated first" comments in the plan, range and SQL modules are reworded to point at
  it (see the spec, Implementation Decisions).
