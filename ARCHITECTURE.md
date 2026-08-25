# Architecture

This document explains how `my-finance` is structured and why, so the reasoning
is written down rather than living only in commit history.

## 1. Goals and constraints

- **Self-hosted first.** Anyone should be able to clone the repo and run the
  whole stack locally with one command. No hosted backend, no external
  accounts required for the core app to work.
- **Multiple profiles per instance.** A single self-hosted instance should
  support fully separate profiles (e.g. "Personal" and "Company"), each with
  its own transactions, categories, and budgets — protected by real
  authentication, not just a client-side switch.
- **Multi-currency.** Transactions and budgets are tracked in a currency
  chosen per profile (or per transaction), not hardcoded to one currency.
- **Small, finishable scope.** This is a portfolio project built by one
  person. Every architectural choice below favors something that can be
  built well and finished, over something impressive-sounding but half-done.

## 2. High-level structure

```
my-finance/
├── backend/     Spring Boot API (Java 21)
├── frontend/    React app
├── docs/        architecture notes, schema diagrams
└── docker-compose.yml
```

A Python `analytics/` service is planned for a later phase (see Section 6)
and will slot in alongside these without requiring changes to the backend's
schema or API.

### Why a monorepo

Backend, frontend, and (later) analytics evolve together and are usually
deployed together for a single self-hosted instance. Keeping them in one
repo means:
- One clone gets you the whole app.
- Changes that span services (e.g. an API change and its corresponding
  frontend update) land in one commit, not coordinated across repos.
- One `docker-compose.yml` at the root can wire up the whole stack.

The tradeoff — coupling services that could in principle be released
independently — isn't a real cost at this project's scale.

## 3. Backend

**Stack:** Java 21, Spring Boot, Spring Data JPA, Spring Security, PostgreSQL,
Flyway.

**Package layout** (package-by-layer, standard for a project this size):

```
com.myfinance
├── controller/   REST endpoints
├── service/      business logic
├── repository/   Spring Data JPA interfaces
├── model/        @Entity classes
├── dto/          request/response records
├── config/       security filter chain, Jackson customization
├── security/     principal (UserDetails), current user, session-held active profile, CSRF cookie filter
└── exception/    custom exceptions + global handler (RFC 9457 Problem Details)
```

### Why PostgreSQL, not a NoSQL store

