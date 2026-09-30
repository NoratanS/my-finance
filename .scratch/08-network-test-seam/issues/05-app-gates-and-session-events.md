# 05: The route gates and the Session events are covered

**What to build:** `App` is tested at the network seam: the loading splash while the Session is pending; signed-out visitors land on the sign-in screen; a Session without an Active profile lands on the profile picker and, after the user picks a Profile, returns to where it was going; a signed-in visitor at the sign-in route goes on to the picker or the app; a Session that expires mid-use lands on the sign-in screen; losing the Active profile mid-use lands on the picker; "Log out" signs out and shows the sign-in screen.

**Blocked by:** 01 — A shared test server answers every request, and nothing reaches a socket

**Status:** ready-for-agent

- [ ] Every gate branch, both Session-event branches and sign-out have a test
- [ ] The profile switch is asserted to carry `profileId` on the wire
- [ ] Removing the listener's `409` branch, then its `401` branch, fails the named tests (planted once each, reverted)
- [ ] Making the app layout ignore a missing Active profile fails the named test (planted once, reverted)
- [ ] lint, format, test and build stay green
