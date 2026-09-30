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
├── docs/        architecture notes, API and schema design, the committed OpenAPI document
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
Flyway, ArchUnit (structural tests).

**Package layout** (package-by-layer, standard for a project this size):

```
com.myfinance
├── controller/   REST endpoints
├── service/      business logic
├── repository/   Spring Data JPA interfaces
├── model/        @Entity classes
├── dto/          request/response records (a response built from an entity has a static from(entity) factory)
├── config/       security filter chain, Jackson customization
├── security/     principal (UserDetails), current user, session-held active profile, CSRF cookie filter
└── exception/    custom exceptions + global handler (RFC 9457 Problem Details)
```

**One mapping idiom: `from()` factories.** Every response DTO built from an
entity is a record with a static `from(entity)` factory that calls the record's
canonical constructor, and services call it inside their transactions (some
entity associations are lazy and open-in-view is off). The canonical
constructor is the compile-time check:
add a component to a response record and its factory stops compiling until it
supplies a value. The remaining risk of a positional call — two same-typed
arguments swapped — is caught by the controller tests, which assert each field
with distinct values. MapStruct generated `TransactionResponse`'s mapping from
2026-09-08 until 2026-09-30: at its default `unmappedTargetPolicy` a missing
target field is only a compiler warning (and a `null` on the wire), so it was a
weaker check than the constructor it replaced, at the cost of a dependency, an
annotation processor and a package for one method.

**Structural tests (ArchUnit):** the package layout above is enforced, not
merely documented — `ArchitectureTest` asserts the layer order, that
controllers never reach a repository directly (every read goes through a
service, which is where profile scoping lives), that `@Entity` classes never
appear in a controller signature, that no service depends on servlet types
(the request- and session-facing code — the active profile, binding a login to
the session — lives in `security/`), and that no class imports Jackson 2
databind. These are the rules a reviewer would otherwise have to catch by
eye, and they fail the same `./mvnw verify` as any other test. Their limit is
that they see imports only: a Jackson 2 component that Spring auto-detects
and registers without any app class importing it is invisible to them, which
is why the converter chain has its own assertion in `HttpMessageConverterTest`.

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
- Sessions are stored in **Redis** (`spring-boot-starter-session-data-redis`),
  not servlet-container memory — `HttpSessionSecurityContextRepository` is
  unchanged, but `request.getSession()` is transparently backed by Redis once
  Spring Session is on the classpath. A self-hosted update is `docker compose
  up -d --build`, which restarts the backend container; with sessions held
  only in that process's memory, every such update logged every user out.
  Redis also makes running a second backend instance viable, since both would
  share one session store. The default serializer is JDK serialization (not
  Jackson — see "OpenAPI document and the Jackson 2/3 split" below for why that
  distinction matters elsewhere), so every type placed on the session
  (`AppUserDetails`, the active-profile id) must implement `Serializable`.
- All domain entities (transactions, categories, budgets) are associated
  with a `profile_id`, and repository queries are always scoped to the
  active profile — this is enforced at the service layer, not left to the
  frontend to respect. The services get the active profile from one module,
  `ActiveProfile` (`security/`), which re-verifies on every request that the
  stored profile still exists and belongs to the authenticated user, hands out
  the verified `Profile` (as the owner of a new row, and row-locked for
  category-tree changes), owns the profile switch, and treats a profile deleted
  from another session as "no active profile".
- **Passwordless mode.** `MYFINANCE_AUTH_MODE=none` (default `password`) turns a
  self-hosted instance into a single-user one with no login screen:
  `PasswordlessAutoLoginFilter` authenticates every request as one local account
  — no users means create `local@localhost`, exactly one means adopt it, more
  than one refuses to start rather than guess whose data to serve. Startup
  applies that rule once before serving, so an ambiguous database stops the
  instance at boot; the filter applies it again on every request that carries no
  logged-in session (a one-row lookup), so the principal always matches the
  account row as it is now. It is deliberately a filter producing the *ordinary*
  principal, so
  sessions, Redis, CSRF and the profile scoping above are unchanged and keep
  running the code paths that were already in production. `register` and `login`
  answer `404` in this mode, which is what keeps "exactly one account" true at
  runtime rather than only at boot. These mode rules — and their mirror,
  `PUT /api/auth/password`, which exists only in this mode so the local account
  can get a password before a switch-back — live in `AuthService`, each as the
  first statement of the method it guards, together with the login sequence;
  `AuthController` only binds and delegates. The mode removes authentication, not
  authorization: it must not be exposed beyond localhost, and the backend logs a
  `WARN` at every startup saying so. That warning is all the backend can do: it
  cannot see how its port is published on the host, so the loopback binding is
  enforced one layer out. The launchers write `MYFINANCE_BIND_ADDRESS=127.0.0.1`
  together with `none`, and compose publishes the frontend on that address. A
  bare `docker compose up` with `none` but no bind address still listens on every
  interface — compose cannot default one variable from another — which is why the
  docs say to set both, and why the launchers warn when they don't match.

