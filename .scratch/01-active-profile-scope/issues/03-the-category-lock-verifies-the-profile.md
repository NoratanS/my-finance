# 03: The category-tree lock is taken by the active-profile module

**What to build:** creating, changing and deleting a Category take "the active profile, locked" from the active-profile module: one owner-scoped row-lock query that both verifies the profile and serialises category-tree changes within the profile until the transaction ends. Two concurrent reparents that together would form a cycle stay serialised, and a category change racing a delete of its profile either completes first or answers `409` `/errors/no-active-profile`. The profile repository's lock query takes the user's id, like every other method on it.

**Blocked by:** 01 — A dangling active profile reads as "no active profile" everywhere

**Status:** done

- [x] A test of two concurrent reparents that together would form a cycle — exactly one `200` and one `422` `/errors/category-cycle` — is committed green against the current lock before the lock moves
- [x] The module offers the locked resolution, documented as requiring a read-write transaction, clearing a dangling selection like every other resolution
- [x] The profile lock query is scoped by owner and replaces the unscoped one
- [x] The Category service no longer locks the profile itself and no longer depends on the profile repository
- [x] The concurrency test, the sweep's category-create row and every Category test pass; the backend build is green

## Comments

- The concurrency test was committed on its own, green against the old lock, before the lock
  moved. With the lock temporarily removed from the update path it failed 3 of 3 runs (both
  moves answered `200`), so it does detect a missing lock.
- Unverified fact 3 of the spec (a pessimistic lock requested outside a read-write transaction)
  was not exercised: the locked resolution is called only from the three read-write Category
  mutations, and its Javadoc states the constraint.
- Backend: `Tests run: 444, Failures: 0, Errors: 0, Skipped: 0` (+1, the concurrency test).
