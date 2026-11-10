# 0007 — Scope: the whole canvas, one milestone at a time

Date: 2026-11-10 · Status: accepted

**Decision.** Launch (inviting friends) happens once everything on the canvas plus auth is built. No deadlines. Prod exists from milestone 1, used only by me until launch. Order: deploy spike + auth → transactions + tags → dashboard → budgets → subscriptions → insights → export → launch.

Two design calls made now:
- **Subscriptions** become transactions by hand: "Mark as paid" records the transaction and moves the next charge forward. No cron. Automation only if it gets tedious.
- **Budgets** are one-off date ranges, as designed. "Repeat" only if real use asks for it.

**Consequences.** No scheduled jobs needed on a request-scoped platform (ADR 0002). Per-milestone details (tables, endpoints) are settled in that milestone's own spec grilling.
