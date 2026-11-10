# 0012 — Invites by link, no email until launch

Date: 2026-11-10 · Status: accepted · Amends [0003](0003-users-and-auth.md)

**Context.** Resend sends to other people only from a verified domain, and `*.vercel.app` can't be verified. I have no domain yet. The app is for 2–10 friends I can message directly.

**Decision.**
- Only the admin (me) invites. An invite is a single-use link bound to one email, valid 7 days, which I send by hand.
- No email in the app before launch. A forgotten password is handled the same way: the admin creates a reset link and sends it.
- Signup asks for the password and the ledger's currency (default PLN); the email comes from the invite and can't be changed. No name field.
- Rails 8 generator sessions and `rate_limit` as generated. Passwords: at least 12 characters, no composition rules (NIST SP 800-63B).
- Deleting your own account arrives with export (M7).

**Consequences.** M1 has no mailer, no Resend and no background jobs. Before launch (M8) I buy a domain and email-based reset replaces admin reset links, through a new ADR.
