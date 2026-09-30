# Every sign-in rule behind the sign-in module

Status: ready-for-agent
Candidate: 6 — Every sign-in rule behind the sign-in module
Strength: Worth exploring
Depends on: candidate 1 — ordering only (both edit `AuthService`; land candidate 1 first). No part of this
spec needs candidate 1's code.

## Problem Statement

The rules of the sign-in mode (`password` / `none`) are split between `AuthController` and `AuthService`, so
the service's interface carries a precondition only its caller enforces.

- `AuthService.setPassword` must only run on a passwordless instance, but it does not check: its Javadoc says
  "`AuthController` guards the mode". Any second caller — a future endpoint, a job, a test — gets a
  password-mode instance that silently accepts a password change without the old password, the exact thing
  the `404 passwordless-only` answer exists to prevent. One test already calls it that way, on purpose.
- The register gate lives in the service, the login and set-password gates in the controller — for no
  reason other than where each flow happened to be orchestrated when its gate was added.
- The login sequence (gate, normalise the email, authenticate and bind to the session, build the session
  response) runs in the controller, which is why `AuthService` exposes `normalizeEmail` — a pass-through
  whose only purpose is to satisfy `SessionAuthenticator`'s own precondition ("email must already be
  normalized").

For the owner and future contributors, `AuthController` is the one controller out of eight with branching
logic, three collaborators and servlet parameters; the sign-in rules cannot be read in one place, and a
comment is the only thing standing between a new caller and a mode bypass. For a self-hosting user nothing is
wrong today — and nothing visible must change.

## Solution

`AuthService` becomes the sign-in module: every sign-in-mode rule and the whole login sequence live behind its
interface — `register`, `login`, `currentSession`, `setPassword`, `switchProfile`. Each mode rule is the first
statement of the method it protects, so no caller needs to know the mode. The login sequence moves into
`AuthService.login`; the servlet-facing part (rotating the session id, saving the security context) stays in
`SessionAuthenticator` in the `security` package, which now obtains the current request and response the same
way `ActiveProfile` already obtains the request — so no servlet type enters the service layer, and a new
ArchUnit rule keeps it that way. The account lookup normalises the email it is given, so no caller has to.
`AuthController` becomes as thin as its seven siblings: bind and validate, delegate, map the status.

For a self-hosting user the behaviour is identical in both modes: same endpoints, same status codes, same
problem types, same session behaviour.

## User Stories

1. As a self-hosting user on a password instance, I want logging in to behave exactly as today (session
   response, `activeProfileId: null`, `authMode: "PASSWORD"`), so that the refactor is invisible to me.
2. As a self-hosting user, I want a wrong password and an unknown email to keep producing the same `401`
   body, so that nobody can probe which emails are registered.
3. As a self-hosting user, I want a failed login to keep creating no session, so that the session store does
   not fill with failed attempts.
4. As a self-hosting user, I want logging in to keep rotating any pre-existing session id and clearing a
   planted active profile, so that session fixation stays impossible.
5. As a self-hosting user, I want to keep logging in with my email typed in any case, or with stray spaces
   around it, so that sign-in stays forgiving.
6. As a self-hosting user on a passwordless instance, I want `register` and `login` to keep answering `404`
   `auth-disabled`, so that no second account can ever appear.
7. As a self-hosting user on a password instance, I want `PUT /api/auth/password` to keep answering `404`
   `passwordless-only`, so that no password can be changed without the old one.
8. As a self-hosting user, I want a malformed body on those endpoints to keep answering `400` in either mode,
   so that the error I see does not change.
9. As a self-hosting user on a passwordless instance, I want setting a password for the local account to keep
   working, so that I can switch the instance back to password mode.
10. As a self-hosting user switching back, I want the password I set in `none` mode to keep logging me in
    after the switch, so that the documented switch-back still works.
11. As a self-hosting user on a passwordless instance, I want cookieless requests (such as the healthcheck) to
    keep leaving no session behind, so that nothing piles up.
12. As a self-hosting user, I want login not to hold a database connection while my password is checked, as
    today, so that a burst of login attempts does not starve other requests.
13. As the owner, I want every sign-in-mode rule to live in `AuthService`, so that I can read the whole
    behaviour of both modes in one class.
14. As the owner, I want `AuthService.setPassword` to refuse on a password instance by itself, so that no
    future caller can bypass the rule by not knowing about it.
15. As the owner, I want `AuthController` to have one collaborator and one line per endpoint, so that it
    follows the convention "thin: bind + validate, delegate, map status".
16. As the owner, I want the login sequence in the service without servlet types in its signature, so that the
    service layer's convention holds.
