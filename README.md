# my-finance

A small personal-finance app for me and a few friends: log spending and income, describe it with tags, and see where the money goes — on PC, iPad and phone.

v2 of this project. The first version (Spring Boot + Python, local-only) lives at [my-finance-java](https://github.com/NoratanS/my-finance-java).

## What it does

- Transactions described by up to 5 tags (no categories, no merchants — tags are the whole model)
- Tag groups, merging and bulk tagging
- Dashboard: the month's net, pinned insights, budgets, recent transactions
- Budgets per tag over a date range
- Subscriptions with next-charge tracking; "mark as paid" records the transaction
- Insights: a small query builder (metric × tags × split × interval), saved and pinned
- Export your data as JSON

## Stack

- `api/` — Rails 8.1, API-only, Postgres (Neon)
- `web/` — Vite + React + TypeScript, React Router, TanStack Query, Tailwind v4
- Hosted on Vercel (Hobby): the SPA as static files, Rails as a container function behind `/api`

## How it's built

- Decisions: ADRs in [`docs/adr/`](docs/adr/)
- Design source of truth: the Claude Design canvas (every screen, desktop / tablet / phone)
- Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Glossary: [`GLOSSARY.md`](GLOSSARY.md)
- Schema: `api/db/schema.rb` · API: the generated OpenAPI file

## Running locally

Needs Docker (Postgres runs in it), plus Ruby and Node at the versions in `.ruby-version` and `.nvmrc` (`mise install` picks them up).

- `bin/dev` starts Postgres, Rails on :3000 and Vite on :5173 (open this one).

### Checks

CI runs the same scripts (`.github/workflows/checks.yml`): PRs check the specs they touch, and pushes to `dev` and `main` run everything before deploying.

- `cd api && bin/ci`: the whole gate (rubocop, rspec, bundler-audit, Brakeman, OpenAPI drift, eslint, `tsc -b`, prettier, vitest). Needs Postgres up (`docker compose up -d --wait db`).
- `cd api && bin/changed-specs origin/dev`: only the specs your branch touches.
- `cd web && npm test -- --changed origin/dev`: only the tests your branch touches.
- `bin/openapi-drift`: regenerates `api/swagger/` and `web/src/api/schema.d.ts` from the rswag specs and fails if they differ from what's committed. Commit the regenerated files to fix it.
