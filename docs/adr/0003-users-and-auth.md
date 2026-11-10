# 0003 — Private data per user, invite-only Rails 8 auth

Date: 2026-11-10 · Status: accepted

**Context.** v1 had no auth: local "profiles", where scoping was a correctness rule only. v2 is on the internet with real people, so scoping becomes a security boundary.

**Decision.** A profile is simply the user: one private ledger, one currency, set in settings. No shared ledgers in v1. Auth uses the Rails 8 authentication generator (email + password, `has_secure_password`, cookie session), invite-only signup, `rate_limit` on login, password reset by email (Resend). Every query goes through `current_user`, resolved once from the session. No 2FA in v1; passkeys are a candidate later.

**Consequences.** The canvas's profile picker and profile chip go away; backup becomes "export my data" for your own account only; restore is deferred until someone needs it. Each resource gets a request spec proving another user can't read or change it.
