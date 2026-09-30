# Candidate 13 — Sessions move into the Postgres already there: grilling log

## Scope, sources and how facts were obtained

- Repository read at `c3e20c5` (a `-s ours` merge of `main` into `dev`; `git diff --stat 4545810 c3e20c5`
  is empty, so the line numbers below also hold for the brief's `4545810`). Read-only throughout:
  nothing in the repository was created, edited, built, tested or started.
- **Spring artifacts.** The assignment expected the Spring Session JDBC jars in `~/.m2`; they are not
  there — only `spring-session-core` 4.1.0 and the Redis jars are cached. So:
  - read locally (`unzip -p`, `javap`): `spring-boot-dependencies-4.1.0.pom`,
    `spring-session-bom-4.1.0.pom`, `spring-boot-session-4.1.0.jar`, `spring-boot-webmvc-4.1.0.jar`,
    `spring-boot-flyway-4.1.0.jar`, `flyway-core-12.4.0.jar`;
  - read from Maven Central **into memory** (`curl … | python3 zipfile`, nothing written to disk):
    `spring-boot-starter-session-jdbc-4.1.0.pom`, `spring-boot-starter-session-jdbc-test-4.1.0.pom`,
    `spring-boot-session-jdbc-4.1.0` (jar, pom, sources), `spring-session-jdbc-4.1.0` (jar, sources),
    `spring-session-core-4.1.0-sources.jar`.
- Docker Compose facts used here (orphans, volumes) are the documented `--remove-orphans` behaviour
  and the repository's own precedent; no container was started.

### Design tree

```
Q1 constraints ──┬── Q2 dependency category / seam
                 ├── Q3 exact dependency ── Q4 who creates the tables ── Q5 where the DDL comes from
                 │                                                        └── Q8 column deviations
                 ├── Q6 where the tables live ── Q9 read-only role ── Q10 the test that proves it
                 ├── Q7 serialization / what is stored
                 ├── Q11 cleanup job vs the charge job ── Q12 startup order vs Flyway
                 ├── tests: Q13 DatabaseCleaner · Q14 restart test · Q15 support classes
                 │          Q16 cookieless requests · Q17 long email · Q18 inventory + seam
                 ├── deploy: Q19 compose · Q20 release upgrade · Q21 development upgrade · Q22 downgrade
                 ├── runtime: Q23 per-request cost · Q24 actuator `sessions` endpoint
                 └── Q25 docs · Q26 env templates · Q27 steps · Q28 order vs 7 · Q29 siblings · Q30 lesson
```

---

## Round 1 — frontier: questions with no open prerequisite

❓ **Q1** - **Constraints the design must not break**

🔎 Facts:
- Wire contract: cookie `JSESSIONID`, HttpOnly, SameSite=Lax, `Secure` from `SESSION_COOKIE_SECURE`,
  8 h idle timeout (`backend/src/main/resources/application.properties:59–70`; `docs/API.md:37–41`).
  Logout deletes `JSESSIONID` (`SecurityConfig.java:87–89`).
- Session semantics: login rotates the session id and clears a stale active profile
  (`SessionAuthenticator.java:91–101`); the active profile lives only in the session and only
  `ActiveProfile.set` creates one (`ActiveProfile.java:12–21,43–45`); the request cache is disabled so an
  anonymous request creates no session (`SecurityConfig.java:60–62`).
- Flyway owns the schema, Hibernate only validates (`application.properties:9–10`); applied migrations
  are immutable (Flyway checksums); V1–V6 exist, the next is V7.
- The analytics test harness applies every `V*__*.sql` in order as plain SQL, substituting exactly one
  placeholder, `${dbAnalyticsPassword}` (`analytics/tests/conftest.py:48–54,74–81,84–93`).
- Settled (brief §6): Redis is replaced by Spring Session's JDBC store on the existing Postgres;
  session-cookie authentication with the active profile held server-side stays.
- ARCHITECTURE §3 records Redis and its two reasons (`ARCHITECTURE.md:113–123`); §7 lists horizontal
  scaling as a non-goal (`:430–431`).
- The assignment's two cares: existing installations keep their data and upgrade cleanly; the read-only
  database role never reads session data.

➡️ The design keeps: (C1) the wire contract byte-for-byte; (C2) the session semantics, verified by the
existing tests; (C3) Flyway as the only creator of tables, through a new V7; (C4) V7 free of Flyway
placeholders so the analytics harness applies it unchanged; (C5) `myfinance_ro` unable to read any
session table; (C6) the reversal of ARCHITECTURE §3 recorded by rewriting that section in the same
change; (C7) a clean upgrade that loses only sessions, once.

⚖️ Strongest argument against: none — these are givens.

✅ Decision: C1–C7 stand. Unblocks Q2–Q7.

---

❓ **Q2** - **Dependency category and seams**

🔎 Facts: Postgres is already local-substitutable — Testcontainers with `@ServiceConnection` in tests
(`support/TestcontainersConfiguration.java:27–31`), the compose `postgres` service in production. Spring
Session's `SessionRepository`, reached through `SessionRepositoryFilter`, is the framework's seam; the
application never names a store in `src/main` (the only two "redis" hits there are comments,
`ActiveProfile.java:20`, `AppUserDetails.java:25`). `TestFixtures` uses the raw `SessionRepository` and
the `CookieSerializer` bean, not a Redis type (`support/TestFixtures.java:66–70,251–258,273–295`).

➡️ Category: local-substitutable (Postgres). No new seam and no application-level interface: exactly
one adapter (JDBC) will ever run, so an interface of our own would be a hypothetical seam. The
framework's `SessionRepository` stays the only seam, and the application keeps not knowing which store
sits behind it.

⚖️ Strongest argument against: none of substance.

✅ Decision: as recommended. Deletion test: the Redis container, its volume, its healthcheck, its
compose wiring and its test container disappear, and no complexity reappears anywhere else.

---

❓ **Q3** - **The exact dependency for Spring Boot 4.1**: which artifact, which properties, and what
happens to the Redis pieces?

🔎 Facts:
- `spring-boot-dependencies-4.1.0.pom` manages `spring-boot-starter-session-jdbc` (line 2794),
  `spring-boot-starter-session-jdbc-test` (2799), `spring-boot-session-jdbc` (2059), sets
  `spring-session.version` 4.1.0 (207) and imports `spring-session-bom` (3589–3594), which manages
  `spring-session-jdbc` (`spring-session-bom-4.1.0.pom:58`).
- The starter depends on `spring-boot-starter`, `spring-boot-starter-jdbc`, `spring-boot-jdbc`,
  `spring-boot-session-jdbc`; the latter on `spring-session-jdbc`, `spring-boot-session`,
  `spring-boot-jdbc` (POMs on Maven Central). The `-test` starter only adds `spring-boot-starter-test`
  and `spring-boot-starter-jdbc-test`.
- `JdbcSessionAutoConfiguration` (sources): `@ConditionalOnMissingBean(SessionRepository.class)`,
  `@ConditionalOnBean(DataSource.class)`, servlet apps only; imports `JdbcHttpSessionConfiguration`.
  With both the Redis and the JDBC starter present, two auto-configurations would compete for one
  `SessionRepository`.
- Current: `backend/pom.xml:40–43` (`spring-boot-starter-session-data-redis`), `:102–106`
  (`com.redis:testcontainers-redis`, test scope); the project has no `spring-boot-starter-session-data-redis-test`
  today. LESSONS.md:2617 records the Boot 4 modularisation lesson (use the one starter).

➡️ Replace `spring-boot-starter-session-data-redis` with `spring-boot-starter-session-jdbc` (version
from the parent) in the same change; remove `com.redis:testcontainers-redis`; do not add the `-test`
starter.

⚖️ Strongest argument against: none; a transitional "both starters" state is rejected outright.

✅ Decision: as recommended. Unblocks Q4, Q7.

---

❓ **Q4** - **Who creates the session tables?** Spring Session's own schema initialiser, or Flyway?

🔎 Facts: `spring.session.jdbc.initialize-schema` defaults to `embedded`
(`spring-boot-session-jdbc-4.1.0.jar` `META-INF/spring-configuration-metadata.json`); the initialiser
bean exists unless the mode is `never` (`OnJdbcSessionDatasourceInitializationCondition`), and in
`embedded` mode runs scripts only for an embedded database — so against Postgres it already does
nothing. Flyway owns the schema (C3).

➡️ A Flyway migration creates the tables, and `spring.session.jdbc.initialize-schema=never` is set
explicitly, next to a comment that V7 owns them.

⚖️ Strongest argument against: the property is redundant with the default for Postgres.

✅ Decision: set it anyway — it states the ownership the way `spring.jpa.hibernate.ddl-auto=validate`
does, and it keeps Spring Session from creating a second copy if the backend is ever pointed at an
embedded database. Unblocks Q5.

---

❓ **Q5** - **Where the PostgreSQL DDL comes from**: copy Spring Session's shipped script, or write
tables in this project's conventions?

🔎 Facts:
- `spring-session-jdbc-4.1.0.jar` ships `org/springframework/session/jdbc/schema-postgresql.sql`:
  `SPRING_SESSION (PRIMARY_ID CHAR(36) NOT NULL, SESSION_ID CHAR(36) NOT NULL, CREATION_TIME BIGINT NOT
  NULL, LAST_ACCESS_TIME BIGINT NOT NULL, MAX_INACTIVE_INTERVAL INT NOT NULL, EXPIRY_TIME BIGINT NOT NULL,
  PRINCIPAL_NAME VARCHAR(100), CONSTRAINT SPRING_SESSION_PK PRIMARY KEY (PRIMARY_ID))`; unique index
  `SPRING_SESSION_IX1 (SESSION_ID)`, indexes `SPRING_SESSION_IX2 (EXPIRY_TIME)`,
  `SPRING_SESSION_IX3 (PRINCIPAL_NAME)`; `SPRING_SESSION_ATTRIBUTES (SESSION_PRIMARY_ID CHAR(36) NOT NULL,
  ATTRIBUTE_NAME VARCHAR(200) NOT NULL, ATTRIBUTE_BYTES BYTEA NOT NULL, CONSTRAINT
  SPRING_SESSION_ATTRIBUTES_PK PRIMARY KEY (SESSION_PRIMARY_ID, ATTRIBUTE_NAME), CONSTRAINT
  SPRING_SESSION_ATTRIBUTES_FK FOREIGN KEY (SESSION_PRIMARY_ID) REFERENCES SPRING_SESSION(PRIMARY_ID) ON
  DELETE CASCADE)`.
- `JdbcIndexedSessionRepository` (4.1.0 sources) issues exactly those names (`:157–209`) with
  `%TABLE_NAME%` replaced textually (`:664–666`), default `SPRING_SESSION` (`:148`); unquoted, so
  Postgres folds them to `spring_session` and `spring_session_attributes`.
- The project's conventions (BIGINT identity keys, TIMESTAMPTZ, singular snake_case) are in
  `docs/SCHEMA.md:69–86`.

➡️ V7 reproduces the shipped PostgreSQL script — names, columns, types, keys, constraint and index
names, in the same order — with exactly one deliberate deviation (Q8), under a header comment that
names the source file and the Spring Session version. SCHEMA.md's conventions gain an explicit
"framework-owned tables" exception.

⚖️ Strongest argument against: upper-case identifiers, `CHAR(36)` keys and epoch-millisecond `BIGINT`
times break every convention the schema document states.

✅ Decision: copy the vendor script. The repository's SQL dictates the shape, and a near-verbatim copy
makes a future Spring Session schema change a plain diff. Unblocks Q8.

---

❓ **Q6** - **Where the tables live**: the `public` schema with default names, or a dedicated schema
(`spring.session.jdbc.table-name=<schema>.SPRING_SESSION`)?

🔎 Facts: V4 grants `myfinance_ro` SELECT on all tables in `public` and sets default privileges for
future ones there (`V4__insights.sql:37–44`, Q9); a schema-qualified table name would work, since the
repository substitutes the name textually (`:664–666`), but needs a non-default property and a
`CREATE SCHEMA`. `DatabaseCleaner` truncates only the ownership chain from `app_user`
(`support/DatabaseCleaner.java:15–16`), so it touches neither placement.

➡️ `public`, default table names, no `table-name` property.

⚖️ Strongest argument against: in `public`, V4's default privileges grant the analytics role SELECT on
the new tables automatically, and any future blanket `GRANT … ON ALL TABLES IN SCHEMA public` would
re-grant it; a dedicated schema without `USAGE` for the role would make the denial structural.

✅ Decision: `public`, with the grant revoked in V7 (Q9) and a test that fails on any
`spring_session*` table the role can read (Q10). That keeps the conventional Spring Session setup — no
extra schema, no non-default property — while the test turns a future blanket re-grant into a red build.
Unblocks Q9.

---

❓ **Q7** - **Serialization, and what the store will hold**

🔎 Facts:
- `JdbcHttpSessionConfiguration` (4.1.0 sources) serialises attributes with a `GenericConversionService`
  holding JDK `SerializingConverter` / `DeserializingConverter` (bean class loader) unless a bean
  qualified `springSessionConversionService` or `conversionService` exists. `src/main` defines no
  `ConversionService` bean and no Spring Session customisation (grep: none); Boot 4.1's MVC
  conversion service bean is `mvcConversionService` (`spring-boot-webmvc-4.1.0.jar`,
  `WebMvcAutoConfiguration$EnableWebMvcConfiguration.mvcConversionService()`), which does not match the
  qualifier.
- Attributes written: `SPRING_SECURITY_CONTEXT`, saved explicitly at login through
  `HttpSessionSecurityContextRepository` (`SessionAuthenticator.java:95–98`, `SecurityConfig.java:125–129`),
  holding `AppUserDetails` — id and email; the hash is erased after authentication
  (`AppUserDetails.java:14–21`, `eraseCredentials`); and `ACTIVE_PROFILE_ID`, a `Long`
  (`ActiveProfile.java:25,43–45`). In passwordless mode the filter never saves the context
  (`PasswordlessAutoLoginFilter.java:36–48`), so such sessions hold only `ACTIVE_PROFILE_ID`.
- The cookie carries the session id, base64-encoded by Spring Session's `DefaultCookieSerializer`
  (`useBase64Encoding = true`, spring-session-core 4.1.0 `DefaultCookieSerializer.java:84,200`; Boot's
  cookie bridging does not change it, and `TestFixtures.java:273–287` asks that bean rather than
  hand-rolling the encoding). The encoding is reversible, so reading the id column is enough to build
  the cookie.

➡️ JDK serialization is unchanged; no application code changes; the `Serializable` rule and the pinned
`serialVersionUID` stay (their comments lose the word Redis). The store will hold, per session: its id
(a bearer credential — whoever reads it can replay it as a cookie), the email as the principal name,
and the serialized security context — the id being replayable once base64-encoded.

⚖️ Strongest argument against: the qualifier match was reasoned from bean names, not observed.

✅ Decision: as recommended; any mismatch would fail every session-using integration test on its
first run, so the adapted suite observes it. Unblocks Q8, Q9.

---

## Round 2 — frontier after Q4–Q7

❓ **Q8** - **Column deviations from the shipped script**: does any vendor column not fit this
application?

🔎 Facts:
- The principal name Spring Session indexes is `authentication?.name` evaluated on the
  `SPRING_SECURITY_CONTEXT` attribute (spring-session-core 4.1.0 `PrincipalNameIndexResolver.java:35–59`),
  and it is written on every insert and update (`JdbcIndexedSessionRepository.java:839,903,923`). For
  the `UsernamePasswordAuthenticationToken` saved at sign-in, `getName()` is the principal's
  `getUsername()` — Spring Security's standard `AbstractAuthenticationToken` behaviour, not re-read
  here — and `AppUserDetails.getUsername()` returns the email. The test's red step (Q17) observes it.
- `RegisterRequest.email` is `@NotBlank @Email @Size(max = 254)` (`dto/RegisterRequest.java:9`); the
  vendor column is `PRINCIPAL_NAME VARCHAR(100)`. An email of 101–254 characters registers, then the
  session insert at login fails with Postgres' "value too long for type character varying(100)" — a
  sign-in that works on Redis would break on the vendor DDL.
- `SESSION_ID`/`PRIMARY_ID CHAR(36)` fit the UUID generator (`JdbcHttpSessionConfiguration`:
  `UuidSessionIdGenerator`); `ATTRIBUTE_NAME VARCHAR(200)` fits `SPRING_SECURITY_CONTEXT` and
  `ACTIVE_PROFILE_ID`.
- SCHEMA.md prefers `TEXT` over a length that duplicates a rule kept elsewhere ("`TEXT` rather than
  `VARCHAR(60)` so an algorithm change isn't a migration", `docs/SCHEMA.md:105–107`).

➡️ One deviation: the principal-name column is `TEXT`. Everything else is verbatim. V7 contains no
`${` anywhere, comments included: Flyway substitutes placeholders with a reader over the raw script
text before parsing (`PlaceholderReplacingReader` in flyway-core 12.4.0), so a `${…}` in a comment is
substituted — or rejected as "No value provided for placeholder" — like any other; V4's comment spells
`spring.flyway.placeholders.dbAnalyticsPassword` for this reason.

⚖️ Strongest argument against: a deviation must be re-applied by hand whenever Spring Session ships a
changed script.

✅ Decision: `TEXT`, recorded in V7's header and in SCHEMA.md; `VARCHAR(254)` would duplicate the API's
limit in a second place. Pinned by an HTTP test (Q17). Unblocks Q17.

---

❓ **Q9** - **The read-only role must not read sessions**: what does the migration have to do? Options:
(a) revoke in the same migration; (b) a dedicated schema; (c) replace V4's default privileges with
explicit per-table grants.

🔎 Facts:
- `V4__insights.sql:37–44`: `GRANT USAGE ON SCHEMA public TO myfinance_ro;`,
  `GRANT SELECT ON ALL TABLES IN SCHEMA public TO myfinance_ro;`, and
  `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO myfinance_ro;` — "This only
  applies to objects created by the role running it, which is the same role every migration runs as".
  `InsightSchemaTest.java:103–113` proves that a table created later by that role *is* readable by
  `myfinance_ro`. So V7's tables would be readable by the analytics credential the moment they exist.
- What they hold (Q7): session ids that work as cookies, emails, serialized principals — credentials,
  not analytics data. `docs/SCHEMA.md:505–513` and `docs/INSIGHTS.md:385–391` record "SELECT on all
  tables".
- V4 records why it grants on *all* tables ("excluding [a table] would need a table list that goes stale
  with the next migration", `V4__insights.sql:38–40`). V1–V6 cannot be edited.

➡️ (a): right after creating the two tables, V7 runs `REVOKE ALL` on both from `myfinance_ro`, with a
comment saying why. Same migration, so there is no moment in which the grant exists on a running
instance (Flyway runs a Postgres migration in one transaction, and migrations finish before the
application serves).

⚖️ Strongest argument against: a per-table exception is exactly the "table list" V4 wanted to avoid,
and a future blanket re-grant would undo it silently.

✅ Decision: (a). The exception is two tables whose names are a framework constant, not a list that
grows with each migration; a future re-grant is caught by Q10's test on every `./mvnw verify`. (b) is
rejected for its extra schema and non-default table name (Q6); (c) reverses a recorded V4 decision for
no gain. SCHEMA.md and INSIGHTS.md record the exception (Q25). Unblocks Q10.

---

❓ **Q10** - **The test that proves the role cannot read sessions**

🔎 Facts: prior art checks this role through catalog functions — `InsightSchemaTest.java:87–113`
(`has_table_privilege`), `TxnMerchantMigrationTest.java:76–81` (`has_column_privilege`), both
`@IntegrationTest` against the migrated Testcontainers Postgres; each migration with a guarantee has its
own `…MigrationTest` (`PasswordHashNullableMigrationTest`, `TxnMerchantMigrationTest`). Postgres'
`has_table_privilege` looks only at table-level grants; `has_any_column_privilege` is true if the role
holds the privilege on the table *or on any column*, so it also catches a column-level
`GRANT SELECT (session_id) …`. The analytics suite already proves, at the credential seam, that the role
cannot write (`analytics/tests/test_db.py:59–60`).

➡️ A new `SessionStoreMigrationTest` (`@IntegrationTest`): it lists every ordinary table in schema
`public` whose name starts with `spring_session` from the catalog, fails if that list is empty (no
vacuous pass), and asserts `has_any_column_privilege('myfinance_ro', <table>, 'SELECT')` is false for
each. The backend suite is the one guard; no analytics-side test is layered on top.

⚖️ Strongest argument against: connecting as `myfinance_ro` and attempting a `SELECT` would observe the
denial directly rather than through the catalog.

✅ Decision: the catalog check, matching prior art; under Postgres semantics it answers the same
question, and it enumerates by name pattern, so a future Spring Session table created without a revoke
also fails it. Written first (red: no tables), then V7 (green).

---

❓ **Q11** - **How are expired sessions cleaned up, and does that interact with the Subscription charge
job's scheduling?**

🔎 Facts:
- `JdbcIndexedSessionRepository`: `DEFAULT_CLEANUP_CRON = "0 * * * * *"` (`:153`); `afterPropertiesSet`
  creates its **own** `ThreadPoolTaskScheduler` with thread prefix `spring-session-` and schedules
  `cleanUpExpiredSessions` on a `CronTrigger` unless the cron is `Scheduled.CRON_DISABLED` ("-")
  (`:274–287`); `destroy` shuts it down (`:289–294`); the job runs
  `DELETE FROM %TABLE_NAME% WHERE EXPIRY_TIME < ?` with `System.currentTimeMillis()` in a transaction
  (`:206–209,647–655`); attribute rows follow through the vendor `ON DELETE CASCADE`. Boot exposes
  `spring.session.jdbc.cleanup-cron` (default `0 * * * * *`).
- The application's scheduling: `@EnableScheduling` on `ClockConfig` (`config/ClockConfig.java:12–15`,
  "the charge job is the app's only scheduled task"); `SubscriptionChargeScheduler` runs
  `@Scheduled(cron = "0 5 0 * * *", zone = "UTC")` and is switched off in tests
  (`service/SubscriptionChargeScheduler.java:25,38`; `support/IntegrationTest.java:26`). The injectable
  `Clock` is for the charge job and the dashboard (`ClockConfig.java:9–13`).

➡️ Keep the default cron; set no property. There is no interaction: the cleanup runs on Spring
Session's own scheduler thread, not on the `@EnableScheduling` infrastructure, and reads the system
clock, not the `Clock` bean. Tests keep it on: it deletes only expired rows, and no test creates an
expired session. `ClockConfig`'s comment stays (it speaks of `@Scheduled` tasks and remains true); the
session block in `application.properties` says that Spring Session deletes expired sessions every
minute on its own thread.

⚖️ Strongest argument against: a job every minute is more than a one-user instance needs.

✅ Decision: default cron. The statement is one indexed `DELETE` (`SPRING_SESSION_IX2` on
`EXPIRY_TIME`), and a custom value would be configuration with no user benefit.

---

❓ **Q12** - **Startup order**: can the session repository or its cleanup job touch the tables before
Flyway creates them?

🔎 Facts: `spring-boot-session-jdbc` registers
`JdbcIndexedSessionRepositoryDependsOnDatabaseInitializationDetector` (its `META-INF/spring.factories`),
which makes the `JdbcIndexedSessionRepository` bean depend on every database initialiser;
`spring-boot-flyway-4.1.0` registers `FlywayDatabaseInitializerDetector` and
`FlywayMigrationInitializerDatabaseInitializerDetector` (`META-INF/spring.factories`). The cleanup job is
scheduled in the repository's `afterPropertiesSet` (Q11).

➡️ No ordering code: the repository, and therefore its cleanup job, is initialised after Flyway has
migrated.

⚖️ Strongest argument against: none.

✅ Decision: as recommended.

---

## Round 3 — tests (frontier after Q8–Q12)

❓ **Q13** - **`DatabaseCleaner`, and tests that hold a session across a truncation**

🔎 Facts: the cleaner runs before each test and executes only `TRUNCATE TABLE app_user RESTART
IDENTITY CASCADE` (`support/DatabaseCleaner.java:15–16`); `CASCADE` follows foreign keys, and the vendor
tables have none to `app_user`, so session rows are untouched and accumulate across tests within one
cached context — as Redis keys do today (nothing flushes Redis between tests). Every session-using test
creates its own session inside the test, after the cleaner ran: through login
(`AuthControllerTest.java:441`, `ProfileControllerTest.java:397`) or through
`TestFixtures.createSessionWithActiveProfile` (`:251–258`), each with a random id. No test stores a
session id across tests; no test counts sessions.

➡️ `DatabaseCleaner` does not change. A leftover session from an earlier test names a user id that
`RESTART IDENTITY` may have handed to a different test user — harmless because no test replays another
test's id, and identical to today.

⚖️ Strongest argument against: truncating the session tables too would give every test an empty store.

✅ Decision: unchanged; nothing needs an empty store (Q16 asserts through the HTTP response, not row
counts), and the cleaner stays "the ownership chain from `app_user`".

---

❓ **Q14** - **`SessionSurvivesRestartTest`**: what changes, and does it still prove the same thing?

🔎 Facts: it starts one Postgres and one Redis container (`config/SessionSurvivesRestartTest.java:40–54`),
boots two independent `SpringApplication` contexts on random ports against them (`:86–97`, Redis passed
as `REDIS_HOST`/`REDIS_PORT` at `:93–94`), logs in through the first, closes it, and asserts the
session cookie authenticates `GET /api/auth/me` against the second (`:56–84`). Its javadoc describes
"sharing one Redis" (`:28–37`).

➡️ Remove the Redis container, its start/stop and the two Redis properties; keep the test method and
every assertion; reword the javadoc to "sharing one Postgres". It still proves the same thing: the
session lives outside both processes. Now it also shows that the second boot finds the tables the first
boot's Flyway created, and that the security context deserialises from `BYTEA`.

⚖️ Strongest argument against: the store is now the same database that holds the users — a reader
may wonder whether the test proves anything the database does not already guarantee.

✅ Decision: as recommended; the property under test — the session outlives the process — is exactly
the reason ARCHITECTURE §3 keeps a server-side store at all.

---

❓ **Q15** - **The test support classes**

🔎 Facts: `TestcontainersConfiguration` declares a Postgres bean and a Redis bean, and its javadoc
explains the Redis half and the `local-db` escape hatch with `REDIS_HOST`/`REDIS_PORT`
(`support/TestcontainersConfiguration.java:12–21,33–37`); `IntegrationTest`'s javadoc says "real
Redis-backed sessions" (`:14`); `TestFixtures`' comments name `RedisSessionRepository` and a
"Redis-backed Session" (`:66–70,238`) while its code uses only `SessionRepository` and
`CookieSerializer`; `PasswordlessModeTest`'s comment says sessions "would pile up in Redis" (`:83`).

➡️ Delete the Redis bean and its import; reword the four comments to name the JDBC store. No code in
`TestFixtures` changes. The `local-db` profile then needs only Postgres, which makes the README's
existing `SPRING_PROFILES_ACTIVE=local-db` command (`README.md:206–212`) complete for the first time.

⚖️ Strongest argument against: none.

✅ Decision: as recommended.

---

❓ **Q16** - **The healthcheck and passwordless mode**: what proves that a cookieless request still
leaves nothing behind?

🔎 Facts:
- The compose healthcheck probes `GET /api/auth/me` every 5 s with no cookie; its comment records that
  in `password` mode no session was created (Redis `DBSIZE` unchanged) and that `none` mode was "to be
  checked the same way on a real stack" (`docker-compose.yml:66–75`,
  `deploy/release/docker-compose.yml:74–83`).
- `SessionRepositoryFilter.commitSession` (spring-session-core 4.1.0, `:219–236`): the repository `save`
  runs only when the request created or loaded a session; for a request with no session cookie the
  requested id is null, so after the save the filter always writes the session cookie
  (`httpSessionIdResolver.setSessionId`). For a cookieless request, therefore, "no session cookie in the
  response" means "no session stored", whatever the store.
- `SecurityConfigTest.unauthenticatedRequestCreatesNoSession` (`config/SecurityConfigTest.java:86–96`,
  password mode) and `PasswordlessModeTest.aCookielessRequestLeavesNoSessionBehind` (`:80–88`, none mode)
  assert exactly that, through the real filter chain, and run against whatever store is configured.

➡️ Those two existing tests are the proof and run unchanged against the JDBC store. The healthcheck
comment in every compose file that defines the stack is updated to say so and to replace the Redis
`DBSIZE` wording with a session-row count. The "to be checked on a real stack" note for `none` mode is
closed by the manual verification in the spec: on a running stack, in each mode, the count of rows in
`spring_session` stays unchanged across a minute of probes.

⚖️ Strongest argument against: a row-count assertion in a test would check the database growth
directly.

✅ Decision: no new test. Counting rows asserts the store's internal state; the cookie assertion is the
observable interface and is equivalent by the filter's code above.

---

❓ **Q17** - **Pinning the principal-name deviation**

🔎 Facts: Q8. The login tests live in `AuthControllerTest` (`loginSessionCarriesAuthenticationAcrossRequests`,
`:169`; helper `loginSession`, `:441`). Hibernate Validator 9.1.0's `@Email` limits the local part to 64 characters and the domain
part to 255 (`AbstractEmailValidator`: `MAX_LOCAL_PART_LENGTH = 64`, `MAX_DOMAIN_PART_LENGTH = 255`), so
a 254-character address has a 64-character local part and a 189-character domain; building that domain
from dot-separated labels of at most 63 characters (the DNS limit) keeps it valid everywhere — whether
the validator would also accept one 189-character label was not checked.

➡️ A new HTTP test next to the existing login tests: a user registers with an email of exactly 254
characters, logs in, and `GET /api/auth/me` with the returned session cookie answers 200 with that
email. The red step: run it once against the vendor `VARCHAR(100)` column and see the login fail, then
widen the column.

⚖️ Strongest argument against: once V7 ships, the test can never fail again for this reason; it is a
regression guard.

✅ Decision: as recommended; it is the only thing that stops a later "restore the vendor script
verbatim" edit from breaking long-email logins.

---

❓ **Q18** - **Test inventory and the seam**

🔎 Facts: session behaviour is covered today, through the real `SessionRepositoryFilter` and the real
store, by `AuthControllerTest` (fixation `:183`, logout `:232`, cross-session profile deletion `:284`),
`ProfileControllerTest` (`:313`, `:353`), `SecurityConfigTest`, `PasswordlessModeTest`, every
`@IntegrationTest` using `TestFixtures.in(profile)`, and `SessionSurvivesRestartTest`. Commit `73a76d3`
moved six of those tests off a mock session path onto the real store.

➡️ Seam: the HTTP interface through the full filter chain against the real store (MockMvc in
`@IntegrationTest`, plus real Tomcat in the restart test). The role guarantee is necessarily checked at
the database seam. Survive unchanged: every test above except the restart test. Changed: the restart
test (Redis removed, same assertion). New: `SessionStoreMigrationTest`, the 254-character sign-in
test. Deleted: none. The analytics suite is untouched; its harness applies V7 like any migration.

⚖️ Strongest argument against: none.

✅ Decision: as recommended.

---

## Round 4 — deploy and runtime (frontier after Rounds 1–3)

❓ **Q19** - **The compose files**

🔎 Facts: Redis appears in the root file at `docker-compose.yml:4–5` (header), `:23–32` (service),
`:41` (`REDIS_HOST`), `:54–55` (`depends_on`), `:71–74` (healthcheck comment), `:122` (volume); in the
release file at `deploy/release/docker-compose.yml:27–36,45,62–63,79–82,134`. Candidate 7 may or may not
have landed when this is implemented.

➡️ In every compose file that defines the stack — today both, after candidate 7 only the release file —
delete the `redis` service, `REDIS_HOST`, the backend's `depends_on: redis`, the `redis-data` volume,
Redis from the header's reachability summary, and rewrite the healthcheck comment's Redis sentence
(Q16). Nothing else in the stack changes; the backend keeps `depends_on: postgres: service_healthy`.

⚖️ Strongest argument against: none.

✅ Decision: as recommended, phrased order-agnostically so the spec holds whichever lands first.

---

❓ **Q20** - **Upgrading an existing release installation**: the orphaned `redis` container, the
`redis-data` volume, the one-time sign-out. What do the launchers and the release README say?

🔎 Facts:
- Both launchers run `docker compose up -d --remove-orphans`, commented as stopping "containers from
  services an older bundle had and this one doesn't (the removed ollama service)"
  (`deploy/release/start.sh:115–117`, `start.bat:66–68`). `--remove-orphans` removes containers of
  services no longer defined; Compose never removes named volumes except on `down -v`.
- Precedent: the release README's "Update" section says the start script removes the old `ollama`
  container but not its volume, and gives `docker volume rm my-finance_ollama-models`
  (`deploy/release/README.md:98–101`). "Where your data lives" names `redis-data` as the sessions volume
  (`:72–79`).
- At the first start of the new backend Flyway applies V7 to the existing database; the data volume
  `my-finance_postgres-data` is untouched. Existing sessions stay behind in Redis, so the new backend
  knows none of them: in `password` mode everyone sees the sign-in screen once; in `none` mode a session
  only ever held the active profile, so `/api/auth/me` answers as the local account with no active
  profile (`PasswordlessModeTest.java:63–68`) and the profile picker appears once.

➡️ No launcher behaviour changes; their `--remove-orphans` comment names the removed `redis` service
too. The release README drops the `redis-data` sentence from "Where your data lives" and adds an
"Update" note: upgrading from a bundle with Redis signs everyone out once (in `none` mode: pick the
profile again); the start script removes the old `redis` container; the `my-finance_redis-data` volume
held only sessions and `docker volume rm my-finance_redis-data` frees it.

⚖️ Strongest argument against: the launcher could delete the orphaned volume itself.

✅ Decision: document, don't automate — the `ollama` precedent, and a launcher that deletes volumes is
one typo away from deleting the database.

---

❓ **Q21** - **Upgrading a development clone**

🔎 Facts: README's update habit for development is `docker compose up -d --build` (quoted in
`ARCHITECTURE.md:116–117` and `application.properties:52–53`), without `--remove-orphans`; Compose then
leaves the orphaned `redis` container running and prints its orphan warning suggesting the flag. The
development volume is `<clone folder>_redis-data`.

