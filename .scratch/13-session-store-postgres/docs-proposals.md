# Candidate 13 — Sessions move into the Postgres already there: docs proposals

## (a) Proposed glossary terms

**Session**:
A signed-in browser's state kept on the server between requests: who is signed in (in `password`
mode) and which Profile is active. It ends at sign-out, after 8 hours without a request, or when an
upgrade replaces the store that held it.
_Avoid_: login (as a noun), token, JWT, "the cookie" (the cookie only carries the session's id)

(The seed list already has **Active profile**, which lives in the Session; this term names the thing a
self-hosting user is told they lose once at the upgrade.)

## (b) Proposed ADRs

None. The change reverses a decision recorded in ARCHITECTURE.md §3 ("Sessions are stored in Redis").
Per the brief's repo rule, the reversal is recorded by rewriting that section in the same change (below),
not in a separate ADR, so there is one source of truth.

## (c) Required updates to recorded-decision documents

### 1. ARCHITECTURE.md §3 "Profiles and authentication" — the session-store bullet (lines 113–123)

Replace the whole bullet with:

> - Sessions are stored in **PostgreSQL**, in the database the stack already runs, through Spring
>   Session's JDBC store (`spring-boot-starter-session-jdbc`) — not in servlet-container memory.
>   `HttpSessionSecurityContextRepository` is unchanged: once Spring Session is on the classpath,
>   `request.getSession()` is transparently backed by the store. A self-hosted update restarts the
>   backend container; with sessions held only in that process's memory, every update would log every
>   user out. The two tables (`spring_session`, `spring_session_attributes`) are created by Flyway
>   (`V7`) from the script Spring Session ships — see `docs/SCHEMA.md` "Session store" — Spring Session
>   deletes expired rows every minute on its own scheduler thread, and the read-only analytics role is
>   explicitly denied them, because a session id is a bearer credential. Redis held the sessions from
>   `b80d087` until <date of this change>; it was dropped because a container, a volume and a
>   healthcheck for one user's session were out of proportion when the database already there gives the
>   same restart survival. The cost accepted: every authenticated request reads and updates one session
>   row. A second backend instance would still share sessions through the database, though horizontal
>   scaling is a non-goal (§7). The default serializer is JDK serialization (not Jackson — see "OpenAPI
>   schema and the Jackson 2/3 split" below for why that distinction matters elsewhere), so every type
>   placed on the session (`AppUserDetails`, the active-profile id) must implement `Serializable`.

### 2. ARCHITECTURE.md §3 "Profiles and authentication" — the passwordless bullet (line 134)

"…so sessions, Redis, CSRF and the profile scoping above are unchanged…" becomes "…so sessions, CSRF and
the profile scoping above are unchanged…".

### 3. ARCHITECTURE.md §5 "Docker Compose stack" — the service list (lines 276–277)

Delete the `redis` bullet. (Candidate 7 rewrites this paragraph and adds the `analytics` service the
list omits today; if candidate 7 lands first, its text already has no `redis` bullet.)

### 4. docs/SCHEMA.md

**4a. "Conventions" (after the table, lines 69–86)** — add:

> **Framework-owned tables.** `spring_session` and `spring_session_attributes` belong to Spring Session:
> their shape is dictated by the SQL its JDBC repository issues, so they follow the PostgreSQL script
> Spring Session ships rather than the conventions above (upper-case names that Postgres folds to lower
> case, `CHAR(36)` UUID keys, times as epoch-millisecond `BIGINT`s). See "Session store".

**4b. A new section "## Session store (`spring_session`, `spring_session_attributes`)"**, placed after
"The read-only analytics role" and before "Foreign keys and cascade behavior":

> The HTTP sessions (ARCHITECTURE.md "Profiles and authentication"): who is signed in and which profile
> is active, kept server-side so a backend restart signs no one out. Created by `V7` as a copy of Spring
> Session 4.1.0's `org/springframework/session/jdbc/schema-postgresql.sql`, because Spring Session's
> `JdbcIndexedSessionRepository` issues SQL against exactly these names and types; Spring Session's own
> schema initialisation is off (`spring.session.jdbc.initialize-schema=never`).
>
> | Table | Holds |
> |---|---|
> | `spring_session` | One row per session: `primary_id` and `session_id` (`CHAR(36)` UUIDs; the session cookie carries `session_id`, base64-encoded — reversibly, so reading this column is enough to replay a session), creation, last-access and expiry times (epoch milliseconds), `max_inactive_interval` (seconds), `principal_name` (the signed-in email; `NULL` for a passwordless session) |
> | `spring_session_attributes` | One row per session attribute, JDK-serialized (`BYTEA`): the Spring Security context and `ACTIVE_PROFILE_ID` |
>
> - **One deviation from the shipped script:** `principal_name` is `TEXT`, not `VARCHAR(100)`. It holds
>   the sign-in email, which `POST /api/auth/register` accepts up to 254 characters; with 100, a longer
>   address could register but never sign in (saving the session would fail). `TEXT` for the same reason
>   as `app_user.password_hash`: the length rule lives in one place. Re-apply the deviation if a future
>   Spring Session release changes its script.
> - **No foreign key to `app_user`.** Which user a session belongs to is known only inside the
>   serialized security context. Users are never deleted through the API; a profile deleted while a
>   session has it active is handled when the session is next read (`docs/API.md`).
> - **Expiry.** Spring Session deletes sessions past their expiry time every minute — its own job, not
>   the app's `@Scheduled` charge job — and attribute rows follow through the foreign key's cascade. A
>   session read after it expired is deleted on the spot and never honoured, even before the job runs.
> - **Not readable by the analytics role.** `V7` revokes all privileges on both tables from
>   `myfinance_ro` right after creating them (see "The read-only analytics role"). `SessionStoreMigrationTest`
>   fails if any `spring_session*` table becomes readable to that role, including through a column-level
>   grant.
> - **Upgrades from a Redis-backed release** lose their sessions once: everyone signs in again (in
>   passwordless mode, picks the profile again).

**4c. "The read-only analytics role" (lines 505–513)** — after "…which is the only credential the
analytics service holds…", add:

> **One exception:** the session tables. `V7` revokes the default-privilege `SELECT` on
> `spring_session` and `spring_session_attributes` right after creating them: a session id is a bearer
> credential (anyone who reads it can replay it as a cookie), and a serialized principal is not
> analytics data. This is a two-table exception named after a framework constant, not a table list that
> grows with each migration; `SessionStoreMigrationTest` keeps it true.

**4d. "Foreign keys and cascade behavior" (lines 516–533)** — add a row and a sentence:

> | `spring_session_attributes.session_primary_id` | `spring_session.primary_id` | **CASCADE** | Spring Session's own: a session's attributes die with it (the cleanup job deletes only session rows). |
>
> Sessions have no foreign key to `app_user` — see "Session store".

### 5. docs/INSIGHTS.md "The analytics service" — the "Read-only role" bullet (lines 385–391)

"…creates role `myfinance_ro` with `SELECT` on all tables (+ `ALTER DEFAULT PRIVILEGES` for future
ones)…" becomes "…creates role `myfinance_ro` with `SELECT` on all tables (+ `ALTER DEFAULT PRIVILEGES`
for future ones) — except the session tables, which `V7` revokes (SCHEMA.md "Session store")…".

### 6. README.md

- "Backend (development)" (lines 99–111): "Requirements: Java 21 and a PostgreSQL 16+ database." Delete
  the Redis sentence and the `docker run … redis` line.
- "Run the whole stack (Docker Compose)": add one line — "Upgrading a clone from a version with Redis:
  run `docker compose up -d --build --remove-orphans` once so the old `redis` container is removed; its
  `…_redis-data` volume held only sessions and can be deleted with `docker volume rm`."
- "Backend tests" (lines 200–212): unchanged — the `local-db` command becomes complete as written.

### 7. deploy/release/README.md

- "Where your data lives" (lines 72–79): delete the parenthesis about the second volume `redis-data`.
- "Update" (lines 90–101): add, next to the Ollama note:
  > Upgrading from a bundle with a `redis` service (sessions used to live there): everyone is signed out
  > once — sign in again (in `none` mode, pick your profile again). The start script removes the old
  > `redis` container; its volume held only sign-in sessions, so `docker volume rm my-finance_redis-data`
  > frees the space without touching your data.

### 8. Comments (not recorded-decision documents; wording for the implementer)

- `application.properties`, the session-store block: sessions live in Postgres (Spring Session JDBC),
  not in servlet-container memory, so a restart signs no one out; `initialize-schema=never` because
  Flyway's V7 owns the tables; Spring Session deletes expired sessions every minute on its own thread.
- Compose header (every file that defines the stack): drop "redis only from the backend (HTTP session
  storage)".