17. As the owner, I want an ArchUnit rule that fails the build if a service depends on servlet types, so that
    the convention is checked rather than remembered.
18. As the owner, I want the email normalised at the lookup that compares it with the stored form, so that no
    caller carries a "must already be normalised" precondition.
19. As the owner, I want `AuthService.normalizeEmail` deleted, so that the service exposes no pass-through.
20. As the owner, I want no strategy interface or second implementation for the two modes, so that three
    simple conditionals are not dressed up as architecture.
21. As the owner, I want the passwordless mechanism (auto-login filter, startup check, local account rule)
    left exactly as it is, so that a just-verified area is not churned.
22. As the owner, I want `ARCHITECTURE.md` to say that the filter resolves the local account on every
    request, so that the document matches the code.
23. As the owner, I want a LESSONS.md entry about request-aware proxies and rules living at the method they
    protect, so that I learn the Spring reasoning behind the change.
24. As a future contributor, I want `AuthService`'s Javadoc to list each method's mode rule, so that I know
    what each endpoint does in each mode without reading the controller.
25. As a future contributor adding an endpoint that touches credentials, I want the existing mode rules to be
    enforced by the methods I would call, so that I cannot open a bypass by accident.
26. As a future contributor, I want `SessionAuthenticator` documented as request-only, so that I do not call
    it from a job or thread where no request exists.
27. As a future contributor, I want `login` documented as running outside a database transaction, and why, so
    that I do not "fix" it by adding one.
28. As a reviewer, I want one new test that fails before the change and passes after, showing `setPassword`
    refuses in password mode when called directly, so that I can see the hidden precondition is gone.
29. As a reviewer, I want the switch-back test rewritten so that it no longer relies on the unguarded service
    method, and I want to see why the rewritten pair still proves the switch-back.
30. As a reviewer, I want every existing login, register, set-password and passwordless test to pass
    unchanged, so that I can trust the refactor preserved behaviour.
31. As a reviewer, I want the changes split into small steps that each leave the build green, so that I can
    review and revert them one by one.
32. As a reviewer, I want the two specs that touch `AuthService` to name which methods each changes and the
    order they land in, so that the two changes do not collide.

## Implementation Decisions

**The sign-in module is `AuthService`** (no rename, no package moves — package-by-layer stays). Its interface
after this change:

- **register(register request)** → the created user. First statement: on a passwordless instance, answer
  `404` `/errors/auth-disabled` (unchanged). Then normalise and store the email, `409` `email-taken` on a
  duplicate.
- **login(login request)** → the session response (new method). First statement: on a passwordless instance,
  answer `404` `/errors/auth-disabled`, before any credential work. Then ask `SessionAuthenticator` to log in
  with the email and password as typed; bad credentials propagate as today (`401` `bad-credentials`); then
  return the current session response. Runs **outside any database transaction**
  (`Propagation.NOT_SUPPORTED`) with a one-line reason: the password check is deliberately slow and must not
  hold a pooled connection — as today, when the controller ran it outside any service transaction. The session
  response it builds reads only plain columns, so it needs no transaction.
- **currentSession()** → unchanged by this candidate.
- **setPassword(set-password request)** → first statement: on a password instance, answer `404`
  `/errors/passwordless-only`. Then set the principal's password as today. The Javadoc's "`AuthController`
  guards the mode" sentence is replaced by the rule itself.
- **switchProfile(profile id)** → owned by candidate 1.
- **normalizeEmail** → deleted.
- Constructor gains `SessionAuthenticator`; everything else in it stays.

Invariants of the module: every sign-in-mode rule is the first statement of the method it guards; no caller
needs to know the mode; emails are accepted in any case and with surrounding whitespace; no servlet type
appears in any signature. Ordering: Bean Validation runs in the controller before the call, so a malformed
body stays `400` in either mode. Configuration: `myfinance.auth.mode` through `AuthProperties`.

**`SessionAuthenticator`** (stays in `security`, stays a separate class — deleting it would pull servlet types
into the service). Its one operation becomes "log in with this email and password": it receives the current
request and response as injected request-aware proxies (the mechanism `ActiveProfile` uses for the request)
instead of as parameters, and keeps doing exactly what it does now — authenticate through the
`AuthenticationManager`, rotate the session id if a session exists, save the security context through the
`SecurityContextRepository`, clear the active profile. Its "email must already be normalized" precondition is
removed. Its Javadoc states it may only be called on a request thread.

**`AppUserDetailsService`** normalises the email it is asked to look up (with `User.normalizeEmail`) before the
equality lookup; its comment claiming callers normalise first is replaced. Registration keeps normalising
before it stores; the stored form and SCHEMA.md's statement about it are unchanged.

