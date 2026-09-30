# Grilling — Candidate 1: Give the active profile one home

Repository `my-finance`, branch `dev`, commit `4545810` (HEAD `c3e20c5` is a merge that changed no backend
file this log relies on). Every fact below was looked up in this session with read-only commands.

Path shorthands used in the evidence:

- `main/…` = `backend/src/main/java/com/myfinance/backend/…`
- `test/…` = `backend/src/test/java/com/myfinance/backend/…`
- `API.md`, `SCHEMA.md` = `docs/API.md`, `docs/SCHEMA.md`; `ledger` =
  `.superpowers/sdd/2026-09-07-maintenance-run/progress.md`

The design tree was worked in seven rounds. A question enters a round only when every decision it
depends on is settled.

---

## Round 1 — frontier: facts and constraints (no prerequisites)

❓ **Q1** - **Constraints the design must not break**: which recorded decisions, wire contracts,
session contracts, build rules and outside-request callers bind this design? Options: treat only the
documents as binding / treat documents plus observable contracts in code and tests as binding.

🔎 Facts:
- Wire contract for "no active profile": `409` `/errors/no-active-profile`, and the frontend must show
  the picker (`API.md:77-80`); `NoActiveProfileException` (`main/exception/NoActiveProfileException.java:6-14`).
  The frontend handles it globally: `frontend/src/api/client.ts:112-114` emits `no-active-profile`,
  `frontend/src/App.tsx:19-35` clears `activeProfileId` and navigates to `/picker`. A `404` has no
  global handler (only `401` and that `409` do, `client.ts:52-58`).
- Wrong-profile rows are `404` `/errors/not-found`, never `403` (`API.md:222-243`,
  `main/exception/ResourceNotFoundException.java:10-13`); a client-named profile owned by someone else is
  `404` on the switch (`API.md:245-246`, `:416-421`).
- The session attribute is a contract with every live session: key `ACTIVE_PROFILE_ID`, value a `Long`
  (`main/security/ActiveProfile.java:25`, `:35`, `:44`). Test fixtures plant it directly
  (`test/support/TestFixtures.java:253-258`, `:267-271`) and three tests read it back
  (`test/controller/AuthControllerTest.java:199`, `:346`; `test/controller/ProfileControllerTest.java:125`).
  Sessions live in a persistent `redis-data` volume (`docker-compose.yml:26-27`, `:120-122`) and are
  JDK-serialized (`ARCHITECTURE.md:120-123`); candidate 13 moves them into Postgres, still serialized.
  Changing key or type would silently de-select every user's profile on upgrade.
- Only the switch may create a session: `ActiveProfile` Javadoc (`main/security/ActiveProfile.java:17-20`),
  reads use `getSession(false)` (`:34`, `:48`), and `test/config/PasswordlessModeTest.java:81-88` proves a
  cookieless request leaves no session. LESSONS.md "Sharing a validation rule across records, and why an
  `HttpSession` proxy writes to Redis" (`docs/LESSONS.md:2930-2951`) records why.
- ArchUnit: `layeredArchitecture().consideringOnlyDependenciesInLayers()` with three layers only —
  Controller, Service, Repository (`test/ArchitectureTest.java:25-39`); controllers never touch a
  repository (`:41-48`); entities stay out of controllers (`:53-60`). `security` and `config` are not
  layers, so a `security → repository` dependency is neither allowed nor forbidden by the rule; it
  exists already: `main/security/AppUserDetailsService.java:14-24` uses `UserRepository`.
- "Services stay free of servlet types" is a convention held by two code comments
  (`main/service/AuthService.java:28`, `main/security/SessionAuthenticator.java:17`), not by a document or
  a rule. `jakarta.servlet` appears only in `main/controller/AuthController.java` and four `security`
  classes (grep).
- Settled (brief §6): session-cookie auth with the active profile held server-side stays;
  package-by-layer with the ArchUnit layer rules stays; controllers never reach a repository.
- Scoping must stay server-side in the service layer with no persistence-level filters
  (`ARCHITECTURE.md:124-127`; card: "no Hibernate `@Filter`, no `@TenantId`").
- Outside-request callers that must keep working: the charge job (`main/service/SubscriptionChargeService.java:13-16`,
  `main/service/SubscriptionChargePoster.java:62` reloads with an unscoped `findById`) and the user-scoped
  services (`main/service/ProfileService.java:22`, `main/service/BackupService.java:45-50`), none of which
  resolve the active profile except `ProfileService.delete` (`:102-104`).
- Build gate: Spotless is bound to `./mvnw verify` (brief §5); `spring.jpa.open-in-view=false`
  (`backend/src/main/resources/application.properties`), so an entity is managed only inside the service
  transaction that loaded it.

➡️ Binding = the documents **plus** the observable contracts in code and tests listed above: the
`409`/`404` wire shapes, the session key and value type, "only the switch creates a session", the
ArchUnit layer rules, servlet-free services, and the two outside-request callers.

⚖️ Strongest argument against: treating code-level conventions (the servlet comment, the session key) as
binding freezes things no document promised.

✅ Decision: all of the above are constraints. The session key `ACTIVE_PROFILE_ID` and its `Long` value
are frozen (live sessions survive the upgrade). Unblocks Q4–Q6.

---

❓ **Q2** - **What does a dangling active profile produce today, and is that the defect this candidate
fixes?** A session keeps a profile id after that profile is deleted from another session. Options:
(a) it is only `CategoryService`'s problem (already handled); (b) it is a defect on every profile-scoped
path; (c) it is acceptable as is.

