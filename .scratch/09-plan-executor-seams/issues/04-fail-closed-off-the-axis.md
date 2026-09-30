# 04: A row off the time axis fails the execution

**What to build:** when a query row's bucket is not on the time axis the executor built (the executor's calendar and Postgres disagree), the execution fails with a logged server error naming the interval and the stray period keys, instead of drawing that bucket as zero. Proved by a fault-injection test that makes weeks start on Sunday and runs the weekly golden plan. The insights design document says so.

**Blocked by:** 01 (Weekly, quarterly and year-to-date plans run end to end), 03 (Query rows are read by name)

**Status:** ready-for-agent

- [ ] The fault-injection test, described as such, is written first and seen to fail because the envelope comes back zero-filled
- [ ] One check where the axis is built raises a runtime error naming the interval and the stray keys; the test passes
- [ ] Plans without a time axis, and range-all plans with no rows, are unaffected
- [ ] The insights design document's zero-filled buckets bullet says a row off the axis fails the execution
- [ ] The analytics gate (ruff, format, mypy, pytest) is green
