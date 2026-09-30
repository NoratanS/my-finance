# Grilling — Candidate 6: Every sign-in rule behind the sign-in module

Repository `my-finance`, branch `dev`, commit `4545810`. Every fact below was looked up in this session with
read-only commands (plus one `grep -a` over the cached `spring-web` jar's entry names).

Path shorthands used in the evidence:

- `main/…` = `backend/src/main/java/com/myfinance/backend/…`
- `test/…` = `backend/src/test/java/com/myfinance/backend/…`
- `plan` = `docs/superpowers/plans/2026-09-23-passwordless-mode.md` (the passwordless mode plan, whose design
  table is "Settled 2026-09-22; do not re-litigate", `plan:28-41`)

The tree was worked in six rounds. This candidate shares `AuthService` and the `security` package with
candidate 1 (see Q16–Q17); the two logs agree on the split.

---

## Round 1 — frontier: constraints, today's split, dependencies

❓ **Q1** - **Constraints the design must not break**: which wire contracts, settled decisions and
conventions bind a reshuffle of the sign-in code? Options: documents only / documents plus observable
contracts in code and tests.

🔎 Facts:
- Wire contracts (`docs/API.md:263-272`, `:313-345`, `:361-392`): `register` and `login` answer `404`
  `/errors/auth-disabled` on a passwordless instance; `PUT /api/auth/password` answers `404`
  `/errors/passwordless-only` on a password instance; bad credentials are one indistinguishable `401`
  `/errors/bad-credentials`; login returns the session response with `activeProfileId: null` and
  `authMode`; the set-password body follows the register password rules. Exceptions:
  `main/exception/AuthDisabledException.java:10-19`, `main/exception/PasswordlessOnlyException.java:11-20`,
  `main/exception/GlobalExceptionHandler.java:47-51`.
- Settled passwordless decisions (`plan:28-41`): switch `myfinance.auth.mode` / `MYFINANCE_AUTH_MODE`; 0/1/>1
  users rule; mechanism is a Spring Security auto-login filter "so sessions/CSRF/profile scoping stay
  unchanged"; `register`/`login` disabled in `none` with `404`; mode reported through `authMode` on
  `SessionResponse`. `ARCHITECTURE.md:128-137` repeats them. Card: "passwordless mode stays a filter that
  produces the ordinary principal".
- Session-fixation defence and "a fresh login never inherits a profile": `main/security/SessionAuthenticator.java:42-52`,
  tested by `test/controller/AuthControllerTest.java:183-200`. A failed login creates no session
  (`AuthControllerTest.java:203-221`, last assertion).
- "Only the profile switch creates a session" (`main/security/ActiveProfile.java:17-20`;
  `test/config/PasswordlessModeTest.java:81-88`; `docs/LESSONS.md:2930-2951`).
- "Services stay free of servlet types": two code comments (`main/service/AuthService.java:28`,
  `main/security/SessionAuthenticator.java:17`); `jakarta.servlet` is imported only by
  `main/controller/AuthController.java` and four `security` classes (grep); no rule enforces it.
- ArchUnit: only Controller/Service/Repository are layers (`test/ArchitectureTest.java:25-39`); controllers
  reach services only.
- Settled (brief §6): session-cookie auth with the active profile server-side; package-by-layer; OpenAPI stays.
- Order of checks visible on the wire today: Bean Validation (`@Valid`) runs before the controller body, so a
  malformed body is `400` in either mode and only a valid body reaches a mode gate
  (`main/controller/AuthController.java:55-61`, `:74-78`).

➡️ Binding = the documents plus these observable contracts: the three `404`s, the `401` shape, session
rotation and clearing, no session on a failed or cookieless request, `400` before `404`, the settled plan
table, and servlet-free services.

⚖️ Strongest argument against: the area was "finished and verified" on 2026-09-29 (card); treating even its
check ordering as a contract makes any tidy-up harder.

✅ Decision: all are constraints; the refactor must be invisible on the wire. Unblocks Q4–Q8.

---

❓ **Q2** - **Where does each sign-in rule and each login step live today, and is the split a real
problem?** Options: (a) a real problem worth fixing; (b) cosmetic.

🔎 Facts:
- Mode read in five places by two mechanisms: `AuthController.java:60` (login gate), `:77` (set-password
  gate), `AuthService.java:61` (register gate), `main/config/SecurityConfig.java:108` (adds the filter),
  `main/config/PasswordlessStartup.java:19` (`@ConditionalOnProperty(name = "myfinance.auth.mode", havingValue =
  "none")`); plus `AuthService.java:130` reads `mode()` for the response.
- History: the register gate went into the service and the login gate into the controller in the same
  commit (`git show be14139`), because login was orchestrated in the controller; the set-password gate went
  into the controller in `742c1e2`.
- Hidden precondition: `AuthService.java:72-78` — "Only reachable on a passwordless instance
  (`AuthController` guards the mode)". The service does not check.
- The precondition is exercised on purpose: `AuthControllerTest.java:399-422`
  (`aPasswordlessAccountThatSetAPasswordCanLogInAfterSwitchingToPasswordMode`) calls
  `authService.setPassword(...)` directly **in password mode**; `742c1e2`'s message says the test was designed
  that way to join the two mode contexts.
- `AuthService.normalizeEmail` (`:85-88`) exists only so the controller can satisfy
  `SessionAuthenticator.java:36` ("email must already be normalized"); `AppUserDetailsService.java:22` repeats
  the assumption ("Emails are normalized … before they get here").
- The login sequence is in the controller (`AuthController.java:55-67`): gate, normalise, bind through
  `SessionAuthenticator` with request and response, then `authService.currentSession()`.
- `AuthController` is the only one of eight controllers with branching; the stated convention is "Thin:
  bind + validate, delegate, map status" (`main/controller/TransactionController.java:33`); all seven others
  are one call per endpoint (all read).
- LESSONS.md "`orElseThrow()` with no supplier…" (`docs/LESSONS.md:2811-2813`): "A comment claiming an
  invariant is a test that never runs."

➡️ (a): a service method whose safety depends on a caller it cannot see is the defect class the project
already paid for once; and the login rule sitting in the controller is why the gates are split.

⚖️ Strongest argument against (card): "Two modes and three gates: small today. Mostly a tidy-up."

✅ Decision: (a), sized as a tidy-up — no behaviour change, small steps. Unblocks Q4.

---

❓ **Q3** - **Dependencies, by category.**

🔎 Facts: the sign-in code depends on `AuthenticationManager` and `SecurityContextRepository` beans
(`SecurityConfig.java:120-129`), the HTTP session (Spring Session over a Testcontainers Redis in tests,
`test/support/TestcontainersConfiguration.java:45-55`), `UserRepository`/`ProfileRepository` (Postgres via
Testcontainers), `PasswordEncoder` (`SecurityConfig.java:115-118`), `AuthProperties`
(`main/config/AuthProperties.java:9-15`). The mode is fixed per application context, so each mode runs in its
own context (`PasswordlessModeTest.java:32-34` with `@TestPropertySource`); no Mockito anywhere (grep).

➡️ Postgres and the session store: local-substitutable. Security beans, encoder, properties, request/response:
in-process. No ports & adapters, no mocks.

⚖️ Strongest argument against: mode-specific tests need a second application context (slower); a mocked
`AuthProperties` would avoid it.

✅ Decision: as above; the two existing contexts (default and `none`) are reused, no third one. Unblocks Q13.

---

## Round 2 — frontier: what the module is; seam or conditionals

❓ **Q4** - **What is "the sign-in module" — which classes are behind its interface, and what does
`AuthController` see?** (card question 1) Options: (a) `AuthService` is the interface, with
`SessionAuthenticator` and `AppUserDetailsService` behind it; (b) a new `SignInService`; (c) move all eleven
files into one package.

🔎 Facts: eleven files in five packages (card), but package-by-layer is settled (brief §6). The passwordless
mechanism (filter, startup runner, `LocalAccountService`, `SecurityConfig`'s conditional) is deliberately
invisible to everything downstream — it "produces exactly the principal a real login produces"
(`main/security/PasswordlessAutoLoginFilter.java:18-27`; LESSONS "A filter is how you change *who*, not
*whether*", `docs/LESSONS.md:2897-2928`). `AuthController` today sees three collaborators: `AuthService`,
`SessionAuthenticator`, `AuthProperties` (`AuthController.java:38-47`).

➡️ (a). The sign-in module's interface is `AuthService`'s public methods — `register`, `login` (new),
`currentSession`, `setPassword`, `switchProfile`. Behind it: `SessionAuthenticator` (servlet-facing binding of
a login to the session), `AppUserDetailsService` (the account lookup), `AuthProperties`, `ActiveProfile`,
repositories, the encoder. The passwordless mechanism stays outside the interface, where it is today.
`AuthController` sees only `AuthService`.

⚖️ Strongest argument against: "sign-in module" suggests one place for everything about sign-in; leaving the
filter, runner and `LocalAccountService` outside keeps the concept spread over four packages.

✅ Decision: (a). No renames, no package moves (package-by-layer is settled); the interface is where the
*rules a caller must know* live, and the passwordless mechanism has no caller-visible rules. Unblocks Q6–Q8.

---

❓ **Q5** - **Is a seam with two adapters (password mode, none mode) justified, or do three conditionals in
one class read better?** (card question 5)

🔎 Facts: what varies by mode — register allowed/404, login allowed/404, set-password 404/allowed (three
booleans), plus two wiring facts (filter present, startup runner present) that are already expressed as
configuration (`SecurityConfig.java:106-111`, `PasswordlessStartup.java:19`). The mode is fixed per process.
Tests already run each mode in its own context. The passwordless design principle is "minimal divergence":
downstream code paths stay the same in both modes (`ARCHITECTURE.md:133-135`, `plan:38`).

➡️ No seam: three one-line gates in `AuthService`.

⚖️ Strongest argument against: two adapters make a *real* seam by the brief's own test ("two adapters a real
one"), and a strategy object would put each mode's whole behaviour in one file.

✅ Decision: no seam. Two adapters would exist, but what varies across them is three booleans, most adapter
methods would only throw, and the tests gain nothing (they already switch contexts); the deletion test on
such an interface brings back three `if`s in one class — no complexity reappearing across callers. Forking
the code paths per mode would also cut against the passwordless design principle.

---

## Round 3 — frontier: login sequence, gates, normalisation

❓ **Q6** - **How does the login sequence leave the controller without servlet types entering the `service`
package?** (card question 2) Options: (a) the controller keeps receiving request and response and passes them
to `AuthService.login`; (b) `SessionAuthenticator` obtains request and response as injected request-aware
proxies and `AuthService.login` takes only the login request; (c) the controller calls a `security`-package
login that calls back into `AuthService` for the gate and the response.

🔎 Facts:
- `ActiveProfile` already injects a request-aware `HttpServletRequest` proxy into a singleton
  (`ActiveProfile.java:17-31`) — in production and every test.
- `spring-web` 7.0.8 (the cached jar) contains `WebApplicationContextUtils$RequestObjectFactory` and
  `WebApplicationContextUtils$ResponseObjectFactory` (entry names, `grep -a`), the factories behind
  request-aware request/response injection. That `ServletResponse` is registered as a resolvable dependency
  is Spring's documented behaviour but was **not verified** here.
- Spring Security's documented custom login endpoint passes request and response from a controller to
  `SecurityContextRepository.saveContext`; the current code follows that shape (`SessionAuthenticator.java:37-55`).
  What `HttpSessionSecurityContextRepository.saveContext` does with the response in Spring Security 7.1.0 was
  **not verified** here.
- (a) puts `HttpServletRequest` into `AuthService`'s signature, against the two comments (Q1). (c) splits the
  login rule across `security` and `service` again.

➡️ (b). `SessionAuthenticator` stays in `security`, gets the current request and response injected like
`ActiveProfile` gets the request, and exposes "log in with this email and password"; `AuthService.login`
runs gate → bind → session response; the controller passes the validated body only.

⚖️ Strongest argument against: the Spring Security reference shape is (a)-like — the controller owns the
servlet objects; a response proxy is rarer than a request proxy and fails with "no thread-bound request" if
ever called off a request thread.

✅ Decision: (b). It is the same mechanism the codebase already relies on for the active profile, it keeps
servlet types in `security`, and login only ever runs on a request thread. The HTTP login tests
(`AuthControllerTest.java:140-221`) fail loudly if the proxies do not reach the real request (e.g.
`loginSessionCarriesAuthenticationAcrossRequests` at `:169` if the context is not saved,
`loginRotatesSessionIdAndClearsStaleActiveProfile` at `:183` if the id is not rotated). Unblocks Q9, Q11, Q12.

---

❓ **Q7** - **Where do the three gates live, and is there one way of reading the mode?** (card question 3)
Options for the gates: (a) all three as the first statement of the `AuthService` method they guard; (b) a
request-mapping condition or filter that removes the routes per mode. Options for the mode read: (i) keep
`@ConditionalOnProperty` on the startup runner; (ii) make the runner always present and check
`AuthProperties` inside it.

🔎 Facts:
- (b) would turn today's `400` for a malformed body on a disabled route into `404` (the route vanishes before
  validation), a wire change (Q1).
- `theStartupCheckIsWiredToTheMode` (`PasswordlessModeTest.java:54-60`) exists precisely to catch a typo in
  the `@ConditionalOnProperty`, and `theStartupCheckIsAbsentByDefault` (`test/config/AuthPropertiesTest.java:27-31`)
  asserts the bean's absence in password mode; (ii) would replace both with behavioural tests of the runner.
- `@ConditionalOnProperty` is Spring Boot's conventional way to register a bean for a property value; the
  runner's job is wiring, not a rule a caller sees. Whether its value comparison is case-insensitive (so
  `NONE` matches like the relaxed enum binding does) was **not verified** here.

➡️ Gates: (a). Mode read: every *rule* reads `AuthProperties.passwordless()` inside `AuthService`;
`SecurityConfig` keeps its typed read for wiring the filter; the runner keeps `@ConditionalOnProperty` (i).

⚖️ Strongest argument against: two mechanisms still read the same property, which is what the card flagged.

✅ Decision: gates (a) — the check sits in the method whose safety depends on it, after validation as today.
Mode read (i): the second mechanism is wiring, is conventional, and is already pinned by a wiring test;
replacing it churns two tests in a just-verified area for no behaviour. After the change the controller reads
the mode nowhere. Unblocks Q12, Q13.

---

❓ **Q8** - **Who normalises the email, so that no caller carries that precondition?** (card question 4)
Options: (a) `AuthService.login` normalises before calling `SessionAuthenticator`; (b) `SessionAuthenticator`
normalises; (c) the account lookup (`AppUserDetailsService.loadUserByUsername`) normalises what it is given.

🔎 Facts: the stored form is `User.normalizeEmail` — strip + lower-case with `Locale.ROOT`
(`main/model/User.java:28-35`); register normalises before storing (`AuthService.java:64`); the lookup is a
plain equality on the stored form (`main/repository/UserRepository.java` `findByEmail`,
`AppUserDetailsService.java:22-25`). The two comments that carry the precondition are
`SessionAuthenticator.java:36` and `AppUserDetailsService.java:22`. The principal after authentication is built
from the stored row (`AppUserDetailsService.java:24-25` → `AppUserDetails(User)`), so the typed form never
reaches the session. Guard test: `loginIsCaseInsensitiveOnEmail` (`AuthControllerTest.java:160-166`).

➡️ (c): the lookup normalises its input — the one place that compares against the stored form.

⚖️ Strongest argument against: (a) keeps both normalisations (register and login) inside `AuthService`, one
module; (c) puts a data rule into a `security` class.

✅ Decision: (c). It removes the precondition from every path into authentication, not just from this caller;
`AuthService.normalizeEmail` is deleted; both comments change. Register keeps normalising before it stores.
"Put a safety check at the layer that has the facts" (LESSONS, `docs/LESSONS.md:2969`) is the same reasoning.
Unblocks Q12.

---

## Round 4 — frontier: transactions, the local account, the servlet rule

❓ **Q9** - **Does `login` join `AuthService`'s class-level read-only transaction?** (not on the card, raised
by Q6) Options: (a) yes, as every other public method; (b) no — it runs outside any database transaction,
as the controller-orchestrated login does today.