🔎 Facts (by code reading; not reproduced):
- The acting session is cleared on delete (`main/service/ProfileService.java:102-104`); other sessions are
  not (`main/security/ActiveProfile.java:39-41` just reads the attribute; nothing verifies it).
- `GET /api/auth/me` self-heals: `main/service/AuthService.java:112-124` checks the stored id against the
  user's profiles and clears it (ledger `:519-525`, `:531-534` — fixed with a two-session test,
  `test/controller/AuthControllerTest.java:284-319`).
- Category writes lock the profile first; a miss is `404` "No profile with id N"
  (`main/service/CategoryService.java:166-176`), from commit `472574e` which chose 404 as "not 500" and says
  "Same defect AuthService#session was fixed for; this caller was missed". Tested at
  `test/controller/CategoryControllerTest.java:170-186`. 409 was not weighed in that commit.
- Transaction / Budget / Subscription create: `requireId()` passes, then `requireCategory` finds nothing
  because the Category was cascade-deleted with the Profile (`SCHEMA.md:520-529`) → `404` "No category
  with id N" (`main/service/TransactionService.java:73-74`, `:263-267`; `BudgetService.java:59-60`, `:163-167`;
  `SubscriptionService.java:78-79`, `:232-236`) — a 404 that blames the wrong thing.
  Update/delete/get of a row → `404` for the row itself (cascade-deleted).
- Insight create: `existsByProfileIdAndName` is false, `getReferenceById` returns a proxy without a SELECT
  (`main/service/InsightService.java:50-53`), the INSERT runs at `save` (identity ids,
  `main/model/AuditedEntity.java:21-23`) and violates `insight.profile_id`'s FK →
  `DataIntegrityViolationException` → `409` `/errors/conflict` (`main/exception/GlobalExceptionHandler.java:57-64`).
  Not reproduced: this is the chain as read.
- Reads (`list`, `summary`, `dashboard`, `tree`, merchant suggestions) return `200` with empty data;
  `POST /api/insights/execute` forwards the dead id to the executor (`InsightService.java:92-96`).
- The ledger flagged the four uncovered services as "by code reading, not reproduced; fixing costs a
  SELECT per write" (`ledger:1145-1147`).
- Exact counts: 33 × `activeProfile.requireId()` (Transaction 10, Category 5, Budget 6, Subscription 6,
  Insight 6); 4 identical `requireCategory` (`TransactionService:263`, `SubscriptionService:232`,
  `BudgetService:163`, `CategoryService:178`); 4 single `requireX` (`TransactionService:257`,
  `BudgetService:157`, `SubscriptionService:226`, `InsightService:98`); 13 `new ResourceNotFoundException(`
  sites in `main`; `profileRepository.getReferenceById` in 4 creates (`TransactionService:76`,
  `SubscriptionService:84`, `BudgetService:66`, `InsightService:53`).

➡️ (b): it is one defect with five symptoms, and the fix belongs in one place — the module every
profile-scoped path already calls.

⚖️ Strongest argument against: nobody reported it; a second session deleting the profile under the
first is rare on a single-user instance.

✅ Decision: fix it for every profile-scoped path, in `ActiveProfile`. Unblocks Q4, Q7.

---

❓ **Q3** - **Dependencies, by category**: what does the deepened module depend on, and how is each
substituted in tests?

🔎 Facts: the module reads the HTTP session through a request-aware `HttpServletRequest` proxy
(`main/security/ActiveProfile.java:27-31`), the authenticated user through `CurrentUser`
(`main/security/CurrentUser.java:11-17`), and profiles through `ProfileRepository`
(`main/repository/ProfileRepository.java`). Tests run a real Postgres and a real Redis session store via
Testcontainers (`test/support/TestcontainersConfiguration.java:45-55`), the real session filter and the
security chain (`test/support/IntegrationTest.java:13-30`); no backend test uses Mockito (grep: zero hits).

➡️ Postgres and the session store: **local-substitutable** (Testcontainers). The security context and the
request proxy: **in-process** (MockMvc drives them). No ports & adapters, no mocks.

⚖️ Strongest argument against: a unit test with a hand-built request and a mocked repository would be
faster.

✅ Decision: local-substitutable + in-process; tests stay integration-first like every sibling. Unblocks Q16.

---

## Round 2 — frontier: the answer, what is verified, where the module lives

❓ **Q4** - **What is the right answer when the active profile was deleted from another session?**
(card question 1) Options: (a) `404` `not-found` for the profile, as `CategoryService` does today;
(b) `409` `no-active-profile` with the session attribute cleared, as `/me` heals towards.

🔎 Facts:
- `API.md:77-80`: no active profile → `409` `no-active-profile`, "the frontend should handle it by showing
  the profile picker".
- `API.md:519-522` (`DELETE /api/profiles/{id}`): deleting the active profile leaves the acting session
  "the same as `PUT /api/auth/active-profile` never having been called — the client is routed back to the
  picker". Today the acting session therefore already gets (b); other sessions get a mix of (a), the
  wrong 404, a generic 409 and empty 200s (Q2).
- `/me` already reports the dangling id as "no active profile" (`AuthService.java:112-124`), so today `/me`
  and `POST /api/categories` disagree about the same session.
- `API.md:222-243`: 404 is for a row the caller asked for that is out of scope. The request that meets a
  dangling profile named no profile at all.
- The frontend routes 409 `no-active-profile` to the picker globally (`client.ts:112-114`,
  `App.tsx:19-35`); a 404 surfaces as a screen-local error ("No profile with id 7.").
- No existence oracle: the id came from the session (written only after an ownership check,
  `AuthService.java:99-104`), not from the client.
