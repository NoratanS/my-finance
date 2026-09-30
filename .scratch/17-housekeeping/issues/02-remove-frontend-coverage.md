# 02: Remove the unused frontend coverage tooling

**What to build:** the frontend's coverage script, its coverage-provider dependency and the test runner's coverage configuration go together, so nothing points at a provider that is no longer installed.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] No coverage script, coverage-provider dependency or coverage configuration remains in the frontend
- [ ] The dependency is removed through the package manager, and the lockfile diff only removes entries
- [ ] Lint, format check, tests, build and the Storybook build are green
