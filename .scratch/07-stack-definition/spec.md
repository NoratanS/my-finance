# One stack definition: the release compose file defines the stack, development includes it

Status: ready-for-agent
Candidate: 7 — One stack definition
Strength: Worth exploring
Depends on: none technically — land it after candidate 13 (Sessions move into Postgres); see Further Notes

## Problem Statement

The my-finance stack is written down twice: once in the root `docker-compose.yml`, which developers
and the CI end-to-end job run, and once in the release compose file that the release bundle ships to
self-hosting users. With comments stripped the two differ in only six places — the release file's
project name, three `image:` lines where development has `build:`, and two `ANALYTICS_TOKEN` lines
(required in the release, defaulted in development) — yet nine of the twelve commits that ever touched
a compose file had to edit both. The long, load-bearing comments (the backend healthcheck's history of
two outages, the analytics start ordering, the bind-address pairing) exist in two copies that can drift
apart. The two `.env` templates are the same list of settings with different comments, and one of them
already lagged behind the other once.

For the owner this means every change to the stack is two changes, and a missed one is invisible until
a self-hosting user runs the file that was not updated — nothing in CI ever exercises the release file.

## Solution

The release compose file becomes the one stack definition. The root `docker-compose.yml` stops
defining services and instead includes the release file together with a small development layer: a
file that tells Compose to build the three application images from source instead of pulling them, and
a one-line defaults file that supplies the development value of the one setting the release file
requires. A developer still types `docker compose up --build` at the repository root with no flags and
no `.env`; the resolved stack is byte-for-byte what it is today. The release bundle, its launchers and
the release workflow do not change at all, apart from the release file's header comment. The duplicate
`.env` template at the repository root is removed; the bundle's template is the one list of settings.

## User Stories

1. As the owner, I want to change a service, port, healthcheck, environment variable or volume in one
   file, so that I never have to repeat the edit in a second compose file.
2. As the owner, I want the development stack to be derived from the file self-hosting users run, so
   that CI's end-to-end job exercises the real stack definition on every pull request.
3. As the owner, I want the healthcheck history and the other load-bearing comments to exist once, so
   that they cannot drift apart.
4. As the owner, I want the release path to keep refusing to start without an explicit
   `ANALYTICS_TOKEN`, so that the C12 defence-in-depth decision still holds.
5. As the owner, I want development to keep working with the published development token when nothing
   sets one, so that `docker compose up --build` still needs no setup.
6. As a future contributor, I want `docker compose up --build` at the repository root to keep working
   with no flags and no `.env`, so that the README's first command still works on a fresh clone.
7. As a future contributor, I want `docker compose config` at the root to print the full merged stack,
   so that I can see exactly what will run without reading three files.
8. As a future contributor, I want the root compose file's header to say where the stack is defined
   and why the root file only includes it, so that I do not go looking for services that are not there.
9. As a future contributor, I want the development layer to contain nothing but "build these images
   from source", so that I can trust that development and release run the same topology.
10. As a future contributor, I want a first `docker compose up` without `--build` to build from my
    working tree rather than pull the last published images, so that I never test the wrong code.
11. As a future contributor, I want the README to state the minimum Docker Compose version the
    development entry point needs, so that an old Compose fails with an explanation rather than a
    confusing path error.
12. As a future contributor, I want one `.env` template to copy when I want to change a setting, so
    that I am not unsure which of two near-identical files is current.
13. As a future contributor, I want my own `.env` and shell variables to keep overriding every
    default, including the development token, so that the precedence I know from Compose still holds.
14. As a future contributor with an existing development database, I want the project name and the
    volume names to stay exactly as they are, so that my data is still there after pulling this change.
15. As a future contributor with running containers, I want switching to the new root file to recreate
    nothing, so that pulling this change is a non-event.
16. As a future contributor who runs the end-to-end suite locally, I want the documented overlay
    command to keep working unchanged, so that the backend is still published on 8080 for Playwright.
17. As a self-hosting user, I want the release bundle, its launchers and its compose file to behave
    exactly as before, so that nothing about installing or upgrading changes for me.
18. As a self-hosting user, I want the bundle's project name `my-finance` to stay pinned, so that an
    upgrade into a new folder keeps using my database volume.
19. As a self-hosting user who runs `docker compose` in the bundle folder without the launcher, I want
    a missing token to still stop the stack with the same message, so that I am never silently given
    the published development token.
20. As a reviewer, I want the equivalence of the old and new development stacks demonstrated by
    identical `docker compose config` output, so that I can accept a structural change without running
    it myself.
21. As a reviewer, I want the first CI run of the change to be the proof on CI's Compose version, so
    that the part that could only be reasoned about from source is observed before merge.
22. As a reviewer, I want ARCHITECTURE §5 to describe the stack definition and the development entry
    point as they are, including the analytics service it currently omits, so that the recorded
    decision matches the files.
23. As the owner implementing candidate 17 later, I want a `TZ` or any other new setting to be one edit
    to one compose file and one template, so that housekeeping does not reintroduce the duplication.
