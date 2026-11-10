# 0013 — GitHub Actions deploys; migrations run before the deploy

Date: 2026-11-10 · Status: accepted · Amends [0002](0002-hosting-on-vercel.md) and 0008's "Branching and CI"

**Context.** Vercel's Container Runtime has no release step, and the Rails Docker entrypoint migrates on every boot, which on a scale-to-zero platform means on every cold start and over the pooled URL, where Rails' migration lock doesn't work. Neon Free allows 10 branches; one per preview runs out.

**Decision.**
- Vercel's git auto-deploy is off. GitHub Actions deploys: on push to `main`, full suite → `db:migrate` over Neon's direct URL → `vercel deploy --prod`; on push to `dev`, the same into a preview environment backed by a permanent Neon branch `dev`. PR branches don't deploy.
- The entrypoint never migrates. Migrations are expand-then-contract, because old code briefly runs against the new schema.
- Rails runs under `/api`, uses the pooled URL, and has Solid Queue/Cache/Cable off (in-memory cache, no jobs, no Action Cable).
- One-off admin tasks run with `bin/rails` on my machine against the prod database.

**Consequences.** CI needs a Vercel token and both Neon URLs as secrets. The M1 spike passes when, for `/api/health` with one query on prod: a fully cold first response ≤ 5 s, warm p95 ≤ 300 ms, and projected CPU under half of Hobby's 4 h/month. If it fails, a new ADR moves Rails and only the rewrite target changes.