The core data — transactions, categories, budgets — is inherently
relational:
- Categories form a **hierarchy** (self-referencing parent/child).
- Transactions **belong to** a category and a profile.
- Budgets are tied to a category and a time period.
- Common queries (e.g. "total spend under Groceries and its subcategories
  this month") are joins + aggregations — a natural fit for SQL, and awkward
  to model well in a document store.

A relational database also gives ACID transactions across related writes
(e.g. recording a transaction and updating a budget's remaining amount as
one atomic operation), which matters more here than horizontal write
scaling, which this project doesn't need.

### Profiles and authentication

- A **User** account can own multiple **Profiles** (e.g. "Personal",
  "Company"). Switching profiles is a real auth boundary, not just a UI
  filter — each profile's data is scoped and access-checked server-side.
- Spring Security handles authentication; profile switching re-scopes the
  authenticated session to the selected profile.
- All domain entities (transactions, categories, budgets) are associated
  with a `profile_id`, and repository queries are always scoped to the
  active profile — this is enforced at the service layer, not left to the
  frontend to respect.

### Subscriptions and the charge job

Recurring charges (`subscription` table) are turned into ordinary transactions by a
daily `@Scheduled` job (`SubscriptionChargeService`, one transaction per subscription,
idempotent by construction — see `docs/SCHEMA.md` "Charge posting"). The LLM-free rule
of the app applies here too: the dashboard endpoint returns server-computed,
per-currency aggregates so no client re-derives money math.

### Multi-currency

- Each profile has a default currency.
- Transactions store their own currency code alongside the amount, so a
  profile can hold transactions in more than one currency if needed.
- Aggregation/reporting logic is currency-aware rather than assuming a
  single global currency; conversion/normalization (if added later) would
  live in the service layer, not the schema.

### Data model (core entities)

```
User
 └── Profile (1..N)
      ├── Category (self-referencing: parent_id → tree structure)
      ├── Transaction (belongs to Category, has amount + currency)
      └── Budget (tied to Category + time period)
```

The concrete schema — columns, types, constraints, foreign keys and cascade
behavior, indexes, and the recursive CTEs used for category-hierarchy
aggregation — is designed in [`docs/SCHEMA.md`](./docs/SCHEMA.md), along with
the reasoning behind each choice.

Flyway migration files under `backend/src/main/resources/db/migration` act as
the source of truth for the schema as it actually is over time;
`docs/SCHEMA.md` records *why* it has that shape and should be updated
alongside any migration that changes a decision recorded there.

### REST API

The HTTP contract — endpoints, request/response DTOs with their validation
constraints, status codes, and the RFC 9457 error shapes — is designed in
[`docs/API.md`](./docs/API.md). Notable decisions settled there: session-cookie
authentication with the active profile held server-side (never accepted from
the client), nested JSON for category trees, and money as a decimal string
plus an ISO 4217 code so `NUMERIC(19,4)` precision survives the trip to a
JavaScript client.

## 4. Frontend

**Stack:** React (Vite, TypeScript), `react-router-dom` for routing, TanStack Query for
server-state caching/invalidation, plain CSS carrying the design tokens from
`docs/design/styles.css`. No UI framework.

The frontend talks only to the Spring Boot backend's REST API. It has no
direct database access and no business logic beyond presentation and form
handling — validation rules live server-side (Bean Validation) and are
mirrored client-side only for UX, never as the source of truth.

**Why Vite instead of Next.js:** this app is a private, self-hosted
dashboard behind auth, not a public site needing SSR or SEO. Spring Boot
already owns all server-side logic, so Next.js's server/client component
split and data-fetching conventions would add complexity without buying
anything here. A plain React SPA talking to a REST API is also a more
common real-world pairing for internal tools than a Next.js frontend in
front of a separate backend — and, since an existing portfolio project
already uses Next.js, a plain React setup here demonstrates a different
frontend pattern rather than repeating one.

## 5. Deployment, packaging, and CI/CD (Phase 3)

### Docker Compose stack

A single `docker-compose.yml` at the repo root defines:
- `postgres` — the database, with a named volume so data survives restarts
- `backend` — the Spring Boot app, built by a multi-stage `backend/Dockerfile`
  (Maven build stage → slim JRE 21 runtime stage)
- `frontend` — the built React SPA served by **nginx**
  (`frontend/Dockerfile`), which also **proxies `/api` to the backend**

`docker compose up` is enough to get a working instance running locally. This
is the main thing that makes "clone and self-host" realistic for someone
other than the author.

**Why nginx proxies `/api` instead of exposing the backend directly:** the
session cookie and CSRF design assume the SPA and the API share an origin —
exactly what the Vite dev proxy provides in development. The nginx proxy
reproduces that in production: the user visits one host/port, cookies stay
first-party, and no CORS configuration is needed. The backend port is not
published on the host at all.

Startup ordering uses healthchecks, not sleep: `postgres` has a `pg_isready`
check, and the backend exposes Spring Boot Actuator's `/actuator/health`
(the only actuator endpoint enabled, permitted anonymously — it reveals
liveness, not data) so compose can gate the frontend on a genuinely ready
API.

### Release bundle ("download and run")

Each tagged release publishes:
- versioned images to GHCR (`ghcr.io/noratans/my-finance-backend`,
  `.../my-finance-frontend`)
- a zip attached to the GitHub Release containing a compose file pinned to
  those image tags, a `.env` template, and `start.sh` / `start.bat` launcher
  scripts.

The point: a user who has never cloned the repo unzips the bundle anywhere on
their machine, runs the script, and gets the full stack. The scripts check
that Docker is installed (the one prerequisite), generate a database password
into `.env` on first run, run `docker compose up -d`, and print the URL.

One-time maintainer step: the first tagged release creates the two GHCR
packages **private** (that's GitHub's default for packages pushed with
`GITHUB_TOKEN`, regardless of repo visibility), so anonymous
`docker compose pull` from the bundle fails with "denied" until both
packages are flipped to public in GitHub → Packages → package settings.
There is no supported way to do this from the workflow.
Building a no-Docker distribution (bundled JVM + Node + Postgres per OS) was
considered and rejected: it trades one well-known prerequisite for a
per-platform installer project bigger than the app itself.

### Backup and restore

Backups are **manual, profile-selective, application-level JSON exports**
driven from the profile picker: the user chooses which profiles to include,
downloads a file, and restores by uploading it back. Restore always creates
new profiles — it never merges into existing data. A `pg_dump`-based backup
was rejected because it cannot scope to selected profiles and a restore would
clobber the whole instance; the full reasoning and the file format live in
[`docs/API.md`](./docs/API.md) → "Backup". An earlier roadmap idea (scheduled
export to Google Drive) was dropped: on a self-hosted instance a downloadable
file the user stores wherever they like is simpler and doesn't require
third-party credentials.

### CI/CD (GitHub Actions)

- **CI** on pull requests and pushes to `dev`/`main`: backend
  `./mvnw verify` (integration tests run against real Postgres via
  Testcontainers — the runner's Docker daemon makes this work unchanged),
  frontend type-check and production build.
- **Release** on a `v*` tag: build and push both images to GHCR, assemble the
  release bundle, create the GitHub Release with the zip attached.

CI runs the same commands a developer runs locally — no CI-only build path
to drift out of sync.

## 6. Planned future phases (not yet built)

These are deliberately deferred so the core app can be built, tested, and
finished first.

### Python analytics service

- A separate service (`analytics/`), built with FastAPI, that reads from the
  same PostgreSQL database (read-only) to compute things that are either
  awkward in SQL or genuinely benefit from a data-science toolset:
  trend analysis, spend forecasting, and category-suggestion based on past
  transactions.
- **Why a shared database instead of calling the backend's API:** simpler for
  this project's scale, and avoids adding network calls for what is
  fundamentally read-heavy reporting. The known tradeoff (shared-DB coupling
  between services) is accepted deliberately here, not by default.
- Basic aggregation (totals, sums per category) will be handled directly by
  the backend via JPA — the Python service is only justified for things that
  go beyond simple `GROUP BY` queries.

### Local AI insights (Ollama)

- An optional layer on top of the analytics service that uses a small local
  LLM (e.g. Phi-3-mini or Llama 3.2 1B/3B) to phrase computed insights in
  plain language.
- The LLM is a **narration layer only** — it receives already-computed,
  structured summaries and phrases them conversationally. It does not run
  arbitrary queries against the database and is not responsible for the
  actual analysis, to keep behavior deterministic and testable.
- Toggleable via a Docker Compose profile/env var, since not everyone
  self-hosting the app will want to run a local LLM alongside it.

## 7. Explicit non-goals

- Multi-tenant SaaS hosting is not a goal — this is designed for individual
  self-hosting, not a shared cloud service.
- Horizontal scaling / high write throughput is not a design concern at this
  project's scale.
