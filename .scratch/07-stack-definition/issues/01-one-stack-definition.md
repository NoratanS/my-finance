# 01: The release compose file is the one stack definition, and development includes it

**What to build:** a change to a service, port, healthcheck, environment variable or volume is made once, in the stack definition the release bundle ships, and development picks it up. At the repository root a developer still types `docker compose up --build` with no flags and no `.env` and gets exactly today's stack: the same services, images built from the working tree under the same names, the same environment, ports, healthchecks, dependencies, volumes and folder-derived project name. The root compose file defines no services; it includes the stack definition together with the development layer (build the backend, analytics and frontend images from source, nothing else) and a development defaults file that supplies the published development `ANALYTICS_TOKEN`, the one setting the stack definition requires. A `.env` or shell variable still overrides every default; an explicitly empty token now stops the development stack with the release message. `docker compose config` at the root prints the merged stack. The e2e overlay command, CI, the release workflow, the launchers and the bundle behave exactly as before; only the stack definition's header comment changes, absorbing the root file's summary of which service is reachable from which. ARCHITECTURE §5 (with the missing `analytics` service), docs/INSIGHTS.md and the README describe the new layout and the Docker Compose 2.27 floor, and a lessons entry explains `include`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The root compose file holds only a header and one long-form include entry: the stack definition, then the development layer, with the repository root as project directory and the development defaults file as its env file
- [ ] The development layer only resets the inherited image and adds a build context for backend, analytics and frontend; its header says it is not standalone, that nothing else belongs there, and why the image is reset
- [ ] The development defaults file holds exactly `ANALYTICS_TOKEN=dev-analytics-token`; its header says it is a published development value, not a secret, that `.env` and the shell win, and that an empty token stops the stack as in the release
- [ ] The stack definition's services, image lines, project name and required token are unchanged; only its header is rewritten
- [ ] `docker compose config --format json` on the new layout equals the old layout's output byte for byte with no `.env` and no shell variables, with a passwordless setup (from the shell and from a `.env`), with the e2e overlay, with no flags at all, and in the built image names; an empty token fails with the release message
- [ ] ARCHITECTURE §5 "Docker Compose stack", docs/INSIGHTS.md "The analytics service" and the README "Project structure" and "Run the whole stack" are updated as the docs proposals say
- [ ] The lessons entry "Compose `include`: one stack definition, two entry points" is written
- [ ] Backend, frontend and analytics suites are untouched (no file of theirs changes)
