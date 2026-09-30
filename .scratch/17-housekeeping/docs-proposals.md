# Candidate 17 — Housekeeping: documentation proposals

Evidence and reasoning for every item here are in `grilling.md`. Line numbers refer to HEAD
`c3e20c5`, whose tree equals `4545810`.

## (a) Proposed glossary terms

**Normalized plan**:
A Plan with every optional top-level field spelled out: `filters` as an object, `groupBy` and
`interval` as a value or `null`. It is the form in which the Plan executor reads a plan and echoes
it back in a result envelope.
_Avoid_: complete plan, full plan, canonical plan

**Empty answer**:
The outcome of executing a valid Plan over no matching transactions. The result has either no
entry, or one entry per pinned currency whose groups, series or points are empty. It is an answer,
not an error.
_Avoid_: empty result, no data, blank chart, zero result

**Instance time zone**:
The IANA time zone an instance is configured with (`TZ`, default `UTC`). The Plan executor decides
in this zone what "today" is for an Insight's date range.
_Avoid_: server time zone, local time, system time zone

Notes for the orchestrator:
- **Normalized plan** adopts wording INSIGHTS.md already uses ("normalized plan as executed",
  INSIGHTS.md:202) rather than coining a new term.
- **Empty answer** is the explorer's own copy ("an empty answer is still an answer",
  `ResultsPanel.tsx:154-155`).
- None of the three renames a seed term.

## (b) Proposed ADRs

None. The candidates for an ADR each fail at least one of the three tests (hard to reverse,
surprising without context, a real trade-off), or land in a recorded-decision document under the
repo rule:

- **Removing JaCoCo and the frontend coverage tooling** is easy to reverse: re-add one plugin block
  or one devDependency.
- **Keeping `uvicorn[standard]`** changes nothing.
- **The time-zone decision** (behaviour unchanged, backend-follows-`TZ` deferred) amends INSIGHTS.md
  and API.md. By the repo rule, those documents are updated instead of adding an ADR.
- **The Normalized plan at the frontend's read boundary** amends INSIGHTS.md "Plan DSL v1".
- **Leaving the frozen design-system stylesheet alone** is already recorded
  (`docs/design/insights-explorer.md:8-13`).

## (c) Required updates to documents

All of these land in the same step as the code or behaviour they describe (spec, "Ordered steps").

### 1. `docs/INSIGHTS.md` → "Execution semantics" → the "Today" bullet (lines 187–194). Step 8.

Today it says the executor's clock is "mirroring the backend's `config/ClockConfig.java`, resolving
the date in the instance's configured `TZ`". The backend's clock is `Clock.systemUTC()`
(`ClockConfig.java:20`). After the change it must say:

> - **"Today" is the executor's, from an injectable clock** — the same pattern as the backend's
>   `config/ClockConfig.java`, but not the same zone. The executor resolves the date in the
>   instance time zone (`TZ`, an IANA name, default `UTC`), never from the database clock. The
>   backend's clock is fixed to UTC (`API.md` → the subscription dashboard's `asOf`, "Charge
>   posting"). `lastMonths`, `yearToDate`, drift's current bucket and the forecast's partial bucket
>   all resolve against that *local* date, because `occurred_on` is a plain `DATE` the user enters
>   in their own local time: an instance in Europe/Warsaw must not put a transaction entered at
>   23:30 on the last of the month into the next one. With `TZ` away from UTC, Insights and the
>   subscription widgets can therefore disagree about "today" for the hours between local and UTC
>   midnight. Whether the backend should follow `TZ` too is an open question (`API.md` → "Open
>   questions for implementation tickets"). An unknown zone name fails every execute, which the
>   backend reports as `analytics-unavailable`. Golden tests inject a frozen date.

### 2. `docs/INSIGHTS.md` → "Execution semantics" → "Empty data is a result" bullet (lines 180–186). Step 9.

Replace the sentence "Either way the explorer renders from that array, empty or not." with:

> When there is no entry, or every entry's collection (`groups`, `series`, or an `all`-range
> timeseries' `points`) is empty, that is an *empty answer*: the explorer and a pinned dashboard
> tile both say "No transactions match this plan" instead of drawing an empty chart. A `value` of
> zero, or a bounded timeseries of zero-filled buckets, is an answer and renders as one.

The rest of the bullet stays.

### 3. `docs/INSIGHTS.md` → "Plan DSL v1" → the paragraph after the result-shape table (lines 142–147, "Validation is strict and structural …"). Step 10.

Append:

> `filters`, `groupBy` and `interval` may be omitted. An absent `filters` means no filters (`{}`),
> an absent `groupBy` or `interval` means `null`, and the envelope's normalized plan spells all
> three out. The explorer always sends all three, so only a hand-crafted plan omits them. The
> frontend normalizes a saved plan the same way when it reads it back, so no screen reads an
> omitted field as one of the explorer's own defaults.

Evidence: `validation.py:57-59,121-125,134-135`; `test_validation.py:19`; `plan.py:82-104`.

### 4. `docs/API.md` → "Open questions for implementation tickets" (line 1541). Step 8.

Add a bullet:

> - **Backend clock and the instance time zone.** Insights resolve "today" in `TZ` (`INSIGHTS.md` →
>   Execution semantics). The backend's clock is UTC: the charge job runs at 00:05 UTC, and the
>   subscription dashboard's `asOf` is the UTC date (above). With `TZ` away from UTC the two
>   disagree for the hours between local and UTC midnight. Making the backend follow `TZ` would:
>   - move the charge job;
>   - change what `asOf`, `chargedThisMonth`, `upcoming` and `overdue` mean;
>   - change restore's date re-basing and the backup filename date;
>   - if passed as `TZ` itself, change the JVM's default zone.
>
>   The `occurredOn` bound (UTC + 1) is zone-independent and would not change. Decide it when a user
>   reports subscription widgets and Insights disagreeing near midnight.

Nothing else in API.md changes. The `POST /api/insights` plan row (line 1480) stays true: its note
about hand-crafted *unexecutable* plans is unaffected by the normalization, which concerns
executable ones.

### 5. `README.md` → "Run the whole stack (Docker Compose)", after the sign-in-mode paragraphs (after line 86, before "### Run from a release"). Step 8.

Add:

> Insights decide what "today" is — and so "this month", "last N months" and "year to date" — in
> UTC, unless you set `TZ` in `.env` to your own time zone as an IANA name such as
> `Europe/Warsaw`. Set it so that an entry made late in the evening counts in your day and month.
> Only Insights follow `TZ`. The daily subscription charge job (00:05 UTC) and the subscriptions
> screen's dates stay on UTC, so near midnight the two can disagree about "today". Transaction
> dates are accepted up to one day past today's UTC date, so any time zone can enter its own
> "today" either way. A misspelled zone makes every insight fail with "the analytics service isn't
> running". A `TZ` exported in your shell takes precedence over `.env`.

### 6. `.env.example` (root), appended after the sign-in block (after line 32). Step 8.

```
# Time zone Insights use to decide what "today", "this month" and "last N
# months" mean — an IANA name such as Europe/Warsaw (default UTC). The
# subscription charge job and the subscriptions screen stay on UTC regardless.
# A misspelled name makes every insight fail ("the analytics service isn't
# running"). A TZ exported in your shell takes precedence over this line.
TZ=UTC
```

`TZ=UTC` equals the compose default (`docker-compose.yml:89`), so copying the template changes
nothing until the user edits the line.

### 7. `deploy/release/.env.example`, appended after the sign-in block (after line 36). Step 8.

The same block as item 6. Both launchers pass keys they don't rewrite straight through:
`start.sh:63-68` uses `sed` with targeted substitutions, and `start.bat:39` uses PowerShell
`-replace`. A new install gets the line. An existing `.env` without it keeps the compose default,
UTC (`deploy/release/docker-compose.yml:101`).

### 8. `deploy/release/README.md`: new section "## Time zone" between "## Sign-in mode" and "## Where your data lives" (before line 72). Step 8.

> ## Time zone
>
> Insights decide what "today" is — and so "this month", "last N months" and "year to date" — in
> the time zone set by `TZ` in `.env`, UTC by default. To count in your own zone, set it to an
> IANA name and run `docker compose up -d`:
>
> ```
> TZ=Europe/Warsaw
> ```
>
> Only Insights follow it. The daily subscription charge job (00:05 UTC) and the subscriptions
> screen's dates stay on UTC, so near midnight the two can disagree about "today". A misspelled
> zone makes every insight fail with "the analytics service isn't running". If your `.env` came
> from an older bundle and has no `TZ` line, add one.

### 9. Documents that do not change

- **`ARCHITECTURE.md`, `docs/SCHEMA.md`.** Neither mentions coverage tooling, JaCoCo, `TZ`, plan
  field absence or the pinned-tile empty state. `git grep -n -i -E 'jacoco|coverage'` finds no hit
  in either file.
- **`docs/design/*`.** The frozen-copy rule stands.
- **`docs/superpowers/*`.** Done-work history, kept as is.

### 10. Tracked text outside the documents (listed for completeness; specified in the spec)

These are code comments and one config pattern, all in the spec's steps 3, 5, 7, 9 and 11:

- **Step 3:** the analytics image's `__pycache__` ignore pattern (any depth).
- **Step 5:** `AnalyticsClient`'s HTTP/1.1 comment.
- **Step 7:**
  - the plan filters type's merchant comment;
  - the invalidation test's reference to the pre-split file;
  - the transaction hooks' "line above";
  - the browser-date helper's docblock;
  - the explorer test's `granularity` fixture field and J15 comment.
- **Step 9:** `ResultsPanel`'s empty-result docblock, which moves with `nothingMatched`.
- **Step 11:** the end-to-end UTC comment, now in the support module.

## (d) Lesson entries (docs/LESSONS.md, git-ignored; written after the relevant step)

- **New — "Which 'today'? Three clocks in one app"** (step 8).
  - **What:** the browser's local date, the backend's UTC with a zone-independent UTC+1 bound, and
    the executor's instance time zone.
  - **Why:** each exists for its own reason; documenting a knob means documenting its scope.
- **New — "A Maven plugin can run without a POM entry"** (step 1).
  - **What:** invoking JaCoCo by coordinates on the command line.
  - **How it works:** `prepare-agent` reaches surefire through the `argLine` property.
- **New — "Normalize at the boundary, not in every consumer"** (step 10).
  - **What:** the saved plan is completed once, where it enters the frontend.
  - **Python comparison:** parsing JSON into a dataclass once, instead of `.get()` with a default
    at every use.
- **Same pattern as "A gate that checks the wrong level of a nested collection is a silent dead
  branch"** (LESSONS.md:2145), for step 9. Add one line there: the dashboard tile carried the same
  gate until the two callers shared `nothingMatched`.
- **Owner's choice:** correct "An HTTP/1.1-only server can reject a client's own default
  handshake" (LESSONS.md:1019), which names h11. The container runs httptools (`grilling.md` Q3).