➡️ README's "Run the whole stack" gets one line: after pulling this change, run
`docker compose up -d --build --remove-orphans` once (or `docker compose down` first); the old
`…_redis-data` volume can be removed with `docker volume rm`.

⚖️ Strongest argument against: Compose's own warning already says it.

✅ Decision: one line is cheap and saves a contributor from a Redis container that runs forever.

---

❓ **Q22** - **Downgrade**: can an installation go back to the previous bundle after V7 has run?

🔎 Facts: `spring.flyway.ignore-migration-patterns` defaults to `*:future` in Spring Boot 4.1
(`spring-boot-flyway-4.1.0.jar` metadata), matching Flyway 12.4.0's own default (`FlywayModel` sets
`ignoreMigrationPatterns` to `*:future`); Boot's parent pins Flyway 12.4.0
(`spring-boot-dependencies-4.1.0.pom:58`). An older backend, which knows V1–V6, therefore validates a
history that contains V7 without failing. The older bundle's compose file still defines `redis`, and
its launcher recreates the container.

➡️ A downgrade starts; the session tables sit unused; sessions are lost once more.

⚖️ Strongest argument against: not exercised — reasoned from the defaults.

✅ Decision: recorded as supported, with the manual rehearsal in the spec covering the upgrade
direction only.

