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
- **Insights** — saved, re-runnable questions about your spending, executed by
  a separate read-only analytics service (Python/FastAPI) that runs beside the
  backend and never writes to your data.
- **Local AI insights (Ollama)** — an optional, fully local LLM layer that turns
  a plain-language question into an insight plan and narrates the result. Off by
  default (`docker compose --profile ai`), since the app is fully functional
  without it — the insights explorer offers templates and chips instead.
- **Self-hosted, cloneable** — run it entirely on your own machine or server
  via Docker Compose. No hosted service, no vendor lock-in.

## Tech stack

| Layer      | Technology                                   |
|------------|-----------------------------------------------|
| Backend    | Java 21, Spring Boot, Spring Data JPA, Spring Security |
| Database   | PostgreSQL, Flyway (migrations)              |
| Frontend   | React (Vite)                                 |
| Analytics  | Python, FastAPI                              |
| AI insights| Ollama *(optional)* |
| Deployment | Docker, Docker Compose                       |

## Project structure

```
my-finance/
├── backend/       # Spring Boot API (+ Dockerfile)
├── frontend/      # React app (+ Dockerfile, nginx.conf)
├── analytics/     # internal plan-executor service (Python, FastAPI, + Dockerfile)
├── deploy/        # release bundle contents (compose file, launcher scripts)
├── docs/          # architecture notes, schema diagrams
├── docker-compose.yml
└── README.md
```

## Getting started

### Run the whole stack (Docker Compose)

Requirements: Docker with the compose plugin.

```bash
git clone https://github.com/NoratanS/my-finance.git
cd my-finance
docker compose up --build
```

Then open http://localhost:3000 and register an account. Postgres data lives in
a named volume, so it survives restarts. Optionally copy `.env.example` to
`.env` first to set your own database password. Only the frontend publishes a
port — nginx proxies `/api` to the backend, so cookies stay same-origin (see
`ARCHITECTURE.md` §5). The analytics service is internal too: no published
port, and nginx has no route to it, so only the backend can call it.

Add the optional local AI layer with `docker compose --profile ai up --build`;
without the profile the app is fully functional and the insights explorer
offers templates and chips instead of free-text search.

Add optional metrics with `docker compose --profile observability up --build`.
This starts Prometheus and a Grafana with a dashboard (HTTP request rate,
error rate, p95 latency, JVM heap) provisioned automatically — no manual
setup. Without the profile, neither container is pulled or run and nothing
changes. The backend exposes `/actuator/prometheus` on a separate management
port (`8081`) that compose never publishes to the host; Prometheus reaches it
over the internal compose network only. Grafana (`http://localhost:3001`,
default login `admin` / `admin`) and Prometheus's own UI
(`http://localhost:9090`) are published to `127.0.0.1` only, for a human on
the machine to check on the stack — set `GRAFANA_ADMIN_PASSWORD` in `.env` to
change the default login.

### Run from a release

Each tagged release ships a zip (attached to the GitHub Release) for people who
don't want to clone or build anything: a compose file pinned to that release's
images on GHCR, a `.env` template, and `start.sh` / `start.bat` launcher
scripts. Unzip it anywhere, run the script for your OS, and open
http://localhost:3000 — the script checks Docker is installed, generates a
database password on first run, and starts the stack. Details in the bundle's
own README (`deploy/release/README.md` in this repo).

### Backend (development)

Requirements: Java 21, a PostgreSQL 16+ database, and a Redis server (sessions are
Redis-backed — see ARCHITECTURE.md "Profiles and authentication"; the backend starts
without one, but `/actuator/health` goes DOWN and login fails).

```bash
createdb myfinance                          # or any name; see DB_URL below
docker run -d -p 6379:6379 redis:8.10-alpine   # or any local Redis on the default port
cd backend
DB_URL=jdbc:postgresql://localhost:5432/myfinance DB_USERNAME=postgres DB_PASSWORD=postgres \
  ./mvnw spring-boot:run
```

Flyway creates the schema on first start. The API is served under `http://localhost:8080/api`
— see [`docs/API.md`](./docs/API.md) for the contract. Swagger UI is at
`http://localhost:8080/swagger-ui.html` (raw schema at `/v3/api-docs`) when the backend is
running. A quick smoke test:

```bash
# 1. Any request issues the XSRF-TOKEN cookie (this one answers 401 — expected).
curl -c jar -b jar http://localhost:8080/api/auth/me
# 2. Mutating requests must echo it in the X-XSRF-TOKEN header.
curl -c jar -b jar -H 'Content-Type: application/json' \
  -H "X-XSRF-TOKEN: $(grep XSRF-TOKEN jar | awk '{print $7}')" \
  -d '{"email":"me@example.com","password":"correct-horse-battery","displayName":"Me"}' \
  http://localhost:8080/api/auth/register
```

### Analytics (development)

Requirements: Python 3.12+ and [uv](https://docs.astral.sh/uv/). The service is
internal-only — the backend calls it, a browser never does.

```bash
cd analytics
uv sync
uv run uvicorn analytics.main:app --reload --port 8000
```

`GET http://localhost:8000/internal/health` answers without a token; every
other route needs `Authorization: Bearer $ANALYTICS_TOKEN`.

### Frontend (development)

Requirements: Node 24 (see `.nvmrc`). Start the backend first (above) — the Vite dev server
proxies `/api` to `http://localhost:8080` so cookies stay same-origin.

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

### Component catalogue (Storybook)

The reusable presentational primitives — `Card`, `ProgressBar`, `CategoryDot`
and the insights `chips/` family — are catalogued in Storybook, each story
covering more than just the happy path (e.g. `ProgressBar` at 0%, 50%, 100%
and over budget; `CategoryDot` with an explicit color and with the inherited
fallback). Whole screens aren't included — they need the router and query
client, which would make the stories brittle.

```bash
cd frontend
npm run storybook          # http://localhost:6006
npm run build-storybook    # static build in frontend/storybook-static/
```

`storybook-static/` is the portfolio artifact: it's a self-contained static
site, so it can be published (e.g. to GitHub Pages or Netlify) and linked
from a resume or profile without standing up the rest of the app.

### Regenerating API types

`frontend/src/api/schema.d.ts` is generated from the backend's OpenAPI schema
and committed, so drift shows up as a reviewable diff. Regenerate it whenever
a DTO or endpoint changes — this needs the backend **running** (it fetches
`/v3/api-docs` live):

```bash
cd frontend
npm run generate:types
```

### Running the end-to-end tests

The Playwright suite drives the Vite dev server, which proxies `/api` to
`localhost:8080`. The default compose stack keeps the backend
container-internal, so bring it up with the e2e overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d
cd frontend
npx playwright install --with-deps chromium   # first run only
npx playwright test
```

Without the overlay every spec fails on connection errors rather than on
anything real.

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

### Analytics tests

```bash
cd analytics
uv run pytest
```

Requires a running Docker daemon: the executor's golden tests start a Postgres container and
migrate it with the backend's own Flyway files, so the SQL is exercised against the real schema.

### Pre-commit formatting

A [lefthook](https://github.com/evilmartians/lefthook) `pre-commit` hook formats staged files
before each commit and re-stages the result: Prettier for staged frontend `.ts`/`.tsx`/`.css`/
`.json` files (`frontend/src/styles.css` is excluded, per `.prettierignore`) and `ruff format`
for staged `analytics/**/*.py`. It only formats — it never blocks a commit on a lint error.

Java is deliberately not in the hook: Spotless formats the whole module rather than named
files, so a partially staged (`git add -p`) `.java` file would have had its unstaged hunks
reformatted and silently committed too. Spotless `check` is bound to Maven's `verify` phase
instead, so `./mvnw verify` and CI both still enforce it. Run `./mvnw spotless:apply` in
`backend/` before committing Java.

The hook installs as a postinstall step of `npm ci` in `frontend/`; a backend- or
analytics-only contributor can install it directly with `npx lefthook install`. Skip it for a single commit with:

```bash
LEFTHOOK=0 git commit
```

## License

Not yet decided.

## Status

Phases 1 through 5 are complete: the backend core (schema, auth, profiles,
categories, transactions, budgets, integration tests), the React SPA and the
subscriptions tracker, Docker Compose packaging with profile-selective backup
export/restore, CI/CD on GitHub Actions and the downloadable release bundle,
the analytics service running beside the backend as an internal read-only plan
executor, and the optional local AI layer that interprets free-text questions
and narrates results. This is an active portfolio project — expect the
structure and feature set to evolve.
