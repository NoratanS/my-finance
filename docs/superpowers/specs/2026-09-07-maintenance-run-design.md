# Repo-wide maintenance run — design

**Status:** approved in brainstorming 2026-09-07; implementation plan to follow.
**Scope owner:** one plan, executed unattended via `superpowers:subagent-driven-development`.

## 1. Purpose

Bring `my-finance` to production grade along four axes the user named: modern
libraries where they earn their place, good practice (SOLID / FIRST / REST /
DRY / KISS), user-visible gaps, and developer experience. The organising goal
is **long-term maintainability**, not shipping a feature.

Optimisation is explicitly **out of scope** (user decision). Nothing here is
performance work; where a change happens to remove an N+1 or a capped query,
that is a correctness fix, not an optimisation pass.

## 2. The reframe this design is built on

The user's instinct pointed at Python and named SQLAlchemy. The evidence points
the other way.

| Service | Lint | Unit tests | What CI actually proves |
|---|---|---|---|
| backend | none | 30 test classes | `mvn verify` — real |
| analytics | ruff (`E,F,I,UP,B`) | 27 test files | ruff + pytest on Testcontainers — real |
| **frontend** | **none — no ESLint config exists anywhere in the repo** | **zero** | **`tsc -b && vite build`. It compiles. Nothing more.** |

The five Playwright specs are a local-only step; `.github/workflows/ci.yml` has
no e2e job. So "CI verifies less than it appears" is precise and specific: on
the frontend, CI proves the TypeScript compiles.

**Analytics is the best-covered service in the repo.** Its library gaps are
small. The frontend has no safety net at all, and that is where the budget goes.

## 3. Findings — evidence gathered 2026-09-07

Gathered against a live compose stack seeded with 235 transactions, 3 budgets,
3 subscriptions and a 5-node category tree, driven headlessly through Chromium
with axe-core injected.

### G1 — Budgets are half-built at every layer
`BudgetController` exposes `POST`, `GET`, `GET /{id}/status` and nothing else.
`BudgetService` has only `create`. `Budgets.tsx` imports only `useBudgets` and
`useBudgetStatuses`. Measured in the browser, the Budgets screen renders **9
interactive controls, 6 of which are the nav bar** — it has no controls of its
own. A budget can be created only by curling the API, and can never be edited or
deleted at all. `frontend/e2e/smoke.spec.ts:36` calls its raw-`fetch` helper
"the budget-seed trick" — the test suite has the same problem.

### G2 — There is no responsive layout
`grep -rn "@media" frontend/src/` returns **nothing**. Not one media query.
The nav row (6 links + profile `<select>` + "Add transaction" + "Log out",
`Nav.tsx`, `gap: 22`, no wrap) pins every page to a ~1094px minimum. Measured:

| Viewport | Result |
|---|---|
| 1280px | all six screens OK |
| 820px (tablet) | all six overflow to 1094–1151px |
| 390px (phone) | all six overflow to 1094–1151px |

Every screen scrolls sideways on any device narrower than a laptop. One root
cause, one fix location, six screens fixed.

### G3 — The 200-row cap, in two places, both silently wrong
- `frontend/src/screens/Transactions.tsx:66` — the money tiles sum a *separate*
  `size: 200` query. Past 200 matching rows the KPI silently describes a subset
  while presenting as the total.
- Categories — each row shows a count (`43 txn`) computed from the same capped
  set. The **only** disclosure is a native `title` tooltip reading *"counted
  from the latest 200 transactions"*, which does not exist until the pointer
  lands on the element. This is the "text wouldn't show until I hovered" bug.

Both are wrong numbers in a finance app. The fix is server-side aggregation, not
a bigger cap.

### G4 — Transaction editing is implemented but unreachable
`PUT /api/transactions/{id}` exists, is tested, and has no UI. Rows offer only
"Delete transaction". To correct a typo you delete and re-enter.

### G5 — Category rename and delete are unreachable
`PATCH /api/categories/{id}` and `DELETE /api/categories/{id}` exist. The UI
offers create and colour-change only.

