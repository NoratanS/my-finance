# 01: A dangling active profile reads as "no active profile" everywhere

**What to build:** a session whose active profile was deleted from another session (or no longer belongs to the session's user) gets `409` `/errors/no-active-profile` on every profile-scoped endpoint — reads and writes of categories, transactions, budgets, subscriptions and insights, and insight execution — and the stored selection is forgotten, so the frontend lands on the profile picker whatever the next request was. Resolving the active profile re-verifies, on every use, that it exists and belongs to the authenticated user; `GET /api/auth/me` uses the same resolution and keeps reporting `activeProfileId: null`. Requests without a session or without a selection behave exactly as today. The API document states the rule.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] A sweep over a read and a write of every profile-scoped resource (category list and create, transaction list and create, budget list and create, subscription list, dashboard and create, insight list, create and execute) is written first and seen failing against the current code, with each row's current answer recorded
- [x] After the active profile is deleted from another session, every row of the sweep answers `409` `/errors/no-active-profile`
- [x] The stale session still exists after one such request, and its stored active profile is gone
- [x] A session whose stored active profile belongs to another user answers `409` and returns none of that profile's rows
- [x] A session with a valid active profile answers `200` and keeps its selection
- [x] `GET /api/auth/me` builds its answer from the same verified resolution; its local self-heal is gone
- [x] The Category test that expected `404` for this state is replaced by the sweep
- [x] Every existing no-active-profile, wrong-profile, switch, `/me` and passwordless test passes unchanged
- [x] The API document's active-profile section, switch section, profile-delete section and status-code summary describe the rule
- [x] The committed OpenAPI document is unchanged; the backend build is green

## Comments

- Red run of the sweep against the code before the change (after the profile was deleted from
  another session): category list `200`, category create `404 not-found` (profile), transaction
  list `200`, transaction create `404 not-found` (category), budget list `200`, budget create
  `404`, subscription list `200`, subscription dashboard `200`, subscription create `404`, insight
  list `200`, insight create `409 /errors/conflict`, insight execute `503` (the dead id was
  forwarded to the plan executor, which the test context cannot reach). The session-attribute
  check answered `200`; the other-user check answered `200` **with that user's rows** — reachable
  only through a session the API cannot produce, but it confirms the stored id was trusted as is.
  The valid-profile check was already green.
- Unverified fact 1 of the spec (insight create answers `409 conflict` today) is confirmed.
- Unverified fact 2 (Spring Session commits an attribute removal on a request that ended in a
  handled exception) is confirmed: the session-attribute check is green after the change.
- The switch section's closing sentence of the docs proposal ("Both checks live in
  `ActiveProfile`") lands with ticket 04, when the switch moves there; until then it would be
  false.
- Backend: `Tests run: 443, Failures: 0, Errors: 0, Skipped: 0` (429 before, +15 new, −1 replaced).