### Subscriptions and the charge job

Recurring charges (`subscription` table) are turned into ordinary transactions by a
daily `@Scheduled` job (`SubscriptionChargeService`, one transaction per subscription,
idempotent by construction — see `docs/SCHEMA.md` "Charge posting"). The dashboard
endpoint returns server-computed, per-currency aggregates so no client re-derives
money math.

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

### OpenAPI document and the Jackson 2/3 split

springdoc (`org.springdoc:springdoc-openapi-starter-webmvc-ui`) serves the
OpenAPI document at `/v3/api-docs` and Swagger UI at `/swagger-ui.html`
(`OpenApiConfig`). The document is committed as `docs/openapi.json` and is
the checked statement of the API's request and response shapes:
`OpenApiDocumentTest` fetches the served document through MockMvc and fails
`./mvnw verify` when it differs from the committed copy, and the frontend
generates `frontend/src/api/schema.d.ts` from that copy
(`npm run generate:types`, no running backend needed), with
`npm run check:types` failing CI when the generated file is stale. A
wire-contract change therefore cannot land without appearing as a diff of
both files. springdoc writes the document with sorted keys and a fixed
relative server, so that diff contains only the change. Status codes and
error shapes are not taken from the document; `docs/API.md` stays
authoritative for them. springdoc
introspects DTOs through its own Jackson **2** pass (`jackson-databind`,
package `com.fasterxml.jackson.databind`), which is blind to the app's
Jackson **3** `STRING`-shape customizer for `BigDecimal` (`JacksonConfig`,
package `tools.jackson.databind`) — left alone, every money field would be
schema'd as `type: number` even though the wire format is a decimal string.
`OpenApiConfig` corrects this once, for every field: it registers `BigDecimal`
with springdoc as `{type: string, format: decimal}`
(`SpringDocUtils.replaceWithSchema`), and `OpenApiDocumentTest` fails if any
property in the document is a bare `number`; `ArchitectureTest`
additionally bans any `com.fasterxml.jackson.databind..` import from
`backend/src/main`, since that package's `ObjectMapper` would carry none of
`JacksonConfig`'s rules, including the strict deserializer that rejects money
sent as a JSON number.

The same registration documents Jackson 3 `JsonNode` values — an insight's
`plan` and `viz`, and both bodies of `POST /api/insights/execute` — as
free-form JSON objects. Their structure belongs to the plan executor
(`docs/INSIGHTS.md`); the backend only checks that a plan is an object. That
is why the frontend's Plan and result-shape types are written by hand rather
than generated.

In the document every property of a success-response body is **required** —
Jackson writes every record component, `null`s included, so a response field
is always present — and a field that can be `null` says so with
`@Schema(nullable = true)`. One `OpenApiCustomizer` in `OpenApiConfig`
applies this to every schema reachable from a 2xx response, so no response
record carries a "required" annotation; request schemas keep the required
list Bean Validation gives them, because an absent request field is
legitimate (the category `PATCH` depends on it). Two consequences: a record
must not serve both as a request body and inside a response body, and
configuring Jackson to omit `null`s would make the document untrue. The
frontend's request and response types (`frontend/src/api/types.ts`) are
aliases of the generated ones and carry the backend record names; only the
Plan DSL and result shapes, and the transaction list's query parameters, are
written by hand.

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
Storybook catalogues the reusable presentational primitives.

The frontend talks only to the Spring Boot backend's REST API. It has no
direct database access and no business logic beyond presentation and form
handling — validation rules live server-side (Bean Validation) and are
mirrored client-side only for UX, never as the source of truth.
A failed request becomes user-facing text in one module in the API layer,
next to the client that parses the Problem: validation messages go under the
fields a screen shows, everything else is one message where the action
happened, and a lint rule keeps screens from reading the error object
directly — the frontend's small counterpart to the backend's ArchUnit rules.

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
gzipped and a d3 transitive tree in a frontend whose only other runtime
dependencies are React, React Router and TanStack Query. Rejected: hand-rolled SVG — scales, tick selection,
hover hit-testing and responsive `viewBox` maths across four renderers is
the largest single chunk of Phase 4's frontend work, for no user-visible
gain — and visx, which is the same assembly effort minus the tick maths.

