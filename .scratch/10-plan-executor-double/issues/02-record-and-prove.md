# 02: Record the executor's answers and prove them against the real route

**What to build:** the five recorded exchanges the backend's tests will need (a monthly timeseries, an unknown category, an unsupported version, a profile id inside the plan, and the timeseries plan with a failing database) exist as readable JSON files in the backend's test resources, and the analytics suite proves each one against the real route, the real validation and the seeded database. A recorded exchange that depends on the date, a changed executor answer, or an empty exchange directory fails the analytics suite, naming the file. The three analytics tests the proof replaces are deleted. The backend does not read the files yet.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Five exchange files, each with the executor's database state, the plan, the status and the body, named in kebab case after the behaviour
- [x] One parametrized analytics test posts each recorded plan as profile 1 and asserts the recorded status and body; ids are the file names
- [x] A recorded plan that reads the clock (a relative range, a forecast, a split) is rejected before it is posted, and a test proves the rule rejects each of those
- [x] An empty or missing exchange directory fails the suite instead of skipping it
- [x] The route's success test, its version-7 rejection and the 500-body test are deleted; the profile-scoping, non-object-plan, token, leak and logging tests stay
- [x] Any recorded body that differs from what the real executor returns is corrected to the executor's answer and reported
- [x] ARCHITECTURE.md §5 says the analytics job proves the exchanges the backend's tests replay
- [x] The analytics gate (ruff, format, mypy, pytest) is green

## Comments

- All five hand-computed exchange bodies matched the real route on the first run against the
  seeded Postgres; none needed correcting. Mutating one value, or one plan problem's wording,
  fails the proof naming the file; moving the directory away fails
  `test_the_exchange_directory_holds_recorded_exchanges` (the parametrized test alone would only
  skip).
- Clock rule, clarified: the spec's "an absolute range or no time axis" would admit a
  `lastMonths` or `yearToDate` plan without an interval, whose value still depends on today
  (`resolve_range`). The enforced rule is what the route actually reads the clock for: the range
  must be `absolute` or `all`, no `forecast`, and not a timeseriesSplit (`groupBy` and `interval`
  both set). A small parametrized test proves the rule rejects each of those and accepts an
  absolute timeseries and an `all` breakdown.
- Analytics suite: 186 → 195 (three replaced tests removed; twelve added: the directory check,
  five exchanges, four rejected and two accepted plans for the clock rule).
