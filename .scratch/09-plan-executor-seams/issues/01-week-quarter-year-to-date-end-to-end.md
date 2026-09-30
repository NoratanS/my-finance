# 01: Weekly, quarterly and year-to-date plans run end to end

**What to build:** three more golden cases execute through the plan executor against the seeded database with the frozen date: weekly spend over the last month, quarterly spend over the last twelve months, and monthly spend year to date, all for Groceries with its descendants in PLN. Each returns one PLN time series whose buckets and values reconcile with the existing monthly and yearly goldens. No production behaviour changes. The testing strategy in the insights design document says every range type and the week and quarter buckets run end to end.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] A weekly plan's axis starts on the Monday before the range start and carries 300.0000, 25.0000, 0.0000
- [x] A quarterly plan carries 2025-Q4 200.0000, 2026-Q1 and 2026-Q2 0.0000, 2026-Q3 675.0000
- [x] A year-to-date plan carries nine monthly buckets from January (six zeros, 150.0000, 200.0000, 325.0000) and no anomaly flag
- [x] Any hand-computed value the real executor disagrees with is investigated, and the golden follows the executor if the executor is right (recorded below)
- [x] The insights design document's Executor testing bullet names every range type and the week and quarter buckets
- [x] The analytics gate (ruff, format, mypy, pytest) is green

## Comments

- All three hand-computed envelopes (week, quarter, year to date) matched the real executor
  against the seeded Postgres on the first run; no golden needed correcting. Analytics suite
  195 → 198.
