# Architecture

Short on purpose. The schema lives in `api/db/schema.rb`, the API in the generated OpenAPI file; this page holds only what code can't say. Each decision links its ADR.

## Shape

```
browser (PC / iPad / phone, PWA)
   │  same origin: https://<app>.vercel.app
   ├── /*       → web/  static SPA (Vite build)
   └── /api/*   → Vercel rewrite → api/  Rails 8.1 API (Container Runtime)
                                        │
                                        └── Postgres (Neon, via Vercel Marketplace)
```

- **One platform: Vercel Hobby.** Free and low-ops. Rails runs on the Container Runtime (beta), which is request-scoped: expect a cold start after idle, and no always-on worker. Nothing in the design needs one. If the beta fails us, only Rails moves; the rewrite target changes. [ADR 0002](docs/adr/0002-hosting-on-vercel.md)
- **Same origin.** The SPA calls `/api/*` on its own domain. That keeps cookie sessions working on iOS Safari, which blocks cross-site cookies, and removes CORS entirely.
- **No Python service.** Analytics are SQL aggregations behind Rails query objects. Revisit only if a feature truly needs it. [ADR 0001](docs/adr/0001-stack.md)

## Users and data

- A user owns a fully private ledger with one currency. There are no profiles; the old "profile" is just the user. [ADR 0003](docs/adr/0003-users-and-auth.md)
- Every query is scoped through `current_user` — resolved once, server-side, from the session. Never from a path, query or body. This is a security boundary, and request specs prove it per resource.
- Signup is invite-only.

## Domain (see GLOSSARY.md for terms)

User · Transaction (amount, kind, date, description, 0–5 tags, optional subscription) · Tag (+ optional TagGroup) · Budget (one tag, date range, limit) · Subscription (price, cadence, next charge, status) · SavedInsight (query, pinned).

Money is an integer in minor units plus a `kind` (expense / income). [ADR 0006](docs/adr/0006-money.md)

## Contract between api/ and web/

rswag request specs → OpenAPI file → `openapi-typescript` → TS types in `web/`. CI fails if the generated types drift from the specs. [ADR 0005](docs/adr/0005-code-is-the-doc.md)

## Milestones

Each one starts with a design pass on the canvas (desktop / tablet / phone, approved before code). [ADR 0004](docs/adr/0004-canvas-is-the-design.md)

1. Deploy spike (cold start, Hobby limits) + auth and invites
2. Transactions + tags (tag field, groups, bulk tagging, merge)
3. Dashboard
4. Budgets
5. Subscriptions
6. Insights (then pinned insights on the dashboard)
7. Export
8. Launch — invite friends
