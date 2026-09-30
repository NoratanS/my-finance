# Give the active profile one home

Status: ready-for-agent
Candidate: 1 — Give the active profile one home
Strength: Strong
Depends on: none (lands before candidate 6, which also edits `AuthService` — see Further Notes)

## Problem Statement

The active profile is the one piece of state that decides whose financial data a request may touch, and
today it has no single owner. `ActiveProfile` hands out a raw id read from the HTTP session and trusts it;
each of the five profile-scoped services (`TransactionService`, `CategoryService`, `BudgetService`,
`SubscriptionService`, `InsightService`) then finishes the scoping ritual on its own — fetching a reference
for inserts, locking, deciding what a missing profile means.

That split already produced a defect that was fixed caller by caller and is still open in four callers.
When a user deletes a profile in one browser (or tab), every other session that had it selected keeps the
dead id. What that other session sees next depends on which endpoint it happens to call:

- lists, summaries and dashboards answer `200` with empty data — the user sees their money "disappear"
  instead of being sent to the profile picker;
- creating a transaction, budget or subscription answers `404` "No category with id N" — blaming a
  category the user never touched;
- creating an insight answers a generic `409` "conflict — retry or refresh" (by code reading);
- creating a category answers `404` "No profile with id N";
- `GET /api/auth/me` alone answers correctly ("no active profile").

The same session thus gets four different answers for one state, and only one of them makes the frontend
do the right thing. For the maintainer and future contributors, the rule "the active profile must exist
and be the user's" lives in three places (the switch, the `/me` self-heal, the category lock) and is
missing from four more, so the next new endpoint will inherit whichever variant its author copies.

## Solution

`ActiveProfile` becomes the one module that knows what the active profile is. Every time a request needs
it, the module reads the stored id, proves that the profile still exists and still belongs to the
authenticated user (one indexed lookup), and hands back either the id or the `Profile` itself. If the
stored profile no longer resolves, the module forgets it and answers exactly what the API already answers
when no profile is selected: `409` `/errors/no-active-profile` — which the frontend already turns into
the profile picker. The module also owns the profile switch (the only place a client may name a profile),
the row lock that serialises category-tree changes, and clearing the selection at login.

For a self-hosting user, the visible change is one fix: after a profile is deleted anywhere, every session
that had it selected lands on the profile picker on its next request, whatever that request was. Nothing
else on the wire changes — no new endpoint, field, status code or problem type.

For the maintainer and contributors, the five services stop handling the profile themselves: they ask the
module for the id (reads) or the Profile (inserts), and the locked form (category mutations).

## User Stories

1. As a self-hosting user who deleted a profile on my laptop, I want my phone's session that had that
   profile open to take me to the profile picker on its next request, so that I am never shown an empty
   ledger that looks like lost data.
2. As a self-hosting user, I want creating a transaction in a session whose profile was deleted elsewhere
   to send me to the picker, so that I am not told a category I chose "does not exist".
3. As a self-hosting user, I want creating a budget or a subscription in such a session to behave the
   same way, so that every form fails the same understandable way.
4. As a self-hosting user, I want creating or running an insight in such a session to send me to the
   picker, so that I never see a vague "conflict — retry" message for a state retrying cannot fix.
5. As a self-hosting user, I want creating, renaming, moving or deleting a category in such a session to
   send me to the picker, so that I am not told "No profile with id 7" about a profile I never named.
6. As a self-hosting user, I want the dashboard, which fires several requests at once, to land me on the
   picker exactly once, so that the app does not flicker between errors.
7. As a self-hosting user, I want `GET /api/auth/me` to keep reporting "no active profile" for such a
   session, so that reloading the page also lands on the picker.
8. As a self-hosting user who deletes the profile I am working in, I want the same session to behave
   exactly as it does today (picker on the next request), so that nothing I rely on changes.
9. As a self-hosting user, I want switching to one of my own profiles to work exactly as today, so that the
   fix costs me nothing in normal use.
10. As a self-hosting user, I want switching to a profile that is not mine, or does not exist, to keep
    answering `404`, so that ids cannot be probed.
11. As a self-hosting user, I want logging in to keep starting with no profile selected, so that a new
    session never inherits an old choice.
12. As a self-hosting user on a passwordless instance, I want requests without a cookie (including the
    compose healthcheck) to keep leaving no session behind, so that the session store does not fill up.
13. As a self-hosting user, I want my existing sessions to keep their selected profile across the upgrade
    that ships this change, so that updating does not de-select my profile.