**`AuthController`** keeps its five endpoints and their mappings, status codes and request bodies. Each endpoint
is one delegation to `AuthService`; it no longer depends on `SessionAuthenticator` or `AuthProperties`, and
`login` no longer takes servlet parameters. The logout note in its Javadoc stays.

**Unchanged on purpose:** `AuthMode`, `AuthProperties`, `SecurityConfig` (it keeps its typed mode read to add
the filter), `PasswordlessAutoLoginFilter` (keeps resolving the local account on every request without a
logged-in session), `LocalAccountService`, `PasswordlessStartup` (keeps `@ConditionalOnProperty`; its wiring is
pinned by two existing tests), `AuthDisabledException`, `PasswordlessOnlyException`. No seam: three
conditionals in one class, not a strategy interface with a password-mode and a none-mode implementation.

**New structural rule:** `ArchitectureTest` gains `servicesStayFreeOfServletTypes` — no class in the `service`
package depends on `jakarta.servlet`. It passes on today's code and on every step below.

**API contract:** no change — no endpoint, field, status code, problem type or session behaviour changes in
either mode.

**Recorded-decision documents updated in the same change** (exact wording in `docs-proposals.md`):
- ARCHITECTURE.md §3 "Profiles and authentication", passwordless bullet — the filter re-resolves the local
  account on every request (the document says only "startup resolves"); every sign-in-mode rule and the login
  sequence live in `AuthService`.
- ARCHITECTURE.md §3 "Structural tests (ArchUnit)" — list the new rule.

**Cross-candidate agreement with candidate 1 (active profile scope).** Both edit `AuthService`. This candidate
owns `register` (Javadoc only), `login` (new), `setPassword`, `normalizeEmail` (deleted) and the constructor
(adds `SessionAuthenticator`), plus `AuthController`, `SessionAuthenticator`, `AppUserDetailsService` and the
ArchUnit rule. Candidate 1 owns `switchProfile` and the private session-response builder, plus `ActiveProfile`,
`ProfileService`, `ProfileRepository` and the five profile-scoped services; it leaves `AuthService`'s
constructor unchanged and keeps `ActiveProfile`'s clear, which `SessionAuthenticator` keeps calling. **Landing
order: candidate 1, then this candidate.**

**Ordered steps** (each separately shippable, `./mvnw verify` green, Spotless applied):

1. **Normalise at the lookup.** `AppUserDetailsService` normalises; delete `AuthService.normalizeEmail`; the
   controller passes the email as typed; remove both "already normalised" comments. Guarded by the existing
   case-insensitive login test.
2. **Gate set-password in the service.** Write the new direct-call test (red); move the gate into
   `setPassword` (green); rewrite the switch-back test to set the hash with the encoder; the controller's
   set-password endpoint becomes one line.
3. **Move the login sequence.** Add `AuthService.login` (outside any transaction); `SessionAuthenticator` takes
   request and response by injection and drops its servlet parameters; `AuthController` drops
   `SessionAuthenticator`, `AuthProperties` and servlet parameters; add the ArchUnit rule; update both
   ARCHITECTURE.md passages. Guarded by the unchanged HTTP login tests in both modes.
4. **Lesson.** Add the LESSONS.md entry (the file is git-ignored, so it is not part of a commit).

## Testing Decisions

**What makes a good test here.** Tests assert observable behaviour only: HTTP status, problem `type`, response
body, the session that does or does not exist afterwards, and the stored password hash. No test inspects
fields, counts calls or mocks a collaborator. Behaviour that is already pinned at the HTTP interface is left to
those tests; a new test is added only where the HTTP interface cannot see the property that changes.

**The seams — the HTTP interface, plus `AuthService`'s interface for one property.** Everything on the wire is
tested through MockMvc in `@IntegrationTest` (real context, real Postgres and session store, the real security
chain), in both mode contexts that already exist (default, and `myfinance.auth.mode=none`). The one thing this
change moves that the wire cannot show — *who* enforces the set-password mode rule — is tested at
`AuthService`'s interface by calling it directly with an authenticated principal in the security context, as
the existing switch-back test already does. No third application context is added.

**New tests.**
- In `AuthControllerTest`, beside the switch-back test: calling `AuthService.setPassword` in password mode with
  an authenticated principal answers the passwordless-only problem and leaves the stored hash unchanged. Fails
  today (the service silently sets the hash); passes after step 2. This is the test that proves the hidden
  precondition is gone.
- `ArchitectureTest.servicesStayFreeOfServletTypes`.

