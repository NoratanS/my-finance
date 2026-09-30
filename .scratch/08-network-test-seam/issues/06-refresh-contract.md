# 06: Every mutation family's refresh contract is covered

**What to build:** for each mutation family — Transaction data, Category data, Budgets, Subscriptions, Insights, the Profile mutations' Session updates and restore — a test mounts every query the family must refresh, runs one mutation, and shows each mounted query asking the server again (and, for the documented bug, the pinned result showing the new answer). It replaces the one test that stubbed the client and asserted cache state, which is deleted and leaves the lint allowlist.

**Blocked by:** 01 — A shared test server answers every request, and nothing reaches a socket; 04 — A lint rule keeps new tests on the network seam

**Status:** done

- [x] One test per mutation family, observing refetches over the wire, never cache state
- [x] The old invalidation test is deleted and leaves the allowlist (twelve entries remain)
- [x] Removing the pinned-result refresh from the Transaction data helper fails the Transaction family test (planted once, reverted)
- [x] Removing Subscription delete's Transaction refresh fails the Subscription family test (planted once, reverted)
- [x] lint, format, test and build stay green

## Comments

- **Planted defects, each seen failing and reverted** (every one of the seven tests failed at
  least once): the pinned-result refresh removed from the Transaction data helper, and separately
  the merchant-suggestions refresh (the Transaction family test, naming the query whose count
  stayed at 1); Subscription delete's Transaction refresh removed (the Subscription test); the
  Category helper's Subscription refresh removed (the Category test); the Budget status refresh
  removed (the Budget test); the open-Insight refresh removed (the Insight test); create not
  adding the Profile to the Session, and delete keeping a deleted Active profile (the Profile
  test); restore not refetching the Session (the restore test).
- **Rule of two.** The Insight builder entered the wire fixtures here (its second user after the
  pinned-tile test, which now builds its Insight from it). The page, Budget, Budget status and
  Subscription dashboard answers stay local to this file.
- **The Profile family** is one test that runs create, rename, delete of another Profile and
  delete of the Active profile in sequence, observing what `useSession` returns: those mutations
  write the Session directly rather than asking the server again.
