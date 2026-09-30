# 03: The category-tree lock is taken by the active-profile module

**What to build:** creating, changing and deleting a Category take "the active profile, locked" from the active-profile module: one owner-scoped row-lock query that both verifies the profile and serialises category-tree changes within the profile until the transaction ends. Two concurrent reparents that together would form a cycle stay serialised, and a category change racing a delete of its profile either completes first or answers `409` `/errors/no-active-profile`. The profile repository's lock query takes the user's id, like every other method on it.

**Blocked by:** 01 — A dangling active profile reads as "no active profile" everywhere

**Status:** ready-for-agent

- [ ] A test of two concurrent reparents that together would form a cycle — exactly one `200` and one `422` `/errors/category-cycle` — is committed green against the current lock before the lock moves
- [ ] The module offers the locked resolution, documented as requiring a read-write transaction, clearing a dangling selection like every other resolution
- [ ] The profile lock query is scoped by owner and replaces the unscoped one
- [ ] The Category service no longer locks the profile itself and no longer depends on the profile repository
- [ ] The concurrency test, the sweep's category-create row and every Category test pass; the backend build is green
