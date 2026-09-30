# 04: The profile switch lives beside the check that re-verifies it

**What to build:** the active-profile module owns the profile switch — the only place a client names a profile: it answers `404` unless the profile is the user's, stores the selection (the only operation that may create a session) and returns the Profile. The auth service delegates to it. Deleting a profile no longer clears the acting session's selection eagerly: that session heals on its next request like every other session, with identical observable behaviour. The unverified raw-id read and the raw setter leave the module's interface. The architecture document describes the one module.

**Blocked by:** 01 — A dangling active profile reads as "no active profile" everywhere

**Status:** done

- [x] The switch operation is on the active-profile module; the auth service's switch delegates to it and its constructor is unchanged
- [x] The profile service no longer depends on the active-profile module
- [x] The module no longer offers an unverified id read or a raw setter
- [x] The four switch tests, the `/me` tests, the login test and the profile-delete tests pass unchanged; the backend build is green
- [x] The architecture document's scoping bullet names the module and what it guarantees

## Comments

- `ProfileControllerTest.deleteClearsActiveProfileWhenTheDeletedProfileWasActive` passes
  unchanged without the eager clear: the acting session heals through `/me` like any other.
- The API document's switch section gains its closing sentence ("Both checks live in
  `ActiveProfile`") here rather than in ticket 01, where it would have been false.
- Backend: `Tests run: 444, Failures: 0, Errors: 0, Skipped: 0`.
