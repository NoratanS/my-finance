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

> `docker compose up` for the whole stack lands in Phase 3. Until then the backend runs
> on its own against a local Postgres.

### Backend (development)

Requirements: Java 21, a PostgreSQL 16+ database.

```bash
createdb myfinance                          # or any name; see DB_URL below
cd backend
DB_URL=jdbc:postgresql://localhost:5432/myfinance DB_USERNAME=postgres DB_PASSWORD=postgres \
  ./mvnw spring-boot:run
```

Flyway creates the schema on first start. The API is served under `http://localhost:8080/api`
— see [`docs/API.md`](./docs/API.md) for the contract. A quick smoke test:

```bash
curl -c jar -b jar -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"correct-horse-battery","displayName":"Me"}' \
  http://localhost:8080/api/auth/register
```

### Backend tests

```bash
cd backend && ./mvnw test
```

Integration tests start a throwaway Postgres with Testcontainers, so Docker must be
running. Without Docker, point the tests at an existing database instead:

```bash
SPRING_PROFILES_ACTIVE=local-db DB_URL=jdbc:postgresql://localhost:5432/myfinance_test \
DB_USERNAME=postgres DB_PASSWORD=postgres ./mvnw test
```

## License

Not yet decided.

## Status

Early development. Phase 1 (backend core: schema, auth, profiles, categories,
transactions, budgets, integration tests) is complete; the React frontend is next.
This is an active portfolio project — expect the structure and feature set to evolve.
