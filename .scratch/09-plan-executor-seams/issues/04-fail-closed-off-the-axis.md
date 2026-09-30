# 04: A row off the time axis fails the execution

**What to build:** when a query row's bucket is not on the time axis the executor built (the executor's calendar and Postgres disagree), the execution fails with a logged server error naming the interval and the stray period keys, instead of drawing that bucket as zero. Proved by a fault-injection test that makes weeks start on Sunday and runs the weekly golden plan. The insights design document says so.

**Blocked by:** 01 (Weekly, quarterly and year-to-date plans run end to end), 03 (Query rows are read by name)

**Status:** done

- [x] The fault-injection test, described as such, is written first and seen to fail because the envelope comes back zero-filled
- [x] One check where the axis is built raises a runtime error naming the interval and the stray keys; the test passes
- [x] Plans without a time axis, and range-all plans with no rows, are unaffected
- [x] The insights design document's zero-filled buckets bullet says a row off the axis fails the execution
- [x] The analytics gate (ruff, format, mypy, pytest) is green

## Comments

- Red seen for the right reason: under the injected Sunday-start week, the weekly golden plan
  returned `2026-08-30`, `2026-09-06`, `2026-09-13`, all `0.0000`, while Postgres had put
  300.0000 and 25.0000 in the Mondays' buckets. With the check it raises a `RuntimeError`
  naming `week` and `['2026-08-31', '2026-09-07']`; the route's catch-all turns it into the
  logged 500.
- The check sits where the axis is built, so it covers bounded and `all` ranges and both
  time-axis shapes; a plan without an interval returns before it, and an `all` range with no
  rows has nothing to check.