🔎 Facts: `AuthService` is `@Transactional(readOnly = true)` at class level (`AuthService.java:33`). Today the
password check runs from the controller through `SessionAuthenticator` → `AuthenticationManager` →
`AppUserDetailsService` with no service transaction around it; the lookup is a single repository call, then
BCrypt runs, then `currentSession()` opens its own read-only transaction (`AuthController.java:64-66`). No
connection-pool size is configured (`application.properties`, grep), so the library default applies.
`register` and `setPassword` already run BCrypt inside their read-write transactions (`AuthService.java:59-69`,
`:79-83`). Whether a read-only JPA transaction holds a pooled connection from its start was **not verified**
here (believed yes). `spring.jpa.open-in-view=false`. The session response touches only basic columns
(`AuthService.java:107-131`; `ProfileSummary.from`).

➡️ (b): `login` is marked to run without a transaction (`Propagation.NOT_SUPPORTED`), with a one-line reason.

⚖️ Strongest argument against: one more Spring concept for a learner, for a cost `register` already pays;
and the session response built inside `login` then also runs without a transaction (safe only because it reads
no lazy association).

✅ Decision: (b). A refactor should preserve runtime behaviour, including resource use: login is the endpoint
anonymous callers can hammer (rate limiting is an open question, `docs/API.md:1548-1549`), and joining the
transaction would hold a pooled connection across every BCrypt check where today none is held. The
lazy-loading risk is guarded by `loginReturnsSessionAndProfilesWithNoActiveProfile`
(`AuthControllerTest.java:139-158`). BCrypt inside `register`/`setPassword` stays as is (out of scope).