---

❓ **Q23** - **Per-request cost**

🔎 Facts: for a request carrying a session cookie, the filter loads the session
(`GET_SESSION_QUERY`, a join of both tables, `:167–172`) and, because the last-access time changes,
saves it at the end (`UPDATE_SESSION_QUERY`, `:174–178`) — one `SELECT` and one `UPDATE` per
authenticated request. `JdbcHttpSessionConfiguration` runs them in a `TransactionTemplate` with
`PROPAGATION_REQUIRES_NEW` on the application's single `PlatformTransactionManager` (JPA's), so a session
read inside an open service transaction would borrow a second pooled connection; the security filter
chain resolves the session before any controller runs, and open-in-view is off
(`application.properties:11`). The pool is Hikari's default (no `spring.datasource.hikari.*` property is
set).

➡️ Accept; leave flush mode and save mode at their defaults.

⚖️ Strongest argument against: every authenticated request now writes to the database the finance
data lives in.

✅ Decision: negligible for one user — the cost the card names and the settled decision accepts.

---

❓ **Q24** - **The actuator `sessions` endpoint**

🔎 Facts: Boot 4.1's `SessionsEndpoint` is built from the `SessionRepository` and an optional
`FindByIndexNameSessionRepository` (`spring-boot-session-4.1.0.jar`,
`SessionsEndpointAutoConfiguration$ServletSessionEndpointConfiguration`); `JdbcIndexedSessionRepository`
implements `FindByIndexNameSessionRepository` (`:142–143`), so with JDBC the endpoint could list and
delete a user's sessions. Web exposure is `health,info` only (`application.properties:48`) on a
management port no compose file publishes (`:49`); `ManagementPortSecurityTest` guards that.