- The two existing tests disagree: `AuthControllerTest:284-319` expects `activeProfileId: null`;
  `CategoryControllerTest:176-186` expects `404` `/errors/not-found`.

➡️ (b) `409` `no-active-profile`, and the stored id is cleared. A dangling active profile **is** "no
active profile": the answer every other session already gets, the answer `/me` gives, and the one the
frontend already acts on.

⚖️ Strongest argument against: (a) is the tested, shipped behaviour for category writes, and commit
`472574e` chose it on purpose.

✅ Decision: (b). `472574e` weighed 404 against 500, not against 409; its own reasoning ("the API's
ordinary answer") points at 409 once the state is named correctly. `CategoryControllerTest`'s
`createIs404WhenTheActiveProfileWasDeletedFromAnotherSession` is **replaced** (Q16).
Documents that change: `API.md` "Active profile: server-side, never client-supplied" (`:60-80`),
"`PUT /api/auth/active-profile`" (`:405-408`), "`DELETE /api/profiles/{id}`" (`:519-522`), "Status code
summary" 409 row (`:1529`). Unblocks Q7, Q8, Q15, Q17.

---

❓ **Q5** - **What exactly is verified: that the profile exists, or that it exists and belongs to the
authenticated user?**

🔎 Facts: the switch verifies ownership with `findByIdAndUserId` (`AuthService.java:100-102`,
`ProfileRepository.java:24`); `ProfileRepository`'s Javadoc says "every method takes the authenticated
user's id" (`ProfileRepository.java:15-18`) — `lockById(id)` (`:32-34`) is the one method that does not.
Profiles never change owner (no setter for `user`, `main/model/Profile.java:19-21`, `:34-38`), and no
endpoint deletes a user. `API.md:405-408` says "Everything downstream trusts the session value". The
session store (`redis-data`) and the database (`postgres-data`) are separate volumes
(`docker-compose.yml:120-122`), so they can diverge (a database wiped and re-seeded under live sessions).

➡️ Exists **and** belongs to the authenticated user: the same primary-key lookup with one more predicate
(`findByIdAndUserId`), so no extra cost over an existence check, and the Profile the module hands out is
then proven to be the caller's — the security rule itself, re-established on each use instead of trusted.

⚖️ Strongest argument against: in every state the API can produce, existence implies ownership, so the
extra predicate guards only states produced outside the API.

✅ Decision: ownership is verified. A stored id that exists but is not the user's is treated exactly like
a deleted one (409 + clear) — it names no profile this user may use, and the answer reveals nothing.
The lock query becomes owner-scoped too, which also makes `ProfileRepository` true to its own Javadoc.
Unblocks Q7, Q10.

---

❓ **Q6** - **Where does the deepened module live, and is `ActiveProfile` still the right name?**
(card question 3) Options: (a) stay `security.ActiveProfile`; (b) a new `service.ActiveProfileService`
over a thin `security` holder; (c) move everything into `service`.

🔎 Facts: `ActiveProfile` needs the HTTP session (servlet types, `ActiveProfile.java:5-6`); services are
kept free of servlet types (Q1). A `security` class already uses a repository
(`AppUserDetailsService.java:14-24`) and ArchUnit's layer rule does not look at `security` (Q1).
`ARCHITECTURE.md:65` lists "session-held active profile" under `security/`. "Active profile" is a
seed domain term (brief §7).

➡️ (a). One class, where the architecture document already says it is; the name is the domain term and
describes exactly what it now is — the active profile of the current request.

⚖️ Strongest argument against: after the change the class does data access, which reads like a service;
(b) would keep "queries live in `service`" literally true.

✅ Decision: (a). (b) creates two modules for one concept again — the shallowness this candidate removes —
and (c) would pull `HttpServletRequest` into `service`. The class name stays `ActiveProfile`. Unblocks
Q9–Q13.

---

## Round 3 — frontier: cadence, query, and session effects

❓ **Q7** - **When is the Profile verified, and with which query?** (card question 2) Options:
(a) on every resolution (reads and writes); (b) only on writes; (c) once per request, cached.
Query: plain lookup or the existing row lock.

🔎 Facts:
- Every public method of the five services resolves the profile exactly once, at its top, and passes the
  id down (all 33 call sites read; e.g. `TransactionService.java:93-100` → `filterSpec(filter, profileId)`
  `:160-182`); every controller endpoint calls exactly one service method (all 8 controllers read). So
  "every resolution" is "once per request" in practice.
- Reads with a dangling id return empty `200`s today (Q2); the frontend then renders empty screens
  instead of the picker unless `/me` is refetched (`App.tsx:78-80` redirects only on
  `activeProfileId === null`).
- Cost: one primary-key lookup on `profile` (a handful of rows per user) per profile-scoped request.
  Category writes already pay one query for the lock (`CategoryService.java:172-176`); inserts pay none
  today (`getReferenceById`, `TransactionService.java:75-76`).
- Caching per request would need a request attribute or a `@RequestScope` bean, rules for the switch and
  the clear to invalidate it, and the lock path to bypass it.

➡️ (a): verify on every resolution with the owner-scoped primary-key lookup; category tree mutations use
the row lock instead (Q10), which verifies and locks in one query. No cache.

⚖️ Strongest argument against: the ledger's own reason for leaving it — one more SELECT per request,
now on reads as well (`ledger:1146-1147`).

✅ Decision: (a). The added query is an indexed single-row lookup on a table of a handful of rows,
against requests that already run one or more queries each on a single-user self-hosted instance
(`ARCHITECTURE.md` §1, §7 non-goals). Verifying reads is what turns the empty screens into the picker.
Resolution discipline — resolve once per operation and pass the id or Profile down — is a stated usage
note of the interface, not a correctness rule (a second resolution costs a second lookup, nothing else).
Unblocks Q9, Q10, Q13.

---

❓ **Q8** - **What does resolution do to the session?** Options for a dangling id: (a) clear it on
discovery; (b) leave it (every request re-verifies and fails). For an absent session: must resolution
ever create one?

🔎 Facts: `/me` clears on discovery today (`AuthService.java:122-124`); `ProfileService.delete` clears
eagerly for the acting session (`:102-104`). Spring Session's filter commits session changes after the
chain returns — believed to include responses produced by `@RestControllerAdvice` after an exception, but
**not verified here** (it is exactly what the new test asserts, Q16). A concurrent `PUT
/api/auth/active-profile` in the same session could be overwritten by a clear from an in-flight request
still holding the dead id; the same window exists today for `/me`'s self-heal.

➡️ (a) clear on discovery, never create: resolution reads with `getSession(false)`; with no session or no
attribute it answers "none" without querying; with a dangling id it removes the attribute and answers
"none".

⚖️ Strongest argument against: the clear can race a concurrent switch in the same session and undo it;
(b) never writes and so never races.

✅ Decision: (a). The race costs the user one more pick; (b) would leave the session disagreeing with the
answer it gets, and repeat the lookup on every request. The new test asserts the stored attribute is gone
after the failing request, which turns the "commits on an exception path" belief into a fact. Unblocks
Q12, Q13.

---

## Round 4 — frontier: what the module hands out, the lock, the switch, the raw readers

❓ **Q9** - **What does the module hand to its callers, and how do services ask for "this Category, in
the active profile, or 404"?** (card question 4) Options: (a) a verified id only; (b) a verified id and
a verified `Profile` for inserts; (c) additionally a generic owned-row lookup (a method taking a scoped
finder as a method reference plus a resource name); (d) an intermediate `@NoRepositoryBean` repository
interface declaring `findByIdAndProfileId`, plus a generic lookup; (e) a shared `requireCategory` on
`CategoryService` (package-private) injected into three sibling services.

🔎 Facts:
- The four creates need the Profile as the new row's owner and fetch it with `getReferenceById`
  (Q2 counts); after Q7 the verification query already loads the managed Profile inside the service's
  read-write transaction, so the reference is free.
- The duplicated lookup is one expression — `findByIdAndProfileId(id, profileId).orElseThrow(() -> new
  ResourceNotFoundException("category", id))` — in 4 private helpers; the other 4 `requireX` exist once
  each in their own service. None of these was the source of the defect: the defect came from the
  profile id they were given (Q2).
- `API.md:231-235`: the row-level 404 "falls out of the implementation naturally: repository queries are
  scoped to the session's profile".
- Option (c) re-resolves (and re-verifies) the profile per lookup unless it takes the resolved id — in
  which case it no longer involves the active profile at all — or unless a per-request cache exists
  (rejected in Q7). `TransactionService.update` would do three verifications.
- Option (c)/(d) do not enforce scoping: the caller still chooses the finder.
- Option (e) makes `TransactionService`, `BudgetService` and `SubscriptionService` depend on
  `CategoryService` (six collaborators, `CategoryService.java:48-61`) for a one-expression lookup.
- Deletion test on a shared category lookup: delete it and one expression reappears in each of four
  callers — close to a pass-through.

➡️ (b): the module hands out a verified id (for queries) and a verified, managed `Profile` (as the owner
of an inserted row). The owned-row lookups stay in their services, each one scoped query.

⚖️ Strongest argument against: the report's direction for this candidate says the deepened module also
"answers the 404 for rows that belong elsewhere", and four identical helpers remain.

✅ Decision: (b) — **a deliberate deviation from the report's direction**, for three reasons read off the
facts: (1) every way to absorb the lookup is either cleverer than conventional Spring (a finder passed
as a method reference; a generic base repository) or a cross-service dependency for one expression, which
the card's own question rules out; (2) none of them adds safety, because the caller still picks the
query; (3) the deletion test says the shared helper would be nearly a pass-through. The leverage of this
candidate is at the profile level, where the defect lived. Revisit only if a fifth resource starts
referencing categories. Unblocks Q13, Q14.

---

❓ **Q10** - **How does `CategoryService`'s row lock fit: part of the module's interface, or stays
where it is?** (card question 6) Options: (a) stays in `CategoryService` after a separate verification;
(b) the module offers "the active profile, locked", verifying and locking in one query.

🔎 Facts:
- `lockById` has exactly one caller (`CategoryService.java:174`); it is `SELECT … FOR UPDATE`
  (`ProfileRepository.java:28-34`), held to transaction end, and serialises tree changes so two concurrent
  reparents cannot together form a cycle (`CategoryService.java:30-33`).
- With (a), a verification SELECT followed by the lock leaves a window in which a concurrent delete makes
  the lock miss; the miss would need the same 409-and-clear handling duplicated in `CategoryService`.
- Postgres read-committed semantics: a `FOR UPDATE` blocked by a concurrent `DELETE` that commits returns
  no row; `ProfileService.delete` takes `FOR UPDATE` on all the user's profiles (`ProfileService.java:88-93`,
  `ProfileRepository.java:36-45`). So with (b), a category write racing a profile delete either completes
  first (and its rows are cascade-deleted) or answers 409 — never a 500 or a half state.
