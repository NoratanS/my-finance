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
├── analytics/   plan executor (Python 3.12, FastAPI)
├── docs/        architecture notes, schema diagrams
└── docker-compose.yml
```

The Python `analytics/` service (Section 6) reads the same database through a
read-only role and is reached only by the backend over the compose network —
it publishes no port, and it needed no change to the backend's schema or API.

### Why a monorepo

Backend, frontend, and analytics evolve together and are usually
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

### OpenAPI schema and the Jackson 2/3 split

springdoc (`org.springdoc:springdoc-openapi-starter-webmvc-ui`) serves the
OpenAPI schema at `/v3/api-docs` and Swagger UI at `/swagger-ui.html`
(`OpenApiConfig`), and the frontend's generated types
(`frontend/src/api/schema.d.ts`) are generated from that schema. springdoc
introspects DTOs through its own Jackson **2** pass (`jackson-databind`,
package `com.fasterxml.jackson.databind`), which is blind to the app's
Jackson **3** `STRING`-shape customizer for `BigDecimal` (`JacksonConfig`,
package `tools.jackson.databind`) — left alone, every money field would be
schema'd as `type: number` even though the wire format is a decimal string.
Response and request DTOs with a `BigDecimal` field carry an explicit
`@Schema(type = "string", format = "decimal", ...)` (from
`io.swagger.v3.oas.annotations.media.Schema`) to correct this; `ArchitectureTest`
additionally bans any `com.fasterxml.jackson.databind..` import from
`backend/src/main`, since that package's `ObjectMapper` would carry none of
`JacksonConfig`'s rules, including the strict deserializer that rejects money
sent as a JSON number.

This same springdoc dependency pulls Jackson 2 onto the classpath at compile
scope, which caused a second, unrelated problem: Hibernate's
`@JdbcTypeCode(SqlTypes.JSON)` mapper (used today only by `Insight.plan` and
`Insight.viz`, both `tools.jackson.databind.JsonNode`) auto-selects a
`FormatMapper` at startup, and with Jackson 2 present it silently picked the
Jackson 2 one — unable to construct a Jackson 3 `JsonNode` — breaking every
JSON-column read/write (20 tests failed with no related code change).
`application.properties` pins this explicitly:
`spring.jpa.properties.hibernate.type.json_format_mapper=jackson3`. Any future
column using `SqlTypes.JSON` needs a Jackson-3-shaped type for the same
reason; a Jackson-2-typed one would fail under this pin.

## 4. Frontend

**Stack:** React (Vite, TypeScript), `react-router-dom` for routing, TanStack Query for
server-state caching/invalidation, Recharts for the Phase 4 insight charts, plain CSS
carrying the design tokens from `docs/design/styles.css`. No UI framework.

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

**Why Recharts for charts (Phase 4):** the insights explorer needs four
renderers — a stat tile (plain HTML), a line chart, a bar chart, and a
multi-line chart (`docs/INSIGHTS.md` → Result shapes). Recharts is one
small declarative dependency covering all three chart shapes with axes,
tick selection, tooltips, legends and responsive resizing included; series
colours are passed in from the existing design tokens through props, so
`docs/design/styles.css` stays authoritative. Cost accepted: ~100 kB
gzipped and a d3 transitive tree in a frontend that otherwise has three
runtime dependencies. Rejected: hand-rolled SVG — scales, tick selection,
hover hit-testing and responsive `viewBox` maths across four renderers is
the largest single chunk of Phase 4's frontend work, for no user-visible
gain — and visx, which is the same assembly effort minus the tick maths.

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
  `.../my-finance-frontend`, `.../my-finance-analytics`)
- a zip attached to the GitHub Release containing a compose file pinned to
  those image tags, a `.env` template, and `start.sh` / `start.bat` launcher
  scripts.

The point: a user who has never cloned the repo unzips the bundle anywhere on
their machine, runs the script, and gets the full stack. The scripts check
that Docker is installed (the one prerequisite), generate the `.env` secrets on
first run (database password, analytics role password, analytics service
token), run `docker compose up -d`, and print the URL.

One-time maintainer step: the first tagged release creates the three GHCR
packages **private** (that's GitHub's default for packages pushed with
`GITHUB_TOKEN`, regardless of repo visibility), so anonymous
`docker compose pull` from the bundle fails with "denied" until all three
packages are flipped to public in GitHub → Packages → package settings.
There is no supported way to do this from the workflow, and it applies again
to `my-finance-analytics` the first time a release includes it.
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

## 6. Analytics & Insights (Phase 4) and the local AI layer (Phase 5)

Designed in [`docs/INSIGHTS.md`](./docs/INSIGHTS.md) — the plan DSL, result
shapes, service contract, and testing strategy all live there; this section
records the architecture-level decisions.

### The Insight, and why analytics needs no AI

The central object is the **Insight**: a saved, profile-scoped question —
a name plus a versioned **query plan** (typed JSON: metric, filters,
groupBy, interval, range). Users author plans through an explorer UI whose
state is always visible as editable chips; common questions ship as a
parameterized template gallery; any answer can be saved and pinned as a
dashboard tile. A one-off exploration is just an unsaved Insight.

Every plan execution returns one of a **small, closed set of result
shapes** (single value, timeseries, categorical breakdown,
timeseries×split), so one universal explorer renders anything the DSL can
express, per currency, never mixed. Growing the analytics means growing the
DSL — never the renderer contract.

The AI layer is strictly optional because nothing depends on it: the entire
question → chart → save loop works with zero AI. This is a hard design
rule, since some self-hosting machines can't comfortably run a local model.

### Python analytics service

- `analytics/` (FastAPI) is a **pure plan executor**: plan in, typed results
  out. It holds the only Python↔DB credential — a **read-only Postgres
  role** (`SELECT` only, created by migration), so "analytics can't write"
  is a database guarantee in the same spirit as the composite FKs.
- **Internal-only.** No published port; nginx has no route to it. The
  backend authenticates the session, resolves the active profile
  server-side (the one place that ever happens), and forwards the profile
  id over the compose network with a static service token. The browser can
  never reach the analytics service, so profile scoping stays implemented
  exactly once.
- **Why a shared database instead of calling the backend's API:** simpler
  for this project's scale, and avoids adding network calls for what is
  fundamentally read-heavy reporting. The known tradeoff (shared-DB
  coupling between services) is accepted deliberately here, not by default.
- Simple aggregation the app already shows (dashboard KPIs, budget status)
  stays in the backend via JPA — the Python service owns the *plan-shaped*
  queries and, later, the genuinely analytical work (forecasts, anomalies,
  drift detection on pinned insights).

### Local AI layer (Ollama, Phase 5)

- The founding rule, refined from "narration-only": **the LLM never queries
  data and never does arithmetic.** It does exactly two jobs — translate a
  typed sentence into a *draft* plan (validated against the schema,
  rendered as editable chips, executed by the deterministic pipeline like
  any other plan), and narrate already-computed results it receives as
  structured numbers. A hallucination can produce a wrong sentence or a
  rejected plan — never a wrong number.
- Runs as an `ollama` container behind a Docker Compose profile
  (`--profile ai`) with a small local model (~2–4 GB, configurable). The
  frontend detects availability via a capabilities endpoint: with AI, the
  search window takes free text; without it, the same window offers
  templates and chips. No capability exists only behind the model. In the
  release bundle the profile is reached through `./start.sh --ai`
  (`start.bat --ai`), which is also what downloads the model on first run;
  the model lives in the `ollama-models` volume so restarts and image
  upgrades never re-download it.
- Deterministic testability is preserved: sentence → plan is golden-tested
  against fixtures, narration is asserted to reference only values present
  in its input, and none of the core pipeline's CI requires a model.

### Beyond: savings & investments tracking (Phase 6, designed, not started)

A separate backend-owned domain (activity ledger → derived positions) for a
buy-and-hold investor: market-priced ETFs/stocks with automatic daily
quotes, formula-valued Polish retail treasury bonds computed from their
letters of issue plus public CPI/NBP data, and manual-value assets — all
three flowing through one price-series table. Research findings and the
settled direction live in [`docs/INVESTMENTS.md`](./docs/INVESTMENTS.md);
concrete contracts get written when the phase starts, after Phases 4–5.

## 7. Explicit non-goals

- Multi-tenant SaaS hosting is not a goal — this is designed for individual
  self-hosting, not a shared cloud service.
- Horizontal scaling / high write throughput is not a design concern at this
  project's scale.
