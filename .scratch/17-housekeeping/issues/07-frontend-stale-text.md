# 07: Correct stale frontend text

**What to build:** comments and one test fixture that state false things are corrected, text only: the plan filters type stops saying merchants are rejected; the invalidation test and the transaction hooks point at the insights hooks module where the code lives; the browser-date helper describes the server's real UTC-today-plus-one rule; the explorer's test fixture uses the real `interval` field and its J15 comment describes the executor's two empty shapes and cites the design document, not a git-ignored file.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The plan filters type no longer says merchants are rejected
- [ ] The invalidation test's comment points at `useInsightResults` in the insights hooks module
- [ ] The transaction hooks' comment says `useInvalidateInsights` lives in the insights hooks module
- [ ] The browser-date helper's docblock describes the UTC-today-plus-one rule and no bounce
- [ ] The explorer test's saved-insight fixture uses `interval`, and its J15 comment describes both empty shapes and cites the design document
- [ ] No test assertion changes; lint, format check and tests are green