- The five services are class-level `@Transactional(readOnly = true)`; the three category mutations carry
  their own read-write `@Transactional` (`CategoryService.java:74`, `:98`, `:130`). A pessimistic lock taken
  outside a read-write transaction would be released immediately or refused.
- No test covers the lock's serialisation today (grep for concurrency: only
  `test/controller/ProfileControllerTest.java:349-353`, the profile-delete race).

➡️ (b): the module offers a locked resolution; the owner-scoped lock query replaces `lockById`;
`CategoryService` loses `lockProfile` and its `ProfileRepository` dependency.

⚖️ Strongest argument against: locking is a category-tree concern; putting it on `ActiveProfile` widens
that module for one caller.

✅ Decision: (b). One query verifies and locks, so there is one miss policy and no window. Ordering
constraint recorded in the interface: the locked resolution must be called inside the caller's read-write
transaction, and the lock lasts until that transaction ends. Because the lock moves and nothing tests it,
a characterisation test for concurrent reparents is added before it moves (Q16). Unblocks Q13, Q16.

---

❓ **Q11** - **Does the switch (`AuthService.switchProfile`, "the hinge") move into the module, and how
does that meet candidate 6?** (card question 7) Options: (a) stays in `AuthService`, writing through
`set(id)`; (b) the module owns the switch: verify ownership, store, return the Profile.

