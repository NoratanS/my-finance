# 02: Redis leaves the stack

**What to build:** a my-finance instance runs one container fewer: every compose file that defines
the stack has no `redis` service, no Redis volume and no backend dependency on it, and its comments
no longer mention Redis. The backend healthcheck is unchanged; its comment says why its anonymous
probe leaves no Session behind in either sign-in mode. A self-hosting user upgrading from a bundle
with Redis is told they will sign in (or pick their Profile) once, that the start script removes the
old container, and how to delete the leftover volume, which held only sessions; a developer
upgrading a clone is told to remove the orphaned container once. On a real stack the session row
count stays flat under the healthcheck in both sign-in modes, and the read-only analytics role is
refused both session tables.

**Blocked by:** 01 (Sessions are kept in the application's own Postgres database)

**Status:** done

- [x] Neither compose file that defines the stack has a `redis` service, a `REDIS_HOST` for the backend, a backend dependency on Redis or a `redis-data` volume; their headers no longer list Redis among the services the backend reaches
- [x] The backend healthcheck is unchanged, and its comment names the two tests that prove a cookieless probe stores no session and the real-stack row count
- [x] Both launchers behave exactly as before; their comment on removing orphaned containers names the removed `redis` service next to `ollama`
- [x] The release README no longer names a Redis volume under "Where your data lives" and tells an upgrading user about the one-time sign-out, the removed container and how to delete the leftover volume
- [x] README tells a developer upgrading a clone to remove the orphaned Redis container once, and how to delete its volume
- [x] ARCHITECTURE.md's compose service list no longer lists `redis`
- [x] On a throwaway stack built from the branch, the `spring_session` row count is unchanged across at least a minute of healthchecks in `password` mode and in `none` mode, and the read-only analytics role is refused a select on both session tables (or recorded as unverified)
- [x] The backend suite is green

## Comments

- Manual verification on a throwaway stack built from this branch's root compose file, project
  `mf-verify13`, services `postgres`, `backend`, `analytics` only (none publishes a port), torn
  down with `down -v` afterwards:
  - Flyway applied `7 | session store` on a fresh database.
  - `password` mode, backend healthy: `SELECT count(*) FROM spring_session` = 0 at 04:58:20 UTC
    and 0 at 04:59:35 UTC (75 s of 5-second probes, every probe healthy).
  - `none` mode (backend recreated with `MYFINANCE_AUTH_MODE=none`; the cookieless
    `/api/auth/me` answers 200 with only an `XSRF-TOKEN` cookie): 0 at 04:59:57 and 0 at
    05:01:11 UTC (74 s, every probe exit 0).
  - Positive control: a client that created a Profile and chose it got a `JSESSIONID`, and the
    count became 1 (`principal_name` NULL, as documented for a passwordless session).
  - Connected as `myfinance_ro`: `permission denied for table spring_session` and
    `permission denied for table spring_session_attributes`; the same role counts `profile`.
- `docker compose config` passes for the root file, the root file with the e2e overlay, and the
  release file.
- Not done here (left for the owner): the upgrade rehearsal from the current `dev` stack (manual
  step 3 of the spec).