---

❓ **Q10** - **Should the per-request `resolveLocalAccount()` stay? What breaks if the local account is
resolved once at startup and remembered?** (card question 6)

🔎 Facts:
- The filter calls it on every request without an authenticated context (`PasswordlessAutoLoginFilter.java:39-40`);
  it runs `userRepository.findAll()` in a read-write transaction and may save
  (`main/service/LocalAccountService.java:29-38`).
- The plan chose per-request: "Why per-request and not session-persisted: the filter is cheaper than a login and
  needs no session of its own" (`plan:591`); the plan once named a `localAccountId()` accessor that was never
  built (`plan:392`).
- `PasswordlessModeTest` shares one application context across its tests while `DatabaseCleaner` truncates
  `app_user` with `RESTART IDENTITY` before each test (`test/support/DatabaseCleaner.java:11-17`); every test
  there relies on the filter re-creating the account after truncation. A remembered account would dangle from
  the second test on: `currentSession()` does `findById(...).orElseThrow()` (`AuthService.java:91`) → 500.
- Spring Boot starts the embedded web server during context refresh and calls `ApplicationRunner`s afterwards
  (documented startup order; **not verified by running** here), so requests can arrive before the startup
  runner has resolved anything; per-request resolution is correct from the first request.
- In production the only way to change the account in `none` mode is by hand in the database; remembered
  state would need a restart to notice.
