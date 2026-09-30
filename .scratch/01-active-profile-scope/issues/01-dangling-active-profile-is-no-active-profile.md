# 01: A dangling active profile reads as "no active profile" everywhere

**What to build:** a session whose active profile was deleted from another session (or no longer belongs to the session's user) gets `409` `/errors/no-active-profile` on every profile-scoped endpoint — reads and writes of categories, transactions, budgets, subscriptions and insights, and insight execution — and the stored selection is forgotten, so the frontend lands on the profile picker whatever the next request was. Resolving the active profile re-verifies, on every use, that it exists and belongs to the authenticated user; `GET /api/auth/me` uses the same resolution and keeps reporting `activeProfileId: null`. Requests without a session or without a selection behave exactly as today. The API document states the rule.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A sweep over a read and a write of every profile-scoped resource (category list and create, transaction list and create, budget list and create, subscription list, dashboard and create, insight list, create and execute) is written first and seen failing against the current code, with each row's current answer recorded
- [ ] After the active profile is deleted from another session, every row of the sweep answers `409` `/errors/no-active-profile`
- [ ] The stale session still exists after one such request, and its stored active profile is gone
- [ ] A session whose stored active profile belongs to another user answers `409` and returns none of that profile's rows
- [ ] A session with a valid active profile answers `200` and keeps its selection
- [ ] `GET /api/auth/me` builds its answer from the same verified resolution; its local self-heal is gone
- [ ] The Category test that expected `404` for this state is replaced by the sweep
- [ ] Every existing no-active-profile, wrong-profile, switch, `/me` and passwordless test passes unchanged
- [ ] The API document's active-profile section, switch section, profile-delete section and status-code summary describe the rule
- [ ] The committed OpenAPI document is unchanged; the backend build is green
