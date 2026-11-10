# 0001 — Rails API + React SPA in one repo, no Python

Date: 2026-11-10 · Status: accepted

**Context.** v1 was Spring Boot + React + a Python analytics service. I work daily in Rails with some React and Python. v2 is a fresh start for 2–10 users.

**Decision.** Monorepo: `api/` is Rails 8.1 API-only; `web/` is Vite + React + TypeScript (React Router SPA mode, TanStack Query, react-hook-form + zod, Tailwind v4, Recharts). No Python service — analytics are SQL aggregations in Rails query objects. Hotwire and Inertia were ruled out: I want the API/SPA separation.

**Consequences.** One backend language, one deploy target for the API. A Python service comes back only if a specific feature needs it (forecasting models, ML tagging), via its own ADR.