➡️ No change; the endpoint stays unexposed.

⚖️ Strongest argument against: none.

✅ Decision: mention it in the spec's Further Notes so a reviewer knows why nothing was done.

---

## Round 5 — documents, sequence, siblings

❓ **Q25** - **Which documents change in the same change**

🔎 Facts: Redis is recorded in `ARCHITECTURE.md:113–123` (the decision and its reasons) and `:134`
("sessions, Redis, CSRF and the profile scoping above are unchanged"), and listed in §5
(`:276–277`); the §5 list also omits `analytics` (fixed by candidate 7, which rewrites that paragraph).
`docs/SCHEMA.md` states conventions for every table (`:69–86`), the role's grant (`:505–513`) and the
FK/cascade table (`:516–533`); `docs/INSIGHTS.md:385–391` repeats "SELECT on all tables". README
requires Redis for backend development (`:99–111`). The release README names `redis-data` (`:72–79`).
`docs/API.md` describes the session without naming a store (`:37–41`, `:1546`) — unchanged. The env
templates carry no Redis key (Q26).

➡️ Change in the same change: ARCHITECTURE §3 (the Redis bullet rewritten as the JDBC decision, with
the reversal, its date, its reasons and its cost; "Redis" dropped from the passwordless bullet), §5
(remove the `redis` bullet); SCHEMA.md (framework-owned exception to the conventions; a "Session store"
section; the role's exception; the vendor FK in the cascade table and why sessions have no FK to
`app_user`); INSIGHTS.md (the role's exception); README (backend-development requirements; the one-line
upgrade note); the release README ("Where your data lives", "Update"); comments in
`application.properties`, both compose files, both launchers, `ActiveProfile`, `AppUserDetails` and the
test support classes; a LESSONS.md entry. No ADR: the reversal is recorded by rewriting ARCHITECTURE §3.

