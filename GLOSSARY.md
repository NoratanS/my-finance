# Glossary

- **User** — a person with a login. Owns one private ledger in one currency.
- **Account** — a user's sign-in and own settings (email, password, currency); `/api/account` changes the settings.
- **Admin** — the one user who can create invites and reset links (the owner). Created by a Rails task, never through the app.
- **Invite** — the only way for a person to get an account; the smoke user is created by a Rails task. A single-use link the admin creates for one email address, expiring after 7 days, sent by hand.
- **Smoke user** — a dedicated prod user the post-deploy smoke signs in as. Created by a Rails task, never used by hand; it must stay empty.
- **Transaction** — one expense or income: amount, kind, date (today or earlier, no time), optional description, 0–5 tags shown A–Z.
- **Kind** — `expense` or `income`. Amounts are always positive; kind carries the sign.
- **Tag** — a label on transactions. Name is unique per user ignoring case, max 40 chars, kept as first typed. Optional colour (one of 8) and optional group. Tags replace both categories and merchants.
- **Tag group** — a named set of tags (e.g. "Shops"). Name follows the tag name rules. A tag is in at most one group. Group totals count each transaction once.
- **Untagged** — a transaction with no tags.
- **Merge** — fold one tag into another; transactions, budgets, subscriptions and saved insights move to the target.
- **Bulk tagging** — add or remove a tag across selected transactions; never replaces tags, skips ones already at 5.
- **Budget** — a spending limit for one tag over one date range. Overlaps allowed, identical periods not. Does not repeat.
- **Subscription** — a recurring charge: price, cadence (weekly / monthly / quarterly / yearly), next charge, status (active / paused / cancelled), tags.
- **Overdue** — a subscription whose next charge date passed without being marked paid.
- **Mark as paid** — records the subscription's transaction and moves its next charge forward.
- **Insight** — a question over transactions: metric (spend / income / net) × tags × split × range × interval, optional 3-month forecast.
- **Saved insight** — a named insight; can be pinned to the dashboard.
