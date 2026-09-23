# Passwordless Mode (backend first cut) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a self-hosted instance run with authentication switched off (`MYFINANCE_AUTH_MODE=none`), so a single-user install has no login screen, while the default stays password authentication and profile scoping is untouched.

**Architecture:** A Spring Security filter auto-authenticates every request as the one local account when the mode is `none`; everything downstream of the `SecurityContext` — sessions, Redis, CSRF, the active profile, service-layer profile scoping — is unchanged, because the filter produces exactly the principal a real login would have produced. Startup resolves that single account (0 users → create one, 1 → use it, >1 → refuse to start), and `register`/`login` are disabled in this mode so a second account can never appear.

**Tech Stack:** Java 21, Spring Boot, Spring Security, Spring Data JPA, Flyway, PostgreSQL, Redis-backed sessions, JUnit 5 + MockMvc + Testcontainers, AssertJ.

**Spec:** No separate spec file — the design was settled in the 2026-09-22 grilling session and is reproduced in "Design decisions" below. Background: `ARCHITECTURE.md` §3 "Profiles and authentication", `docs/API.md` "Cross-cutting decisions" and "Auth", `docs/SCHEMA.md` "`app_user`".

---

## Global Constraints

- **Default is unchanged.** `myfinance.auth.mode` defaults to `password`. No behavior changes for an existing install that sets nothing.
- **Profile scoping is untouched.** `ARCHITECTURE.md` §3: every data access stays scoped server-side to the active profile. This feature changes *who the principal is*, never *how data is scoped*. No service, repository, or query is modified by this plan.
- **Sessions, Redis, CSRF unchanged.** CSRF stays enforced in `none` mode. `AppUserDetails` stays `Serializable` with its pinned `serialVersionUID` — do not add fields to it.
- **`none` is opt-in and loopback-only by policy.** Never make `none` the default; never bind the server off-loopback as part of this plan. Startup in `none` mode must log a `WARN` stating the instance has no authentication.
- **Flyway owns the schema.** New migration is `V6__nullable_password_hash.sql`; `spring.jpa.hibernate.ddl-auto=validate` must still pass.
- **Docs travel with the code** (`CLAUDE.md`): a change to columns updates `docs/SCHEMA.md`, a change to endpoints or error shapes updates `docs/API.md`, in the *same commit*.
- **`docs/LESSONS.md` is gitignored.** Write the entry, never `git add` it.
- **Java is formatted by Maven Spotless**, which `verify` enforces — a formatting violation fails the build *after* the tests pass. Fix with `cd backend && ./mvnw spotless:apply`, never by hand. (Only the *lefthook* Spotless job was dropped in `6727525`; the Maven plugin is still the gate.) Do not run prettier, and do not reformat untouched code — Spotless only rewrites what it is given.
- **Every commit is green on its own:** `cd backend && ./mvnw -B verify` passes before each commit. Baseline at branch point (`397e39a`): green, exit 0.
- **Branch `feat/passwordless-mode`, local commits only.** No push, no PR, no tag, no merge.

## Design decisions

Settled 2026-09-22; do not re-litigate during execution.

| Decision | Value |
|---|---|
| Switch | `myfinance.auth.mode`, env `MYFINANCE_AUTH_MODE`, values `password` (default) / `none` |
| 0 users in `none` | create one, email `local@localhost`, display name `Local`, no password |
| 1 user in `none` | use it, whatever it is |
| >1 users in `none` | refuse to start, naming the count and the fix |
| Mechanism | Spring Security auto-login filter, so sessions/CSRF/profile scoping stay unchanged |
| `register` / `login` in `none` | disabled — `404` `/errors/auth-disabled` |
| How the frontend learns the mode | `authMode` added to the existing `SessionResponse` (`GET /api/auth/me`) — no new endpoint |
| Switching back to `password` | a passwordless account simply cannot log in (`401`); the "set password" screen is frontend work, out of scope here |

**Deliberately out of scope for this first cut** (follow-up commits, per the scope Chris chose): frontend gating and the set-password screen, launcher (`start.sh` / `start.bat`) mode prompts, and enforcing the `127.0.0.1` bind default. Binding is currently a launcher/compose concern; this cut only *warns* at startup. Flag this in the handoff.

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `backend/src/main/java/com/myfinance/backend/config/AuthMode.java` | The two-value enum |
| `backend/src/main/java/com/myfinance/backend/config/AuthProperties.java` | Binds `myfinance.auth.*` |
| `backend/src/main/java/com/myfinance/backend/service/LocalAccountService.java` | Resolves-or-creates the single local account; owns the 0/1/>1 rule |
| `backend/src/main/java/com/myfinance/backend/config/PasswordlessStartup.java` | `ApplicationRunner` that triggers the above and logs the WARN; active only in `none` |
| `backend/src/main/java/com/myfinance/backend/security/PasswordlessAutoLoginFilter.java` | Puts the local account in the `SecurityContext` on every request |
| `backend/src/main/java/com/myfinance/backend/exception/AuthDisabledException.java` | `404` `/errors/auth-disabled` |
| `backend/src/main/resources/db/migration/V6__nullable_password_hash.sql` | Drops `NOT NULL` from `app_user.password_hash` |
| `backend/src/test/java/com/myfinance/backend/config/AuthPropertiesTest.java` | Property binding, both modes |
| `backend/src/test/java/com/myfinance/backend/PasswordHashNullableMigrationTest.java` | The column really accepts `NULL`; a passwordless account can't log in |
| `backend/src/test/java/com/myfinance/backend/service/LocalAccountServiceTest.java` | The 0/1/>1 rule |
| `backend/src/test/java/com/myfinance/backend/config/PasswordlessModeTest.java` | End-to-end in `none`: auto-login, disabled endpoints, `authMode` on `/me` |