🔎 Facts: `switchProfile` is the only writer (`AuthService.java:94-105`), verifies with
`findByIdAndUserId`, answers `404` for a foreign or missing profile (`API.md:416-421`), and runs in the
class-level read-only transaction (`AuthService.java:33`; no method-level annotation). After Q5/Q7 the
module runs the same query for reads. Candidate 6 edits `AuthService.register`, `setPassword`,
`normalizeEmail` and adds `login`; it does not touch `switchProfile` or `session()` (card 6 evidence).

➡️ (b): the module owns both halves of the rule — the write-side check (404 for a client-named profile)
and the read-side check (409 for a stored one) — so "the active profile belongs to the user" lives in one
class. `AuthService.switchProfile` becomes a one-line delegate that builds the response.

⚖️ Strongest argument against: the hinge "gets a dedicated test in the auth ticket" (`API.md:408`) and
sits in the service layer by design; moving it into `security` moves a security decision out of the
layer ARCHITECTURE.md names.

✅ Decision: (b). The decision still runs inside `AuthService`'s transaction and is still covered by the
same dedicated tests (`AuthControllerTest:323-379`), which pass unchanged. Candidate 6 owns the other
`AuthService` methods; the two specs name the split identically and land candidate 1 first. Unblocks Q12,
Q13, Q19.

---

❓ **Q12** - **What happens to the other readers of the raw id — `AuthService.session()` and
`ProfileService.delete` — and does an unverified `id()` stay on the interface?** Options: (a) keep `id()`
and `set()` public; (b) replace them with verified operations and drop them.

🔎 Facts: `id()` callers: `AuthService.java:118` (self-heal), `ProfileService.java:102` (eager clear);
`set()` caller: `AuthService.java:103` only; `clear()` callers: `AuthService.java:123`,
`ProfileService.java:103`, `SessionAuthenticator.java:52`. The defect path was a caller using the raw id
without verifying it (Q2). The acting session's eager clear is observable only through `/me` and scoped
endpoints (`ProfileControllerTest.java:313-327` asserts via `/me`); the frontend clears its own copy on a
successful delete (`frontend/src/api/hooks/profiles.ts:67-81`).

➡️ (b): `session()` asks the module for "the active profile, or none" (verified, clears a dangling id);
`ProfileService.delete` drops its eager clear and its `ActiveProfile` dependency, because the acting
session now heals on its next request exactly like every other session; `id()` and `set()` leave the
interface; `clear()` stays for login.

⚖️ Strongest argument against: the eager clear states intent at the place of deletion and API.md
describes it; removing working code is not "surgical".

✅ Decision: (b). With an unverified read on the interface the defect path stays open; with it gone,
one rule covers every session, the acting one included, and the observable behaviour is identical
(`ProfileControllerTest:313-327` passes unchanged). `API.md:519-522` is reworded to state the single rule.
Unblocks Q13.

---

## Round 5 — frontier: the interface, repository reach, edge cases

❓ **Q13** - **The shape of the deepened module**: operations, invariants, ordering constraints, error
modes, configuration; what sits behind the seam; is there a seam?

🔎 Facts: settled in Q4–Q12. Callers after the change: the five services (reads and inserts),
`CategoryService` (locked), `AuthService` (switch, session report), `SessionAuthenticator` (clear).

➡️ `ActiveProfile` — "the active profile of the current request, proven to exist and to belong to the
authenticated user each time it is resolved". Interface:
- *the active profile* — returns the verified, managed Profile; `409 no-active-profile` if none is
  selected or the stored one no longer resolves (the stored id is then cleared);
- *the active profile's id* — the same, returning the id (what the 26 read call sites keep calling);
- *the active profile, locked* — the same, taking a row lock held until the caller's read-write transaction
  ends;
- *the active profile if any* — the same resolution answering "none" instead of 409 (for `/me`);
- *switch to profile N* — the only acceptance of a client-supplied profile id: `404 not-found` unless N is
  the user's; stores it (the only operation that creates a session) and returns the Profile;
- *clear* — forget the selection; never creates a session.
Invariants: key `ACTIVE_PROFILE_ID` holding a `Long`; one owner-scoped primary-key lookup (or one lock
query) per resolution, none when nothing is stored; a dangling id is cleared on discovery; 409 only for a
stored id, 404 only for a client-named id. Ordering: the locked form inside a read-write transaction; the
returned Profile is managed only inside the caller's transaction. Configuration: none.
Behind it: session attribute read/write/remove, the ownership lookup, the lock query, the clear policy,
the two error mappings.