⚖️ Strongest argument against: none.

✅ Decision: as recommended; exact wording in `docs-proposals.md`.

---

❓ **Q26** - **The env templates**

🔎 Facts: neither `.env.example` nor `deploy/release/.env.example` has a Redis key; `REDIS_HOST` is
set literally in compose (`docker-compose.yml:41`, `deploy/release/docker-compose.yml:45`) and
`REDIS_PORT` only defaults in `application.properties:57`.

➡️ No change to either template.

⚖️ Strongest argument against: none.

✅ Decision: as recommended.

---

❓ **Q27** - **Sequence of separately shippable steps**

🔎 Facts: as Q10 and Q17 (the tests to write first), Q19–Q21 (the stack and upgrade edits),
Q25 (the documents); applied migrations are immutable (Flyway checksums), so V7 can change only until it
ships; CI runs `./mvnw -B verify`, the analytics suite and the e2e job on every push
(`.github/workflows/ci.yml:9–75`).

➡️
1. **The session store moves into Postgres (backend).** Test-first order inside the step:
   `SessionStoreMigrationTest` (red: no session tables) → V7 with the shipped script and the revoke
   (green) → the 254-character sign-in test (green on Redis) → swap the starter, remove the Redis
   properties, add `initialize-schema=never`, drop the Redis test container, adapt the restart test →
   the long-email test goes red on the vendor `VARCHAR(100)` → widen the column in the not-yet-shipped
   V7 → all green. Same change: ARCHITECTURE §3, SCHEMA.md, INSIGHTS.md, README's backend-development
   section, the code and test-support comments, the lesson. Leaves: the compose stacks still start a
   Redis container nobody uses (harmless; the backend waits on its healthcheck); CI green.
