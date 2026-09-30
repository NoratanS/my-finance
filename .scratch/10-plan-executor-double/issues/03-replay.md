# 03: The stand-in answers with the recorded exchanges

**What to build:** the stand-in answers each plan with its recorded exchange for the current database state, and a plan with no recorded exchange fails the test with the plan and the recorded names in the message. Backend tests send recorded plans and read every executor answer they assert from the exchange: the envelope passed through byte for byte, the unknown-category rejection, the executor's real wording for an unsupported version, the executor's 400 for a profile id smuggled into a plan (while the forwarded profile id stays the session's), and a new test that an executor failure carrying a problem list still becomes "analytics unavailable". Faults no plan can produce (a failing database, a delay, a proxy's non-JSON page, nothing listening) are explicit on the stand-in. The stand-in accepts only its own bearer token.

**Blocked by:** 01 (One stand-in for the plan executor), 02 (Record the executor's answers and prove them against the real route)

**Status:** ready-for-agent

- [ ] The stand-in loads every exchange at start and refuses to start on none or on two with the same database state and plan
- [ ] Each test can look up an exchange by name: its plan, status and the exact body text sent
- [ ] Every backend assertion on executor wording or envelopes reads it from an exchange
- [ ] The smuggled-profile test expects the executor's 400 invalid plan and still asserts the forwarded profile id is the session's
- [ ] An executor 500 carrying a problem list becomes "analytics unavailable", not "invalid plan" (client tests: 10)
- [ ] A wrong bearer token gets the executor's 401, and the endpoint test sets the token the stand-in expects
- [ ] An unrecorded plan fails the test with a message quoting the plan and listing the recorded exchanges
- [ ] docs/INSIGHTS.md "Testing strategy" describes recorded exchanges in its Backend bullet
- [ ] The full backend build is green