⚖️ Strongest argument against: six operations is not a small interface.

✅ Decision: as above. Each operation is one line to call and hides the session, the query, the policy and
the error mapping; the implementation is several times the interface. **No seam**: one adapter, nothing
varies across it (brief §2) — `ActiveProfile` stays a concrete class. Unblocks Q14–Q18.

---

❓ **Q14** - **Should the unscoped finders stay reachable on the repositories, and is an ArchUnit rule worth
adding?** (card question 5) Options: (a) narrow the five repositories to declared methods only;
(b) an ArchUnit rule forbidding services to call `findById`/`getReferenceById`/`existsById`/`deleteById`
on the profile-scoped repositories; (c) neither.

🔎 Facts: in `main`, the only unscoped calls on the five profile-scoped repositories are
`findAll(spec, …)` in `TransactionService.java:99` and `BudgetService.java:92` (scoped by the
specification) and `findById` in `SubscriptionChargePoster.java:62` (system job, deliberately unscoped,
`SubscriptionRepository.java` Javadoc). In tests, about 29 calls use `findById`/`count`/`findAll` on them
(grep across 5 test classes). Every resource's controller test already has wrong-profile cases
(`…FromAnotherProfileIs404`, `listDoesNotLeakOtherProfiles`; grep list in this session). ArchUnit can
express (b) with `callMethodWhere` and a predicate on the call target's owner and name; it would not see a
derived query without `ProfileId`, a `Specification` without `inProfile`, or a native query without
`profile_id` — the likelier slips. `ArchitectureTest.java:11-16` states scoping "remains a human review
concern".

➡️ (c).

⚖️ Strongest argument against: profile scoping is "the single most important rule" (`API.md:65`); a rule
that catches even the obvious slip is cheap insurance.

✅ Decision: (c). (a) means redeclaring every needed method on five repositories and rewriting ~29 test
calls, and it breaks the charge job's reload. (b) needs an exception for the charge job and would overstate
what is enforced; the behavioural wrong-profile tests at the HTTP interface are the real guard and exist
per resource. `ArchitectureTest`'s Javadoc stays true as written. Recorded under Out of Scope.

---

❓ **Q15** - **Edge cases and failure modes** — what happens in each concrete scenario?

🔎 Facts: Q4–Q13; frontend handling in `App.tsx:19-35`; lock semantics in Q10; session commit in Q8.

➡️ Scenarios and the designed answer:
1. Session B's profile deleted by session A; B lists transactions → 409 `no-active-profile`, B's attribute
   cleared, frontend lands on the picker (today: `200` empty page).
2. B posts a transaction / budget / subscription → 409 (today: 404 "No category with id N").
3. B creates an insight → 409 (today, by reading: 409 `conflict`).
4. B creates a category → 409 (today: 404 "No profile with id N").
5. B runs `POST /api/insights/execute` → 409 before the analytics service is called (today: forwarded).
6. B calls `/me` → `activeProfileId: null`, attribute cleared (unchanged).
7. The dashboard fires several requests at once after the delete → each answers 409; the first to commit
   clears the attribute; the global handler navigates to the picker idempotently.
8. A delete of profile P commits between B's verification and B's insert (non-category) → the insert hits
   the FK → 409 `conflict` "Retry or refresh"; the retry answers 409 `no-active-profile`. Accepted window.
9. A category write and a delete of the same profile race → serialised by the row locks: the write
   completes first (then cascade-deleted) or answers 409 (Q10).
10. B's in-flight request clears the dead id while B concurrently switches to profile Q → the switch may be
    undone; the next request answers 409 and the user picks again (Q8).
11. A cookieless request on a passwordless instance (compose healthcheck on `/me`) → no session, no query,
    no session created (`PasswordlessModeTest:81-88` unchanged).
12. A session that names a profile owned by another user (unreachable through the API; possible only if the
    session store outlives a re-seeded database) → 409 and cleared, never that profile's data. The
    principal's own user id is still trusted — a pre-existing limit, closed in practice by candidate 13
    (sessions stored in the same database).
13. The acting session deletes its own active profile → its next request heals it exactly as in (1);
    `/me` reports `null` (`ProfileControllerTest:313-327`).
14. A second resolution inside one operation (a future caller) → a second lookup, same answer.

⚖️ Strongest argument against: scenario 8 still leaks a generic 409 in a narrow window; a `FOR KEY SHARE`
on verification would close it.

✅ Decision: accept scenario 8 (a lock on every write for a millisecond window on a single-user instance is
not worth its cost); all other scenarios answer as listed. Unblocks Q16, Q17.

---

## Round 6 — frontier: tests and documents

❓ **Q16** - **Tests: the seam, what is added, what survives, what is replaced or deleted.** (card
question 9) Options for the seam: (a) the HTTP interface of the profile-scoped endpoints, through MockMvc
in `@IntegrationTest`; (b) a direct test of `ActiveProfile` with a hand-built request context.

🔎 Facts: the module's observable behaviour is a status, a problem type and the stored session attribute
after a request that ended in an exception — only (a) sees the last two end to end (`GlobalExceptionHandler`
mapping, session commit). Prior art: the parameterized sweep `withoutActiveProfileIs409`
(`test/controller/TransactionControllerTest.java:240-256`); the two-session delete setup
(`CategoryControllerTest.java:176-186`: delete via `fixtures.in(other)`, stale session via
`fixtures.in(profile)`); session inspection (`fixtures.createSessionWithActiveProfile`, `findSession`,
`withSession`; `AuthControllerTest.java:183-200`); the concurrency pattern with a `CyclicBarrier` and two
sessions (`ProfileControllerTest.java:349-395`). `DatabaseCleaner` truncates with `RESTART IDENTITY`
before each test (`test/support/DatabaseCleaner.java:16`).

