# Sessions move into the Postgres already there

Status: ready-for-agent
Candidate: 13 — Sessions move into the Postgres already there
Strength: Strong
Depends on: none (land it before candidate 7, One stack definition — see Further Notes)

## Problem Statement

A my-finance instance runs a Redis container, with its own volume and its own healthcheck, for one
purpose: holding the HTTP session of the one person who uses it. Every self-hosting user downloads,
runs and updates that extra service; every developer runs it (the backend's development instructions
say login fails without it); every integration test run starts a Redis container next to the Postgres
one. The reason for a server-side store — a backend restart during an update must not sign anyone out —
is real, but the database the stack already runs can meet it.

## Solution

Sessions are kept in the application's own Postgres database through Spring Session's JDBC store. The
session cookie, its flags, the 8-hour idle timeout, sign-in, sign-out, profile switching and
passwordless mode behave exactly as before, and a backend restart still keeps everyone signed in. The
two session tables are created by a Flyway migration like every other table, and the read-only
analytics credential is explicitly denied them. The stack loses its `redis` service. Upgrading an
existing installation keeps all data; the only visible effect is that everyone signs in (or, in
passwordless mode, picks their profile) once.

## User Stories

1. As a self-hosting user, I want my instance to run one fewer container, so that it uses less memory
   and has one less thing that can fail to start.
2. As a self-hosting user, I want to stay signed in when the backend restarts during an update, so that
   updating does not interrupt me.
3. As a self-hosting user upgrading from a Redis-based release, I want all my transactions, categories,
   budgets, subscriptions and insights to be exactly where they were, so that the upgrade is safe.
4. As a self-hosting user upgrading, I want to be told that I will be signed out once, so that the
   sign-in screen after the upgrade does not look like a fault.
5. As a self-hosting user in passwordless mode, I want to be told that I will pick my profile again
   once after the upgrade, so that the profile picker is expected.
6. As a self-hosting user, I want the start script to remove the old `redis` container for me, so that
   it does not keep running after it is no longer used.
7. As a self-hosting user, I want to know that the leftover `redis-data` volume held only sessions and
   how to delete it, so that I can reclaim the space without fear of losing data.
8. As a self-hosting user who downgrades to the previous release, I want the older backend to still
   start against my upgraded database, so that a bad upgrade is reversible.
9. As a self-hosting user, I want my session cookie to keep its name, its HttpOnly and SameSite=Lax
   flags, its Secure setting and its 8-hour idle timeout, so that nothing about signing in changes.
10. As a self-hosting user, I want signing out to end my session immediately, so that a shared computer
    is safe.
11. As a self-hosting user, I want sign-in to rotate the session id and forget any profile chosen
    before, so that session fixation stays impossible.
12. As a self-hosting user with an email address up to the 254 characters the API accepts, I want to
    be able to sign in, so that a long address is not silently broken by the new store.
13. As a self-hosting user, I want expired sessions to be deleted automatically, so that the database
    does not accumulate stale sign-ins.
14. As the owner, I want the compose healthcheck's anonymous probe every five seconds to leave no
    session behind in either sign-in mode, so that the session table does not grow by thousands of rows
    a day.
15. As the owner, I want the read-only analytics role to be unable to read any session table, so that a
    compromised or buggy analytics service can never replay a session id or read who is signed in.
16. As the owner, I want a test that fails if any session table ever becomes readable to that role, so
    that a future blanket re-grant is caught by the build rather than by an attacker.
17. As the owner, I want Flyway to own the session tables like every other table, so that the schema
    has one source of truth and Hibernate's validation stays meaningful.
18. As the owner, I want the migration to reproduce the script Spring Session ships, with its one
    deviation stated, so that a future Spring Session upgrade is a readable diff.
19. As the owner, I want the reversal of the recorded Redis decision written into ARCHITECTURE §3 in the
    same change, so that the document and the code never disagree.
20. As the owner, I want the session-store cleanup job not to interfere with the daily Subscription
    charge job, so that charges keep posting exactly as before.
21. As a future contributor, I want to run the backend and its tests with only Java and Postgres, so
    that setting up a development machine is simpler.
22. As a future contributor using the `local-db` test profile, I want to need only an existing Postgres,
    so that the README's command is complete.
23. As a future contributor, I want the integration tests to exercise the same session store as
    production, so that session behaviour is never tested only against a stand-in.
24. As a future contributor, I want the restart test to keep proving that a session outlives the
    backend process, so that the reason for a server-side store stays protected.
25. As a future contributor, I want SCHEMA.md to explain why the session tables break the naming and
    key conventions, so that I do not "fix" them.
26. As a future contributor, I want SCHEMA.md and INSIGHTS.md to state the exception to "the analytics
    role reads every table", so that I understand the revoke in the migration.
