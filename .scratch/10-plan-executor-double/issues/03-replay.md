# 03: The stand-in answers with the recorded exchanges

**What to build:** the stand-in answers each plan with its recorded exchange for the current database state, and a plan with no recorded exchange fails the test with the plan and the recorded names in the message. Backend tests send recorded plans and read every executor answer they assert from the exchange: the envelope passed through byte for byte, the unknown-category rejection, the executor's real wording for an unsupported version, the executor's 400 for a profile id smuggled into a plan (while the forwarded profile id stays the session's), and a new test that an executor failure carrying a problem list still becomes "analytics unavailable". Faults no plan can produce (a failing database, a delay, a proxy's non-JSON page, nothing listening) are explicit on the stand-in. The stand-in accepts only its own bearer token.

**Blocked by:** 01 (One stand-in for the plan executor), 02 (Record the executor's answers and prove them against the real route)

**Status:** done

- [x] The stand-in loads every exchange at start and refuses to start on none or on two with the same database state and plan
- [x] Each test can look up an exchange by name: its plan, status and the exact body text sent
- [x] Every backend assertion on executor wording or envelopes reads it from an exchange
- [x] The smuggled-profile test expects the executor's 400 invalid plan and still asserts the forwarded profile id is the session's
- [x] An executor 500 carrying a problem list becomes "analytics unavailable", not "invalid plan" (client tests: 10)
- [x] A wrong bearer token gets the executor's 401, and the endpoint test sets the token the stand-in expects
- [x] An unrecorded plan fails the test with a message quoting the plan and listing the recorded exchanges
- [x] docs/INSIGHTS.md "Testing strategy" describes recorded exchanges in its Backend bullet
- [x] The full backend build is green

## Comments

- The token check lands here rather than in step 4 (spec deviation). Once the stand-in answers
  from recorded exchanges, the client test's "unexpected status" case has nothing left to run
  against: its canned 401 is gone, an unrecorded plan fails the test by design, and the 500 is
  the new failure test's job. Checking the bearer token here gives that test its final form (a
  client with a wrong token gets the stand-in's real 401) with no throwaway scripting hook, and
  the endpoint test registers `analytics.token` in the same step. Step 4 adds the other refusals.
- The endpoint's 409 and 401 tests still post a relative-range plan: they never reach the
  stand-in, and if a regression ever made them reach it, the unrecorded-plan failure would say so.
- Verified by hand: a scratch test posting an unrecorded plan failed with the plan, its database
  state and the five recorded names in the message (the scratch test was deleted).
- The Testing strategy bullet says "an absolute range or `all`" where the proposal said "an
  absolute range or no time axis" (see ticket 02's comment).
