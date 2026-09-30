# 04: The profile switch lives beside the check that re-verifies it

**What to build:** the active-profile module owns the profile switch — the only place a client names a profile: it answers `404` unless the profile is the user's, stores the selection (the only operation that may create a session) and returns the Profile. The auth service delegates to it. Deleting a profile no longer clears the acting session's selection eagerly: that session heals on its next request like every other session, with identical observable behaviour. The unverified raw-id read and the raw setter leave the module's interface. The architecture document describes the one module.

**Blocked by:** 01 — A dangling active profile reads as "no active profile" everywhere

**Status:** ready-for-agent

- [ ] The switch operation is on the active-profile module; the auth service's switch delegates to it and its constructor is unchanged
- [ ] The profile service no longer depends on the active-profile module
- [ ] The module no longer offers an unverified id read or a raw setter
- [ ] The four switch tests, the `/me` tests, the login test and the profile-delete tests pass unchanged; the backend build is green
- [ ] The architecture document's scoping bullet names the module and what it guarantees
