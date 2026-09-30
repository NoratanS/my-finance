# 10: Saved plans are normalized where they enter the frontend

**What to build:** a saved Insight whose plan leaves out `filters`, `groupBy` or `interval` renders on the Dashboard instead of blanking it, its tile's "Open" link reopens the same question, and the explorer's deep link to it renders. The insights hooks return every Insight with a Normalized plan (absent `filters` -> `{}`, absent `groupBy` or `interval` -> `null`, nothing else touched), exactly as the plan executor reads one.

**Blocked by:** 09 (same test file and seam)

**Status:** ready-for-agent

- [ ] Failing tests are seen red first: a pinned minimal plan (version, metric, "all time") renders its tile with the description "spend · all categories · all time · every currency" and an Open link whose plan carries a null `groupBy`
- [ ] The deep-link hook returns that plan with `filters` `{}` and `groupBy` and `interval` null
- [ ] Normalization lives only in the insights hooks module; unknown fields, version, metric, range and forecast pass through untouched; no backend or executor change
- [ ] The Insight type's comment says its plan is normalized on read; INSIGHTS.md "Plan DSL v1" states the absence semantics
- [ ] Lint, format check, tests, build and the Storybook build are green