### G6 — Profiles are create-only
No rename, no delete, at either layer.

### G7 — Deep links lose their destination
Visiting `/budgets` without an active profile in the browser session redirects
to `/picker`; after picking, you land on `/`, not `/budgets`.

### G8 — REST inconsistency
`categories` updates via `PATCH`; `transactions`, `subscriptions` and `insights`
all use `PUT`. One resource disagrees with its siblings.

### G9 — Transaction search is page-local
`Transactions.tsx` filters client-side over the loaded page only, with the
comment "the API has no search". Searching for a merchant that sits on page 3
returns nothing while you are on page 1.

### G10 — The e2e suite cannot run against the compose stack
`playwright.config.ts` points the Vite dev proxy at `localhost:8080`, but
`docker-compose.yml` publishes only the nginx frontend on `3000`; the backend's
8080 is container-internal. Running the suite against a running stack therefore
fails 7/7 with connection errors that look like product bugs. Publishing 8080
makes the same suite pass 7/7. The repo needs a documented, committed way to do
this — it is a prerequisite for putting e2e in CI (M0).

### Not a finding — contrast
axe-core (WCAG 2.0/2.1 A + AA) reports **zero violations** on all six screens.
An earlier hand-rolled contrast probe suggested failures; that probe was wrong
(it parsed `color(srgb 0.92 …)` floats as 0–255 values) and its output is
discarded. No contrast work is planned.

## 4. Library decisions

Criterion, applied to every candidate: **does this remove a class of bug, or
delete code we would otherwise maintain?** "Modern" alone does not qualify.
Versions resolved from npm / PyPI / Maven Central on 2026-09-07.

