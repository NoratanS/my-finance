# 0006 — Money as integer minor units plus a kind

Date: 2026-11-10 · Status: accepted

**Decision.** Amounts are stored as `bigint` minor units (grosze / cents), always positive; a `kind` column (`expense` / `income`) carries the sign. One currency per user, no conversion. Local dev uses Postgres in Docker; previews use Neon branches.

**Consequences.** No float rounding; sums are exact integer SQL. Formatting happens at the edge (the SPA), using the user's currency.