- `ARCHITECTURE.md:130-131` says the filter authenticates as the account "which startup resolves" — it
  omits the per-request resolution (doc/code contradiction).

➡️ Keep per-request resolution unchanged; correct the architecture text.

⚖️ Strongest argument against: every request in `none` mode pays a `SELECT` on `app_user` and a read-write
transaction to learn something that cannot change at runtime.

✅ Decision: keep. The cost is one single-row lookup on a localhost single-user instance; remembering breaks
the test suite's isolation, opens a startup window, and adds state. Doc fix in Q15.

---

❓ **Q11** - **Should "services are free of servlet types" become an ArchUnit rule?** Options: (a) add one
rule: no class in `..service..` depends on `jakarta.servlet..`; (b) leave it as two comments.

🔎 Facts: after Q6 the only thing keeping servlet types out of `AuthService` — now holding the login
sequence — is a comment; the rule is precise (ArchUnit sees exactly the imports it asserts on) and passes on
today's code (grep: no `jakarta.servlet` in `service`); `ARCHITECTURE.md:79-88` lists the existing rules and
their limits. Candidate 1 declined a profile-scoping rule because it would see only some slips; this rule has no
such gap.

➡️ (a).

⚖️ Strongest argument against: a guard for a convention nobody has broken is speculative.

