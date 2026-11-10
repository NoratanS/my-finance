# 0002 — Everything on Vercel Hobby, API on the same origin

Date: 2026-11-10 · Status: accepted

**Context.** Goal: free, low-ops, one platform, reachable from PC / iPad / phone. Render's free Postgres expires after 30 days, Fly has no free tier, Railway costs ~$5/month. Since July 2026 Vercel runs any HTTP server from a `Dockerfile.vercel` (Container Runtime, beta, same limits and Active-CPU billing as Functions). Hobby is non-commercial — fine here.

**Decision.** SPA as static files, Rails on the Container Runtime, Postgres from Neon via the Vercel Marketplace, email via Resend (Marketplace). The SPA calls `/api/*`, rewritten by Vercel to Rails — same origin, cookie sessions, no CORS (iOS Safari blocks cross-site cookies).

**Consequences.** Cold starts after idle; no always-on worker, so nothing may depend on one (subscriptions are marked paid by hand — see ADR 0007). Milestone 1 opens with a spike: deploy a hello-world Rails API, measure cold start, confirm Hobby limits. If the beta fails, Rails moves elsewhere and only the rewrite target changes.