14. As a self-hosting user, I want two concurrent category moves in one profile to remain serialised, so
    that my category tree can never end up in a cycle.
15. As a self-hosting user, I want a category change racing a deletion of the same profile to either finish
    before the deletion or send me to the picker, so that I never get a server error.
16. As a self-hosting user, I want a session that somehow names a profile belonging to another account to
    be treated as having no profile, so that no request can ever read that profile's data.
17. As a self-hosting user, I want every wrong-profile row access to keep answering `404`, so that the
    existence of other profiles' rows stays invisible.
18. As a self-hosting user, I want requests without any selected profile to keep answering `409`
    `no-active-profile` exactly as today, so that the picker flow is unchanged.
19. As the owner, I want the rule "the active profile exists and is the user's" to live in one class, so
    that the next endpoint I add cannot forget it.
20. As the owner, I want the five services to ask for the active profile with one call, so that each
    service method starts with the same obvious line.
21. As the owner, I want the insert paths to receive the verified `Profile` from the module, so that no
    service needs `ProfileRepository` just to fill in an owner.
22. As the owner, I want the category-tree lock to be taken by the same call that verifies the profile, so
    that there is one query and one failure answer on that path.
23. As the owner, I want the profile switch to live next to the check that re-verifies what it stored, so
    that both halves of the ownership rule are read and changed together.
24. As the owner, I want the unverified raw-id read removed from the module's interface, so that the path
    the original defect took no longer exists.
25. As the owner, I want `ProfileService` to stop touching the active profile, so that the one service
    "above the profile boundary" does not reach below it.
26. As the owner, I want the change to add one indexed lookup per profile-scoped request and nothing more,
    so that the cost stays negligible on a single-user instance.
27. As the owner, I want the session attribute's key and value type unchanged, so that live sessions and
    the planned move of sessions into Postgres are unaffected.
28. As the owner, I want API.md and ARCHITECTURE.md to describe the new rule in the same change,
    so that the recorded design and the code do not drift.
29. As the owner, I want a LESSONS.md entry explaining why a stored decision is re-verified where it
    is used, so that I learn the Spring and design reasoning behind the change.
30. As a future contributor reading a profile-scoped service, I want the first line of each method to show
    where the profile comes from and that it is verified, so that I do not have to trace session code.
31. As a future contributor adding a resource, I want one documented way to get the active profile for
    queries, inserts and locked changes, so that I copy the right pattern.
32. As a future contributor, I want `ActiveProfile`'s Javadoc to state its invariants (never creates a
    session except on switch; clears a dangling id; 409 vs 404), so that I can use it without reading its
    body.
33. As a future contributor, I want the locked operation's documentation to say it must run inside a
    read-write transaction, so that I cannot silently take a lock that is released at once.
34. As a future contributor, I want `ProfileRepository` to take the user's id in every method, as its own
    Javadoc says, so that the repository and its description agree.
35. As a reviewer, I want one integration test that sweeps a read and a write of every profile-scoped
    resource after a cross-session delete, so that I can see the uniform answer in one place.
36. As a reviewer, I want that test to assert the stored session attribute is gone after the failing
    request, so that "cleared on discovery" is proven, not assumed.
37. As a reviewer, I want a concurrency test for the category lock written before the lock moves, so that
    moving it is verified rather than trusted.
38. As a reviewer, I want every existing wrong-profile, no-active-profile, switch and `/me` test to pass
    unchanged, so that I can see the refactor preserved behaviour.
39. As a reviewer, I want each step to ship separately with the build green, so that I can review and
    revert them one at a time.
40. As a reviewer, I want the spec to say which report recommendation was not followed and why, so that I
    can check the deviation against the evidence.

## Implementation Decisions

**The deepened module — `ActiveProfile` (stays in the `security` package, keeps its name).**
It is "the active profile of the current request, proven to exist and to belong to the authenticated user
each time it is resolved". It depends on the request-aware `HttpServletRequest` proxy (as today),
`CurrentUser` and `ProfileRepository`. It stays a concrete class: one adapter, nothing varies, so no seam
and no extracted interface. Its interface after the change:

- **the active profile** — returns the verified `Profile`, managed within the caller's transaction and
  usable as the owner of a new row; answers `409` `no-active-profile` when nothing is selected, or when the
  stored id no longer names a profile owned by the authenticated user — in that case it first removes the
  stored id from the session.
- **the active profile's id** — the same resolution, returning only the id. This keeps the existing name
  `requireId()`, so the read call sites in the five services do not change textually.