➡️ Seam (a), one seam. Tests:
- **Added — `ActiveProfileTest`** (security test package, `@IntegrationTest`, MockMvc):
  1. a parameterized sweep: after the active profile is deleted from another session, a representative
     read and write of each resource — category list and create (the locked path), transaction list and
     create, budget list and create, subscription list and dashboard and create, insight list and create,
     insight execute — each answers `409` `/errors/no-active-profile`;
  2. the stored attribute of the stale session is gone after one such request (session inspected, not just
     the status);
  3. a session naming a profile owned by another user answers 409 and returns none of that profile's rows;
  4. a valid active profile still answers `200` (guards against over-eager clearing).
  Written first; before the change the sweep fails with the Q2 mix (404 category, 404 profile, 409
  conflict, 200 empty).
- **Added — a characterisation test for the lock** (in `CategoryControllerTest`): two concurrent reparents
  that together would form a cycle (A under B, B under A) → exactly one `200` and one `422`
  `/errors/category-cycle`. Passes against today's code; must stay green when the lock moves.
- **Replaced** — `CategoryControllerTest.createIs404WhenTheActiveProfileWasDeletedFromAnotherSession`: its
  scenario is row 1 of the sweep with the new expectation; delete it.
- **Survive unchanged** — `AuthControllerTest.meReturnsNullActiveProfileWhenItWasDeletedFromAnotherSession`
  (`:284`), the four switch tests (`:323-379`), `loginRotatesSessionIdAndClearsStaleActiveProfile` (`:183`);
  `ProfileControllerTest.deleteClearsActiveProfileWhenTheDeletedProfileWasActive` (`:313`) and
  `createReturns201WithLocationAndDoesNotSwitchActiveProfile` (`:107`); every `…WithoutActiveProfileIs409`
  and `…FromAnotherProfileIs404`; `PasswordlessModeTest` in full; `ArchitectureTest`.
- **Deleted** — nothing else; no shallow module is absorbed whose tests become waste (the absorbed pieces —
  `lockProfile`, the `/me` self-heal, the eager clear — had no tests of their own besides the ones above).

⚖️ Strongest argument against: a direct unit test of `ActiveProfile` would pin each operation's contract
more precisely and run faster.

✅ Decision: seam (a). The sweep is the module's test surface; it asserts only status, problem type, the
stored attribute and returned data. Fixture rule: create every row before the delete (identity restarts
per test). Unblocks Q18.

---

❓ **Q17** - **Which recorded-decision documents change in the same change?**

🔎 Facts: `API.md:60-80`, `:405-408`, `:519-522`, `:1518-1533`; `ARCHITECTURE.md:65`, `:124-127`;
`SCHEMA.md` holds no statement about the active profile (grep). `ARCHITECTURE.md:113-123` (the Redis bullet)
is candidate 13's.

➡️ Update `API.md` (four places) and `ARCHITECTURE.md` §3 "Profiles and authentication" (the scoping
bullet); no `SCHEMA.md` change; no ADR (the repo rule makes the recorded documents the place to amend).

⚖️ Strongest argument against: `API.md` "Status of this document" (`:10-12`) says controllers are the source
of truth once they exist, so doc edits are optional.

✅ Decision: update them in the step that makes each statement true (CLAUDE.md: code and doc must not
drift). Exact texts in `docs-proposals.md`.

---

## Round 7 — frontier: sequence, siblings, lesson

❓ **Q18** - **Which steps, in which order, keep every controller test green throughout?** (card question 8)

🔎 Facts: Q9–Q16; the four inserts, the three category mutations, the switch and the two raw readers are
independent edits once resolution verifies.

➡️ Five steps, each shippable with `./mvnw verify` green:
1. **Verify on resolution** — resolution checks ownership, clears a dangling id and answers 409; add "the
   active profile if any" and use it in `AuthService.session()` (delete the local self-heal). Test first:
   `ActiveProfileTest` sweep red → green; replace the Category 404 test. Docs: the four `API.md` edits.
2. **Hand out the Profile for inserts** — the four creates take the verified Profile; drop
   `getReferenceById` and the `ProfileRepository` dependency from Transaction, Budget, Subscription and
   Insight services. No behaviour change; the sweep's create rows guard it.
3. **Move the lock** — first add the concurrency characterisation test (green on old code); then the
   locked resolution with the owner-scoped lock query replacing `lockById`; `CategoryService` drops
   `lockProfile` and `ProfileRepository`.
4. **Move the switch; retire the raw operations** — the switch operation replaces `set`;
   `AuthService.switchProfile` delegates; `ProfileService.delete` drops the eager clear and its
   `ActiveProfile` dependency; `id()` and `set()` are removed. Docs: `ARCHITECTURE.md` scoping bullet.
5. **Lesson** — the `docs/LESSONS.md` entry (git-ignored, not part of the commit).

⚖️ Strongest argument against: step 1 changes the answer for all resources at once instead of one per
step.

✅ Decision: as above. Changing the answer resource by resource would ship an API that answers the same
state three different ways between steps; step 1 is the single behaviour change, steps 2–4 are
behaviour-preserving refactors under the tests step 1 and 3 add.

---

❓ **Q19** - **Cross-candidate effects** — what does this design need from, or change for, a sibling?