2. **Redis leaves the stack.** Compose files (Q19), healthcheck comments (Q16), launcher comments and
   the release README (Q20), README's upgrade line (Q21), ARCHITECTURE §5. Manual verification on a
   running stack (spec). Leaves: CI green; one container fewer.

⚖️ Strongest argument against: shipping V7 on its own first would split the database change from the
code change.

✅ Decision: two steps as above. V7 cannot be edited once shipped, and the red step of the
principal-name test only exists while V7 is still unshipped.

---

❓ **Q28** - **Order relative to candidate 7** (both edit both compose files)

🔎 Facts: candidate 7 turns the root compose file into an `include` of the release file with a
development layer; it needs Docker Compose 2.27+ and its behaviour on CI's Compose 2.38.2 is proven only
by its first CI run. This candidate has no version floor and removes a block from the same files.

➡️ This candidate lands first, candidate 7 second. The compose step here is written for "every file
that defines the stack", so it is correct in either order.

⚖️ Strongest argument against: after candidate 7 this candidate's compose edit would be one file.

✅ Decision: 13 → 7. The Strong candidate should not wait on the one with the version floor, and 7's
docs and its one-time model comparison then describe the final four-service stack.

---

❓ **Q29** - **Effects on sibling candidates**

🔎 Facts (sibling cards read): candidate 1 deepens `ActiveProfile` (G1); candidate 6 moves sign-in rules
out of `AuthController` and may move login tests (G1); candidate 17 removes JaCoCo from `backend/pom.xml`
and decides `TZ` handling in compose and the templates (G8); candidates 9/10 change the plan executor,
whose test harness applies every backend migration (G6).

