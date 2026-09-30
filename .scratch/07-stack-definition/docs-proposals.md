# Candidate 7 — One stack definition: docs proposals

## (a) Proposed glossary terms

These are deployment terms rather than business-domain terms. They are what the owner, a
contributor and a self-hosting user already say (ARCHITECTURE §5 and both READMEs use "release
bundle" and "launcher"); the orchestrator may file them under a "Deployment" heading or drop them if the
glossary stays strictly business-domain.

**Stack definition**:
The one compose file that says which services make up a my-finance instance and how they connect. The
release bundle ships it; development includes it.
_Avoid_: release compose, prod compose, topology file, base compose

**Release bundle**:
The zip attached to each tagged release that a self-hosting user unzips and starts with a launcher: the
stack definition pinned to that release's images, the env template and the launchers.
_Avoid_: bundle zip, distribution, installer, package

**Development layer**:
What development adds to the stack definition: building the application images from source, and a
default for the one setting the release requires.
_Avoid_: dev override, dev compose, dev stack

**Launcher**:
The script in the release bundle (`start.sh` or `start.bat`) that prepares `.env` and starts the stack.
_Avoid_: start script, installer, wrapper

## (b) Proposed ADRs

None. The choice (one stack definition, `include` rather than `extends` / `-f` / `COMPOSE_FILE`, the
development layer attached through the include's `path` list) is surprising without context and the
result of a real trade-off, but it is easy to reverse (restore the old root file) and — more
decisively — ARCHITECTURE.md §5 is this repository's recorded decision for the compose stack. Per the
brief's repo rule, it is recorded by updating §5 (below), not in a separate ADR.

## (c) Required updates to recorded-decision documents

### 1. ARCHITECTURE.md §5 "Deployment, packaging, and CI/CD" → "Docker Compose stack" (lines 272–285)

Replace the opening sentence and the service list (274–281) with the text below; keep the paragraph
"`docker compose up` is enough…" (283–285), the nginx-proxy paragraph and the startup-ordering
paragraph as they are. The list below assumes candidate 13 has landed (no `redis`); if it has not, keep
the `redis` bullet until it does. It also fixes a pre-existing contradiction: today's list omits
`analytics`, which both compose files run.

> The stack is defined once, in `deploy/release/docker-compose.yml` — the compose file the release
> bundle ships. It defines:
> - `postgres` — the database, with a named volume so data survives restarts
> - `backend` — the Spring Boot app, whose image is built by a multi-stage `backend/Dockerfile`
>   (Maven build stage → slim JRE 21 runtime stage)
> - `analytics` — the plan executor (§6); it publishes no port and only the backend reaches it
> - `frontend` — the built React SPA served by **nginx** (`frontend/Dockerfile`), which also
>   **proxies `/api` to the backend**
>
> The root `docker-compose.yml` is the development entry point. It `include`s that file together with
> a development layer: `docker-compose.dev.yml` builds the three application images from source
> instead of pulling them from GHCR (it resets the inherited `image:` and adds `build:`, nothing else),
> and `docker-compose.dev.env` supplies the published development `ANALYTICS_TOKEN`, the one variable
> the release file requires rather than defaults (§6, `docs/INSIGHTS.md`). `docker compose up --build`
> at the root therefore still needs no flags and no `.env`; a `.env` or shell variable still overrides
> every default; `docker compose config` prints the merged stack. The development entry point needs
> Docker Compose 2.27 or newer; the release bundle has no such requirement.
>
> **Why one definition, and why `include`:** the two compose files used to be kept in step by hand
> (nine of the first twelve commits that touched one edited both). `extends` cannot share the release
> file here: Compose interpolates each file before merging, so the release file's required token fails
> any development run without a `.env` before an override could supply it. A second `-f` file or
> `COMPOSE_FILE` needs flags or a `.env`, takes the release file's project name and resolves build
> paths against `deploy/release/`. The development layer rides in the include entry's `path` list
> because redefining included services in the including file itself is accepted only from Compose 5.0,
> and CI's runner has 2.38.2.

Leave §2's "One `docker-compose.yml` at the root can wire up the whole stack" (line 44) — still true.
Leave "Release bundle" (303–328) — its "compose file pinned to those image tags" is still exact.

### 2. docs/INSIGHTS.md "The analytics service" → the "Internal-only" bullet (lines 370–384)

Replace the sentences at 374–384 ("Both sides default … without the launcher.") with:

> Both sides default to the same published dev token (`dev-analytics-token`) in development: the root
> `docker-compose.yml` supplies it through `docker-compose.dev.env`, which it includes alongside the
> stack definition, so `docker compose up` works with no setup — the port being unpublished and
> `hmac.compare_digest` on the check (C12) are what actually keep that harmless. The stack definition
> itself (`deploy/release/docker-compose.yml`, the file the release bundle ships) does not carry that
> fallback: `ANALYTICS_TOKEN` there is `${ANALYTICS_TOKEN:?...}`, so a deployment with no explicit token
> fails to start rather than silently shipping the well-known default. `start.sh`/`start.bat` always
> generate one into `.env` first, so this only bites someone who runs `docker compose` directly against
> that bundle without the launcher — or a developer who sets `ANALYTICS_TOKEN` to an empty value.

### 3. README.md

- "Project structure" (lines 41–50): describe `deploy/` as "the stack definition (the release compose
  file) and the release bundle's launchers", and `docker-compose.yml` as "development entry point:
  includes the stack definition and builds from source".
- "Run the whole stack (Docker Compose)" (lines 54–69):
  - Requirements: "Docker with the compose plugin, Compose 2.27 or newer (`docker compose version`)."
  - Replace "Optionally copy `.env.example` to `.env` first to set your own database password." with:
    "Optionally create a `.env` first to set your own database password: copy
    `deploy/release/.env.example`, which lists every setting (its notes about the launcher apply to the
    release bundle). The stack itself is defined in `deploy/release/docker-compose.yml`; the root
    `docker-compose.yml` includes it and builds the images from source — `docker compose config` shows
    the merged result."
- "Running the end-to-end tests" (184–198): unchanged.

### 4. Comments in the compose files (not recorded-decision documents; listed so the implementer has
the wording)

