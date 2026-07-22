# my-finance

A self-hosted personal finance tracker. Log your daily spending, organize it into
a hierarchy of categories, manage per-profile budgets, and keep your data on
your own machine.

Built as a portfolio project — see [`ARCHITECTURE.md`](./ARCHITECTURE.md) for
design decisions and technical details.

## What it does

- **Quick daily entry** — log a transaction and assign it to a category in a
  few seconds.
- **Hierarchical categories** — e.g. `Groceries > Supermarket`,
  `Groceries > Takeaway`, so you can track at whatever level of detail you want.
- **Profiles** — switch between fully separate spaces (e.g. "Personal" and
  "Company"), each with its own transactions, categories, and budgets. Each
  profile is protected by real login/authentication, not just a UI toggle.
- **Multi-currency support** — transactions and budgets can be tracked in
  different currencies per profile.
- **Budgets** — set limits per category and time period, and track how you're
  doing against them.
- **Self-hosted, cloneable** — run it entirely on your own machine or server
  via Docker Compose. No hosted service, no vendor lock-in.

## Planned (not yet built)

- **Analytics service (Python)** — trend analysis, spend forecasting, and
  smart category suggestions based on transaction history.
- **Local AI insights (Ollama)** — an optional, fully local LLM layer that
  narrates your spending in plain language ("you're 20% over your grocery
  budget this month"). Toggleable, since it's not needed to self-host the
  core app.

These are intentionally out of scope for the initial build — see
`ARCHITECTURE.md` for the reasoning.

## Tech stack

| Layer      | Technology                                   |
|------------|-----------------------------------------------|
| Backend    | Java 21, Spring Boot, Spring Data JPA, Spring Security |
| Database   | PostgreSQL, Flyway (migrations)              |
| Frontend   | React (Vite)                                 |
| Analytics  | Python, FastAPI, pandas *(planned)*          |
| AI insights| Ollama *(planned, optional)*                 |
| Deployment | Docker, Docker Compose                       |

## Project structure

```
my-finance/
├── backend/       # Spring Boot API
├── frontend/      # React app
├── docs/          # architecture notes, schema diagrams
├── docker-compose.yml
└── README.md
```

`analytics/` will be added once that phase starts.

## Getting started

> This section will be filled in once the backend/frontend have a first
> working version. The intended workflow is:

```bash
git clone https://github.com/<your-username>/my-finance.git
cd my-finance
docker compose up
```

This will start Postgres, the Spring Boot backend, and the React frontend.

## License

Not yet decided.

## Status

Early development. This is an active portfolio project — expect the
structure and feature set to evolve.