- Backend healthcheck comment: "Probing every 5s must not leave sessions behind: a cookieless request
  creates none in either mode — `SecurityConfigTest.unauthenticatedRequestCreatesNoSession` (password)
  and `PasswordlessModeTest.aCookielessRequestLeavesNoSessionBehind` (none) — and on a real stack the
  row count of `spring_session` stays unchanged across repeated probes (checked in both modes)."
- Launchers: "(the removed ollama service)" → "(the removed ollama and redis services)".
- `ActiveProfile` class comment: "…leaves nothing behind in the session store."
- `AppUserDetails`: "…changes nothing for sessions already in the store."
- `TestcontainersConfiguration`, `IntegrationTest`, `TestFixtures`, `PasswordlessModeTest`,
  `SessionSurvivesRestartTest`: name the JDBC store / Postgres instead of Redis.

### 9. docs/LESSONS.md (git-ignored) — entry draft

> ### Spring Session on JDBC: Flyway owns the framework's tables, and default privileges reach them too
>
> - **What** — the session store moved from Redis to Spring Session's JDBC store by swapping one
>   starter (same pattern as "Spring Session: swapping `HttpSession`'s backing store…"). Two tables
>   appeared in the database the app already has.
> - **Where** — `backend/pom.xml`, `application.properties`, `V7` migration, `SessionStoreMigrationTest`.
> - **Why it's this way** — Spring Session can create its own tables, but this project lets Flyway own
>   every table, so the vendor's PostgreSQL script is copied into a migration and Spring Session's
>   initialiser is switched off. Because V4 ran `ALTER DEFAULT PRIVILEGES … GRANT SELECT … TO
>   myfinance_ro`, *any* table a later migration creates is readable by the analytics role — including
>   the session table, whose ids work as login cookies — so the same migration revokes it (builds on "A
>   database role is a privilege boundary that code cannot argue with"). In Python terms: a default
>   applied at creation time, like a metaclass hook, reaches classes you didn't write too. Expired rows
>   are deleted by a job Spring Session schedules on its own thread, not through `@EnableScheduling`.
>   The older entries about Redis stay as a record of the earlier choice.