**Why Storybook, scoped to primitives only:** the presentational components
(`Card`, `ProgressBar`, `CategoryDot`, the insight `chips/`) have states that
are awkward to reach in the running app — a progress bar over budget, a
category with no colour set — and reviewing them means clicking through the
SPA to construct the data. Stories render each state directly. Whole screens
are excluded on purpose: they need the router and the query client, so their
stories would duplicate app wiring and break whenever it changes. The static
build (`npm run build-storybook`) is also the portfolio artifact — a
self-contained site that can be published without standing up the stack.

**Why plain form state, no form library:** every form is a component that keeps its fields in
React state and submits through a real `<form>` — Enter submits, only the submit button submits,
the form's own checks run first, and a failed request comes back through the one module that
turns a Problem into messages. `react-hook-form` and `zod` were adopted for the budget form in
the 2026-09 maintenance run and removed once no other form had followed them: with validation
owned by the server (see above), a form library and a schema library bought one form a second
idiom and three runtime dependencies. Converting an entered amount to a Money amount — a comma or
a dot accepted, a dot always sent, at most four decimals — lives in the money module next to
amount formatting.

## 5. Deployment, packaging, and CI/CD (Phase 3)

### Docker Compose stack

A single `docker-compose.yml` at the repo root defines:
- `postgres` — the database, with a named volume so data survives restarts
- `redis` — HTTP session storage (see "Profiles and authentication" above),
  also with a named volume so logins survive a restart, not just a request
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
check, and the backend exposes Spring Boot Actuator's `/actuator/health`,
permitted anonymously (it reveals liveness, not data), so compose can gate
the frontend on a genuinely ready API. Actuator lives on its own management
port (`8081`, `management.server.port` in `application.properties`), never
published to the host by any compose file; only `health` and `info` are
exposed. There is no metrics stack: a Prometheus/Grafana profile existed and
was removed on 2026-09-22 as out of proportion for a single-user instance.

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
token), ask for the sign-in mode when `.env` doesn't set one yet (see
"Passwordless mode" in §3), run `docker compose up -d`, and print the URL.

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

- **CI** on pull requests and pushes to `dev`/`main`, four parallel jobs:
  - *backend* — `./mvnw -B verify`: unit, integration (real Postgres via
    Testcontainers, using the runner's own Docker daemon) and ArchUnit tests —
    among them `OpenApiDocumentTest`, which fails when the committed OpenAPI
    document (`docs/openapi.json`) no longer matches what the code serves —
    plus Spotless formatting, which is bound to the `verify` phase rather than
    run as a separate step.
  - *frontend* — ESLint, Prettier `--check`, the generated-types check
    (`npm run check:types`: `schema.d.ts` regenerated from `docs/openapi.json`
    must equal the committed file), vitest, the production build, and the
    Storybook build.
  - *analytics* — `ruff check`, `ruff format --check`, mypy, and pytest (which
    also starts Postgres via testcontainers-python and applies the backend's
    own Flyway migrations, so the SQL is exercised against the real schema, and
    proves against the real route the recorded exchanges that the backend's
    tests replay; see `docs/INSIGHTS.md` → "Testing strategy").
  - *e2e* — brings the stack up with the e2e compose overlay, waits for the
    backend, and runs Playwright against it.
- **Release** on a `v*` tag: build and push both images to GHCR, assemble the
  release bundle, create the GitHub Release with the zip attached.

Every formatter is gated in CI, so formatting cannot drift for a contributor
who never installed the pre-commit hook.

CI runs the same commands a developer runs locally — no CI-only build path
to drift out of sync.

## 6. Analytics & Insights (Phase 4)

Designed in [`docs/INSIGHTS.md`](./docs/INSIGHTS.md) — the plan DSL, result
shapes, service contract, and testing strategy all live there; this section
records the architecture-level decisions.

### The Insight

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

### Local AI layer (removed)

Phase 5 added an optional Ollama container that turned typed sentences into
draft plans and captioned results. It was removed on 2026-09-22: for a
single-user instance it was a multi-gigabyte model and a second failure mode
in exchange for skipping a few chip clicks. The last version with it is
commit `3d00643` (git tag `pre-cleanup`).

### Beyond: savings & investments tracking (Phase 6, designed, not started)

A separate backend-owned domain (activity ledger → derived positions) for a
buy-and-hold investor: market-priced ETFs/stocks with automatic daily
quotes, formula-valued Polish retail treasury bonds computed from their
letters of issue plus public CPI/NBP data, and manual-value assets — all
three flowing through one price-series table. Research findings and the
settled direction live in [`docs/INVESTMENTS.md`](./docs/INVESTMENTS.md);
concrete contracts get written when the phase starts.

## 7. Explicit non-goals

- Multi-tenant SaaS hosting is not a goal — this is designed for individual
  self-hosting, not a shared cloud service.
- Horizontal scaling / high write throughput is not a design concern at this
  project's scale.