- Release compose file header (replaces lines 1–4; keep 6–9 about the project name):
  > The my-finance stack, defined once, here (ARCHITECTURE.md §5). The release bundle ships this file as
  > it is — the release workflow only pins the image tags to the released version — and the
  > repository's docker-compose.yml includes it, building the backend, analytics and frontend images
  > from source instead of pulling them. Only the frontend publishes a port: the backend is reached
  > exclusively through nginx's /api proxy, postgres only from the backend and analytics, and analytics
  > only from the backend (nginx has no route to it).
- Root `docker-compose.yml` header:
  > Development entry point (ARCHITECTURE.md §5). The stack is defined once, in
  > deploy/release/docker-compose.yml; this file includes it with the development layer —
  > docker-compose.dev.yml builds the three app images from source, docker-compose.dev.env supplies the
  > development ANALYTICS_TOKEN the release file requires. `docker compose up --build` and the app is at
  > http://localhost:3000; `docker compose config` shows the merged stack. Needs Docker Compose 2.27+.
- `docker-compose.dev.yml` header: not standalone (included by docker-compose.yml); only `build:` belongs
  here; `image: !reset null` because with both `image` and `build` Compose pulls the published image
  before building and would tag a local build with the published name.
- `docker-compose.dev.env` header: not a template (copy `deploy/release/.env.example` to change
  settings); a published development value, not a secret; `.env` and the shell win; an empty
  `ANALYTICS_TOKEN` stops the stack, as in the release.

### 5. docs/LESSONS.md (git-ignored) — entry draft

> ### Compose `include`: one stack definition, two entry points
>
> - **What** — the release compose file defines the stack; the root `docker-compose.yml` only
>   `include`s it, with a `path` list that adds a development layer (`!reset` the pulled `image`, add
>   `build:`) and an `env_file` that fills in the one variable the release file requires.
> - **Where** — `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.dev.env`,
>   `deploy/release/docker-compose.yml`.
> - **Why it's this way** — Compose interpolates each file *before* merging, so a `${VAR:?…}` in a
>   shared file fails before any override can supply a value; that rules out `extends`. An include
>   entry's `env_file` is the lowest-priority source of values — the shell and `.env` still win — so it
>   is the right place for a development default. The project name comes from the including folder,
>   not from an included file's `name:`, which is what keeps development and release volumes where they
>   were. Same family as "Compose overlay files merge, they don't replace" and "Compose readiness, `$$`
>   escaping, and volume identity".