➡️ Candidate 1: this change edits only one javadoc sentence of `ActiveProfile` — whichever lands second
rebases a comment. Candidate 6: the 254-character sign-in test goes wherever the login HTTP tests live at
implementation time; `SessionAuthenticator`'s behaviour is untouched here. Candidate 17: textual
neighbours in `pom.xml` and compose, no conflict in substance. Candidates 9/10: V7 is placeholder-free, so
the harness applies it as is; if any sibling also adds a migration, versions follow landing order.
Candidate 7: Q28.

⚖️ Strongest argument against: none.

✅ Decision: recorded in the spec's Further Notes.

---

❓ **Q30** - **The lesson for `docs/LESSONS.md`**

🔎 Facts: LESSONS.md already covers the Redis swap ("Spring Session: swapping `HttpSession`'s
backing store without touching the code that uses it", `:2617`), the restart test (after it) and the
database role (`:586`); the file is git-ignored (`.gitignore:13`).

➡️ "Spring Session on JDBC: Flyway owns the framework's tables, and default privileges reach them too"
— the store swap is a dependency swap (same pattern as "Spring Session: swapping `HttpSession`'s backing
store", LESSONS.md:2617); why the vendor script is copied into a migration instead of letting Spring
Session create it; why `ALTER DEFAULT PRIVILEGES` from V4 made the revoke necessary (builds on "A database
role is a privilege boundary that code cannot argue with", LESSONS.md:586); and that the cleanup job runs
on Spring Session's own scheduler thread, not on `@EnableScheduling`.

⚖️ Strongest argument against: none.

✅ Decision: as above.

---

## Decisions (one page)

| # | Decision | Evidence |
|---|---|---|
| D1 | `spring-boot-starter-session-jdbc` replaces `spring-boot-starter-session-data-redis` in one change; `testcontainers-redis` removed; no `-test` starter | Q3 |
| D2 | Flyway creates the tables in V7; `spring.session.jdbc.initialize-schema=never` set explicitly | Q4, Q12 |
| D3 | V7 = Spring Session 4.1.0's `schema-postgresql.sql` (names, types, keys, indexes), in `public`, default table name | Q5, Q6 |
| D4 | One deviation: the principal-name column is `TEXT` (the email may be 254 characters; vendor `VARCHAR(100)`) | Q8 |
| D5 | V7 revokes all privileges on both session tables from `myfinance_ro`, right after creating them | Q9 |
| D6 | New `SessionStoreMigrationTest`: every `public` table named `spring_session*` (non-empty list) has no column `myfinance_ro` can `SELECT` (`has_any_column_privilege`) | Q10 |
| D7 | New HTTP test: a 254-character email registers, signs in, and `/api/auth/me` answers 200 through the session cookie (red once against `VARCHAR(100)`) | Q17 |
| D8 | Default cleanup cron (every minute) on Spring Session's own scheduler; no interaction with `@EnableScheduling` or the charge job; no property | Q11 |
| D9 | JDK serialization unchanged; no application code changes | Q7 |
| D10 | `DatabaseCleaner` unchanged; `SessionSurvivesRestartTest` keeps its assertion with Redis removed; support classes lose the Redis bean and wording | Q13–Q15 |
| D11 | Cookieless requests proven by the two existing tests (store-agnostic by `commitSession`); manual row count on a real stack closes the `none`-mode note | Q16 |
| D12 | Redis removed from every compose file that defines the stack; launchers unchanged but for a comment; release README documents the one-time sign-out and `docker volume rm my-finance_redis-data` | Q19, Q20 |
| D13 | Downgrade works (`*:future`); development clones run `--remove-orphans` once | Q21, Q22 |
| D14 | Docs: ARCHITECTURE §3 rewritten (reversal recorded there, no ADR), §5; SCHEMA.md; INSIGHTS.md; READMEs; comments; lesson | Q25 |
| D15 | Steps: (1) backend store swap with docs; (2) Redis leaves the stack. Order: this candidate before candidate 7 | Q27, Q28 |

Unverified and labelled as such: the qualifier mismatch that keeps JDK serialization (from bean names;
observed by the first test run); the downgrade (from Flyway defaults); the 254-character address with
a single long domain label (not checked — the test uses DNS-sized labels); the real-stack row counts
(to be done in step 2's manual verification).
