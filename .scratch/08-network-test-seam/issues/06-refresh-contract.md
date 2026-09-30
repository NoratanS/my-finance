# 06: Every mutation family's refresh contract is covered

**What to build:** for each mutation family — Transaction data, Category data, Budgets, Subscriptions, Insights, the Profile mutations' Session updates and restore — a test mounts every query the family must refresh, runs one mutation, and shows each mounted query asking the server again (and, for the documented bug, the pinned result showing the new answer). It replaces the one test that stubbed the client and asserted cache state, which is deleted and leaves the lint allowlist.

**Blocked by:** 01 — A shared test server answers every request, and nothing reaches a socket; 04 — A lint rule keeps new tests on the network seam

**Status:** ready-for-agent

- [ ] One test per mutation family, observing refetches over the wire, never cache state
- [ ] The old invalidation test is deleted and leaves the allowlist (twelve entries remain)
- [ ] Removing the pinned-result refresh from the Transaction data helper fails the Transaction family test (planted once, reverted)
- [ ] Removing Subscription delete's Transaction refresh fails the Subscription family test (planted once, reverted)
- [ ] lint, format, test and build stay green