✅ Decision: (a). This change is the first to put a request-bound sequence into a service, so it is the first
that could break the convention; turning the comment into a check is the ArchUnit paragraph's own stated
purpose ("the rules a reviewer would otherwise have to catch by eye"). The ARCHITECTURE.md paragraph lists it.

---

## Round 5 — frontier: interface, tests, edge cases

❓ **Q12** - **The shape of the deepened module**: operations, invariants, ordering constraints, error modes,
configuration; what sits behind the seam.

🔎 Facts: Q4–Q11; candidate 1 changes `switchProfile` and the session-response builder internally only.

➡️ `AuthService` — the sign-in module:
- *register(body)* → the new user; `404 auth-disabled` without passwords; `409 email-taken`; stores the
  normalised email.
- *login(body)* → the session response (`activeProfileId: null`, `authMode`); `404 auth-disabled` without
  passwords (checked before any credential work); `401 bad-credentials`; effects: session id rotated if a
  session existed, security context saved to the session, active profile cleared; runs outside any database
  transaction; must run on a request thread.
- *currentSession()* → the session response.
- *setPassword(body)* → sets the principal's password; `404 passwordless-only` with passwords on; the account is
  always the principal.
- *switchProfile(id)* → candidate 1.
Invariants: every sign-in-mode rule is the first statement of the method it guards; no caller needs to know the
mode; emails are accepted in any case and surrounding whitespace; no servlet type in any signature. Ordering:
Bean Validation happens before the call (the controller's `@Valid`), so `400` precedes `404`. Configuration:
`myfinance.auth.mode`, read through `AuthProperties`.
Behind it: `SessionAuthenticator` ("log in with email and password", request and response injected),
`AppUserDetailsService` (normalising lookup), `ActiveProfile`, repositories, encoder, properties.
`AuthController`: five one-line endpoints, one collaborator. No seam (Q5).

⚖️ Strongest argument against: `AuthService` grows by one method and one collaborator while the controller
shrinks — total code is about the same.

✅ Decision: as above; the gain is locality (every rule in one class) and an interface without a hidden
precondition, not fewer lines. Unblocks Q13–Q16.

---

❓ **Q13** - **Which existing tests must pass unchanged, which change, and what is the one new test that
proves the hidden precondition is gone?** (card question 7) Seam options: (a) the HTTP interface via MockMvc
(existing); (b) `AuthService`'s interface called directly with a principal in the security context (one
existing precedent, `AuthControllerTest.java:399-422`).

