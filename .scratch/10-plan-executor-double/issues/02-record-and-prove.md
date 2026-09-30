# 02: Record the executor's answers and prove them against the real route

**What to build:** the five recorded exchanges the backend's tests will need (a monthly timeseries, an unknown category, an unsupported version, a profile id inside the plan, and the timeseries plan with a failing database) exist as readable JSON files in the backend's test resources, and the analytics suite proves each one against the real route, the real validation and the seeded database. A recorded exchange that depends on the date, a changed executor answer, or an empty exchange directory fails the analytics suite, naming the file. The three analytics tests the proof replaces are deleted. The backend does not read the files yet.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Five exchange files, each with the executor's database state, the plan, the status and the body, named in kebab case after the behaviour
- [ ] One parametrized analytics test posts each recorded plan as profile 1 and asserts the recorded status and body; ids are the file names
- [ ] A recorded plan that reads the clock (a relative range, a forecast, a split) is rejected before it is posted, and a test proves the rule rejects each of those
- [ ] An empty or missing exchange directory fails the suite instead of skipping it
- [ ] The route's success test, its version-7 rejection and the 500-body test are deleted; the profile-scoping, non-object-plan, token, leak and logging tests stay
- [ ] Any recorded body that differs from what the real executor returns is corrected to the executor's answer and reported
- [ ] ARCHITECTURE.md §5 says the analytics job proves the exchanges the backend's tests replay
- [ ] The analytics gate (ruff, format, mypy, pytest) is green