- **the active profile, locked** — the same resolution performed by a `SELECT … FOR UPDATE` on the
  profile row, scoped by owner; the lock is held until the caller's transaction ends. It must be called
  inside a read-write transaction. Used by `CategoryService`'s create, update and delete.
- **the active profile, if any** — the same resolution answering "none" instead of `409`; used by
  `AuthService` to build the session response of `GET /api/auth/me` and login.
- **switch to a profile** — the only place a client-supplied profile id is accepted: answers `404`
  `not-found` unless the profile exists and belongs to the authenticated user; otherwise stores its id in
  the session (the only operation that may create a session) and returns the `Profile`.
- **clear** — forgets the selection; never creates a session. Used by login.

Invariants the implementation must keep:

- Session attribute key `ACTIVE_PROFILE_ID`, value a `Long` — unchanged, so live sessions keep working and
  the test fixtures that plant it keep working.
- Reads use the existing-session-only form; with no session or no stored id, resolution answers without a
  database query and without creating a session.
- One owner-scoped primary-key lookup per resolution (or one lock query for the locked form). Callers
  resolve once per operation and pass the id or `Profile` down; a second resolution is correct but costs a
  second lookup.
- `409` `no-active-profile` only ever for a stored id; `404` `not-found` only ever for a client-named id
  (the switch).
- The module's Javadoc speaks of "the session store", not of a specific store (candidate 13 moves it).

**`ProfileRepository`.** `lockById` (one caller) is replaced by an owner-scoped locking query taking the
profile id and the user id — the same `PESSIMISTIC_WRITE` query with one more predicate. After this, every
method takes the user's id, as the repository's Javadoc already claims. `findByIdAndUserId` is reused for
plain resolution and for the switch.

**The five profile-scoped services.**
- Read methods keep calling the id operation; their text does not change.
- `TransactionService.create`, `BudgetService.create`, `SubscriptionService.create`, `InsightService.create`
  take the verified `Profile` from the module (and use its id for their scoped lookups) instead of calling
  `profileRepository.getReferenceById`; those four services lose their `ProfileRepository` dependency.
- `CategoryService.create`, `update`, `delete` take the locked form in place of "id, then `lockProfile`";
  `lockProfile` and `CategoryService`'s `ProfileRepository` dependency go. Its class Javadoc about the lock
  points at the module's locked operation.
- The per-resource owned-row lookups stay as they are: the four private `requireCategory` helpers and the
  single `requireTransaction`, `requireBudget`, `requireSubscription`, `requireInsight`, each one scoped
  query plus the `404`. **This deviates from the report's direction ("answers the 404 for rows that belong
  elsewhere")**: absorbing them needs either a finder passed as a method reference, a generic base
  repository, or a cross-service dependency — each cleverer or more coupled than the one-expression
  duplicate it removes, none of them adding safety (the caller still chooses the query), and the deletion
  test shows a shared helper would be nearly a pass-through. The defect lived at the profile level, which
  is what the module absorbs.

**`AuthService`** (candidate 1 owns only these two methods).
- `switchProfile` delegates to the module's switch and builds the `ActiveProfileResponse`; it still runs in
  the class-level read-only transaction. Its "hinge" Javadoc moves to the module's switch operation.
- The private session-response builder asks the module for "the active profile, if any" and loses its
  local self-heal block; the module's Javadoc carries that explanation.
- The constructor's dependencies do not change.

**`ProfileService.delete`** no longer clears the active profile eagerly and no longer depends on
`ActiveProfile`: the acting session heals on its next request like every other session, with identical
observable behaviour. Its Javadoc says so.

**`SessionAuthenticator`** is not changed by this candidate; it keeps calling the module's clear at login.

**Removed from the module's interface:** the unverified raw-id read and the raw setter. The
`NoActiveProfileException` and `ResourceNotFoundException` types are unchanged.

**API contract.** No new endpoint, field, status code or problem type. Behaviour change: for a session whose
stored active profile no longer resolves to one of the user's profiles, every profile-scoped endpoint
answers `409` `/errors/no-active-profile` (previously `200` empty, `404` for a category/profile/row, or `409`
`conflict`), and the stored id is removed. `GET /api/auth/me`, the switch, login and logout behave as today.

