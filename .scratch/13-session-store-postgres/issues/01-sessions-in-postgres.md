# 01: Sessions are kept in the application's own Postgres database

**What to build:** a Session — who is signed in and which Profile is active — is stored in the
Postgres database the instance already runs, through Spring Session's JDBC store, instead of in
Redis. Signing in, signing out, switching the Active profile, passwordless mode, the session cookie
(name, flags, `Secure` setting) and the 8-hour idle timeout behave exactly as before, and a backend
restart still keeps everyone signed in. The two session tables are created by a Flyway migration
copied from the script Spring Session ships, with one stated deviation (the principal-name column
holds a sign-in email of up to 254 characters), and the read-only analytics role is denied them.
Backend development and the backend tests need only Java and Postgres. The recorded decision in
ARCHITECTURE.md, the schema document and the Insights document describe the new store in the same
change. The compose stacks still start a Redis container nobody uses (removed by ticket 02).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A migration test lists every session table in the public schema, fails when there is none, and fails when the read-only analytics role can select from any of them (table or column grant); it is seen red before the migration exists and red again once with the revoke removed
- [ ] The next free Flyway migration creates both session tables exactly as Spring Session's shipped PostgreSQL script does, except that the principal-name column is unbounded text; its header names the source script and version, the deviation and why the analytics role is revoked; it contains no Flyway placeholder syntax
- [ ] A user registering with an email of exactly 254 characters can sign in and `GET /api/auth/me` with the returned session cookie answers 200 with that email; the test is green on Redis, red against the vendor 100-character column, and green after the column is widened
- [ ] The backend depends on the Spring Session JDBC starter and no longer on the Redis starter or the Redis test container; no Redis connection property remains; Spring Session's own schema initialisation is switched off with a comment that the migration owns the tables
- [ ] The restart test proves, without Redis, that a session created through one backend process authenticates through a second, fresh one
- [ ] Every existing session test (sign-in, id rotation, sign-out, cross-session profile deletion, cookieless requests in both sign-in modes) passes unchanged against the new store
- [ ] No application behaviour changes; comments that named Redis in application code, configuration and test support name the session store instead
- [ ] ARCHITECTURE.md "Profiles and authentication", docs/SCHEMA.md (conventions exception, a "Session store" section, the analytics role's exception, the cascade table) and docs/INSIGHTS.md (the role's exception) describe the new store; README's backend-development section needs only Java 21 and PostgreSQL
- [ ] The committed OpenAPI document is unchanged; the backend and analytics suites are green