### Adopt — frontend
| Library | Version | What it buys |
|---|---|---|
| `vitest` + `@vitest/coverage-v8` | 5.0.0 | Unit runner reusing the existing Vite config. Fills the repo's biggest hole. Requires Node >=22.12, which the Node 24 upgrade below provides. |
| `@testing-library/react` / `user-event` / `jest-dom` | 16.3.3 / 14.6.7 / 7.0.1 | Component tests that assert what the user sees. |
| `jsdom` | 30.0.1 | DOM environment. Pulls `undici@8`, which needs Node >=22.19 — again supplied by the Node 24 upgrade. |
| `msw` | 2.15.0 | Mocks at the network layer, so hooks are tested through real `fetch` rather than a stubbed module. |
| `eslint` + `@eslint/js` + `typescript-eslint` + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh` + `globals` | 10.10.0 / **10.0.1** / 8.69.0 / 7.1.1 / 0.5.6 / 17.12.0 | There is no linter today. `react-hooks` alone catches the dependency-array class of bug nothing currently catches. |
| `prettier` | 3.9.6 | Configures the formatter, retiring the standing "never run an unconfigured formatter" hazard by removing its cause. |
| `react-hook-form` + `zod` + `@hookform/resolvers` | 7.87.0 / 4.5.4 / 5.9.1 | The budget CRUD forms (G1), then reused for the existing hand-rolled forms. |
| `@axe-core/playwright` | 4.13.0 | Turns the a11y sweep run once during this design into a permanent CI gate. |
| `openapi-typescript` | 7.13.0 | Generates `frontend/src/api/types.ts` from the backend's OpenAPI. Backend/frontend type drift becomes a CI failure instead of a runtime surprise. |

### Adopt — backend
| Library | Version | What it buys |
|---|---|---|
| `springdoc-openapi-starter-webmvc-ui` | 3.1.1 | OpenAPI 3.1 + Swagger UI. springdoc 3.x is the Spring Boot 4 line (their compatibility matrix); the repo is on Boot 4.1.0. Feeds the codegen above. |
| `spotless-maven-plugin` + `palantir-java-format` | 3.10.2 / 2.97.0 | Formatting, checked in CI. |
| `jacoco-maven-plugin` | 0.8.15 | Coverage becomes visible rather than assumed. |
| `archunit-junit5` | 1.5.0 | Mechanically enforces layering — controllers never touch repositories, etc. **Note:** ArchUnit enforces *structure*, not the semantic "every query is profile-scoped". That boundary stays a review concern. |

### Adopt — analytics
| Library | Version | What it buys |
|---|---|---|
| `pydantic-settings` | 2.15.0 | Replaces the hand-rolled `config.py`. Must preserve the `Settings(database_url=…, analytics_token=…, tz=…)` constructor shape — `tests/test_db.py` depends on it, as `config.py`'s own comment warns. |
| `mypy` | 2.3.1 | Type checking (dev group). |
| `ruff format` | already present | Formatting from a tool already in the toolchain and in CI. |

### Adopt — repo
`lefthook` 2.1.12 (pre-commit format + lint on staged files), `.editorconfig`,
`.git-blame-ignore-revs`, and a Dependabot config.

### Reject, with evidence
- **SQLAlchemy** (user-named). `analytics/src/analytics/sql.py` already binds
  every user-supplied value through psycopg's `%(name)s` parameters —
  `profile_id`, dates, `currency`, `merchants`, `category_id`. The only
  f-string interpolation is `_BUCKET_EXPRESSIONS`, built from the module's own
  `INTERVALS` constant and reached through a dict keyed by an already-validated
  enum, deliberately, so the module "fails closed on its own". **There is no
  injection surface to close.** The query is recursive CTEs +
  `FILTER (WHERE …)` + `::numeric(19,4)` casts, which SQLAlchemy Core expresses
  as `text()` fragments anyway — the same strings wrapped in an engine
  lifecycle, at the cost of rewriting the golden tests that pin the SQL's
  semantics. The service is read-only and issues one query; there is no CRUD
  for an ORM to earn.
- **Pydantic for the plan DSL.** `docs/API.md` pins the exact problem-string
  contract, and `validate_plan` performs a DB-backed category check that takes
  a live `conn` — neither maps onto Pydantic cleanly. **However**, `plan.py`'s
  docstring justifies the choice with a false claim ("Pydantic's fail-fast
  exceptions would collapse that list"); Pydantic v2's `ValidationError.errors()`
  returns every error. Per CLAUDE.md the wrong doc gets corrected in this run
  even though the migration is declined.
- **pandas / numpy.** `postprocess.py` computes median/MAD over small result
  sets. A large dependency for arithmetic already written and tested.
- **Lombok / MapStruct.** Java 21 records plus explicit mapping is the
  idiomatic, readable choice; there is no boilerplate mass to delete.
- **TanStack Table.** The lists are simple; it would add more code than it removes.
- **The `QUERY` HTTP method** (user-raised earlier). Still an IETF draft with no
  support in Spring MVC 7, `fetch`, or nginx. G9's search is a `GET` with a `q`
  parameter, which is what the rest of the API already does.

### Adopt: Node 20 -> 24 (the run's first task)
Node 20 was holding the whole toolchain back. It is upgraded to **24.20.0**,
the current Latest LTS ("Krypton"), as Task 0 — before anything else.

This was initially deferred as too risky for an unattended run. That was wrong,
and the check is cheap: `nvm` is already installed, so the upgrade is
**user-space, needs no sudo, and rolls back with one command**. The version is
pinned in exactly three places — nvm locally, `node-version` in `ci.yml`, and
`FROM node:20-alpine` in `frontend/Dockerfile`.

Verified on Node 24.20.0 / npm 11.19.0 before this spec was amended:
- the existing repo `npm ci` + `npm run build` clean;
- the existing Playwright suite **7/7 passing**;
- vitest 5.0.0 + jsdom 30.0.1 + RTL + msw **2/2 passing**, no engine warnings.

A `.nvmrc` pinning `24` is added so the runtime is recorded in the repo rather
than in one machine's shell.

## 5. Phases

One plan, executed in order. Each phase is independently mergeable and leaves
the suite green.

**M0 — Verification.** Vitest + RTL + MSW harness with first real component
tests; ESLint flat config; Prettier / Spotless / `ruff format` plus one
whole-repo reformat commit recorded in `.git-blame-ignore-revs`; lefthook;
JaCoCo; e2e + axe added to CI. Behaviour does not change.

**M1 — Gaps.** G1–G9 above: budget CRUD end-to-end, responsive layout, the
200-cap replaced by server-side aggregates, the unreachable edit/delete paths,
deep-link destination, the REST inconsistency, and search.

**M2 — Structure.** SOLID/DRY/KISS pass. Split `api/hooks.ts` (510 lines, 35
hooks spanning every domain), `Insights.tsx` (528), `Subscriptions.tsx` (488),
`narrate.py` (516). **Harness-gated** (user decision): a file is refactored only
if it has test coverage written earlier in this run; anything without a net is
reported, not touched.

**M3 — Libraries.** springdoc + `openapi-typescript` codegen; pydantic-settings;
mypy; ArchUnit rules; Dependabot; the `plan.py` docstring correction.

## 6. Global constraints

- **All work stays local.** Never push, no PRs, no `gh`. The run ends on a
  branch for review; merging is the user's call.
- Commit trailers: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
  and `Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD`.
- **Never create a database on the host.** Testcontainers or the repo's
  `docker compose`; tear down what you start. `docker compose down -v` is
  **project-scoped, not service-scoped** — it has destroyed the dev volume
  twice. Never pass `-v`.
- `docs/LESSONS.md` is gitignored: write entries, never `git add` it.
- Do not run a formatter the repo does not configure. From the M0 formatter task
  onward the three formatters *are* configured; before it, none may be run.
- **`frontend/src/styles.css` is not to be modified.** It is the design-system
  file and the repo convention is that app CSS is confined to `app.css`. All
  responsive work (G2) goes in `app.css`, which can override `.nav` and the
  layout containers without touching the design system. `styles.css` must also
  never be re-synced from `docs/design/styles.css` — they differ by a Google
  Fonts `@import` deliberately disabled in Phase 3, and re-syncing breaks font
  loading.
- Read Maven's own `Results:` aggregate for test counts, never a sum of
  `target/surefire-reports/*.xml` (it accumulates stale files).
- Throwaway probe classes go in the scratchpad, never `src/test`.
- `docs/SCHEMA.md` and `docs/API.md` are binding: no column, endpoint or error
  shape may contradict them. New endpoints (budget `PUT`/`DELETE`, aggregates,
  search) update `docs/API.md` in the same task.

## 7. Verification strategy

Every phase ends green on: `cd backend && ./mvnw -B verify`,
`cd analytics && uv run --locked ruff check . && uv run --locked pytest -q`,
`cd frontend && npm run lint && npm run test && npm run build`, and — from M0
onward — the Playwright e2e suite including the axe gate and a viewport
regression test asserting no horizontal overflow at 390px and 820px.

The 235-transaction seed used for this design is the fixture shape the G3
aggregate tests need: any assertion about totals must exercise more than 200
rows, or it cannot fail.

**The frontend toolchain was proven before planning, not assumed.** In a
scratch project the full adopted set was installed together (384 packages, no
resolution errors) and then exercised: a React component rendered through RTL,
clicked through `user-event`, and a `fetch` intercepted by msw — 2/2 passing on
Node 20. ESLint's flat config was run against a file with three planted defects
and reported all three, including `react-hooks/exhaustive-deps`. The working
`vitest.config.ts` and `eslint.config.js` from that pre-flight are the
configurations the plan installs.

## 8. Risks

- **M1's aggregate endpoints are new API surface.** They must be designed
  against `docs/API.md` conventions and profile-scoped server-side; a new
  endpoint that trusts a client-supplied profile is a security regression.
- **The reformat commit touches every file.** It lands alone, with no logic
  change, and is added to `.git-blame-ignore-revs` in the same commit.
- **M2 is the riskiest work to run unattended.** Harness-gating is the control:
  no test coverage, no refactor.
- **openapi-typescript changes the frontend build.** Generated types are checked
  in, so a stale regeneration is a reviewable diff rather than a silent drift.
