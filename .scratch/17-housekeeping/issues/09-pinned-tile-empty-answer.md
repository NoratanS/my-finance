# 09: A pinned tile shows the Empty answer

**What to build:** a pinned Insight that matches no transactions says "No transactions match this plan." on the Dashboard instead of drawing empty axes. The explorer and the Dashboard tile share one definition of an Empty answer: no result entry, or every entry's collection empty; a `value` result (its zero is an answer) and a zero-filled bounded timeseries are never empty.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A failing test is seen red first: a pinned Insight pinning PLN whose execute answer holds one PLN breakdown entry with no groups shows the message and no chart
- [ ] Guards: one group shows the chart and no message; no result entries shows the message
- [ ] The tests run the real hooks with only the HTTP function stubbed by path (the fallback seam; msw has not landed); the result renderer is the one substitution
- [ ] The explorer and the tile both use one shared, non-component definition; the explorer's zero note stays private to it
- [ ] INSIGHTS.md's "Empty data is a result" bullet says a pinned tile shows the same Empty answer
- [ ] Lint, format check, tests, build and the Storybook build are green
