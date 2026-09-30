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

**Status:** ready-for-agent

- [ ] Neither compose file that defines the stack has a `redis` service, a `REDIS_HOST` for the backend, a backend dependency on Redis or a `redis-data` volume; their headers no longer list Redis among the services the backend reaches
- [ ] The backend healthcheck is unchanged, and its comment names the two tests that prove a cookieless probe stores no session and the real-stack row count
- [ ] Both launchers behave exactly as before; their comment on removing orphaned containers names the removed `redis` service next to `ollama`
- [ ] The release README no longer names a Redis volume under "Where your data lives" and tells an upgrading user about the one-time sign-out, the removed container and how to delete the leftover volume
- [ ] README tells a developer upgrading a clone to remove the orphaned Redis container once, and how to delete its volume
- [ ] ARCHITECTURE.md's compose service list no longer lists `redis`
- [ ] On a throwaway stack built from the branch, the `spring_session` row count is unchanged across at least a minute of healthchecks in `password` mode and in `none` mode, and the read-only analytics role is refused a select on both session tables (or recorded as unverified)
- [ ] The backend suite is green
