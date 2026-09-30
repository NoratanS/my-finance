# 11: One end-to-end support module

**What to build:** the six end-to-end helpers that are identical across suites (register and log in, post JSON with the session, the current month's bounds, today's UTC date with an optional offset, create a profile and a category, the first day of a past month) are defined once in a support module the runner does not collect, with one correct comment on why test dates are UTC. Helpers that genuinely differ per suite stay in their suites; no assertion changes.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The six helpers live in one support module that is not collected as a spec; every suite imports them from there
- [ ] The support module's comment says compose defaults the executor's `TZ` to UTC and the backend is UTC in code
- [ ] `registerPickAndGo`, `seedData` and `verifySeeded` stay in their suites
- [ ] The Playwright runner lists the same tests as before; lint, format check and a type check of the end-to-end files are green (the suite itself runs in CI)