27. As a future contributor upgrading my development clone, I want to know to remove the orphaned
    Redis container once, so that it does not keep running.
28. As a reviewer, I want each test to assert behaviour through the HTTP interface or the database
    role, not the store's internals, so that the tests survive a future store change.
29. As a reviewer, I want the equivalence of cookieless probes across stores argued from Spring
    Session's code and checked on a real stack, so that the healthcheck claim is not taken on trust.
30. As a reviewer, I want the application code untouched apart from comments, so that the risk of the
    change sits in configuration, one migration and tests.

## Implementation Decisions

**Dependency.** `spring-boot-starter-session-jdbc` (version managed by the Spring Boot 4.1.0 parent,
which brings Spring Session 4.1.0) replaces `spring-boot-starter-session-data-redis` in the same change;
the two are never on the classpath together (each auto-configuration backs off only when a
`SessionRepository` already exists). The test-scope `com.redis:testcontainers-redis` dependency is
removed. The `spring-boot-starter-session-jdbc-test` starter is not added — it only aggregates the
generic test starters the project already has.

**Configuration.** The Redis connection properties are removed. `spring.session.jdbc.initialize-schema`
is set to `never`, with a comment that the Flyway migration owns the tables (the default, `embedded`,
already skips Postgres; the explicit value states ownership the way `ddl-auto=validate` does). No other
`spring.session.*` property is set: default table name, default flush and save modes, default cleanup
schedule. The session-cookie properties and `server.servlet.session.timeout=8h` stay exactly as they
are; Spring Boot applies them to Spring Session regardless of the store. The comment block above the
session store is rewritten: sessions live in Postgres so a restart never signs anyone out; the tables
come from the migration; Spring Session deletes expired sessions every minute on its own scheduler
thread.

**Schema — a new Flyway migration (V7, the next free version at implementation time).** It creates
`SPRING_SESSION` and `SPRING_SESSION_ATTRIBUTES` exactly as Spring Session 4.1.0's shipped PostgreSQL
script does — same table, column, constraint and index names, types, primary keys, the attributes'
foreign key with `ON DELETE CASCADE`, and the unique index on the session id plus the indexes on expiry
time and principal name — with one deliberate deviation: the principal-name column is `TEXT` instead of
`VARCHAR(100)`, because it holds the sign-in email, which the API accepts up to 254 characters. Right
after the two `CREATE TABLE` statements it revokes all privileges on both tables from `myfinance_ro`: the
V4 migration's default privileges grant that role `SELECT` on every table the migration user creates in
`public`, and a session id is a bearer credential (the cookie carries it base64-encoded, which anyone reading the
column can reproduce). The header comment names the source script and
version, the deviation and the reason for the revoke. The migration uses no Flyway placeholder — and no `${` anywhere, comments included, because Flyway
substitutes placeholders in the raw script text — so the analytics test harness, which applies every
migration as plain SQL, needs no change. The tables live in
`public` under their default names; no foreign key ties a session to `app_user` (the security context is
serialized inside the attributes, and no account-deletion endpoint exists).

