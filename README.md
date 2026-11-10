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

_To be written with the deploy spike (milestone 1)._
