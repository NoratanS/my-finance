# 06: Remove frontend dead code

**What to build:** the display helper `sumAmounts` that nothing calls, and the `useProfiles` hook that nothing calls together with the four invalidations of its now-unused cache key and the import this orphans, are gone. The profile list the UI renders still comes from the Session and is updated exactly as before; `GET /api/profiles` stays in the backend.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `sumAmounts` is gone
- [ ] `useProfiles`, the four invalidations of its key and the orphaned import are gone; Session updates are unchanged
- [ ] Lint, format check, tests, build and the Storybook build are green