**Rewritten.** `AuthControllerTest.aPasswordlessAccountThatSetAPasswordCanLogInAfterSwitchingToPasswordMode`
no longer calls `AuthService.setPassword` in password mode (which step 2 makes impossible); it gives the
passwordless account a hash produced by the application's `PasswordEncoder` — the same encoding `setPassword`
performs — and then logs in over HTTP. Together with `PasswordlessModeTest.theLocalAccountCanSetAPassword`
(the none-mode endpoint stores a hash that encoder matches) the pair still proves the switch-back end to end.

**Must pass unchanged.** The rest of `AuthControllerTest` — register, login (including
`loginSessionCarriesAuthenticationAcrossRequests`, `loginRotatesSessionIdAndClearsStaleActiveProfile`,
`loginWithWrongPasswordAndUnknownEmailAreIndistinguishable401s`, `loginIsCaseInsensitiveOnEmail`), logout, me,
the profile-switch tests and `setPasswordIs404InPasswordMode`; all of `PasswordlessModeTest`
(`registerIsDisabled`, `loginIsDisabled`, the set-password tests, `aCookielessRequestLeavesNoSessionBehind`,
`theStartupCheckIsWiredToTheMode`); `SecurityConfigTest`; `AuthPropertiesTest`; `AuthPropertiesNoneModeTest`;
`LocalAccountServiceTest`; the existing `ArchitectureTest` rules.

**Deleted.** None.

**Prior art.** `AuthControllerTest`'s switch-back test (direct service call with a principal placed in
`SecurityContextHolder` and cleared in a `finally`); `PasswordlessModeTest` (a whole class in the `none` mode
context via a test property); `ArchitectureTest`'s `noClasses()…dependOnClassesThat()…resideInAPackage(…)`
rules (the new rule has the same shape as the Jackson 2 rule).

## Out of Scope

- A strategy seam (a sign-in mode interface with two implementations) — rejected: what varies is three booleans.
- Replacing `PasswordlessStartup`'s `@ConditionalOnProperty` with a typed check — its two wiring tests already
  pin it, and it is conventional Spring Boot.
- Remembering the local account after startup instead of resolving it per request — rejected: it breaks the
  per-test database truncation the passwordless tests rely on, opens a window where requests arrive before the
  startup runner, and adds state for a one-row lookup.
- BCrypt running inside `register`'s and `setPassword`'s read-write transactions (pre-existing).
- Rate limiting login (an open question in API.md), and a password change that asks for the old password.
- Moving or renaming classes, or merging the passwordless mechanism into `AuthService`.
- Any frontend, API.md or OpenAPI change: the wire contract is unchanged.

## Further Notes

- **Lesson (LESSONS.md):** new entry "Keep servlet types in one package: request-aware proxies, and rules at the
  method they protect" — how a singleton reaches the current request and response through injected proxies; why a
  precondition written in a Javadoc is the "a comment claiming an invariant is a test that never runs" lesson
  again; normalising at the lookup is "put a safety check at the layer that has the facts"; why `login` runs
  outside a transaction. Cross-reference the existing entries on `orElseThrow()` without a supplier, on the
  `HttpSession` proxy trap, and on putting a check at the layer that has the facts, instead of repeating them.
- **Cross-candidate effects.** Candidate 1: split and order above, stated identically in both specs. Candidate 13
  (sessions in Postgres): session-id rotation and the saved security context behave the same on the JDBC store;
  both candidates edit ARCHITECTURE.md's passwordless bullet (this one its "startup resolves" sentence and a new
  closing sentence; candidate 13 probably the word "Redis" in it) — merge with care. Candidate 15 (OpenAPI):
  springdoc is expected to ignore servlet parameters, so removing them from `login` should leave the generated
  document unchanged; its schema check would reveal any difference. Candidate 17: if it lists ARCHITECTURE.md's
  "which startup resolves" as stale text, this candidate fixes it. Frontend candidates: no wire change.
- **Not verified in this pass:** that `ServletResponse` is registered for request-aware injection (the factory
  class `WebApplicationContextUtils$ResponseObjectFactory` is present in the `spring-web` 7.0.8 jar; the
  registration was not read); what `HttpSessionSecurityContextRepository.saveContext` does with the response in
  Spring Security 7.1.0; whether `@ConditionalOnProperty` compares the mode value case-insensitively; whether a
  read-only JPA transaction holds a pooled connection from its start (the reason for decision "login runs
  outside a transaction" — harmless if it does not); Spring Boot's order of starting the web server before
  running `ApplicationRunner`s. The HTTP login tests in step 3 fail loudly if the injected proxies do not reach
  the real request and response.
- **New failure modes, documented rather than prevented:** calling `SessionAuthenticator` off a request thread
  fails with "no thread-bound request"; calling `login` from inside another transaction suspends it. No current
  caller does either.
