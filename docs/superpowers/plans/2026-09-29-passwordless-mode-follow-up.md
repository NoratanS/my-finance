# Passwordless Mode (follow-up) Implementation Plan

> Follows `2026-09-23-passwordless-mode.md` (backend first cut, `c8f1099..8addf52`). That plan's
> Global Constraints still apply: default stays `password`, profile scoping untouched,
> sessions/Redis/CSRF unchanged, docs travel with the code, `docs/LESSONS.md` is gitignored,
> Java is formatted by `./mvnw spotless:apply`, every commit green on its own, local commits only.

**Goal:** Finish passwordless mode end to end: the frontend knows the mode, a passwordless
account can get a password, the launchers ask for the mode, and `none` binds to loopback.

## Design decisions (settled 2026-09-29 with Chris)

| Decision | Value |
|---|---|
| Where a password gets set | **In `none` mode**, by the already auto-authenticated local user: `PUT /api/auth/password`. Never through an unauthenticated "claim" endpoint — that would let whoever reaches the port first take the account. |
| `PUT /api/auth/password` | Body `{ "password" }`, same validation as `RegisterRequest.password` (`@NotBlank @Size(min=12,max=128)` + 72-byte UTF-8 limit reported as `passwordWithinBcryptLimit`). `204 No Content`. Sets the password of the authenticated account; overwrites an existing one (the caller already has full access in `none`). In `password` mode: `404` — mirrors login/register being `404` in `none`. |
| Switching `none` → `password` without a password | Login simply fails with the usual `401`. The sign-in screen carries a **static** hint (no new signal that reveals whether an account has a password). The real instructions — the email to sign in with (`local@localhost` unless changed) and what to edit in `.env` — live on the set-password screen, shown only in `none`. |
| Frontend in `NONE` | No logout control (the filter would re-authenticate the next request anyway); a "Set password" entry in the nav leading to the set-password screen inside `AppLayout`. `/auth` never shows (the `/me` call succeeds, `AuthGate` redirects). |
| Launcher prompt | `start.sh`/`start.bat` ask for the mode **only when `.env` has no `MYFINANCE_AUTH_MODE`** (first run, or upgrade from an older bundle). No TTY / empty answer → `password`. The answer writes `MYFINANCE_AUTH_MODE` and `MYFINANCE_BIND_ADDRESS` (`none` → `127.0.0.1`, `password` → `0.0.0.0`, today's behavior). Changing mode later = edit `.env`, documented in the README. |
| Compose | Backend gets `MYFINANCE_AUTH_MODE: ${MYFINANCE_AUTH_MODE:-password}`; frontend port becomes `"${MYFINANCE_BIND_ADDRESS:-0.0.0.0}:3000:80"`. |
| Healthcheck | The backend check asserted `/api/auth/me` answers `401`; in `none` it answers `200`, so the stack would never go healthy. Accept `200` or `401`. |

## Workstreams

| # | Owner files | Deliverable | Verify |
|---|---|---|---|
| A — backend | `backend/**`, `docs/API.md` | `PUT /api/auth/password`, TDD; a test that a passwordless account which set its password in `none` can log in as `local@localhost` after the switch to `password` | `cd backend && ./mvnw -B verify` |
| B — frontend | `frontend/**` | `authMode` in types, nav gating, set-password screen, static sign-in hint; vitest for each | `npm run lint && npm run format:check && npm test && npm run build` |
| C — deploy | `deploy/release/**`, `docker-compose.yml`, `docker-compose.e2e.yml`, `README.md`, `ARCHITECTURE.md` | Launcher prompts, compose env + bind, healthcheck fix, docs | `docker compose config` on each file; `bash -n start.sh`; `shellcheck` if present |

All three run in parallel against the contract fixed above; B does not regenerate `schema.d.ts` (that needs a running backend) — it types the new request by hand in `types.ts`, as `SessionResponse` already is.

## Checks after merge (real stack, not test doubles)

1. Release compose with `MYFINANCE_AUTH_MODE=none`: backend reaches `healthy`; the browser lands on
   `/picker` with no login screen.
2. `redis-cli DBSIZE` stays flat while the 5 s healthcheck probes `/api/auth/me` in `none` mode —
   the auto-login filter must not leave a session per probe.
3. Switch back: set a password in `none`, flip `.env` to `password`, restart, sign in as
   `local@localhost`.