🔎 Facts: HTTP tests pass before and after for every moved rule — so no HTTP test can prove the precondition
moved; only a direct call to the service in password mode can (today it silently sets the hash). The switch-back
test calls `setPassword` in password mode and will fail once the gate moves (Q2). `PasswordlessModeTest.java:145-154`
proves the none-mode endpoint stores a hash the `PasswordEncoder` bean matches.

➡️ Seam: the HTTP interface for everything observable on the wire, plus `AuthService`'s interface for the one
property that is not (who enforces the mode). Tests:
- **New** — in `AuthControllerTest`, beside the switch-back test: calling `AuthService.setPassword` in password
  mode with an authenticated principal throws the passwordless-only problem and leaves the stored hash
  unchanged. Red today, green after step 2.
- **Rewritten** — the switch-back test sets the passwordless account's hash with the `PasswordEncoder` bean (the
  same encoding `setPassword` performs, which `PasswordlessModeTest.theLocalAccountCanSetAPassword` proves) and
  then logs in over HTTP in password mode. The pair still proves the switch-back end to end.
- **New rule** — `ArchitectureTest.servicesStayFreeOfServletTypes` (Q11).
- **Unchanged** — the rest of `AuthControllerTest` (register ×5, login ×6, logout, me ×4, switch ×4,
  `setPasswordIs404InPasswordMode`); `PasswordlessModeTest` in full (incl. `loginIsDisabled`,
  `registerIsDisabled`, the set-password tests, the cookieless test); `SecurityConfigTest`, `AuthPropertiesTest`,
  `AuthPropertiesNoneModeTest`, `LocalAccountServiceTest`.
- **Deleted** — none.

⚖️ Strongest argument against: a direct service call tests an interface a client never sees; it is the kind of
test the brief warns can become waste.

✅ Decision: as above. It asserts only observable behaviour of `AuthService`'s interface (an exception type and
the stored hash), and it is the only test that fails if a future edit moves the gate back into a caller.

---

❓ **Q14** - **Edge cases and failure modes.**

🔎 Facts: Q1, Q6–Q10; `SecurityConfig.java:68-104` (permitted routes, entry point, CSRF).

