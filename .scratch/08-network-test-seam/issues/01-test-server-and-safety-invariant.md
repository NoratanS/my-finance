# 01: A shared test server answers every request, and nothing reaches a socket

**What to build:** every frontend unit test runs with a fake network. A shared test server answers the Session by default and answers anything else nobody declared with a network error, recording it; a test that leaves a request unanswered fails with the method and URL named, and the next test still starts clean. The unit-test origin is a reserved `.invalid` name instead of `localhost:3000`, where the shipped app is published, so a test run next to a running instance can never read or change its data. Every test starts with the default answers only, a fresh query client, the CSRF cookie planted and real timers. The decision and its reasons are written in ARCHITECTURE.md, and a lessons entry maps it onto `httpx.MockTransport`. The existing tests stay unchanged and green.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The unit-test origin is a `.invalid` name, proven by a test
- [ ] A request no test answered never opens a connection (proven against a real local listener), including one whose handler returns nothing
- [ ] An unanswered request fails its test, naming method and URL; the test after it starts with nothing mounted and no leftover handlers (planted once and seen)
- [ ] The default Session answer is a signed-in User with the "Household" (PLN) Profile active, built fresh per request by a typed wire-fixture builder
- [ ] One Problem answer helper serves `application/problem+json` in the backend's shape
- [ ] The CSRF cookie is present at the start of every test
- [ ] ARCHITECTURE.md §4 carries "Why unit tests fake the network, not the hooks"; the lessons entry is written
- [ ] `npm test` wall time is recorded before and after
- [ ] lint, format, test and build stay green, with every existing test unchanged