24. As the owner, I want the reasons for choosing `include` over `extends`, a second `-f` file or
    `COMPOSE_FILE` written down, so that I do not re-derive them the next time a compose change feels
    awkward.
25. As a developer who, for a test, ran a launcher inside the repository's bundle folder, I want the
    secrets it generated there never to leak into my development stack, so that the two stay separate.
26. As a developer who adds a new built service one day, I want the rule for the development layer to
    be stated in the file, so that I know to add exactly an image reset and a build context there.

## Implementation Decisions

**The stack definition.** The release compose file (the one the release bundle ships) is the single
definition of the stack: every service, healthcheck, dependency, port, environment variable, volume and
all their explanatory comments live there. It keeps its explicit project name `my-finance`, its three
`ghcr.io/noratans/my-finance-*:latest` image lines (still rewritten to the release version by the
release workflow's existing substitution) and its required `ANALYTICS_TOKEN`. Only its header comment
changes: it describes the stack (absorbing the root file's current summary of which service is reachable
from which) and says that the repository's `docker-compose.yml` includes this file and builds the three
application images from source.

**The development entry point.** The root `docker-compose.yml` contains no services. It holds one
top-level `include` entry in the long form: a `path` list whose first element is the release compose
file and whose second is the development layer; `project_directory` set to the repository root (`.`),
so the development layer's build contexts resolve against the repository; and `env_file` pointing at
the development defaults file. Its header explains, in a few lines, what the include does, that
`docker compose config` shows the merged result, and the Docker Compose 2.27 floor.

**The development layer — `docker-compose.dev.yml`.** For each of backend, analytics and frontend: the
inherited image is removed with Compose's `!reset` tag and a `build:` context of that service's folder is
added. Nothing else belongs in this file; its header says so, says it is not a standalone compose file
(the root file includes it), and explains in one line why the image is reset (with both `image` and
`build`, Compose would pull the published image before building, and a local build would be tagged with
the published name). With the image reset, Compose names the built images after the project exactly as
today.

**The development defaults — `docker-compose.dev.env`.** A committed dotenv file with exactly one
setting, `ANALYTICS_TOKEN=dev-analytics-token`, the only variable the release file requires instead of
defaulting. Its header says: it is not a template (the template is the bundle's `.env.example`); it
holds a published development value, not a secret; anything set in `.env` or the shell wins; and an
explicitly empty `ANALYTICS_TOKEN` stops the stack in development exactly as in the release. It must not
grow other defaults: the release file already defaults every other variable, and a second copy of those
defaults could drift (and, as with `change-me` values, would break existing development databases).

**Why `include` and this form.** `extends` and every other way of loading the release file fail a
`.env`-less development run on the release file's required token, because Compose interpolates each file
before merging anything; a second `-f` file and `COMPOSE_FILE` need flags or a `.env`, adopt the
release project name and resolve build paths against the release folder. Redefining the included
services directly in the root file works only on Compose 5.0 and later — CI's Compose 2.38.2 rejects it
as a conflict — so the development layer is attached through the include entry's `path` list, the
documented override form. An auto-loaded `docker-compose.override.yml` is rejected because the e2e
command passes `-f` and would then silently run the published images.

**Unchanged interfaces.** The e2e overlay `docker-compose.e2e.yml`, the CI workflow (including the
flag-less `docker compose logs` calls), the release workflow, both launchers and the bundle README stay
as they are. The development project name stays derived from the clone's folder name, so development
volume names do not change; the release project name stays `my-finance`.

**One env template.** The root `.env.example` is deleted. The bundle's `.env.example` is the only
template and its text does not change. README's "Run the whole stack" tells developers to copy it to
`.env` if they want to change a setting, and notes that its launcher remarks apply to the bundle.

**Minimum Docker Compose.** The development entry point needs Docker Compose 2.27 or newer (the first
release carrying the corrected `include` `project_directory` and `env_file` handling). README's
requirements and ARCHITECTURE §5 state it. The release bundle gains no version requirement.

**Recorded-decision documents updated in the same change.**
- ARCHITECTURE.md §5 "Docker Compose stack": the stack is defined once, in the release compose file;
  the root `docker-compose.yml` is the development entry point that includes it with the development
  layer; the list of services includes `analytics` (missing today); why `include`; the 2.27 floor.
- docs/INSIGHTS.md "The analytics service": the development default of `ANALYTICS_TOKEN` now comes from
  the development defaults file the root compose file includes, not from an inline fallback.
- README: "Project structure", "Run the whole stack" (Compose floor, template pointer, `docker compose
  config`).
- No ADR: ARCHITECTURE §5 is the recorded decision (see docs-proposals).

**Ordered steps, each separately shippable and each leaving CI green.**
1. One stack definition: rewrite the root `docker-compose.yml` as the include entry; add the
   development layer and the development defaults file; move the root header's reachability summary
   into the release file's header; update ARCHITECTURE §5, docs/INSIGHTS.md and README; add the lesson.
   The PR carries the equivalence evidence (Testing Decisions).
2. One env template: delete the root `.env.example`; point README and the defaults file's header at the
   bundle's template.

**Lesson for docs/LESSONS.md.** "Compose `include`: one stack definition, two entry points" — include vs
`extends` vs `-f`; per-file interpolation (a required variable in a shared file fails before an
override can help); the include entry's `env_file` as the lowest-priority defaults layer; `!reset`; the
project name coming from the including folder. It builds on the existing entries "Compose overlay files
merge, they don't replace" and "Compose readiness, `$$` escaping, and volume identity".

## Testing Decisions

- **What a good test is here.** The behaviour that must not change is the resolved stack: services,
  images or build contexts, environment, ports, healthchecks, dependencies, volumes and project name.
  That is observable at one seam — Compose's own resolved model, printed by `docker compose config` —
  and, continuously, at the running stack the e2e job brings up. Nothing inside the files (their
  layout, the order of keys) is asserted.
- **The seam chosen: the resolved compose model, checked once; the running stack, checked always.**
  Before merging, the implementer runs `docker compose config --format json` at the repository root on
  the old layout and on the new one and shows the outputs identical in three cases: no `.env` and no
  shell variables; a passwordless setup (`MYFINANCE_AUTH_MODE=none`, `MYFINANCE_BIND_ADDRESS=127.0.0.1`,
  custom secrets); and with the e2e overlay added. The design was already checked this way on Docker
  Compose 5.1.3 (identical in all three cases, see grilling E12). The implementer also runs
  `docker compose up -d` against already-running development containers and confirms nothing is
  recreated.
- **CI is the proof on Compose 2.38.2.** The only part reasoned from source rather than observed is the
  behaviour on CI's Compose 2.38.2 (the `path`-list include, `project_directory: .`, the overlay merging
  onto an included service). The PR's first run of the unchanged e2e job — which brings the root stack
  up with `--build` and runs Playwright — is that verification. If it fails on build-context paths, the
  fallback is to drop `project_directory` and write the build contexts relative to the release file's
  folder.
- **Formal TDD is skipped** for this candidate: it changes configuration with no logic in Java,
  TypeScript or Python (the "pure boilerplate" allowance in `CLAUDE.md`).
- **Tests that survive, are replaced or are deleted.** Every existing test survives unchanged — the
  backend, frontend and analytics suites do not read compose files, and the Playwright suite runs
  against the same stack. Nothing is replaced or deleted. No new automated test: a CI step diffing both
  entry points would be a CI-only script (ARCHITECTURE §5: CI runs the same commands a developer runs),
  guarding a rule the file structure already makes hard to break.
- **Prior art.** The e2e job itself (the overlay pattern), and the manual verification habit recorded in
  the compose healthcheck comments ("verified: … unchanged across repeated probes").

## Out of Scope

- Anything about the session store: the `redis` service, `REDIS_HOST` and the `redis-data` volume are
  candidate 13's. If candidate 13 has not landed, they simply move into the single definition with
  everything else.
- The `TZ` question (candidate 17): which services honour `TZ` and whether the template lists it.
- Changing the release workflow, the launchers, the image names or the bundle layout.
- Pinning a development project name, or separating a development stack from a release bundle on the
  same machine (see Further Notes).
- A CI job that validates the release file standalone or diffs the two entry points.
- Rewording the bundle `.env.example` for developers.
- The C12 decision itself — it is kept, not revisited.

## Further Notes

- **Order with candidate 13.** Land candidate 13 first, then this. Neither depends on the other:
  candidate 13's compose edits are phrased as "every file that defines the stack — today both, after
  candidate 7 only the release file". Landing 13 first keeps the Strong candidate free of this one's
  Compose-version floor and CI-only verification, and lets this change, its docs and its one-time
  comparison describe the final four-service stack.
- **Candidate 17 (housekeeping).** Its `TZ` item edits compose and the env templates. After this lands
  that is one compose file and one template; if 17 lands first, this candidate carries its result into
  the single definition unchanged.
- **Behaviour change, accepted.** An explicitly empty `ANALYTICS_TOKEN` (set but blank, in `.env` or the
  shell) used to fall back to the development token and now stops the development stack with the
  release file's C12 message. No template ships an empty value.
- **Pre-existing hazard, not addressed.** A developer whose clone folder is named `my-finance` shares the
  Compose project — and therefore containers and the `my-finance_postgres-data` volume — with a release
  bundle installed on the same machine. That is true today and stays true; pinning a development
  project name would orphan every existing development volume, so it is left for a separate decision.
- **Pre-existing doc error fixed here.** ARCHITECTURE §5's list of compose services omits `analytics`.
  This candidate rewrites that paragraph and fixes it; candidate 13 only removes the `redis` entry.
- **Verified vs reasoned.** Verified on Compose 5.1.3 by `docker compose config` (no containers started):
  E1–E14 in the grilling log, including the identical-model comparison. Reasoned from compose-go v2.7.1
  source, pending CI: behaviour on Compose 2.38.2. Derived from `go.mod` and commit history, not run:
  the 2.27 floor. Expected, not observed: no recreate on switching. Not checked: Windows paths.
- **Compose documentation is stale on one point.** Docker's docs describe redefining an included service
  in the including file as an error (how-to) or a warning (reference); Compose 5.x merges it. The design
  deliberately does not rely on either behaviour.
