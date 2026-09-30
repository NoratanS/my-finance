# 02: The client module's request contract is covered

**What to build:** the one module every request passes through is tested at the network seam: the CSRF header on mutating requests only, JSON bodies and their content type, parsed 2xx bodies, `204`, a Problem becoming an `ApiError` with every member, a non-JSON error body, a network failure, the Session events for `401` and `409` `no-active-profile` and their opt-out, the backup download and the backup upload. API.md "Errors" names the two Problems the security layer writes, which the fixtures mirror.

**Blocked by:** 01 — A shared test server answers every request, and nothing reaches a socket

**Status:** ready-for-agent

- [ ] Every request, Session-event, download and upload behaviour the spec lists has a test
- [ ] The query-string builder is tested by calling it
- [ ] Removing the CSRF header from the client fails the CSRF test (planted once, reverted)
- [ ] Stopping the client firing the `409` event fails the event test (planted once, reverted)
- [ ] API.md "Errors" names `401` `/errors/unauthenticated` and `403` `/errors/forbidden`
- [ ] lint, format, test and build stay green