**Modified**

| File | Change |
|---|---|
| `backend/src/main/java/com/myfinance/backend/model/User.java` | `passwordHash` nullable; `passwordless(...)` factory |
| `backend/src/main/java/com/myfinance/backend/config/SecurityConfig.java` | Register the filter when mode is `none` |
| `backend/src/main/java/com/myfinance/backend/service/AuthService.java` | Guard `register`; add `authMode` to the session response |
| `backend/src/main/java/com/myfinance/backend/controller/AuthController.java` | Guard `login` |
| `backend/src/main/java/com/myfinance/backend/dto/SessionResponse.java` | New `authMode` component |
| `backend/src/main/resources/application.properties` | The new property with its default |
| `docs/SCHEMA.md`, `docs/API.md`, `ARCHITECTURE.md`, `README.md` | Match the code |

---

### Task 1: Auth mode configuration

**Files:**
- Create: `backend/src/main/java/com/myfinance/backend/config/AuthMode.java`
- Create: `backend/src/main/java/com/myfinance/backend/config/AuthProperties.java`
- Modify: `backend/src/main/resources/application.properties`
- Modify: `backend/src/main/java/com/myfinance/backend/BackendApplication.java` (enable `@ConfigurationProperties` scanning if not already on)
- Test: `backend/src/test/java/com/myfinance/backend/config/AuthPropertiesTest.java`
- Test: `backend/src/test/java/com/myfinance/backend/config/AuthPropertiesNoneModeTest.java`

**Interfaces:**
- Consumes: nothing.
- Produces: `AuthMode.PASSWORD`, `AuthMode.NONE`; `AuthProperties.mode()` returning `AuthMode`. Tasks 3–6 inject `AuthProperties`.

- [ ] **Step 1: Write the failing test**

```java
package com.myfinance.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

import com.myfinance.backend.support.IntegrationTest;

/** myfinance.auth.mode defaults to password authentication when nothing sets it. */
@IntegrationTest
class AuthPropertiesTest {

    @Autowired
    private AuthProperties authProperties;

    @Test
    void defaultsToPasswordAuthentication() {
        assertThat(authProperties.mode()).isEqualTo(AuthMode.PASSWORD);
        assertThat(authProperties.passwordless()).isFalse();
    }
}
```

The `none` case needs a different Spring context, so it is a **separate top-level class**, not a
nested one — surefire's default include pattern only picks up `*Test` classes, and a static nested
`NoneMode` class would silently never run.

`AuthPropertiesNoneModeTest.java`:

```java
package com.myfinance.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

import com.myfinance.backend.support.IntegrationTest;

/** The env var MYFINANCE_AUTH_MODE=none binds to AuthMode.NONE (relaxed binding, case-insensitive). */
@IntegrationTest
@TestPropertySource(properties = "myfinance.auth.mode=none")
class AuthPropertiesNoneModeTest {

    @Autowired
    private AuthProperties authProperties;

    @Test
    void bindsNone() {
        assertThat(authProperties.mode()).isEqualTo(AuthMode.NONE);
        assertThat(authProperties.passwordless()).isTrue();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw -B test -Dtest=AuthPropertiesTest`
Expected: FAIL — compilation error, `AuthProperties` and `AuthMode` do not exist.

- [ ] **Step 3: Write minimal implementation**

`AuthMode.java`:

```java
package com.myfinance.backend.config;

/**
 * How the instance authenticates. {@code NONE} is the single-user self-hosted case: there is no
 * login screen and every request is the one local account (see {@code PasswordlessAutoLoginFilter}).
 * It is opt-in and never the default.
 */
public enum AuthMode {
    PASSWORD,
    NONE
}
```

`AuthProperties.java`:

```java
package com.myfinance.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code myfinance.auth.*}. Relaxed binding means the env var {@code MYFINANCE_AUTH_MODE} sets
 * {@code mode}, which is how the launchers and docker-compose pass it.
 */
@ConfigurationProperties(prefix = "myfinance.auth")
public record AuthProperties(AuthMode mode) {

    public boolean passwordless() {
        return mode == AuthMode.NONE;
    }
}
```

`application.properties` — append a new block after the session-cookie block:

```properties
# --- Authentication mode (ARCHITECTURE.md "Profiles and authentication") ---
# "password" (default) is the normal login. "none" is the single-user self-hosted case: no login
# screen, every request is the one local account. Opt-in only, and it must not be exposed beyond
# localhost -- the backend logs a WARN at startup when it is on.
myfinance.auth.mode=${MYFINANCE_AUTH_MODE:password}
```

Check `BackendApplication.java` for `@ConfigurationPropertiesScan`. If absent, add it beside `@SpringBootApplication`:

```java
@SpringBootApplication
@ConfigurationPropertiesScan
public class BackendApplication {
```

(Import `org.springframework.boot.context.properties.ConfigurationPropertiesScan`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./mvnw -B test -Dtest='AuthPropertiesTest*'`
Expected: PASS, 2 tests.

- [ ] **Step 5: Full verify, then commit**

```bash
cd backend && ./mvnw -B verify
git add backend/src/main/java/com/myfinance/backend/config/AuthMode.java \
        backend/src/main/java/com/myfinance/backend/config/AuthProperties.java \
        backend/src/main/java/com/myfinance/backend/BackendApplication.java \
        backend/src/main/resources/application.properties \
        backend/src/test/java/com/myfinance/backend/config/AuthPropertiesTest.java
git commit -m "feat(auth): add the myfinance.auth.mode switch, defaulting to password"
```

---

### Task 2: A password hash that may be absent

**Files:**
- Create: `backend/src/main/resources/db/migration/V6__nullable_password_hash.sql`
- Modify: `backend/src/main/java/com/myfinance/backend/model/User.java`
- Modify: `docs/SCHEMA.md` (the `app_user` section, `password_hash` bullet)
- Test: `backend/src/test/java/com/myfinance/backend/PasswordHashNullableMigrationTest.java`

**Interfaces:**
- Consumes: nothing.
- Produces: `User.passwordless(String email, String displayName)` returning a `User` with a `null` hash. Task 3 calls it.

**Why:** the local account has no password, and `V1__core_schema.sql` declares `password_hash TEXT NOT NULL`. The second test pins the behavior that matters when an instance switches *back* to `password` mode: a passwordless account must fail login cleanly as `401`, never `500`.

- [ ] **Step 1: Write the failing test**

```java
package com.myfinance.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.UserRepository;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;

/**
 * V6__nullable_password_hash.sql (docs/SCHEMA.md "app_user"): the passwordless local account needs
 * a row with no hash. The login assertion is the half that matters when an instance switches back
 * to password mode — an account that cannot prove a password must be a clean 401, not a 500.
 */
@IntegrationTest
class PasswordHashNullableMigrationTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private MockMvc mockMvc;

    @Test
    void passwordHashIsNullable() {
        Boolean nullable = jdbcTemplate.queryForObject(
                """
                SELECT is_nullable = 'YES'
                  FROM information_schema.columns
                 WHERE table_name = 'app_user' AND column_name = 'password_hash'
                """,
                Boolean.class);
        assertThat(nullable).isTrue();
    }

    @Test
    void aPasswordlessAccountPersists() {
        User saved = userRepository.save(User.passwordless("local@localhost", "Local"));
        assertThat(userRepository.findById(saved.getId()).orElseThrow().getPasswordHash())
                .isNull();
    }

    @Test
    void aPasswordlessAccountCannotLogIn() throws Exception {
        userRepository.save(User.passwordless("local@localhost", "Local"));
        mockMvc.perform(post("/api/auth/login")
                        .with(TestFixtures.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                                """
                                {"email":"local@localhost","password":"anything"}
                                """))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.type").value("/errors/bad-credentials"));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw -B test -Dtest=PasswordHashNullableMigrationTest`
Expected: FAIL — compilation error, `User.passwordless` does not exist.

- [ ] **Step 3: Write minimal implementation**

`V6__nullable_password_hash.sql`:

```sql
-- The passwordless single-user mode (MYFINANCE_AUTH_MODE=none, ARCHITECTURE.md "Profiles and
-- authentication") stores a local account with no password at all. Every account created through
-- POST /api/auth/register still gets a hash; the column is simply no longer mandatory.
ALTER TABLE app_user ALTER COLUMN password_hash DROP NOT NULL;
```

In `User.java`, relax the column and add the factory:

```java
    @Column(name = "password_hash")
    private String passwordHash;
```

```java
    /**
     * The local account of a passwordless instance (MYFINANCE_AUTH_MODE=none). It holds no hash, so
     * it can never authenticate through the login endpoint — by construction, not by a check.
     */
    public static User passwordless(String email, String displayName) {
        return new User(normalizeEmail(email), null, displayName);
    }
```

In `docs/SCHEMA.md`, replace the `password_hash` bullet under `## app_user` with:

```markdown
- `password_hash` holds a BCrypt hash (`~60` chars) from Spring Security's
  `PasswordEncoder`. `TEXT` rather than `VARCHAR(60)` so an algorithm change
  (Argon2, longer hashes) isn't a migration. **Nullable since `V6`**: an instance
  running `MYFINANCE_AUTH_MODE=none` (ARCHITECTURE.md "Profiles and authentication")
  holds one local account with no password. A row with `NULL` here can never log in —
  `PasswordEncoder.matches` rejects it — so the absent hash is the enforcement, not a flag.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./mvnw -B test -Dtest=PasswordHashNullableMigrationTest`
Expected: PASS, 3 tests.

- [ ] **Step 5: Full verify, then commit**

```bash
cd backend && ./mvnw -B verify
git add backend/src/main/resources/db/migration/V6__nullable_password_hash.sql \
        backend/src/main/java/com/myfinance/backend/model/User.java \
        backend/src/test/java/com/myfinance/backend/PasswordHashNullableMigrationTest.java \
        docs/SCHEMA.md
git commit -m "feat(auth): let app_user.password_hash be absent, for the local account"
```

---

### Task 3: Resolving the single local account

**Files:**
- Create: `backend/src/main/java/com/myfinance/backend/service/LocalAccountService.java`
- Create: `backend/src/main/java/com/myfinance/backend/config/PasswordlessStartup.java`
- Test: `backend/src/test/java/com/myfinance/backend/service/LocalAccountServiceTest.java`

**Interfaces:**
- Consumes: `User.passwordless(...)` (Task 2), `AuthProperties` (Task 1).
- Produces: `LocalAccountService.resolveLocalAccount()` returning `User`, throwing `IllegalStateException` when more than one account exists. Task 4's filter calls `localAccountId()`.

**Why the rule lives in a service and the runner is three lines:** the 0/1/>1 decision is the testable part, and testing it directly beats booting a deliberately-failing application context. The `ApplicationRunner` only triggers it, so a failure aborts startup — which is the point: an ambiguous instance must not serve requests.

- [ ] **Step 1: Write the failing test**

```java
package com.myfinance.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.UserRepository;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;

/** The 0/1/>1 rule for MYFINANCE_AUTH_MODE=none (ARCHITECTURE.md "Profiles and authentication"). */
@IntegrationTest
class LocalAccountServiceTest {

    @Autowired
    private LocalAccountService localAccountService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TestFixtures fixtures;

    @Test
    void createsTheLocalAccountWhenThereAreNoUsers() {
        User resolved = localAccountService.resolveLocalAccount();

        assertThat(resolved.getEmail()).isEqualTo("local@localhost");
        assertThat(resolved.getDisplayName()).isEqualTo("Local");
        assertThat(resolved.getPasswordHash()).isNull();
        assertThat(userRepository.count()).isEqualTo(1);
    }

    @Test
    void adoptsTheSingleExistingAccountWhateverItIs() {
        User existing = fixtures.user("chris@example.com");

        User resolved = localAccountService.resolveLocalAccount();

        assertThat(resolved.getId()).isEqualTo(existing.getId());
        assertThat(userRepository.count()).isEqualTo(1);
    }

    @Test
    void isIdempotentAcrossRestarts() {
        Long first = localAccountService.resolveLocalAccount().getId();
        Long second = localAccountService.resolveLocalAccount().getId();

        assertThat(second).isEqualTo(first);
        assertThat(userRepository.count()).isEqualTo(1);
    }

    @Test
    void refusesWhenMoreThanOneAccountExists() {
        fixtures.user("chris@example.com");
        fixtures.user("someone@example.com");

        assertThatThrownBy(() -> localAccountService.resolveLocalAccount())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("2")
                .hasMessageContaining("MYFINANCE_AUTH_MODE");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw -B test -Dtest=LocalAccountServiceTest`
Expected: FAIL — compilation error, `LocalAccountService` does not exist.

- [ ] **Step 3: Write minimal implementation**

`LocalAccountService.java`:

```java
package com.myfinance.backend.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.UserRepository;

/**
 * The single account a passwordless instance runs as (MYFINANCE_AUTH_MODE=none). Resolved once at
 * startup: no users means a fresh install, so create one; exactly one means adopt it, whatever it
 * is; more than one is genuinely ambiguous — there is no way to pick whose data to serve without
 * asking, and serving the wrong person's finances is worse than refusing to start.
 */
@Service
public class LocalAccountService {

    public static final String LOCAL_EMAIL = "local@localhost";
    private static final String LOCAL_DISPLAY_NAME = "Local";

    private final UserRepository userRepository;

    public LocalAccountService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional
    public User resolveLocalAccount() {
        List<User> users = userRepository.findAll();
        if (users.size() > 1) {
            throw new IllegalStateException("MYFINANCE_AUTH_MODE=none needs exactly one account, but this "
                    + "database holds " + users.size() + ". Start with MYFINANCE_AUTH_MODE=password and "
                    + "remove the accounts you do not want, or point this instance at a different database.");
        }
        return users.isEmpty()
                ? userRepository.save(User.passwordless(LOCAL_EMAIL, LOCAL_DISPLAY_NAME))
                : users.get(0);
    }
}
```

`PasswordlessStartup.java`:

```java
package com.myfinance.backend.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import com.myfinance.backend.model.User;
import com.myfinance.backend.service.LocalAccountService;

/**
 * Resolves the local account before the instance serves anything, so an ambiguous database aborts
 * startup rather than surfacing as a confusing 500 on the first request. Only present when
 * {@code myfinance.auth.mode=none}.
 */
@Component
@ConditionalOnProperty(name = "myfinance.auth.mode", havingValue = "none")
public class PasswordlessStartup implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PasswordlessStartup.class);

    private final LocalAccountService localAccountService;

    public PasswordlessStartup(LocalAccountService localAccountService) {
        this.localAccountService = localAccountService;
    }

    @Override
    public void run(ApplicationArguments args) {
        User local = localAccountService.resolveLocalAccount();
        log.warn(
                "AUTHENTICATION IS OFF (MYFINANCE_AUTH_MODE=none). Every request is served as '{}'. "
                        + "Do not expose this instance beyond localhost.",
                local.getEmail());
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./mvnw -B test -Dtest=LocalAccountServiceTest`
Expected: PASS, 4 tests.

- [ ] **Step 5: Full verify, then commit**

```bash
cd backend && ./mvnw -B verify
git add backend/src/main/java/com/myfinance/backend/service/LocalAccountService.java \
        backend/src/main/java/com/myfinance/backend/config/PasswordlessStartup.java \
        backend/src/test/java/com/myfinance/backend/service/LocalAccountServiceTest.java
git commit -m "feat(auth): resolve the single local account at startup in passwordless mode"
```

---

### Task 4: Auto-login filter

**Files:**
- Create: `backend/src/main/java/com/myfinance/backend/security/PasswordlessAutoLoginFilter.java`
- Modify: `backend/src/main/java/com/myfinance/backend/config/SecurityConfig.java`
- Test: `backend/src/test/java/com/myfinance/backend/config/PasswordlessModeTest.java`

**Interfaces:**
- Consumes: `LocalAccountService.resolveLocalAccount()` (Task 3), `AuthProperties` (Task 1), existing `AppUserDetails`.
- Produces: a `SecurityContext` holding an `AppUserDetails` for the local account on every request in `none` mode. Tasks 5 and 6 add to the same test class.

**Why per-request and not session-persisted:** the filter is cheaper than a login and needs no session of its own — the active profile still creates the session when it is set, exactly as in password mode. CSRF stays on, so the frontend's existing `X-XSRF-TOKEN` handling is unchanged.

- [ ] **Step 1: Write the failing test**

```java
package com.myfinance.backend.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.myfinance.backend.support.IntegrationTest;

/**
 * End-to-end behavior of MYFINANCE_AUTH_MODE=none: no credentials anywhere in the request, and the
 * API answers as the local account. The password-mode half of each behavior is covered by the
 * existing SecurityConfigTest and AuthControllerTest, which run in the default mode.
 */
@IntegrationTest
@TestPropertySource(properties = "myfinance.auth.mode=none")
class PasswordlessModeTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void anUnauthenticatedRequestIsServedAsTheLocalAccount() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.email").value("local@localhost"))
                .andExpect(jsonPath("$.activeProfileId").doesNotExist());
    }

    @Test
    void aScopedEndpointIsReachableWithoutLoggingIn() throws Exception {
        mockMvc.perform(get("/api/profiles")).andExpect(status().isOk());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw -B test -Dtest=PasswordlessModeTest`
Expected: FAIL — `401` with `/errors/unauthenticated`; nothing authenticates the request yet.

- [ ] **Step 3: Write minimal implementation**

`PasswordlessAutoLoginFilter.java`:

```java
package com.myfinance.backend.security;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import com.myfinance.backend.model.User;
import com.myfinance.backend.service.LocalAccountService;

/**
 * Authenticates every request as the single local account when the instance runs without passwords
 * (MYFINANCE_AUTH_MODE=none). It produces exactly the principal a real login produces, so
 * everything downstream — the active profile in the session, CSRF, and the service layer's profile
 * scoping — behaves identically and needed no change.
 *
 * <p>Registered only in that mode ({@code SecurityConfig}); in password mode this class is never in
 * the chain. An already-authenticated context is left alone so the filter can never override a
 * real session.
 */
public class PasswordlessAutoLoginFilter extends OncePerRequestFilter {

    private final LocalAccountService localAccountService;

    public PasswordlessAutoLoginFilter(LocalAccountService localAccountService) {
        this.localAccountService = localAccountService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (SecurityContextHolder.getContext().getAuthentication() == null) {
            User local = localAccountService.resolveLocalAccount();
            AppUserDetails principal = new AppUserDetails(local);
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(
                    UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities()));
            SecurityContextHolder.setContext(context);
        }
        chain.doFilter(request, response);
    }
}
```

In `SecurityConfig.java`: add `AuthProperties authProperties` and `LocalAccountService localAccountService` as parameters of the `securityFilterChain` bean method. Then register the filter with a plain `if` placed **after** the existing builder chain and **before** `return http.build();` — a conditional inside the chain would need a no-op filter for the other branch, which is machinery for nothing:

```java
        // Passwordless mode only: authenticate as the local account before authorization runs.
        // After SecurityContextHolderFilter, so a real session context is already loaded and wins.
        if (authProperties.passwordless()) {
            http.addFilterAfter(
                    new PasswordlessAutoLoginFilter(localAccountService), SecurityContextHolderFilter.class);
        }
        return http.build();
```

Add the imports `org.springframework.security.web.context.SecurityContextHolderFilter`,
`com.myfinance.backend.security.PasswordlessAutoLoginFilter`,
`com.myfinance.backend.service.LocalAccountService`. Extend the class Javadoc with one sentence:

```java
 *   <li>When {@code myfinance.auth.mode=none} a {@link PasswordlessAutoLoginFilter} authenticates
 *       every request as the single local account; the rest of the chain is unchanged.</li>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./mvnw -B test -Dtest=PasswordlessModeTest`
Expected: PASS, 2 tests.

- [ ] **Step 5: Confirm password mode is untouched**

Run: `cd backend && ./mvnw -B test -Dtest='SecurityConfigTest,AuthControllerTest'`
Expected: PASS, unchanged — a `401` for an unauthenticated request in the default mode.

- [ ] **Step 6: Full verify, then commit**

```bash
cd backend && ./mvnw -B verify
git add backend/src/main/java/com/myfinance/backend/security/PasswordlessAutoLoginFilter.java \
        backend/src/main/java/com/myfinance/backend/config/SecurityConfig.java \
        backend/src/test/java/com/myfinance/backend/config/PasswordlessModeTest.java
git commit -m "feat(auth): authenticate every request as the local account in passwordless mode"
```

---

### Task 5: Register and login are disabled in passwordless mode

**Files:**
- Create: `backend/src/main/java/com/myfinance/backend/exception/AuthDisabledException.java`
- Modify: `backend/src/main/java/com/myfinance/backend/service/AuthService.java`
- Modify: `backend/src/main/java/com/myfinance/backend/controller/AuthController.java`
- Modify: `docs/API.md`
- Test: `backend/src/test/java/com/myfinance/backend/config/PasswordlessModeTest.java` (add)

**Interfaces:**
- Consumes: `AuthProperties` (Task 1), existing `ApiException`.
- Produces: `AuthDisabledException` → `404` `/errors/auth-disabled`.

**Why this matters and isn't cosmetic:** the auto-login filter authenticates *every* request, `/api/auth/register` included. Without this guard a second account could be created at runtime, and the instance would then refuse to start on its next restart (Task 3's `>1` rule). The guard is what keeps that rule satisfiable.

- [ ] **Step 1: Write the failing test** (append these methods to `PasswordlessModeTest`)

```java
    @Test
    void registerIsDisabled() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .with(TestFixtures.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                                """
                                {"email":"someone@example.com","password":"correct-horse-battery","displayName":"Someone"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("/errors/auth-disabled"));
    }

    @Test
    void loginIsDisabled() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .with(TestFixtures.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"local@localhost","password":"anything"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/auth-disabled"));
    }

    @Test
    void noSecondAccountIsEverCreated() {
        assertThat(userRepository.count()).isEqualTo(1);
    }
```

Add the imports this needs: `static org.assertj.core.api.Assertions.assertThat`,
`static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post`,
`static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content`,
`org.springframework.http.MediaType`, `com.myfinance.backend.repository.UserRepository`,
`com.myfinance.backend.support.TestFixtures`, plus the field:

```java
    @Autowired
    private UserRepository userRepository;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw -B test -Dtest=PasswordlessModeTest`
Expected: FAIL — `register` returns `201` and `login` returns `401`; neither is `404`.

- [ ] **Step 3: Write minimal implementation**

`AuthDisabledException.java`:

```java
package com.myfinance.backend.exception;

import org.springframework.http.HttpStatus;

/**
 * Registration and login do not exist on an instance running MYFINANCE_AUTH_MODE=none. 404 rather
 * than 403: the route genuinely is not part of this deployment's API, and 403 already means "CSRF
 * token missing or invalid" everywhere else in this API.
 */
public class AuthDisabledException extends ApiException {

    public AuthDisabledException() {
        super(
                HttpStatus.NOT_FOUND,
                "auth-disabled",
                "Authentication is disabled",
                "This instance runs without passwords (MYFINANCE_AUTH_MODE=none); "
                        + "registration and login are not available.");
    }
}
```

In `AuthService`, inject `AuthProperties authProperties` (add the constructor parameter and field) and guard `register` as its first statement:

```java
    @Transactional
    public UserResponse register(RegisterRequest request) {
        if (authProperties.passwordless()) {
            throw new AuthDisabledException();
        }
        String email = User.normalizeEmail(request.email());
```

In `AuthController`, inject `AuthProperties authProperties` and guard `login` as its first statement:

```java
    @PostMapping("/login")
    public SessionResponse login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        if (authProperties.passwordless()) {
            throw new AuthDisabledException();
        }
```

In `docs/API.md`, add to the `## Auth` section, directly under the heading:

```markdown
> **Passwordless instances.** When the server runs with `MYFINANCE_AUTH_MODE=none`
> (ARCHITECTURE.md "Profiles and authentication") there is no login: every request is
> already the single local account. `POST /api/auth/register` and `POST /api/auth/login`
> answer **`404` `/errors/auth-disabled`**, and `GET /api/auth/me` never returns `401`.
> Clients tell the two deployments apart by the `authMode` field on the session response.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./mvnw -B test -Dtest=PasswordlessModeTest`
Expected: PASS, 5 tests.

- [ ] **Step 5: Full verify, then commit**

```bash
cd backend && ./mvnw -B verify
git add backend/src/main/java/com/myfinance/backend/exception/AuthDisabledException.java \
        backend/src/main/java/com/myfinance/backend/service/AuthService.java \
        backend/src/main/java/com/myfinance/backend/controller/AuthController.java \
        backend/src/test/java/com/myfinance/backend/config/PasswordlessModeTest.java \
        docs/API.md
git commit -m "feat(auth): disable register and login on a passwordless instance"
```

---

### Task 6: The session response carries the auth mode

**Files:**
- Modify: `backend/src/main/java/com/myfinance/backend/dto/SessionResponse.java`
- Modify: `backend/src/main/java/com/myfinance/backend/service/AuthService.java`
- Modify: `docs/API.md`
- Test: `backend/src/test/java/com/myfinance/backend/config/PasswordlessModeTest.java` (add), `backend/src/test/java/com/myfinance/backend/controller/AuthControllerTest.java` (add)

**Interfaces:**
- Consumes: `AuthProperties` (already injected into `AuthService` by Task 5).
- Produces: `SessionResponse(SessionUser user, List<ProfileSummary> profiles, Long activeProfileId, AuthMode authMode)`. This is the contract the frontend follow-up consumes.

**Why no new endpoint:** the frontend already calls `GET /api/auth/me` on page load to decide what to render. In `none` mode that call now always succeeds, so one extra field on a response it already reads is all the information it needs — a separate capability endpoint would be a second round trip for one enum.

- [ ] **Step 1: Write the failing tests**

In `PasswordlessModeTest`:

```java
    @Test
    void theSessionResponseReportsTheMode() throws Exception {
        mockMvc.perform(get("/api/auth/me")).andExpect(jsonPath("$.authMode").value("NONE"));
    }
```

In `AuthControllerTest`, add a test that the default mode reports itself — match the file's existing style for building an authenticated request:

```java
    @Test
    void meReportsPasswordAuthentication() throws Exception {
        User user = fixtures.user("chris@example.com");
        mockMvc.perform(get("/api/auth/me").with(fixtures.as(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authMode").value("PASSWORD"));
    }
```

**Wire casing:** upper case, and deliberately so. Every enum this API already emits is upper case
(`"type": "EXPENSE"`, `"billingPeriod": "MONTHLY"`) and the codebase contains no `@JsonValue` and no
enum-naming configuration — Jackson's default `name()` serialization is the established convention
here, so `authMode` follows it rather than introducing a second style. The *input* side is
unaffected: Spring's relaxed binding accepts `MYFINANCE_AUTH_MODE=none` case-insensitively.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./mvnw -B test -Dtest='PasswordlessModeTest,AuthControllerTest'`
Expected: FAIL — `$.authMode` does not exist in either response.

- [ ] **Step 3: Write minimal implementation**

`SessionResponse.java`:

```java
package com.myfinance.backend.dto;

import java.util.List;

import com.myfinance.backend.config.AuthMode;

/**
 * Returned by login and {@code GET /api/auth/me}: who is logged in, their profiles, which one is
 * active, and how this instance authenticates — {@code authMode} is how the frontend knows whether
 * to offer a login screen at all (docs/API.md "Auth").
 */
public record SessionResponse(
        SessionUser user, List<ProfileSummary> profiles, Long activeProfileId, AuthMode authMode) {

    public record SessionUser(Long id, String email, String displayName) {}
}
```

In `AuthService.session(...)`, pass the mode as the fourth argument:

```java
        return new SessionResponse(
                new SessionResponse.SessionUser(user.getId(), user.getEmail(), user.getDisplayName()),
                profiles,
                activeId,
                authProperties.mode());
```

No Jackson annotation is needed: the enum serializes as `name()`, which is the upper-case form the
rest of this API already uses. Do **not** add `@JsonValue`, and do **not** import anything from
`com.fasterxml.jackson.databind` — the `noJackson2Databind` ArchUnit rule fails the build on it.

In `docs/API.md`, update both places that show the session shape — the `POST /api/auth/login` response body and the `GET /api/auth/me` description — adding the field to the JSON sample:

```json
{
  "user": { "id": 1, "email": "chris@example.com", "displayName": "Chris" },
  "profiles": [
    { "id": 3, "name": "Personal", "defaultCurrency": "PLN" },
    { "id": 4, "name": "Company",  "defaultCurrency": "EUR" }
  ],
  "activeProfileId": null,
  "authMode": "PASSWORD"
}
```

and a line under it:

```markdown
`authMode` is `"PASSWORD"` or `"NONE"` — how the server authenticates, not anything about this
user. A client uses it to decide whether to render a login screen and a log-out control at all.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./mvnw -B test -Dtest='PasswordlessModeTest,AuthControllerTest'`
Expected: PASS.

- [ ] **Step 5: Full verify, then commit**

```bash
cd backend && ./mvnw -B verify
git add backend/src/main/java/com/myfinance/backend/dto/SessionResponse.java \
        backend/src/main/java/com/myfinance/backend/service/AuthService.java \
        backend/src/test/java/com/myfinance/backend/config/PasswordlessModeTest.java \
        backend/src/test/java/com/myfinance/backend/controller/AuthControllerTest.java \
        docs/API.md
git commit -m "feat(auth): report the auth mode on the session response"
```

---

### Task 7: Document the mode

**Files:**
- Modify: `ARCHITECTURE.md` ("Profiles and authentication")
- Modify: `README.md`
- Modify: `docs/LESSONS.md` (**gitignored — write it, never `git add` it**)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing code-facing.

- [ ] **Step 1: Add the ARCHITECTURE.md subsection**

Append to the "Profiles and authentication" bullet list in §3:

```markdown
- **Passwordless mode.** `MYFINANCE_AUTH_MODE=none` (default `password`) turns a self-hosted
  instance into a single-user one with no login screen: `PasswordlessAutoLoginFilter`
  authenticates every request as one local account, which startup resolves — no users means
  create `local@localhost`, one means adopt it, more than one refuses to start rather than
  guess whose data to serve. It is deliberately implemented as a filter producing the ordinary
  principal, so sessions, Redis, CSRF, and the service layer's profile scoping are unchanged and
  untested-by-this-feature code paths stay the ones already in production. `register` and `login`
  answer `404` in this mode, which is what keeps "exactly one account" true at runtime. The mode
  removes authentication, not authorization: it must not be exposed beyond localhost, and the
  backend logs a `WARN` at every startup saying so.
```

- [ ] **Step 2: Add the README note**

`README.md` documents environment variables inline rather than in a table. Add a paragraph to
**"### Run the whole stack (Docker Compose)"**, directly after the existing paragraph that ends
"…so only the backend can call it.":

```markdown
If you are the only person using this instance, you can skip accounts entirely: set
`MYFINANCE_AUTH_MODE=none` in `.env` before the first start. There is then no register or login
screen — the app serves one local account, and the backend logs a warning at every start to say
authentication is off. Use it only on a machine you control and do not publish the port beyond
localhost. Switching back to the default `MYFINANCE_AUTH_MODE=password` leaves that account
unable to log in until it is given a password.
```

- [ ] **Step 3: Add the LESSONS.md entry** (write, do not `git add`)

Follow the template at the top of the file; content along these lines:

```markdown
## Spring Security: a filter is how you change *who*, not *whether*

Passwordless mode could have been a flag checked in every service ("if auth is off, skip the
owner check") — which is how it usually goes wrong. Instead it is one `OncePerRequestFilter` that
puts an ordinary `AppUserDetails` into the `SecurityContext`, exactly as a successful login does.
Everything downstream — the session in Redis, CSRF, `CurrentUser`, the profile scoping in the
service layer — cannot tell the difference and therefore needed no change and no new tests.

The Python instinct here is middleware setting `request.user`, and it transfers directly: Spring's
filter chain is the same idea, and `SecurityContextHolder` is the thread-local the rest of the
framework reads. The lesson is about *where* to intervene — the highest point where the answer is
still "a principal", so that every decision below it stays untouched. A feature that adds branches
to twenty call sites is usually a feature intervening too low.

See `PasswordlessAutoLoginFilter` and the conditional registration in `SecurityConfig`.
```

- [ ] **Step 4: Full verify, then commit**

```bash
cd backend && ./mvnw -B verify
git add ARCHITECTURE.md README.md
git commit -m "docs: describe passwordless mode and its blast radius"
git status --short   # docs/LESSONS.md must NOT appear — it is gitignored
```

---

## Done criteria

- [ ] `cd backend && ./mvnw -B verify` green on the final commit.
- [ ] Default mode: every pre-existing test passes unchanged — an unauthenticated request is still `401`.
- [ ] `none` mode: no credentials anywhere, `GET /api/auth/me` is `200` as `local@localhost`, scoped endpoints work, `register`/`login` are `404`, exactly one account exists.
- [ ] `docs/SCHEMA.md`, `docs/API.md`, `ARCHITECTURE.md`, `README.md` match the code.
- [ ] Seven commits on `feat/passwordless-mode`, nothing pushed.
- [ ] Handoff names the three deferred pieces: frontend gating and set-password screen, launcher prompts, and the `127.0.0.1` bind default.