➡️ Scenarios and designed answers (all identical to today unless stated):
1. `none` mode, `POST /api/auth/login` with a valid body → `404 auth-disabled`, no credential check, no session.
2. `none` mode, blank login fields → `400 validation-failed` (validation precedes the gate).
3. `password` mode, `PUT /api/auth/password` without a session → `401 unauthenticated` (security chain).
4. `password` mode, authenticated, valid body → `404 passwordless-only`, hash unchanged — now enforced by the
   service itself, so a future second caller cannot bypass it.
5. Wrong password vs unknown email → byte-identical `401` bodies; no session created.
6. Login carrying an attacker-planted session → id rotated, planted active profile cleared.
7. Login with `" CHRIS@Example.com "` → normalised at the lookup → success.
8. `SessionAuthenticator` called off a request thread (a future job or test) → "no thread-bound request" error;
   documented on the class; login is request-only by nature.
9. `login` called from inside another transaction (a future caller) → that transaction is suspended for the
   login; documented.
10. `none` mode with a session saved under `password` mode before the switch → the filter leaves the real
    context alone (unchanged behaviour).
11. Startup race: a request arrives before the startup runner finished → the filter resolves the account itself
    (per-request resolution kept).

⚖️ Strongest argument against: scenarios 8 and 9 are new failure modes the old shape did not have.

✅ Decision: accepted, documented in the Javadoc of the two classes; neither is reachable from any current
caller.

---

## Round 6 — frontier: documents, sequence, siblings, lesson

❓ **Q15** - **Which recorded-decision documents change?**

🔎 Facts: `ARCHITECTURE.md:128-137` (passwordless bullet; "which startup resolves" at `:130-131`), `:79-88`
(ArchUnit paragraph); `docs/API.md` wire text unchanged by this candidate; `docs/SCHEMA.md` `app_user.email`
says emails are "stored lowercased by the service layer" — still true (register).

➡️ `ARCHITECTURE.md` twice (passwordless bullet: per-request resolution and where the sign-in rules live;
ArchUnit paragraph: the new rule). No `API.md`, `SCHEMA.md` or ADR change.

⚖️ Strongest argument against: the per-request correction is not caused by this change.

✅ Decision: include it — this candidate is the one that re-examines per-request resolution (Q10), and the brief
asks to surface doc/code contradictions. Exact text in `docs-proposals.md`.

---

❓ **Q16** - **Steps, and how they interleave with candidate 1, which also touches `AuthService`.** (card
question 8)

🔎 Facts: candidate 1 edits `AuthService.switchProfile` and the session-response builder, `ActiveProfile`,
`ProfileService`, `ProfileRepository` and five services, and keeps `ActiveProfile`'s clear (used by
`SessionAuthenticator.java:52`) and `AuthService`'s constructor unchanged (candidate 1 log, Q11, Q19). This
candidate edits `register` (Javadoc only), `login` (new), `setPassword`, `normalizeEmail` (deleted), the
constructor (adds `SessionAuthenticator`), `AuthController`, `SessionAuthenticator`, `AppUserDetailsService`,
`ArchitectureTest`.

➡️ Candidate 1 lands first; then three steps, each green on `./mvnw verify`:
1. **Normalise at the lookup** — `AppUserDetailsService` normalises; `AuthService.normalizeEmail` deleted; the
   controller passes the typed email; both precondition comments go. Guard: `loginIsCaseInsensitiveOnEmail`.
2. **Gate set-password in the service** — new direct-call test red; move the gate into `setPassword`; rewrite the
   switch-back test; controller endpoint becomes one line.
3. **Move the login sequence** — `AuthService.login` (no transaction); `SessionAuthenticator` takes request and
   response by injection and drops its servlet parameters; `AuthController` loses `SessionAuthenticator`,
   `AuthProperties` and servlet parameters; add the ArchUnit rule; update both `ARCHITECTURE.md` passages.
Then the LESSONS.md entry.

⚖️ Strongest argument against: ordering two independent candidates couples their schedules.

✅ Decision: as above. The order is for reviewability of `AuthService` only — neither candidate needs the other's
code; if this one is picked up first, only imports and the constructor need merging.

---

❓ **Q17** - **Cross-candidate effects.**

