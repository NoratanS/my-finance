# 01: The release compose file is the one stack definition, and development includes it

**What to build:** a change to a service, port, healthcheck, environment variable or volume is made once, in the stack definition the release bundle ships, and development picks it up. At the repository root a developer still types `docker compose up --build` with no flags and no `.env` and gets exactly today's stack: the same services, images built from the working tree under the same names, the same environment, ports, healthchecks, dependencies, volumes and folder-derived project name. The root compose file defines no services; it includes the stack definition together with the development layer (build the backend, analytics and frontend images from source, nothing else) and a development defaults file that supplies the published development `ANALYTICS_TOKEN`, the one setting the stack definition requires. A `.env` or shell variable still overrides every default; an explicitly empty token now stops the development stack with the release message. `docker compose config` at the root prints the merged stack. The e2e overlay command, CI, the release workflow, the launchers and the bundle behave exactly as before; only the stack definition's header comment changes, absorbing the root file's summary of which service is reachable from which. ARCHITECTURE §5 (with the missing `analytics` service), docs/INSIGHTS.md and the README describe the new layout and the Docker Compose 2.27 floor, and a lessons entry explains `include`.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The root compose file holds only a header and one long-form include entry: the stack definition, then the development layer, with the repository root as project directory and the development defaults file as its env file
- [x] The development layer only resets the inherited image and adds a build context for backend, analytics and frontend; its header says it is not standalone, that nothing else belongs there, and why the image is reset
- [x] The development defaults file holds exactly `ANALYTICS_TOKEN=dev-analytics-token`; its header says it is a published development value, not a secret, that `.env` and the shell win, and that an empty token stops the stack as in the release
- [x] The stack definition's services, image lines, project name and required token are unchanged; only its header is rewritten
- [x] `docker compose config --format json` on the new layout equals the old layout's output byte for byte with no `.env` and no shell variables, with a passwordless setup (from the shell and from a `.env`), with the e2e overlay, with no flags at all, and in the built image names; an empty token fails with the release message
- [x] ARCHITECTURE §5 "Docker Compose stack", docs/INSIGHTS.md "The analytics service" and the README "Project structure" and "Run the whole stack" are updated as the docs proposals say
- [x] The lessons entry "Compose `include`: one stack definition, two entry points" is written
- [x] Backend, frontend and analytics suites are untouched (no file of theirs changes)

## Comments

- **Equivalence evidence** (Docker Compose v5.1.3, `docker compose config` only — nothing was
  started, pulled or built). Run from the worktree root with a clean environment (`env -i HOME PATH`)
  and `-p mf-config-check`, before the change (at `28cfe4b`) and after it; outputs compared with
  `cmp`:

  | Case | Result |
  |---|---|
  | 1. no `.env`, no shell variables | identical JSON, exit 0, empty stderr |
  | 2a. passwordless from the shell (`MYFINANCE_AUTH_MODE=none`, `MYFINANCE_BIND_ADDRESS=127.0.0.1`, `POSTGRES_PASSWORD`, `ANALYTICS_TOKEN`, `DB_ANALYTICS_PASSWORD`, `TZ=Europe/Warsaw`) | identical |
  | 2b. the same settings from a temporary root `.env` | identical |
  | 3. `-f docker-compose.yml -f docker-compose.e2e.yml` | identical (backend keeps `8080:8080`) |
  | 4. no flags at all (no `-p`), no `.env` | identical: project `07-stack-definition`, volume `07-stack-definition_postgres-data` — the folder-derived name survives |
  | 5. `config --images` | identical after sorting (Compose prints them in random order on both layouts): `mf-config-check-backend`, `-analytics`, `-frontend`, `postgres:16-alpine` |
  | 6. `ANALYTICS_TOKEN=` (set but empty) | deliberate change (spec D7): before → dev token; after → exit 1 with the release file's C12 message |
  | 7. `ANALYTICS_TOKEN=fromshell` | identical — the shell beats the development defaults file |
  | 8. (after only) a `deploy/release/.env` holding `POSTGRES_DB=leaked`, `ANALYTICS_TOKEN=leaked` | identical to case 1 before the change — a bundle `.env` in the clone never reaches development |

  The release file on its own (`-f deploy/release/docker-compose.yml`, old vs new copy): identical
  model with a token, identical C12 error without one; its diff touches comment lines only.
- **Not verified here:** `docker compose up -d` against running development containers ("switching
  recreates nothing") was not run — this session must not start containers; expected from the
  identical model. Behaviour on CI's Compose 2.38.2 is proved by the PR's first e2e run; if it fails
  on build-context paths, the spec's fallback is to drop `project_directory` and write the build
  contexts relative to `deploy/release/`.
- **Development defaults header** also says to keep the file to its one line (the spec's "must not
  grow other defaults"). Its pointer at the bundle's template arrives with ticket 02, together with
  the removal of the root template, so that each commit's README stays true.