**Serialization.** Unchanged: Spring Session's JDBC store serializes attributes with JDK serialization
unless a bean named `springSessionConversionService` or `conversionService` exists, and the application
defines neither (Boot's MVC bean is `mvcConversionService`). `AppUserDetails` stays `Serializable` with
its pinned `serialVersionUID`. The session holds the security context (user id and email; the password
hash is erased at sign-in) and the active-profile id.

**Cleanup.** Spring Session's JDBC repository deletes expired sessions every minute on its own
scheduler thread (`spring-session-*`), created by the repository itself, not by the application's
`@EnableScheduling` (on `ClockConfig`). It does not share threads, the switch the tests use for the
charge job, or the injectable `Clock` with `SubscriptionChargeScheduler`. The repository is initialised
after Flyway (Spring Boot's database-initialisation ordering), so the job never runs before the tables
exist. `ClockConfig` is not changed.

**Application code.** No behaviour changes. Comments that name Redis are reworded to name the session
store: the `ActiveProfile` class comment (cookieless requests leave nothing in the store) and the
`AppUserDetails` `serialVersionUID` comment.

**Compose.** In every compose file that defines the stack — today the root `docker-compose.yml` and the
release compose file; after candidate 7 only the release compose file — remove the `redis` service, the
backend's `REDIS_HOST` and its `depends_on: redis`, the `redis-data` volume, and Redis from the header's
summary of which service reaches which. The backend healthcheck is unchanged; its comment's sentence
about Redis keys is rewritten: the anonymous probe creates no session in either mode, proven by the two
tests named under Testing Decisions and by a session-row count on a real stack.

**Launchers.** Behaviour unchanged: `docker compose up -d --remove-orphans` already removes the orphaned
`redis` container. Their comment explaining `--remove-orphans` names the removed `redis` service next to
`ollama`. Neither launcher deletes the orphaned volume.

**Upgrade and downgrade.** Upgrading applies V7 at the first backend start; the data volume is
untouched; existing sessions stay behind in Redis and are lost, once. Downgrading to the previous
release still starts, because Spring Boot keeps Flyway's default of ignoring applied migrations that are
newer than the ones it knows; the session tables then sit unused.

**Recorded-decision documents, updated in the same change** (wording in docs-proposals):
- ARCHITECTURE.md §3 "Profiles and authentication": the Redis bullet becomes the JDBC-store decision —
  what it is, why a server-side store (restart survival), why the database instead of Redis (a
  container, a volume and a healthcheck for one user's session), the accepted cost (a `SELECT` and an
  `UPDATE` per authenticated request), the history (Redis from `b80d087` until this change), the
  Flyway-owned tables and the analytics-role exception; the passwordless bullet drops "Redis".
  §5 "Docker Compose stack": the `redis` bullet goes. This records the reversal; no ADR.
- docs/SCHEMA.md: the conventions gain a "framework-owned tables" exception; a new "Session store"
  section (V7, the source script, the principal-name deviation, no FK to `app_user`, expiry cleanup, the
  revoke); "The read-only analytics role" states the exception; the cascade table gains the vendor
  foreign key.
- docs/INSIGHTS.md "Read-only role": the exception to "SELECT on all tables".
- README: backend development needs Java 21 and PostgreSQL only; one line on removing the orphaned
  Redis container after pulling this change. Release README: "Where your data lives" and "Update".
- docs/API.md: no change — it describes the session without naming a store.

**Ordered steps, each separately shippable and leaving CI green.**
1. **The session store moves into Postgres.** Dependency swap, configuration, V7, the new and adapted
   tests, test-support cleanup, code comments, ARCHITECTURE §3, SCHEMA.md, INSIGHTS.md, README's backend
   section, the lesson. The compose stacks still start an unused Redis container (harmless).
2. **Redis leaves the stack.** Compose files, healthcheck comments, launcher comments, release README,
   README's upgrade line, ARCHITECTURE §5; the manual verification below.

**Lesson for docs/LESSONS.md.** "Spring Session on JDBC: Flyway owns the framework's tables, and default
privileges reach them too" — same pattern as the existing "Spring Session: swapping `HttpSession`'s
backing store" entry for the swap itself; new: copying the vendor script into a migration, why V4's
`ALTER DEFAULT PRIVILEGES` made the revoke necessary (builds on "A database role is a privilege boundary
that code cannot argue with"), and the cleanup job's own scheduler.

## Testing Decisions

- **What a good test is here.** Session behaviour is asserted where users meet it — HTTP requests
  through the complete security filter chain, with Spring Session's filter and the real store behind it
  — and the role guarantee where it lives, in the database's privilege catalog. No test inspects session
  rows, attribute bytes or repository internals.
- **The seam: the HTTP interface backed by the real store.** `@IntegrationTest` (MockMvc through the
  production filter chain, Postgres from Testcontainers, Flyway-migrated) for everything, plus the
  two-context restart test with real embedded servers. The database-role check is necessarily at the
  database seam. No new seam and no test double.
- **Test-first order** (inside step 1): write `SessionStoreMigrationTest` → red (no session tables); add
  V7 with the shipped script and the revoke → green. Write the long-email sign-in test → green on Redis;
  swap the store → it turns red against the vendor `VARCHAR(100)` → widen the column in the not-yet-
  shipped V7 → green.
- **New tests.**
  - `SessionStoreMigrationTest` (`@IntegrationTest`, next to `InsightSchemaTest`,
    `TxnMerchantMigrationTest` and `PasswordHashNullableMigrationTest`): lists every ordinary table in
    schema `public` whose name starts with `spring_session`; fails if the list is empty; asserts that
    `has_any_column_privilege('myfinance_ro', table, 'SELECT')` is false for each (this also catches a
    column-level grant, which `has_table_privilege` would miss).
  - A sign-in test next to the existing login tests (`AuthControllerTest` today; wherever candidate 6
    leaves them): a user registers with an email of exactly 254 characters (a 64-character local part
    and a domain made of dot-separated labels of at most 63 characters), signs in, and
    `GET /api/auth/me` with the returned session cookie answers 200 with that email.
- **Adapted.** `SessionSurvivesRestartTest`: the Redis container and the two Redis properties are
  removed; the test method and its assertions are unchanged; it still proves that a session created
  through one backend process authenticates through a second, fresh one — now with the session in
  Postgres.
- **Unchanged, now exercising the JDBC store.** `AuthControllerTest` (session carries authentication,
  id rotation at sign-in, sign-out ends the session, cross-session profile deletion),
  `ProfileControllerTest` (active profile cleared on deletion, concurrent deletes),
  `SecurityConfigTest.unauthenticatedRequestCreatesNoSession` and
  `PasswordlessModeTest.aCookielessRequestLeavesNoSessionBehind`, and every test that uses
  `TestFixtures.in(profile)`. The two cookieless tests are the proof for the healthcheck: Spring
  Session's filter stores a session only when one exists, and for a request without a cookie it always
  writes the session cookie after storing, so "no session cookie in the response" means "nothing
  stored", for any store. `InsightSchemaTest` keeps proving the role reads the domain tables and later
  tables.
- **Deleted.** None. The Redis test container bean in `TestcontainersConfiguration` goes (it is support,
  not a test). The analytics suite is untouched; its harness applies V7.
- **Manual verification in step 2**, on a running stack built from the branch:
  1. In `password` mode and again in `none` mode: with the stack healthy, the number of rows in
     `spring_session` is unchanged across at least a minute of healthcheck probes (closing the
     compose comment's open "to be checked on a real stack" note for `none` mode).
  2. Connected as `myfinance_ro`, selecting from either session table is refused with a permission
     error.
  3. Upgrade rehearsal from the current `dev` stack: sign in, switch to the branch, run
     `docker compose up -d --build --remove-orphans`: the `redis` container is gone, the data is intact,
     the browser shows the sign-in screen once, and after signing in a backend restart keeps the session.
- **Prior art.** `InsightSchemaTest` and `TxnMerchantMigrationTest` (role privileges via catalog
  functions), `PasswordHashNullableMigrationTest` (a migration test per migration), the existing login
  tests, `SessionSurvivesRestartTest`.

## Out of Scope

- Any change to the wire contract, the cookie, the timeout, the sign-in flow or passwordless mode.
- A "remember me" login or any change to session lifetime.
- Horizontal scaling (still a non-goal), although a second backend would share sessions through the
  database.
- Deleting the orphaned `redis-data` volume automatically.
- Revisiting V4's all-tables grant for the analytics role beyond the session exception.
- Tuning Spring Session (cleanup schedule, flush or save mode, table name).
- Candidate 7's restructuring of the compose files, and candidate 17's `TZ` decision.
- Account deletion and what it would do to open sessions (no such endpoint exists).

## Further Notes

- **Order with candidate 7.** Land this first; candidate 7 (One stack definition) second. Neither
  depends on the other: the compose step above is written for "every file that defines the stack", so it
  is right in either order. Landing this first keeps the Strong candidate free of candidate 7's Docker
  Compose 2.27 floor and CI-only verification, and lets candidate 7 describe the final four-service
  stack.
- **Other siblings.** Candidate 1 rewrites `ActiveProfile`; this change touches one sentence of its
  class comment — the second to land rebases a comment. Candidate 6 may move the login tests; the new
  254-character test goes with them. Candidate 17 edits `backend/pom.xml` (JaCoCo) and may edit compose
  and the templates (`TZ`) — neighbours, not conflicts. Candidates 9/10: the analytics harness applies
  V7 unchanged. If another sibling adds a migration, versions follow landing order.
- **Actuator.** With the JDBC store, Spring Boot's `sessions` actuator endpoint could list and delete a
  user's sessions. It stays unexposed: web exposure is limited to `health` and `info` on a management port
  no compose file publishes, which `ManagementPortSecurityTest` guards. No change.
- **Per-request cost.** Each authenticated request now reads and updates one session row in Postgres,
  in its own short transaction (a second pooled connection only if a session is first read inside an open
  service transaction; the security filter chain reads it earlier). Negligible for one user; accepted.
- **Pre-existing doc error, fixed by candidate 7.** ARCHITECTURE §5's list of compose services omits
  `analytics`; this change only removes the `redis` entry.
- **Verified vs reasoned.** Verified from the published artifacts: the starter and its versions, the
  shipped DDL, the repository's SQL, cleanup scheduler and serializer defaults, the filter's commit
  logic, Boot's timeout and cookie bridging, the depends-on-Flyway ordering, Flyway's `*:future` default,
  the email length limits. Reasoned, observed at implementation: JDK serialization staying in place (a
  mismatch fails every session test at once); the downgrade path. Pending the manual verification: the
  real-stack row counts in both modes.
- **Old history stays accurate.** The LESSONS.md entries about the Redis swap describe what happened at
  the time; the new entry records the move to JDBC rather than rewriting them.
