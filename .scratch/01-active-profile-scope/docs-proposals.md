# Docs proposals — Candidate 1: Give the active profile one home

## (a) Proposed glossary terms

**Dangling active profile**:
A session's active profile whose Profile no longer exists, or no longer belongs to the session's User —
typically because it was deleted from another session. In the domain it is the same state as having no
active profile.
_Avoid_: stale active profile, orphaned profile, deleted active profile

(Why this word: the code already calls it a "dangling reference" (`AuthService` session-response comment).
"Stale" is avoided because `loginRotatesSessionIdAndClearsStaleActiveProfile` uses it for a different thing —
a profile id left over from before a login.)

No other new terms: "Active profile", "Profile", "User" and "Problem" from the seed list cover the rest.

## (b) Proposed ADRs

None.

- The one hard-to-reverse, surprising decision — a dangling active profile answers `409`
  `no-active-profile` rather than `404` — amends `docs/API.md`, a recorded-decision document. Per the repo
  rule it is recorded there (section (c)), not in a separate ADR.
- Keeping the module in `security`, adding the lock to its interface, and leaving the per-resource
  owned-row lookups in their services are all cheap to reverse; they need no ADR.

## (c) Required updates to recorded-decision documents

All of these land in the same change as the code that makes them true (step numbers refer to the spec's
ordered steps).

### 1. `docs/API.md` — "Active profile: server-side, never client-supplied" (step 1)

Replace the paragraph that begins "Every request to a profile-scoped resource resolves the profile
server-side…" (currently lines 72–75) with:

> Every request to a profile-scoped resource resolves the profile server-side from the session,
> re-verifies that it still exists and still belongs to the authenticated user (one primary-key lookup),
> and passes it into the repository query. The session value is never trusted on its own: it was checked
> when it was stored, and it is checked again every time it is used. This pairs with the composite foreign
> keys in `SCHEMA.md`: the service layer scopes the query, and the schema makes a cross-profile row
> unstorable in the first place.

Append to the paragraph that begins "A request to a profile-scoped endpoint with no active profile
selected…" (currently lines 77–80):

> A session whose selected profile no longer resolves — deleted from another session, or no longer the
> user's — is in the same state. The stored id is cleared and the answer is the same `409`
> `no-active-profile`, on every profile-scoped endpoint, reads included. Not a `404`: the request did not
> name the profile, and the only useful next step for the client is the profile picker.

### 2. `docs/API.md` — "`PUT /api/auth/active-profile`" (step 1)

Replace the paragraph "This is the only place a profile id is ever accepted from the client…" (currently
lines 405–408) with:

> **This is the only place a profile id is ever accepted from the client**, and the server must verify
> the profile belongs to the authenticated user before writing it to the session. That check is where a
> client's choice enters the scoping model; every later request re-verifies the stored value (see
> "Active profile: server-side, never client-supplied"), which is what keeps it true after a profile is
> deleted. Both checks live in `ActiveProfile`. The switch gets a dedicated test in the auth ticket.

The status table is unchanged (`404` still means "no such profile, or it belongs to another user").

### 3. `docs/API.md` — "`DELETE /api/profiles/{id}`" (step 1)

Replace the closing paragraph "Deleting the profile currently active in the session clears the
active-profile session attribute…" (currently lines 519–522) with:

> Every session that had the deleted profile selected — the acting session and any other session of the
> same user — reads as having no active profile from its next request on: `GET /api/auth/me` reports
> `activeProfileId: null`, a profile-scoped request answers `409` `/errors/no-active-profile`, and the stored
> id is cleared — the same as `PUT /api/auth/active-profile` never having been called. The client is routed
> back to the picker rather than left pointing at a profile that no longer exists.

### 4. `docs/API.md` — "Status code summary", `409` row (step 1)

Currently line 1529. After the change:

> | `409` | State conflict: no active profile selected (or the selected one no longer exists), uniqueness violation, category in use, or last remaining profile |

### 5. `ARCHITECTURE.md` — §3 "Profiles and authentication", the scoping bullet (step 4)

Append to the bullet that begins "All domain entities (transactions, categories, budgets) are associated
with a `profile_id`…" (currently lines 124–127):

> The services get the active profile from one module, `ActiveProfile` (`security/`), which re-verifies on
> every request that the stored profile still exists and belongs to the authenticated user, hands out the
> verified `Profile` (as the owner of a new row, and row-locked for category-tree changes), owns the
> profile switch, and treats a profile deleted from another session as "no active profile".

Do not touch the Redis bullet of the same section (lines 113–123) — candidate 13 rewrites it.

### Documents checked and left unchanged

- `ARCHITECTURE.md` line 65 ("`security/` … session-held active profile …") — still accurate.
- `ARCHITECTURE.md` "Structural tests (ArchUnit)" — no rule is added (grilling Q14); its limits sentence
  stays true.
- `docs/SCHEMA.md` — holds no statement about the active profile; cascades (`profile` → everything) are
  unchanged and are what makes the verification necessary.
- `docs/INSIGHTS.md` — the executor still receives the profile id from the backend; nothing changes.

### Contradictions surfaced while cross-checking docs against code

- `ProfileRepository`'s Javadoc says "every method takes the authenticated user's id", but `lockById(id)`
  does not. Resolved by the change (the lock query becomes owner-scoped).
- `docs/API.md` line 407, "Everything downstream trusts the session value", stopped being safe when
  `DELETE /api/profiles/{id}` shipped; `/me` and the category lock were patched around it. Resolved by
  update 2.
- Noticed, **not changed** (adjacent text, not this candidate's): the `ARCHITECTURE.md` scoping bullet lists
  "transactions, categories, budgets" but subscriptions and insights are profile-scoped too — a candidate
  for candidate 17's stale-text sweep.