**Recorded-decision documents updated in the same change** (exact wording in `docs-proposals.md`):
- API.md "Active profile: server-side, never client-supplied" — the stored id is re-verified on every
  profile-scoped request; a profile deleted elsewhere (or no longer the user's) reads as "no active
  profile": `409` and the stored id is cleared.
- API.md "`PUT /api/auth/active-profile`" — replace "Everything downstream trusts the session value":
  the switch is still the only place a client names a profile, and downstream re-verifies the stored value.
- API.md "`DELETE /api/profiles/{id}`" — one rule for every session, the acting one included.
- API.md "Status code summary", `409` row — mention "or the selected one no longer exists".
- ARCHITECTURE.md §3 "Profiles and authentication", the scoping bullet — the active profile is resolved
  and verified by one module on every request. (The Redis bullet in the same section is candidate 13's.)

**Ordered steps** (each separately shippable, `./mvnw verify` green, Spotless applied):

1. **Verify on resolution.** Write `ActiveProfileTest` first (red). Make resolution verify ownership,
   clear a dangling id and answer `409`; add "the active profile, if any" and use it for the session
   response, deleting the local self-heal. Replace the Category deleted-profile test. Update the four
   API.md passages. This is the only behaviour-changing step.
2. **Hand out the Profile for inserts.** The four creates take the verified `Profile`; drop
   `getReferenceById` and the `ProfileRepository` dependency from the four services. Behaviour-preserving.
3. **Move the lock.** First add the concurrent-reparent characterisation test (green on today's code).
   Then add the locked operation with the owner-scoped lock query replacing `lockById`; `CategoryService`
   drops `lockProfile` and `ProfileRepository`. Behaviour-preserving.
4. **Move the switch; retire the raw operations.** Add the switch operation; `AuthService.switchProfile`
   delegates; `ProfileService.delete` drops the eager clear and its `ActiveProfile` dependency; remove the
   raw-id read and the raw setter. Update the ARCHITECTURE.md scoping bullet. Behaviour-preserving.
5. **Lesson.** Add the LESSONS.md entry (the file is git-ignored, so it is not part of a commit).

## Testing Decisions

**What makes a good test here.** Tests drive the real stack and assert only what a client or the session
store can observe: the HTTP status, the problem `type`, the data returned, and the stored session
attribute. No test inspects `ActiveProfile`'s fields, counts queries, or mocks a collaborator. Each test
creates all its rows before it deletes a profile (identity sequences restart per test). Test-first: the
sweep is written and seen failing before step 1's code.

**The seam — one: the HTTP interface of the profile-scoped endpoints**, driven through MockMvc in an
`@IntegrationTest` (real Spring context, real Postgres and session store via Testcontainers, the real
session filter and security chain). Chosen because the module's contract is only fully observable there:
the `409` comes from the exception handler, and "cleared on discovery" is only true if the session filter
commits the removal on a request that ended in an exception — something a direct unit test of
`ActiveProfile` with a hand-built request could not show. It is also the seam every sibling test already
uses. No new seam is introduced.

**Modules tested and new tests.**
- `ActiveProfileTest` (new, in the security test package): a parameterized sweep over a representative read
  and write of every profile-scoped resource — category list and create (the locked path), transaction list
  and create, budget list and create, subscription list, dashboard and create, insight list and create, and
  insight execute — each answering `409` `/errors/no-active-profile` after the session's active profile was
  deleted from another session; a check that the stale session's stored attribute is gone after one such
  request; a check that a session naming another user's profile answers `409` and returns none of that
  profile's rows; and a check that a valid active profile still answers `200`.
- `CategoryControllerTest` (added case): two concurrent reparents that together would form a cycle answer
  exactly one `200` and one `422` `/errors/category-cycle` — a characterisation of the lock, green before and
  after step 3.

**Replaced:** `CategoryControllerTest.createIs404WhenTheActiveProfileWasDeletedFromAnotherSession` — its
scenario is a row of the sweep, with the new expected answer.

**Survive unchanged:** `AuthControllerTest.meReturnsNullActiveProfileWhenItWasDeletedFromAnotherSession`,
the four profile-switch tests and `loginRotatesSessionIdAndClearsStaleActiveProfile`;
`ProfileControllerTest.deleteClearsActiveProfileWhenTheDeletedProfileWasActive` and
`createReturns201WithLocationAndDoesNotSwitchActiveProfile`; every `…WithoutActiveProfileIs409` and
`…FromAnotherProfileIs404` / `listDoesNotLeakOtherProfiles` case in the resource controller tests;
`PasswordlessModeTest` in full (it proves no session is created by reads); `ArchitectureTest`.

**Prior art.** The parameterized `withoutActiveProfileIs409` sweep in `TransactionControllerTest`; the
two-session delete in `CategoryControllerTest`'s current deleted-profile test and in
`AuthControllerTest.meReturnsNullActiveProfileWhenItWasDeletedFromAnotherSession`; session inspection
through `TestFixtures.createSessionWithActiveProfile`, `findSession` and `withSession` in
`AuthControllerTest.loginRotatesSessionIdAndClearsStaleActiveProfile`; the two-thread `CyclicBarrier` race in
`ProfileControllerTest.concurrentDeletesOfBothLastTwoProfilesLeaveExactlyOneStanding`.

## Out of Scope

- Collapsing the per-resource owned-row lookups (`requireCategory` ×4 and the four single `requireX`) into a
  shared or generic lookup — rejected in the grilling (Q9); revisit if a fifth resource starts referencing
  categories.
- Narrowing the repositories to hide `findById`/`findAll`/`deleteById`, and an ArchUnit rule against unscoped
  calls — rejected (Q14): the charge job needs `findById`, about 29 test calls use these methods, and a rule
  would see only the least likely slips. Profile scoping stays a review concern backed by per-resource
  wrong-profile tests, as `ArchitectureTest` already states.
- A lock or `FOR KEY SHARE` on non-category writes to close the millisecond window between verification and
  insert (scenario: a concurrent delete commits in between → generic `409 conflict`; the retry answers
  `409 no-active-profile`).
- Any per-request caching of the verified profile.
- `BackupService`, `ProfileService`'s other methods and the Subscription charge job: they are scoped by user
  or run outside a request and do not use the active profile.
- The user-level analogue (a session whose principal names a user that no longer exists) — pre-existing;
  candidate 13 (sessions in the same database) closes the realistic way to reach it.
- Frontend changes: none are needed; the existing global `409 no-active-profile` handling does the work.

## Further Notes

- **Lesson (LESSONS.md):** new entry "A session value is a cached decision: verify it where it is
  used" — re-verifying beats trusting the check made at write time; a selection that went stale answers like
  "none selected" (409), not like a missing row (404); a pessimistic lock can be part of a module's interface
  only together with "call me inside a read-write transaction". Cross-reference the existing entries on
  `orElseThrow()` without a supplier (same defect family) and on the `HttpSession` proxy (why reads never
  create a session) instead of repeating them.
- **Cost.** One indexed primary-key lookup on `profile` per profile-scoped request; category writes keep one
  query (the lock now also verifies); inserts gain one query (they previously used an unverified reference).
- **Cross-candidate agreement with candidate 6 (sign-in module).** Both edit `AuthService`. Candidate 1 owns
  `switchProfile` and the session-response builder, plus `ActiveProfile`, `ProfileService.delete`,
  `ProfileRepository`'s lock query and the five services. Candidate 6 owns `register`, `login` (new),
  `setPassword`, `normalizeEmail` (deleted), `AuthController`, `SessionAuthenticator` and
  `AppUserDetailsService`. Candidate 1 leaves `AuthService`'s constructor unchanged; candidate 6 adds
  `SessionAuthenticator` to it. `SessionAuthenticator` keeps calling the module's clear. **Landing order:
  candidate 1, then candidate 6** — ordering only, for a clean review of `AuthService`; neither needs the
  other's code.
- **Other siblings.** Candidate 11 owns `TransactionService`'s list/aggregate methods and the filter; this
  candidate touches only `create` there. Candidate 14 also edits `TransactionService.create` (the response
  mapping) — trivial merge in either order. Candidate 13 (sessions in Postgres) needs nothing from this
  design because the session key and value type are unchanged; this candidate edits ARCHITECTURE.md §3's
  scoping bullet, not its Redis bullet. Candidate 2 must keep the API client's global `409
  no-active-profile` → picker handling, which more responses now rely on. Candidate 15: no new status codes
  or problem types. Candidate 17: if it lists the maintenance ledger's residual "deleted-profile writes
  degrade to 409 rather than 404" as a possible bug, this candidate supersedes it.
- **Not verified in this pass (by code reading only):** that an insight create in a dangling session
  answers `409 conflict` today (FK violation translated by the exception handler); that Spring Session
  commits an attribute removal on a request that ended in a handled exception — the sweep's session
  assertion settles it in step 1; whether a pessimistic lock requested outside a read-write transaction is
  refused or silently released (moot while the documented constraint is honoured).
- **Edge scenario accepted.** A request that clears a dead id can race a concurrent switch in the same
  session and undo it; the user picks again. The same window exists today for the `/me` self-heal.
