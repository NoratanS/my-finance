# 03: The pinned-tile tests run on the network seam

**What to build:** the pinned insight tiles' tests, written with the client function stubbed by path while the network seam did not exist yet, declare their answers to the test server instead. Same test names, same assertions; the tiles' full network conversation (Session, Insights, Categories, execution) is declared in the file, and no test mocks the client module any more.

**Blocked by:** 01 — A shared test server answers every request, and nothing reaches a socket

**Status:** done

- [x] The file no longer mocks the client module; only the chart renderer is replaced
- [x] Every test keeps its name and its assertions
- [x] Each converted test still fails against the defect it pins (planted once, reverted)
- [x] lint, format, test and build stay green

## Comments

- **Why this ticket exists.** Spec 17's two frontend defect tests (the pinned tile's Empty answer
  and the minimal saved Plan) landed before this spec, on the fallback seam spec 17 named: the
  client's `api` function stubbed by path. The cross-check says they use the network seam once
  step 1 has landed, and spec 08's lint allowlist is "not a list to grow", so the file converts
  here, in its own commit, rather than joining the allowlist.
- **Typing.** The minimal saved Plan is typed against the generated `InsightResponse` (its `plan`
  is a free-form object on the wire, stored verbatim), not against `Insight`, whose `plan` is the
  Normalized plan the hooks produce.
- **Planted defects, each seen failing and reverted:** the tile drawing a chart for an answer
  where nothing matched (the Empty-answer test), the tile always showing the Empty answer (the
  matching-group guard), the tile drawing any answer (both Empty-answer tests), and the hooks not
  normalizing `filters`, then `groupBy` (both minimal-plan tests).
