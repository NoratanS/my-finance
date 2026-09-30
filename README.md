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
- **Self-hosted, cloneable** — run it entirely on your own machine or server
  via Docker Compose. No hosted service, no vendor lock-in.

## Tech stack

| Layer      | Technology                                   |
|------------|-----------------------------------------------|
| Backend    | Java 21, Spring Boot, Spring Data JPA, Spring Security |
| Database   | PostgreSQL, Flyway (migrations)              |
| Frontend   | React (Vite)                                 |
| Analytics  | Python, FastAPI                              |
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

If you are the only person using this instance, you can skip accounts entirely:
set `MYFINANCE_AUTH_MODE=none` **and** `MYFINANCE_BIND_ADDRESS=127.0.0.1` in `.env`
before the first start. There is then no register or login screen — the app serves
one local account, and the backend logs a warning at every start to say
authentication is off. The second line makes port 3000 listen on this machine only;
compose can't derive it from the first, so set both.

> **`none` means no authentication.** Anyone who can reach port 3000 has full
> access to all the data. Use it only on a machine you control, and never expose
> it beyond that machine.

Switching back to the default `MYFINANCE_AUTH_MODE=password` leaves that account
unable to log in until it is given a password, so set one first: in the app, open
**Set password** in the navigation. Then change `.env` back
(`MYFINANCE_AUTH_MODE=password`, `MYFINANCE_BIND_ADDRESS=0.0.0.0`), restart, and
sign in as `local@localhost` with that password.

Insights decide what "today" is — and so "this month", "last N months" and "year
to date" — in UTC, unless you set `TZ` in `.env` to your own time zone as an
IANA name such as `Europe/Warsaw`. Set it so that an entry made late in the
evening counts in your day and month. Only Insights follow `TZ`. The daily
subscription charge job (00:05 UTC), the subscriptions screen's dates and backup
restore's date re-basing stay on UTC, so near midnight the two can disagree
about "today". Transaction dates are accepted up to one day past today's UTC
date, so any time zone can enter its own "today" either way. A misspelled zone
makes every insight fail with "the analytics service isn't running". A `TZ`
exported in your shell takes precedence over `.env`.

### Run from a release

Each tagged release ships a zip (attached to the GitHub Release) for people who
don't want to clone or build anything: a compose file pinned to that release's
images on GHCR, a `.env` template, and `start.sh` / `start.bat` launcher
scripts. Unzip it anywhere, run the script for your OS, and open
http://localhost:3000 — the script checks Docker is installed, generates a
database password and asks which sign-in mode you want on first run, and starts
the stack. Details in the bundle's own README (`deploy/release/README.md` in this
repo).

### Backend (development)

Requirements: Java 21 and a PostgreSQL 16+ database.

```bash
createdb myfinance                          # or any name; see DB_URL below
cd backend
DB_URL=jdbc:postgresql://localhost:5432/myfinance DB_USERNAME=postgres DB_PASSWORD=postgres \
  ./mvnw spring-boot:run
```

Flyway creates the schema on first start. The API is served under `http://localhost:8080/api`
— see [`docs/API.md`](./docs/API.md) for the contract. Swagger UI is at
`http://localhost:8080/swagger-ui.html` (the raw document at `/v3/api-docs`; a committed copy
lives at `docs/openapi.json`) when the backend is running. A quick smoke test:

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

### Changing the API contract

The backend's OpenAPI document is committed as `docs/openapi.json`, and
`frontend/src/api/schema.d.ts` is generated from it. Both are generated files — never edit them by
hand. When a DTO or endpoint changes, `./mvnw verify` fails in `OpenApiDocumentTest` and writes the
document the code now serves to `backend/target/openapi.json`. Review the difference, then:

```bash
cp backend/target/openapi.json docs/openapi.json
cd frontend && npm run generate:types
```

No backend needs to be running. CI runs `npm run check:types`, which fails when `schema.d.ts` is
stale, so commit both files together with the change.

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

Phases 1 through 4 are complete: the backend core (schema, auth, profiles,
categories, transactions, budgets, integration tests), the React SPA and the
subscriptions tracker, Docker Compose packaging with profile-selective backup
export/restore, CI/CD on GitHub Actions and the downloadable release bundle,
and the analytics service running beside the backend as an internal read-only
plan executor. Phase 5's optional local AI layer (Ollama) was built and then
removed on 2026-09-22; commit `3d00643` (tag `pre-cleanup`) is the last
version with it. This is an active portfolio project — expect the
structure and feature set to evolve.