🔎 Facts: brief §8; `ARCHITECTURE.md:113-123` (Redis bullet) and the word "Redis" at `:134` inside the
passwordless bullet; `PasswordlessModeTest.java:82-83` comment mentions Redis.

➡️
- **Candidate 1**: split and order as in Q16; both specs state it identically.
- **Candidate 13** (sessions into Postgres): `changeSessionId` and the saved security context behave the same on
  the JDBC store; no session contents change. Both candidates edit the `ARCHITECTURE.md` passwordless bullet —
  this one the sentences at `:130-131` and a new closing sentence, candidate 13 likely the word "Redis" at
  `:134`: merge with care.
- **Candidate 15** (OpenAPI): no operation, parameter or schema changes are intended; springdoc is expected to
  ignore servlet parameters, so removing them from `login` should leave the generated document unchanged —
  **not verified**; candidate 15's schema check would show any difference.
- **Candidate 17** (housekeeping): if it lists `ARCHITECTURE.md`'s "which startup resolves" as stale text, this
  candidate fixes it.
- **Candidates 2, 8** (frontend): no wire change.

⚖️ Strongest argument against: none beyond the textual merge in `ARCHITECTURE.md`.

✅ Decision: as above.

---

❓ **Q18** - **Which lesson does the change teach?**

🔎 Facts: LESSONS entries at `docs/LESSONS.md:2793` (a comment claiming an invariant is a test that never runs),
`:2897` (the filter lesson), `:2930` (the `HttpSession` proxy trap), `:2969` (put a check at the layer that has the
facts).

➡️ One entry: *"Keep servlet types in one package: request-aware proxies, and rules at the method they
protect"* — a singleton can reach the current request and response through injected proxies, which is how the
login sequence moves into a service without servlet types; a precondition in a Javadoc ("the controller
guards the mode") is the 2793 lesson again, so the gate moves into the method; normalising at the lookup is
2969's reasoning; `NOT_SUPPORTED` keeps a slow BCrypt check off a pooled connection.

⚖️ Strongest argument against: it bundles four small ideas.

✅ Decision: one entry, cross-referencing 2793, 2930 and 2969 instead of repeating them.

Frontier empty.

---

## Decisions (one page)

1. **The sign-in module is `AuthService`**: `register`, `login` (new), `currentSession`, `setPassword`,
   `switchProfile`. Behind it: `SessionAuthenticator`, `AppUserDetailsService`, `AuthProperties`,
   `ActiveProfile`. The passwordless mechanism (filter, startup runner, `LocalAccountService`,
   `SecurityConfig`'s conditional) stays outside, unchanged. No renames, no package moves. (Q4)
2. **No seam**: three one-line gates, not a two-adapter strategy. (Q5)
3. **Login leaves the controller** through `AuthService.login(body)`; `SessionAuthenticator` gets the current
   request and response as injected request-aware proxies (the `ActiveProfile` precedent). (Q6)
4. **Gates**: all three are the first statement of the `AuthService` method they guard, after validation as
   today. The controller reads the mode nowhere. `PasswordlessStartup` keeps `@ConditionalOnProperty`. (Q7)
5. **Normalisation**: `AppUserDetailsService` normalises the email it looks up; `AuthService.normalizeEmail` is
   deleted; register still normalises before storing. (Q8)
6. **Login runs outside any database transaction** (`NOT_SUPPORTED`), preserving today's resource behaviour. (Q9)
7. **Per-request local-account resolution stays**; `ARCHITECTURE.md`'s "startup resolves" is corrected. (Q10)
8. **New ArchUnit rule**: no service depends on `jakarta.servlet`. (Q11)
9. **Tests**: HTTP tests unchanged; one new direct-call test proves `setPassword` refuses in password mode; the
   switch-back test is rewritten to set the hash with the encoder. (Q13)
10. **Order**: candidate 1 first, then normalise → gate set-password → move login. (Q16)

Unverified and flagged: that `ServletResponse` is registered as a resolvable dependency (the factory class
exists in `spring-web` 7.0.8); what `HttpSessionSecurityContextRepository.saveContext` does with the response in
Spring Security 7.1.0; `@ConditionalOnProperty`'s case handling; whether a read-only JPA transaction holds a
connection from its start; Spring Boot's server-before-runners startup order; springdoc ignoring servlet
parameters.