🔎 Facts: card 6 (sign-in module) edits `AuthService` and the `security` package; brief §8 table.
`TransactionService.list/summary/categoryCounts/categoryTotals/filterSpec/validate` are candidate 11's;
`transactionMapper.toResponse` calls are candidate 14's; `ARCHITECTURE.md:113-123` and the session-store
wording are candidate 13's; the ledger residual (b) (`ledger:1145-1147`) may be in candidate 17's
"possible bugs"; candidate 2 maps Problems to messages on the frontend.

➡️
- **Candidate 6**: shares `AuthService`. Candidate 1 owns `switchProfile` and `session()` (and
  `ActiveProfile`, `ProfileService.delete`, `ProfileRepository`'s lock query, the five services); candidate 6
  owns `register`, `login` (new), `setPassword`, `normalizeEmail` (deleted), `AuthController`,
  `SessionAuthenticator`, `AppUserDetailsService`. `AuthService`'s constructor is unchanged by candidate 1;
  candidate 6 adds `SessionAuthenticator` to it. `SessionAuthenticator` keeps calling the module's clear,
  which candidate 1 keeps. **Order: candidate 1 lands first, candidate 6 second** — ordering only; neither
  needs the other's code.
- **Candidate 11**: in `TransactionService` candidate 1 touches only `create` (and imports/constructor);
  the read methods keep calling the id operation unchanged. Either order.
- **Candidate 14**: both touch `TransactionService.create` (candidate 1 the owner line, candidate 14 the
  response mapping) — trivial merge, either order.
- **Candidate 13**: the session key and `Long` value are unchanged, so the JDBC store needs nothing from
  this design; test fixtures keep planting the attribute through `SessionRepository`. Candidate 1's
  `ActiveProfile` Javadoc must say "the session store", not "Redis". Candidate 1 edits `ARCHITECTURE.md`
  §3's scoping bullet (`:124-127`), not the Redis bullet (`:113-123`).
- **Candidate 2**: must keep the global `409 no-active-profile` → picker handling in the API client; more
  responses now carry that problem type.
- **Candidate 15**: no new status code or problem type; every scoped endpoint already lists 409.
- **Candidate 17**: if it lists "deleted-profile writes answer 409/404 inconsistently" as a possible bug,
  candidate 1 supersedes that item.

⚖️ Strongest argument against: formally ordering 1 before 6 couples two independent specs.

✅ Decision: as above; both specs state the same split and the same order.

---

❓ **Q20** - **Which lesson does the change teach (`docs/LESSONS.md`)?**

🔎 Facts: existing entries "Designing an API so the security rule can't be forgotten"
(`docs/LESSONS.md:63`), "`orElseThrow()` with no supplier is a 500 waiting for a feature to ship" (`:2793`),
"Sharing a validation rule across records, and why an `HttpSession` proxy writes to Redis" (`:2930`).

➡️ One new entry: *"A session value is a cached decision: verify it where it is used"* — why re-verifying
the stored id on every use (one indexed lookup) beats trusting the check made when it was stored; why a
selection that went stale answers 409 like "none selected" rather than 404; why a pessimistic lock can be
part of a module's interface only together with "call me inside a read-write transaction". Point to the
2793 entry for the defect family and to 2930 for why reads never create a session.

⚖️ Strongest argument against: it partly repeats the 2793 entry.

✅ Decision: new entry, cross-referencing 2793 and 2930 rather than repeating them.

Frontier empty.

---

## Decisions (one page)

1. **Answer for a dangling active profile**: `409` `/errors/no-active-profile`, stored id cleared — in every
   session, on every profile-scoped endpoint, reads included. Replaces today's mix (404 profile, 404
   category, 409 conflict, empty 200). (Q4)
2. **What is verified**: the stored id must name a profile that exists **and belongs to the authenticated
   user**; one owner-scoped primary-key lookup. (Q5)
3. **When**: on every resolution — in practice once per request, since each service method resolves once;
   no per-request cache. Nothing stored → no query, no session created. (Q7, Q8)
4. **Where / name**: stays `security.ActiveProfile`; no seam, no interface extraction. (Q6, Q13)
5. **What it hands out**: a verified id for queries and a verified managed `Profile` as the owner of
   inserted rows; `getReferenceById` goes. Owned-row lookups (`requireCategory` ×4, `requireX` ×4) stay in
   their services — a deliberate deviation from the report's direction. (Q9)
6. **Lock**: "the active profile, locked" joins the interface; an owner-scoped `FOR UPDATE` query replaces
   `lockById`; must run inside a read-write transaction. A concurrency characterisation test is added
   before the move. (Q10)
7. **Switch**: the module owns the only acceptance of a client-supplied profile id (404 if not the user's);
   `AuthService.switchProfile` delegates. `id()` and `set()` leave the interface; `ProfileService.delete`
   drops its eager clear. (Q11, Q12)
8. **Repositories**: unscoped finders stay reachable; no new ArchUnit rule. (Q14)
9. **Test seam**: the HTTP interface via MockMvc in `@IntegrationTest`; new `ActiveProfileTest` sweep + a lock
   race test; one Category test replaced; everything else survives. (Q16)
10. **Docs**: `API.md` ×4 sections, `ARCHITECTURE.md` §3 scoping bullet; no ADR. (Q17)
11. **Sequence**: verify (behaviour change) → Profile for inserts → lock → switch and raw-op removal →
    lesson. Lands **before candidate 6**. (Q18, Q19)

Unverified and flagged: the Insight `409 conflict` path (by reading only); that Spring Session commits an
attribute removal on a request that ended in a handled exception (the new test settles it); that a
pessimistic lock outside a read-write transaction is refused rather than silently released (irrelevant
once the constraint is honoured).
