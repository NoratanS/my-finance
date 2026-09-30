# Candidate 7 — One stack definition: grilling log

## Scope, sources and how facts were obtained

- Repository read at `c3e20c5` (a `-s ours` merge of `main` into `dev`; `git diff --stat 4545810 c3e20c5`
  is empty, so every line number below also holds for the brief's `4545810`). Read-only throughout:
  nothing in the repository was created, edited, built, tested or started.
- Docker Compose behaviour was checked two ways, and the log always says which:
  - **Verified on Compose v5.1.3** (the local `docker compose version`): `docker compose config` only —
    it parses and prints the resolved model and starts nothing. Experimental compose files were fed
    through stdin or kept in a scratch folder inside this output directory (removed before hand-back),
    never in the repository. Each experiment is listed as E1–E14 below so a reviewer can rerun it.
  - **Reasoned from source for Compose 2.38.2** — the version GitHub's `ubuntu-latest` runner ships,
    which no local binary could run: the compose-go library at the exact tag that release bundles,
    read from GitHub. Runtime-unverified until the implementing PR's first CI run.
- Spring/Java are not involved in this candidate.

### The experiments (all `docker compose config`, parse-only)

| # | Input | Result |
|---|---|---|
| E1 | root `docker-compose.yml` as is | project `my-finance` (from the folder name), volumes `my-finance_postgres-data`, `my-finance_redis-data`; backend/analytics/frontend have `build`, no `image` |
| E2 | release file standalone, no `ANALYTICS_TOKEN` | error `required variable ANALYTICS_TOKEN is missing a value: …`; with the token set: project `my-finance`, images `ghcr.io/noratans/my-finance-*:latest` |
| E3 | a root file with `include: [deploy/release/docker-compose.yml]`, no token | the same `:?` error — the included file is interpolated before anything else can supply the value |
| E4 | E3 plus a local `services.backend.build` in the including file (token set) | v5.1.3 **merges** silently: backend ends up with the GHCR `image` *and* `build`; no warning on stderr |
| E5 | E4 with `image: !reset null` | the inherited `image` is removed; only `build` remains |
| E6 | `extends: {file: deploy/release/docker-compose.yml, service: …}` per service | `depends_on`, healthcheck, env and service volumes are copied; the GHCR `image` is inherited next to `build`; without a token it fails **even when extending only `postgres`** (the whole base file is interpolated); top-level volumes are not imported (`service "postgres" refers to undefined volume postgres-data`) |
| E7 | E3 run from a folder named `07-stack-definition` | project `07-stack-definition`, volumes `07-stack-definition_*` — an included file's `name:` is ignored |
| E8 | `-f deploy/release/docker-compose.yml -f <overlay with build: ./backend>` | project `my-finance` (the release file's `name:`), and `./backend` resolves to `deploy/release/backend` (relative paths follow the first file's folder) |
| E9 | include + a `.env` next to the including file (`POSTGRES_DB=fromrootenv`) | the including project's `.env` **does** interpolate the included file; shell variables too |
| E10 | include entry with `env_file: dev-defaults.env` (`ANALYTICS_TOKEN=dev-analytics-token`, `POSTGRES_DB=fromdevdefaults`) | (A) with a root `.env`: the root `.env` wins; (B) shell beats both; (C) `env_file: [dev-defaults.env, .env]` works while `.env` exists; (D) the same list with no `.env` → error `stat …/.env: no such file or directory`; (E) single `env_file`, no root `.env` → the dev defaults apply |
| E11 | the proposed design (below) with absolute paths | images reset, build contexts at the repository folders, token = dev default, and `-f … -f docker-compose.e2e.yml` still adds `8080:8080` to backend |
| E12 | **mirror comparison**: a folder named `my-finance` holding symlinks to the repository's `deploy`, `backend`, `analytics`, `frontend`, `docker-compose.e2e.yml`, plus the proposed root `docker-compose.yml`, `docker-compose.dev.yml` and `docker-compose.dev.env`; `docker compose config --format json` there vs in the real repository, with the folder prefix normalised | **identical** in all three cases: (1) no `.env`, no shell variables; (2) shell `MYFINANCE_AUTH_MODE=none MYFINANCE_BIND_ADDRESS=127.0.0.1 POSTGRES_PASSWORD=s3cret ANALYTICS_TOKEN=tok DB_ANALYTICS_PASSWORD=ro`; (3) with the e2e overlay |
| E13 | the proposed design, stderr and `config --images` | no warnings; dev images are named `my-finance-backend`, `my-finance-analytics`, `my-finance-frontend` (project-derived, as today) |
| E14 | `ANALYTICS_TOKEN=` (set but empty) | today's root file → `dev-analytics-token`; the proposed design → the release file's C12 error |

The proposed design used in E11–E14 (shown here because a reviewer reruns it; the spec itself stays
free of file contents):

```yaml
# root docker-compose.yml
include:
  - path:
      - deploy/release/docker-compose.yml
      - docker-compose.dev.yml
    project_directory: .
    env_file: docker-compose.dev.env
```

```yaml
# docker-compose.dev.yml
services:
  backend:
    image: !reset null
    build: ./backend
  analytics:
    image: !reset null
    build: ./analytics
  frontend:
    image: !reset null
    build: ./frontend
```

```
# docker-compose.dev.env
ANALYTICS_TOKEN=dev-analytics-token
```

### Design tree

```
Q1 constraints ──┬── Q2 mechanism ── Q4 how the dev layer attaches ──┬── Q5 build next to image
                 │                                                    ├── Q6 relative paths
                 │                                                    └── Q9 the dev-defaults file
                 ├── Q3 which file is the source ── Q7 project name / volume identity
                 ├── Q8 the token rule ── Q14 empty-token edge
                 ├── Q10 env templates
                 ├── Q11 proof of sameness ── Q12 e2e overlay + CI ── Q13 release workflow + bundle
                 ├── Q15 minimum Compose version ── Q16 recreate on switch ── Q17 where comments live
                 └── Q18 dependency category / seams ── Q19 tests ── Q20 edge cases
                         ── Q21 order vs 13 ── Q22 steps ── Q23 docs ── Q24 siblings ── Q25 lesson
```

---

## Round 1 — frontier: questions with no open prerequisite

❓ **Q1** - **Constraints the design must not break**: what is fixed before any mechanism is chosen?

🔎 Facts:
- The release bundle is exactly `deploy/release/.` zipped: `.github/workflows/release.yml:55–59`
  (`cp -r deploy/release/. "$staging"`, `sed … "$staging/docker-compose.yml"`, `zip -r`). The launchers
  run plain `docker compose pull` and `docker compose up -d --remove-orphans` in that folder with no `-f`
  (`deploy/release/start.sh:107,117`; `start.bat:57,68`). So the bundle's compose file must stay one
  standalone file named `docker-compose.yml`.
- `release.yml:57` rewrites tags with `sed "s|\(my-finance-[a-z]*\):latest|\1:$VERSION|g"` — it relies
  on the three `ghcr.io/noratans/my-finance-*:latest` lines in the release file
  (`deploy/release/docker-compose.yml:39,90,121`).
- Development: README "Run the whole stack" is `docker compose up --build` with no flags
  (`README.md:58–62`); `.env` is optional ("Every variable has a working default in docker-compose.yml",
  `.env.example:1–3`; `README.md:64–66`).
- e2e: CI runs `docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build`
  (`.github/workflows/ci.yml:62`) and later `docker compose logs backend` / `docker compose logs …`
  with no `-f` (`ci.yml:70,75`); README documents the same overlay command without `--build`
  (`README.md:191`).
- Volume identity: the release file pins `name: my-finance` so an upgrade into a differently named
  folder keeps `my-finance_postgres-data` (`deploy/release/docker-compose.yml:6–9`); both launchers
  refuse to generate secrets when that volume exists without a `.env` (`start.sh:54–60`,
  `start.bat:25–33`). The development project name comes from the clone's folder (E1).
- C12, a recorded decision: "make the deployment path require an explicit `ANALYTICS_TOKEN` rather
  than silently falling back to the public default … Keep the dev default working for local runs"
  (`docs/superpowers/plans/2026-09-07-maintenance-run.md:1395`; implemented in `8d67e8f`; described in
  `docs/INSIGHTS.md:370–384` and the release file's comments at `:53–56,96–99`).
- CI's Docker Compose is **2.38.2** (GitHub `actions/runner-images`, `images/ubuntu/Ubuntu2404-Readme.md`
  image 20260920.314.1, line 75; the 22.04 image lists the same version).
- Project rules: idiomatic and conventional over clever; simplicity first; CI runs the commands a
  developer runs (`ARCHITECTURE.md:363–364`).

➡️ The design must keep: (C1) a standalone release compose file, byte-for-byte the same stack as
today, still rewritten by the same `sed`; (C2) `docker compose up --build` at the root with no flags
and no `.env`; (C3) the e2e command and the flag-less `logs` calls; (C4) the release project name
`my-finance` and the development project name (folder-derived) — both carry data volumes; (C5) C12:
required token in the release path, working dev default locally; (C6) work on Compose 2.38.2 in CI.

⚖️ Strongest argument against: C2's "no `.env`" is stricter than the card's "without flags"; relaxing
it would allow simpler mechanisms (Q2).

✅ Decision: C1–C6 stand, including "no `.env` needed": the README and the root template both promise
it, and silently making `.env` mandatory would break every fresh clone. Unblocks Q2, Q3, Q8.

---

❓ **Q2** - **The mechanism**: how can one compose source define the stack? Options: (a) `extends`
with `file:` per service; (b) top-level `include`; (c) a second file merged with `-f`; (d)
`COMPOSE_FILE` in `.env`. For each: flag-less root `up`, standalone release file, `depends_on`,
`build` next to `image`, relative paths.

🔎 Facts:
- (a) `extends` (E6): copies `depends_on`, healthchecks, environment and service volumes; the
  extending file must redeclare top-level volumes; the inherited GHCR `image` sits next to the local
  `build`; relative paths in the base resolve against the base file. Fatal here: extending *any*
  service interpolates the whole release file, so its `${ANALYTICS_TOKEN:?…}` fails a `.env`-less dev
  run before any override can supply a value (E6; per-file interpolation is in compose-go v2.7.1
  `loader/loader.go` `loadYamlFile`: `interp.Interpolate` runs before `ApplyExtends`, the processors,
  `ApplyInclude` and `override.Merge`).
- (b) `include`: imports services, volumes, networks, secrets and configs (compose-go v2.7.1
  `loader/include.go` `importResources`), not `name` (E7). The included file is interpolated with the
  including project's environment (E9), plus an optional per-entry `env_file` that only fills
  variables nothing else set (E10; v2.7.1 `types.Mapping.Merge` adds only unset keys; Docker docs,
  "include" reference: env_file defines "default values when interpolating", and "the local project's
  environment has precedence"). An include entry's `path` may be a list whose later files override the
  first (v2.7.1 `ApplyInclude`: "This is the 'main' file … Others are overrides").
- (c) `-f release -f dev`: the project takes the release file's `name: my-finance` and resolves the
  dev file's `./backend` against `deploy/release/` (E8) — and it needs flags, breaking C2.
- (d) `COMPOSE_FILE` lives in `.env` (git-ignored, optional) — breaks C2 when there is no `.env`; the
  path separator differs on Windows (`COMPOSE_PATH_SEPARATOR`); same `name`/path behaviour as (c).
- `build` next to an inherited `image` (all four): with no `pull_policy`, Compose pulls a missing
  image before building (compose-spec `build.md`: "Compose with build support first tries to pull the
  image, then builds from source if the image wasn't found"). A fresh clone running the README's e2e
  command (`README.md:191`, no `--build`) would pull the published `ghcr.io/…:latest` and test that
  instead of the working tree.

➡️ (b) `include`: it is the only one of the four that keeps C1 (the release file untouched and
standalone), C2 (no flags; with an `env_file` default, no `.env`), C4 (included `name:` ignored) and C5
(the release file keeps `:?`).

⚖️ Strongest argument against: `include` is newer (Compose 2.20+) and its semantics moved between
releases (E4 vs the docs, Q4); `extends` is older and better known.

✅ Decision: top-level `include` in the root `docker-compose.yml`. `extends` is rejected on the token
(E6), `-f`/`COMPOSE_FILE` on C2 and C4. Unblocks Q4.

---

❓ **Q3** - **Which file is the source**: the release file, or a third base file that both use?

🔎 Facts: the bundle can only carry what is in `deploy/release/.` and its compose file must be
standalone (Q1/C1). A third base file would force the release file to be generated at release time
(`docker compose config --no-interpolate` output drops every comment — including the load-bearing
healthcheck history at `deploy/release/docker-compose.yml:65–82` — and canonicalises the YAML), and the
file users run would no longer be reviewed in pull requests.

➡️ The release file (`deploy/release/docker-compose.yml`) is the one stack definition; the root file
includes it.

⚖️ Strongest argument against: the source of the developers' stack now lives under `deploy/release/`,
a folder whose name says "bundle", which a contributor may not look in first.

✅ Decision: the release file is the source; the root file's header points at it, and
`docker compose config` shows the merged result. Unblocks Q7, Q17.

---

❓ **Q8** - **The token rule**: required in the release path, defaulted in development — how is that
difference expressed once, in the thin layer?

🔎 Facts: E2/E3/E6 — `${ANALYTICS_TOKEN:?…}` in the release file fails any `.env`-less load of it. The
include entry's `env_file` supplies interpolation defaults that the shell and the root `.env` override
(E10 A/B/E; compose-go v2.7.1 `ApplyInclude`: `Environment: environment.Clone().Merge(envFromFile)` with
`Merge` adding only unset keys; upstream commit `15210d9` 2023-08-25 "local environment to override
included .env"). Rejected alternatives: turning the release line into `${ANALYTICS_TOKEN:-}` and
relying on the analytics service to refuse an empty token weakens C12 (the analytics settings accept any
string, `analytics/src/analytics/config.py:28–30`); making the backend refuse the dev token breaks the
dev default C12 keeps.

➡️ The release file keeps `${ANALYTICS_TOKEN:?…}` unchanged (C12 intact). The development entry point
supplies `ANALYTICS_TOKEN=dev-analytics-token` through its include entry's `env_file`, a small
committed dotenv file; a developer's `.env` or shell still overrides it.

⚖️ Strongest argument against: the dev default now lives in a third small file instead of inline in
the compose file, one more thing to discover.

✅ Decision: as recommended. The difference is expressed once: required in the stack definition,
defaulted by the development layer. Unblocks Q9, Q14.

---

❓ **Q18** - **Dependency category and seams**: what kind of dependency is this, and does any seam
appear in the code?

🔎 Facts: Docker Compose is a true third-party tool, not a module of this repository; nothing in the
backend, frontend or analytics reads a compose file. The "stack definition" has exactly one adapter
per entry point (the release file for the bundle, the include for development).

➡️ Category: third-party tool configuration — there is no in-process module to deepen and no test
double to write. No seam is introduced in code; the only "seam" is the include entry itself, where the
development layer alters the stack without editing the stack definition.

⚖️ Strongest argument against: none of substance.

✅ Decision: no new code, no new interface; verification is at the compose-model and running-stack
level (Q11, Q19).

---

## Round 2 — frontier after Q2, Q3, Q8

❓ **Q4** - **How the development layer attaches to the include**: (a) the root file includes the
release file and redefines `backend`/`analytics`/`frontend` locally; (b) the include entry's `path`
list carries a second file with the overrides; (c) an auto-loaded `docker-compose.override.yml`.

🔎 Facts:
- (a) works on v5.1.3 (E4) but only because compose-go ≥ v2.10.0 merges a local definition over an
  imported one (`loader/include.go` on `main`: `override.MergeYaml`; introduced by `3d3411d`
  2025-11-06, "Allow importing compose file to override resource definition", = tag v2.10.0). Docker
  Compose's `go.mod`: v5.0.0 (2025-12-02) is the first release on compose-go v2.10.0; v2.40.3 and
  v5.0.0-rc.1/rc.2 are on v2.9.1; **v2.38.2 (CI) is on v2.7.1**, whose `importResource` returns
  `"%s.%s conflicts with imported resource"`. The Docker docs still describe a conflict as an error
  (how-to page) or a warning (reference page) — both stale against v5.
- (b) the `path`-list form is documented ("Using overrides with included Compose files") and is loaded
  by `loadYamlModel` as main file + overrides in every compose-go v2 release read; `!reset` applies to
  each loaded file (v2.7.1 `loadYamlFile`, `ResetProcessor`).
- (c) Compose auto-loads `docker-compose.override.yml` only when no `-f` is given; the e2e command
  passes `-f` (ci.yml:62), so e2e would silently run the GHCR images, not the working tree.

➡️ (b): `include: - path: [deploy/release/docker-compose.yml, docker-compose.dev.yml]`.

⚖️ Strongest argument against: (a) is one file fewer and is exactly the card's picture ("the
development file adds only `build:`"); on Compose ≥ 5.0 it works.

✅ Decision: (b). (a) fails on CI's Compose 2.38.2 and on any developer machine older than v5.0.0;
(c) turns the e2e job into a test of the last release. Unblocks Q5, Q6, Q9.

---

❓ **Q5** - **`build` next to the inherited `image`**: keep the GHCR `image` and add `build`, set
`pull_policy: build`, or reset `image`?

🔎 Facts: see Q2 (pull-before-build when `image` and `build` coexist without `pull_policy`); E5/E13 —
with `image: !reset null` the service has only `build`, and Compose names the built image
`<project>-<service>` exactly as today (`my-finance-backend` etc.). With `pull_policy: build` the local
build would be tagged `ghcr.io/noratans/my-finance-backend:latest`, overwriting a pulled release image
of that tag on the same machine.

➡️ The development layer sets `image: !reset null` and `build: ./<dir>` for backend, analytics and
frontend, and nothing else.

⚖️ Strongest argument against: `!reset` is a YAML tag a newcomer has not seen; `pull_policy: build`
reads more plainly.

✅ Decision: `!reset null` plus `build`, with a one-line comment in the file. It reproduces today's
behaviour exactly (E12). Unblocks Q9.

---

❓ **Q6** - **Relative paths**: where do `./backend`, `./analytics`, `./frontend` in the development
layer resolve?

🔎 Facts: an include entry's `project_directory` "defaults to the directory of the included Compose
file" (Docker docs, include reference), i.e. `deploy/release/`. With `project_directory: .` compose-go
v2.7.1 sets `r.ProjectDirectory = filepath.Join(workingDir, ".")` and `relworkingdir =
loader.Dir(".")`; `localResourceLoader.Dir` (v2.7.1 `loader/loader.go:152–161`, identical in v2.1.0)
takes the absolute path, checks it is a directory, and returns the relative path `.` — the including
file's folder, i.e. the repository root. Verified on v5.1.3: build contexts resolve to
`<repo>/backend`, `<repo>/analytics`, `<repo>/frontend` (E11, E12). The release file itself has no
relative paths (images and named volumes only).

➡️ `project_directory: .` on the include entry; the development layer writes plain `./backend` etc.

⚖️ Strongest argument against: without `project_directory`, writing `../../backend` would avoid the
2024-04 compose-go fix this depends on (see Q15).

✅ Decision: `project_directory: .` — it reads naturally, and the version floor it adds (2.27) is
below CI's 2.38.2. Contingency if CI proves otherwise: drop `project_directory` and write the build
contexts relative to the release file's folder. Unblocks Q15.

---

❓ **Q7** - **Project name and volume identity**: what must not change for existing installations?

🔎 Facts: release installations use project `my-finance` → `my-finance_postgres-data` (and today
`my-finance_redis-data`); development uses the folder name (E1). With include, the included `name:` is
ignored and the including folder names the project (E7); E12 shows the resolved model — project name
and volume names included — identical to today's.

➡️ Nothing changes: the release file keeps `name: my-finance`; the root file gets no `name:`.

⚖️ Strongest argument against: a developer who clones into a folder named `my-finance` and also runs
a release bundle on the same machine shares one project and one database volume between the two —
pinning a development name (e.g. `my-finance-dev`) would separate them.

✅ Decision: no name change. Pinning a development name would orphan every existing development volume
(and worktrees named differently would all converge on one name). The shared-name hazard exists today
and is recorded in the spec's Further Notes, not fixed here. Unblocks Q16.

---

❓ **Q9** - **What goes in the development-defaults file, and what it is called**

🔎 Facts: include-level defaults apply whenever nothing else sets a variable (E10 E). The root
`.env.example` holds `change-me` for `POSTGRES_PASSWORD`, `DB_ANALYTICS_PASSWORD` and `ANALYTICS_TOKEN`
(`.env.example:9,18,22`); used as the `env_file`, it would make `change-me` the default database
password, and every existing development database initialised with the release file's default
`myfinance` (`deploy/release/docker-compose.yml:18,44`) would refuse the backend's login. Every other
variable already has a `:-` default in the release file (`:14–18,42–58,95,101,130`); only the token
has none. `.gitignore` ignores exactly `.env` (lines 25–26), not other `*.env` names.

➡️ A committed dotenv file named `docker-compose.dev.env` holding only
`ANALYTICS_TOKEN=dev-analytics-token`, with a header saying it is *not* a template (the template is the
bundle's `.env.example`, Q10) and that anything set in `.env` or the shell wins.

⚖️ Strongest argument against: a committed file ending in `.env` looks like a secret to a reader or a
scanner.

✅ Decision: as recommended; the header says it holds only a published development value. Keeping
the file to the one variable the release file cannot default avoids a second set of defaults that
could drift from the release file's `:-` values. Unblocks Q14.

---

## Round 3 — frontier after Q4–Q9

❓ **Q10** - **The two env templates**: one file, or two that are checked against each other?

🔎 Facts:
- With comments stripped, `.env.example` (32 lines) and `deploy/release/.env.example` (36 lines) are
  identical — same keys, same values (`diff` of their non-comment lines is empty).
- The launchers consume the bundle's copy: `start.sh:63–68` (`sed … .env.example > .env`),
  `start.bat:39`; they also append missing keys by name (`start.sh:74–90`, `start.bat:45–54`). The root
  copy is read by humans only: its sole reference is `README.md:65` (grep across md/yml/sh/bat/ts/json/py).
- History shows the root copy lagging: `3a964b1` ("feat(release): ask for the sign-in mode on first
  run") changed only the bundle template; `4545810` ("docs(env): list the sign-in mode keys in both
  .env examples") caught the root one up afterwards. `c504eda` and `91d0a82` edited both.

➡️ One template — the bundle's. Delete the root `.env.example`; README's "Run the whole stack" tells
developers to copy `deploy/release/.env.example` to `.env` if they want to change a setting; the
development-defaults file's header points there as well.

⚖️ Strongest argument against: a root `.env.example` is what developers look for first, and the
bundle template's comments talk about the launchers.

✅ Decision: one template. A CI key comparison would be machinery for a documentation-drift problem;
deleting the duplicate is smaller. The bundle template's text is not changed (its launcher notes are
accurate, and harmless to a developer). Unblocks Q22 step 2.

---

❓ **Q11** - **What proves the two stacks are the same apart from the intended differences?** Is there
a cheap `docker compose config` check CI should run?

🔎 Facts: after Q2–Q9 the development stack *is* the release file plus a layer that only resets
`image` and adds `build` for three services, plus one interpolation default. E12 shows the resolved
model identical to today's in three cases. The e2e job already brings the root stack up with
`--build` and drives it with Playwright on CI's Compose 2.38.2 (`ci.yml:50–75`). A normalised diff of
both entry points' `docker compose config` output in CI would need a CI-only script
(`ARCHITECTURE.md:363–364`: "CI runs the same commands a developer runs locally").

➡️ Sameness holds by construction. The proof is (1) the one-time before/after comparison in the
implementing PR — `docker compose config --format json` at the root on the old and the new layout,
with no `.env`, with a passwordless `.env`, and with the e2e overlay, all identical — and (2) the e2e
job, unchanged, as the continuous proof. No new CI step.

⚖️ Strongest argument against: nothing mechanical stops someone from later adding `ports:` or
`environment:` to the development layer.

✅ Decision: no CI check; the development layer's header states its rule ("only `build:`"), and a
change to it is a visible, reviewable diff of a ten-line file.

---

❓ **Q12** - **The e2e overlay and the CI commands**: do they still work unchanged?

🔎 Facts: E11 — `-f docker-compose.yml -f docker-compose.e2e.yml` still adds `8080:8080` to backend on
v5.1.3. For 2.38.2 (compose-go v2.7.1): each `-f` file goes through `loadYamlFile`, which applies that
file's own `include` and then `override.Merge`s it onto the accumulated model, so the overlay merges onto
the already-imported `backend`; the conflict check in `importResource` only runs inside one file's
include. Upstream intended this: `58f2fbb` (2024-02-04, "Restore ability to override an included
resource in compose.override.yaml", in compose-go v2.0.0). `docker compose logs backend` and
`docker compose logs --no-color --tail 200` (`ci.yml:70,75`) load the root file only and resolve the
same project.

➡️ Unchanged: `docker-compose.e2e.yml`, `ci.yml`, README's e2e section.

⚖️ Strongest argument against: the 2.38.2 half is reasoned from source, not run.

✅ Decision: no change; the implementing PR's first e2e run on the GitHub runner is the 2.38.2
verification, and the spec says so.

---

❓ **Q13** - **The release workflow and the bundle**: does `release.yml`'s `sed` still work, and does
the bundle change?

🔎 Facts: the release file's image lines (`:39,90,121`) and every service definition stay as they are;
only its header comment changes (Q17). The bundle is `deploy/release/.` (`release.yml:56`); the new
development files live at the repository root, outside it.

➡️ `release.yml`, both launchers, the bundle README and the bundle's contents are unchanged apart
from the release file's header comment.

⚖️ Strongest argument against: none.

✅ Decision: as recommended. A self-hosting user sees no difference.

---

❓ **Q14** - **A developer whose `.env` or shell sets `ANALYTICS_TOKEN` to an empty value**

🔎 Facts: E14 — today's root file resolves `${ANALYTICS_TOKEN:-dev-analytics-token}` to the dev token
when the variable is empty; the proposed design stops with the release file's C12 message, because
`:?` treats "set but empty" as missing and the include `env_file` only fills variables that are not set
at all (v2.7.1 `Mapping.Merge`). Neither template ships an empty value (`change-me` in both).

➡️ Accept the change: an empty token is a misconfiguration in the release too, and the message says
what to do.

⚖️ Strongest argument against: it is the one observable behaviour change in an otherwise
behaviour-preserving refactor.

✅ Decision: accepted and documented — the development-defaults file's header and the spec's
Further Notes say that an empty `ANALYTICS_TOKEN` stops the stack in development as in the release.

---

❓ **Q15** - **The minimum Docker Compose version**

🔎 Facts: `include` arrived with compose-go `2a97c8a` (2023-06-02). The pieces this design relies on
landed later: `15210d9` (2023-08-25, local environment overrides an included `.env`), `6e8b7bf`
(2024-02-21, "Fix env file read from include", compose-go v2.0.0), `27a3a6a` (2024-04-02, correct
`include.project_directory` handling, compose-go v2.1.0). Docker Compose `go.mod`: v2.26.0/v2.26.1 →
compose-go v2.0.2, **v2.27.0 → v2.1.0**, v2.38.2 → v2.7.1, v5.0.0 → v2.10.0.

➡️ The development entry point requires Docker Compose 2.27 or newer; README's requirements and
ARCHITECTURE §5 say so. The release bundle gains no floor (it has no `include`).

⚖️ Strongest argument against: 2.27.0 itself was not run; the floor is derived from source and
`go.mod`, not observed.

✅ Decision: state 2.27 as the floor. CI (2.38.2) and the local machine (5.1.3) are above it.

---

❓ **Q16** - **Does switching the root file recreate running development containers?**

🔎 Facts: Compose decides to recreate a container by comparing a hash of the service's resolved
configuration; E12 shows the resolved model identical, so the hashes are identical.

➡️ Expect no recreate: the first `docker compose up -d` after pulling the change reports the services
as running, not recreated.

⚖️ Strongest argument against: not observed — no container was started for this design.

✅ Decision: recorded as an expectation for the PR's manual check, not as a verified fact.

---

❓ **Q17** - **Where the comments live**

🔎 Facts: the load-bearing comments are duplicated today: healthcheck history
(`docker-compose.yml:57–74` = `deploy/release/docker-compose.yml:65–82`), analytics ordering (`:93–97`
= `:105–109`), bind address (`:115–117` = `:127–129`); the C12 note exists only in the release file
(`:53–56,96–99`). The root header (`docker-compose.yml:1–6`) describes who reaches whom; the release
header (`deploy/release/docker-compose.yml:1–8`) says "same topology as the repo's docker-compose.yml".

➡️ Every service comment lives once, in the release file. Its header is rewritten to describe the
stack (absorbing the root header's reachability summary) and to say the repository's
`docker-compose.yml` includes it. The root file carries only a header explaining the include, the
layer and the defaults file; the development layer explains `!reset`; the defaults file explains
itself.

⚖️ Strongest argument against: a bundle user now reads a sentence about the repository in their
compose file.

✅ Decision: as recommended; one sentence is a fair price for one copy of the history comments.

---

## Round 4 — frontier after Round 3

❓ **Q19** - **Tests**: which survive, which are replaced, which are deleted, and where is the seam?

🔎 Facts: no Java, TypeScript or Python changes. The Playwright e2e suite runs against the root stack
(`ci.yml:59–72`). There are no tests of compose files today.

➡️ Seam: the resolved compose model (`docker compose config`) for the one-time equivalence check, and
the running stack (the unchanged e2e job) continuously. All existing tests survive unchanged; none is
replaced or deleted; no new automated test — per `CLAUDE.md`, formal TDD is skipped for configuration
without logic, and the spec says so.

⚖️ Strongest argument against: a refactor with no new automated check relies on one manual
comparison.

✅ Decision: as recommended; the comparison is exact (identical JSON), cheap to rerun, and recorded in
the PR.

---

❓ **Q20** - **Edge cases and failure modes**

🔎 Facts and scenarios:
1. Compose older than 2.27 on a developer machine: below 2.20 `include` is unknown and parsing fails;
   2.20–2.26 may resolve the build contexts wrongly (the pre-`27a3a6a` `project_directory` handling).
2. A developer ran a launcher inside `deploy/release/` of their clone, so `deploy/release/.env` holds
   bundle secrets: an explicit `env_file` on the include entry replaces the default `.env` lookup of
   the included project (v2.7.1 `ApplyInclude` only looks for `<project_directory>/.env` when
   `len(r.EnvFile) == 0`), so those values never reach the development stack — the same as today.
3. Someone runs `docker compose -f docker-compose.dev.yml up`: a fragment with three `build`-only
   services and no database; it fails or starts nonsense. The header says "not standalone".
4. Someone adds non-`build` keys to the development layer: Compose accepts it; the header and review
   are the guard (Q11).
5. A developer whose clone folder is `my-finance` also runs a release bundle on the same machine: one
   project, one database volume — pre-existing (Q7), not changed.
6. Windows: forward-slash paths in `include` are what Compose expects on every platform (not run on
   Windows here).
7. An explicitly empty `ANALYTICS_TOKEN` (Q14).
8. An IDE compose integration that predates `include` may not list the services — cosmetic.
9. A new built service later: its `image: !reset null` + `build:` pair goes into the development
   layer — the only reason that file changes.
10. Rollback: reverting the change restores the old root file; no data or volume is involved.

➡️ Handle 1 with the README floor, 3 and 4 with header comments, 7 with documentation; 2, 5, 6, 8,
10 need nothing; 9 is the documented rule.

⚖️ Strongest argument against: none beyond Q15's.

✅ Decision: as recommended.

---

❓ **Q21** - **Order relative to candidate 13**, which removes the `redis` block from the same files

🔎 Facts: candidate 13 (Strong, no version floor) deletes the `redis` service, `REDIS_HOST`,
`depends_on: redis`, the `redis-data` volume and the Redis wording of the healthcheck comment
(`docker-compose.yml:4–5,23–32,41,54–55,71–74,122`; `deploy/release/docker-compose.yml:27–36,45,62–63,
79–82,134`). This candidate carries the 2.27 floor and a runtime check that only CI's 2.38.2 can give.
Neither needs the other to work.

➡️ Candidate 13 lands first, then this one. Both specs phrase their compose edits order-agnostically
("every file that defines the stack — today both, after candidate 7 only the release file").

⚖️ Strongest argument against: landing 7 first would make 13's compose edit a one-file change and
demonstrate 7's value immediately.

✅ Decision: 13 → 7. The Strong candidate should not wait on the one with a version floor, and landing
7 second means its development layer, its docs and the one-time comparison describe the final
four-service stack.

---

❓ **Q22** - **Sequence of separately shippable steps**

🔎 Facts: as Q10 (the template), Q11 (the PR evidence), Q21 (order) and Q23 (documents); CI's e2e
job exercises the root stack on every push (`ci.yml:50–75`); nothing reads the root `.env.example` but
`README.md:65`.

➡️
1. **One stack definition.** The root `docker-compose.yml` becomes the include entry; add
   `docker-compose.dev.yml` and `docker-compose.dev.env`; move the root header's reachability summary
   into the release file's header; update ARCHITECTURE §5, README (requirements and structure) and
   `docs/INSIGHTS.md`; add the lesson. Leaves: identical development model (PR evidence), unchanged
   bundle, CI green on 2.38.2.
2. **One env template.** Delete the root `.env.example`; point README and the defaults file's header
   at the bundle's template. Leaves: nothing reads the deleted file; CI green.

⚖️ Strongest argument against: step 2 could ride along with step 1.

✅ Decision: two steps — step 2 is a separate, trivially revertible decision about documentation.

---

❓ **Q23** - **Documents that change in the same change**

🔎 Facts: `ARCHITECTURE.md:274–285` ("A single `docker-compose.yml` at the repo root defines: …";
the list omits `analytics`, which both compose files run — a doc/code contradiction);
`ARCHITECTURE.md:44` ("One `docker-compose.yml` at the root can wire up the whole stack" — still true
through the include); `ARCHITECTURE.md:303–317` (release bundle — unchanged); `README.md:48,52–69`;
`docs/INSIGHTS.md:375–377` ("Both sides default to the same published dev token … in the repo's own
`docker-compose.yml`"). Code comments that cite `docker-compose.yml` (`SecurityConfig.java:82`,
`ManagementPortSecurityTest.java:22`, `backend/Dockerfile:15`, `analytics/src/analytics/config.py:9,16`,
two Playwright specs) describe behaviour of the stack that does not change — left alone.

➡️ ARCHITECTURE §5 "Docker Compose stack" (rewritten, listing all four services including
`analytics`), README "Project structure" and "Run the whole stack", `docs/INSIGHTS.md` "The analytics
service", the release file's header comment, and a `docs/LESSONS.md` entry. No ADR: ARCHITECTURE §5 is
the recorded decision and is updated instead.

⚖️ Strongest argument against: none.

✅ Decision: as recommended; exact wording is in `docs-proposals.md`.

---

❓ **Q24** - **Effects on sibling candidates**

🔎 Facts: sibling cards read for compose, template and README overlap: G8 candidate 17 item 3 plans
to decide `TZ` handling — `TZ` is passed to the plan executor only (`docker-compose.yml:89`) and is in
neither template. G1, G2, G6 and the others touch no compose file.

➡️ Candidate 13: ordering only (Q21). Candidate 17: whatever it decides for `TZ` becomes a one-file
edit to the stack definition and a one-file edit to the single template once this lands; if 17 lands
first it edits both compose files and both templates, and this candidate simply carries its result.

⚖️ Strongest argument against: none.

✅ Decision: recorded in the spec's Further Notes.

---

❓ **Q25** - **The lesson for `docs/LESSONS.md`**

🔎 Facts: LESSONS.md already has "Compose overlay files merge, they don't replace" (`:1864`) and
"Compose readiness, `$$` escaping, and volume identity" (`:211`); nothing on `include`. The file is
git-ignored (`.gitignore:13`).

➡️ "Compose `include`: one stack definition, two entry points" — why `include` rather than `extends`
or `-f` here; that Compose interpolates each file before merging, so a `${VAR:?}` in a shared file fails
before an override can help; the include entry's `env_file` as a lowest-priority defaults layer;
`!reset` to drop an inherited `image`; the project name coming from the including folder. It builds on
"Compose overlay files merge, they don't replace" (`LESSONS.md:1864`) and "Compose readiness, `$$`
escaping, and volume identity" (`LESSONS.md:211`).

⚖️ Strongest argument against: none.

✅ Decision: as above.

---

## Decisions (one page)

| # | Decision | Evidence |
|---|---|---|
| D1 | Mechanism: top-level `include` in the root `docker-compose.yml`, long form with a `path` list: the release file, then `docker-compose.dev.yml` | Q2, Q4; E3–E12; compose-go v2.7.1 conflict rule |
| D2 | The release compose file is the single stack definition; the root file is the development entry point | Q3 |
| D3 | Development layer = `image: !reset null` + `build: ./<dir>` for backend, analytics, frontend; nothing else | Q5; E5, E13 |
| D4 | `project_directory: .` on the include entry | Q6; `localResourceLoader.Dir` |
| D5 | Project names unchanged: release keeps `name: my-finance`, development stays folder-derived | Q7; E7, E12 |
| D6 | C12 intact: `${ANALYTICS_TOKEN:?…}` stays in the release file; development default via the include entry's `env_file` → `docker-compose.dev.env`, holding only `ANALYTICS_TOKEN=dev-analytics-token` | Q8, Q9; E10 |
| D7 | Explicitly empty `ANALYTICS_TOKEN` now stops the development stack (accepted, documented) | Q14; E14 |
| D8 | One env template (the bundle's); root `.env.example` deleted | Q10 |
| D9 | No new CI check; sameness by construction, proven once by identical `docker compose config` output (3 cases), continuously by the unchanged e2e job | Q11, Q19; E12 |
| D10 | e2e overlay, `ci.yml`, `release.yml`, launchers and bundle unchanged (release file: header comment only) | Q12, Q13 |
| D11 | Floor: Docker Compose 2.27 for development, documented; CI's 2.38.2 run is the runtime proof | Q15 |
| D12 | Comments live once, in the release file | Q17 |
| D13 | Order: candidate 13 first, then this one; compose edits phrased order-agnostically | Q21 |
| D14 | Steps: (1) include-based entry point + docs; (2) single template | Q22 |
| D15 | Docs: ARCHITECTURE §5 (incl. the missing `analytics`), README, INSIGHTS.md, release header, LESSONS; no ADR | Q23 |

Unverified and labelled as such: Compose 2.38.2 runtime behaviour (reasoned from compose-go v2.7.1;
the PR's CI run verifies it); the 2.27 floor (from `go.mod` + commit history); "no recreate on switch"
(from the identical model); Windows path handling.
