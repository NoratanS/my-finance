# Docs proposals: candidate 10, one faithful double for the plan executor

## (a) Proposed glossary terms

**Plan problem**:
One human-readable string naming a field of a Plan and what is wrong with it, for example
`version: unsupported plan version 7`. The plan executor reports every plan problem it finds, as
a list, and the backend carries that list in the `problems` member of an `invalid-plan` Problem.
_Avoid_: error, validation error, message, problem (alone, which means the RFC 9457 Problem)

> Same term and text as candidate 9's proposal, repeated so that each file stands alone; merge
> once. It matters here because the recorded exchanges carry plan problems, and the backend
> test for an executor `500` exists precisely because that body reuses the `problems` member
> for a string (`an unexpected error occurred`) that is *not* a plan problem.

**Not proposed for the glossary: "recorded exchange" and "plan executor double".** Both are
test vocabulary, not domain terms, and the brief keeps the glossary to domain terms.
"Recorded exchange" is defined where it is used, in `docs/INSIGHTS.md` "Testing strategy"
(c.1 below). For consistency across the specs, use it in this sense: one request the backend
sends to the plan executor and the answer the executor gives to it, stored as a file, proved by
the analytics suite and replayed by the backend's stand-in. _Avoid_: fixture, contract, pact,
stub response, canned response.

## (b) Proposed ADRs

None. Three candidates were weighed against the brief's test ("hard to reverse", "surprising
without context", "the result of a real trade-off"):

- *Recorded exchanges proved by the provider's suite, instead of running the real executor in
  the backend build.* A real trade-off, somewhat surprising, but test infrastructure is not hard
  to reverse. Its recorded home is `docs/INSIGHTS.md` "Testing strategy" (c.1), which already
  owns the testing decisions for Insights.
- *The stand-in imitates uvicorn's refusal of an HTTP/2 upgrade offer.* Surprising without
  context, but trivially reversible; the context lives in `AnalyticsClient`'s comment and in
  c.1.
- *The exchange files live in the backend's test resources.* Easy to move; the reasoning
  (classpath idiom, and the precedent of the analytics harness reading the backend's
  migrations) is in the grilling log.

## (c) Required updates to recorded-decision documents

### c.1 `docs/INSIGHTS.md` → "Testing strategy" → the "Backend" bullet

Current text: "**Backend**: the usual controller integration tests — CRUD scoping (404
cross-profile, 409 name-taken), execute proxying, 503 when analytics is down (stub server)."

Text after the change. Step 3 writes the first three sentences; step 4 adds the refusals
sentence.

> - **Backend**: the usual controller integration tests: CRUD scoping (404 cross-profile, 409
>   name-taken), execute proxying, and 503 when analytics is down (nothing listening). Execute
>   proxying runs against one stand-in for the plan executor, held to the real one in two ways.
>   Its answers are **recorded exchanges**: a plan the backend forwards, and the status and
>   body the executor returns for it, one JSON file each in the backend's test resources. The
>   analytics suite proves every file against the real route, validation and the seeded
>   database, and the backend's tests read their expectations from the same files, so executor
>   wording is never re-typed in Java. An exchange must not depend on the date the suite runs:
>   an absolute range or no time axis, no forecast, no split. A plan with no recorded exchange
>   fails the test. The stand-in also refuses what the executor refuses, in the executor's
>   order: an HTTP/2 upgrade offer (answered as the shipped uvicorn answered it, which is why
>   `AnalyticsClient` pins HTTP/1.1), another method, malformed JSON, a wrong token, and a
>   request wrapper that is not `{profileId, plan}`. The real backend and executor run together
>   only in the e2e job.

### c.2 `ARCHITECTURE.md` → §5 "CI/CD (GitHub Actions)" → the *analytics* job bullet (step 2)

Current text: "*analytics* — `ruff check`, `ruff format --check`, mypy, and pytest (which also
starts Postgres via testcontainers-python and applies the backend's own Flyway migrations, so
the SQL is exercised against the real schema)."

Text after the change:

> - *analytics* — `ruff check`, `ruff format --check`, mypy, and pytest (which also starts
>   Postgres via testcontainers-python and applies the backend's own Flyway migrations, so the
>   SQL is exercised against the real schema, and proves against the real route the recorded
>   exchanges that the backend's tests replay; see `docs/INSIGHTS.md` → "Testing strategy").

Why this belongs in ARCHITECTURE.md: it records a cross-job dependency. The backend job's
stand-in is only as true as files that only the analytics job verifies. A reader deciding to
drop or split a CI job needs to know that.

### Documents that do not change, and why

- `docs/API.md`: the backend's HTTP interface for `POST /api/insights/execute` (statuses,
  `/errors/invalid-plan` with `problems`, `/errors/analytics-unavailable`) is unchanged.
- `docs/SCHEMA.md`: no schema change.
- `docs/INSIGHTS.md` "The analytics service" → "Contract": still accurate (the `400` example
  string, `filters.categoryId: 999 does not exist in this profile`, is the same string as one of
  the recorded exchanges).
- `CONTEXT.md` and `docs/adr/`: not created here (brief rule).

### Code comment that changes with the code (implementation, listed for completeness)

`AnalyticsClient`'s comment on the HTTP/1.1 pin ends with: "The in-process JDK HttpServer used by
AnalyticsClientTest tolerates the same upgrade header, which is why this only surfaced against
the real analytics service." After step 4 it should end: "The test stand-in for the executor
(`PlanExecutorDouble`) now refuses upgrade offers the way the shipped executor did, so a revert
of this line fails the backend's tests, not only the e2e job."
