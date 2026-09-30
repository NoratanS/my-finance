# Docs proposals — Candidate 6: Every sign-in rule behind the sign-in module

## (a) Proposed glossary terms

**Switch-back**:
Moving an instance from sign-in mode `none` back to `password`, after its local account has been given a
password so that it can still log in.
_Avoid_: mode migration, re-enabling authentication, password restore

(Why: the README ("Switching back to the default `MYFINANCE_AUTH_MODE=password`…"), `docs/API.md`
(`PUT /api/auth/password`, "before the instance is switched back") and the tests
(`aPasswordlessAccountThatSetAPasswordCanLogInAfterSwitchingToPasswordMode`) all describe this operation in
different words; it is the reason the only passwordless-only endpoint exists.)

No other new terms: "Sign-in mode", "Local account" and "User" from the seed list cover the rest. "Sign-in
module" is an architecture phrase (module = `AuthService` and what sits behind it), not a domain term.

## (b) Proposed ADRs

None. Every decision here is cheap to reverse (where a gate sits, where the email is normalised, whether login
joins a transaction, one ArchUnit rule) and none amends a wire contract. The one recorded-decision text that
changes is `ARCHITECTURE.md`, amended in place per the repo rule.

## (c) Required updates to recorded-decision documents

Both land in step 3 of the spec (the step that moves the login sequence and adds the rule).

### 1. `ARCHITECTURE.md` — §3 "Profiles and authentication", the passwordless bullet

Replace the sentence (currently lines 128–133):

> **Passwordless mode.** `MYFINANCE_AUTH_MODE=none` (default `password`) turns a self-hosted instance into a
> single-user one with no login screen: `PasswordlessAutoLoginFilter` authenticates every request as one local
> account, which startup resolves — no users means create `local@localhost`, exactly one means adopt it, more
> than one refuses to start rather than guess whose data to serve.

with:

> **Passwordless mode.** `MYFINANCE_AUTH_MODE=none` (default `password`) turns a self-hosted instance into a
> single-user one with no login screen: `PasswordlessAutoLoginFilter` authenticates every request as one local
> account — no users means create `local@localhost`, exactly one means adopt it, more than one refuses to start
> rather than guess whose data to serve. Startup applies that rule once before serving, so an ambiguous
> database stops the instance at boot; the filter applies it again on every request that carries no logged-in
> session (a one-row lookup), so the principal always matches the account row as it is now.

After the sentence "`register` and `login` answer `404` in this mode, which is what keeps "exactly one account"
true at runtime rather than only at boot." (currently lines 135–137), insert:

> These mode rules — and their mirror, `PUT /api/auth/password`, which exists only in this mode so the local
> account can get a password before a switch-back — live in `AuthService`, each as the first statement of the
> method it guards, together with the login sequence; `AuthController` only binds and delegates.

Leave the rest of the bullet as it is. Candidate 13 is expected to edit the word "Redis" further down the same
bullet (currently line 134) — merge, do not overwrite.

### 2. `ARCHITECTURE.md` — §3 "Structural tests (ArchUnit)"

In the paragraph currently at lines 79–88, replace:

> …that `@Entity` classes never appear in a controller signature, and that no class imports Jackson 2 databind.

with:

> …that `@Entity` classes never appear in a controller signature, that no service depends on servlet types
> (the request- and session-facing code — the active profile, binding a login to the session — lives in
> `security/`), and that no class imports Jackson 2 databind.

The paragraph's closing sentence about the limits of import rules stays as it is (the new rule has no such gap:
it asserts on imports and nothing else).

### Documents checked and left unchanged

- `docs/API.md` — "Auth" (the passwordless note, `register`, `login`, `PUT /api/auth/password`): the wire
  contract does not change in either mode.
- `docs/SCHEMA.md` — `app_user.email` "is stored lowercased by the service layer": still true (registration
  normalises before storing); the lookup now also normalises its input, which the schema text does not need to
  describe.
- `README.md` — the switch-back instructions are unchanged.

### Contradictions surfaced while cross-checking docs against code

- `ARCHITECTURE.md` (currently lines 130–131) says the local account is the one "which startup resolves", but
  `PasswordlessAutoLoginFilter` resolves it again on every request without a logged-in session. Fixed by
  update 1.
- The passwordless plan (`docs/superpowers/plans/2026-09-23-passwordless-mode.md`, line 392) says "Task 4's
  filter calls `localAccountId()`" — that accessor was never built; the filter calls `resolveLocalAccount()`.
  The plan is a historical record, not a recorded-decision document, so it is not edited; noted for the
  reviewer.
- `AuthService`'s Javadoc on `setPassword` ("`AuthController` guards the mode") and the two "email must already
  be normalized" comments describe preconditions this change removes; they are rewritten with the code.
