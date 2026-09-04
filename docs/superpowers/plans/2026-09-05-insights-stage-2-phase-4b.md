# Insights — Stage 2: Phase 4b Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the flagship question real — "Lidl vs Biedronka, monthly" on actual merchant
data rather than a category-per-merchant workaround — and add the analytics that justify a
separate Python service: forecasts, anomaly flags, and drift detection on pinned insights.

**Architecture:** Two independent additions on top of Stage 1, neither of which changes the
renderer contract. A nullable `txn.merchant` column (`V5`) activates the merchant filter
*and* the merchant grouping axis, both of which the Stage 1 executor rejects by design.
A `forecast` plan field bumps the DSL to **version 2** — the executor accepts `{1, 2}` and
a v2 plan is a v1 plan plus `forecast`, so every saved v1 plan keeps executing untouched.
Projected points are a `timeseries` **variant** flagged `projected: true`, rendered as a
dashed continuation — not a fifth shape.

**Tech Stack:** As Stage 1. No new runtime dependencies.

**Spec:** [`docs/superpowers/specs/2026-09-04-insights-implementation-design.md`](../specs/2026-09-04-insights-implementation-design.md)
— decisions D2 (both merchant axes rejected until V5) and assumptions A1 (version 2) and
A2 (merchant needs no bump) are load-bearing here.

**Prerequisite:** Stage 1 complete and merged.

**Covers Linear:** MY-33, MY-34 (under umbrella MY-28).

**Stage gate:** the canonical `INSIGHTS.md` plan — including `filters.merchants` — returns
a correct `timeseriesSplit` end to end, and a saved v1 plan still executes after the bump.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied
verbatim from the spec and from the committed design docs.

**Versions, pinned.** Java 21 · Spring Boot 4.1.0 (Spring Framework 7, **Jackson 3**) ·
Postgres `postgres:16-alpine` (identical tag in `docker-compose.yml`,
`deploy/release/docker-compose.yml`, `TestcontainersConfiguration.java`, and the Python
test harness) · Node 20 · React 19.2 · Vite 7 · TypeScript ~5.9.2 ·
Python 3.12+ (uv, ruff, pytest, psycopg, FastAPI) · `recharts@^3.10.1`.

**Jackson 3, not 2.** Databind is `tools.jackson.databind.json.JsonMapper` (an injectable
bean); annotations stay `com.fasterxml.jackson.annotation.*`; `JacksonException` is
`tools.jackson.core.JacksonException`. `@AutoConfigureMockMvc` lives in
`org.springframework.boot.webmvc.test.autoconfigure`. Starters are per-slice
(`spring-boot-starter-webmvc`, `-webmvc-test`, `-flyway`, `-flyway-test`, `-data-jpa-test`).

**No Lombok, anywhere.** Constructor injection with a single `final` field. DTOs are
`record`s; request records carry Bean Validation, response records carry a static
`from(entity)` factory.

**Profile scoping is a security boundary** (`ARCHITECTURE.md` §3). Never accept a
client-supplied profile id. `activeProfile.requireId()` at the top of every public
service method, including readers. Single-row access is
`findByIdAndProfileId(...).orElseThrow(...)`. A row in another profile is **404, never 403**.
Every hand-written SQL statement carries `profile_id` — in the outer query *and* in
both terms of any recursive CTE.

**Money.** `NUMERIC(19,4)` in the database, decimal **strings** on the wire, ISO 4217 code
alongside. Never floats, never client-side arithmetic. Aggregation is always per currency;
currencies never mix in one result. `COALESCE(SUM(t.amount), 0)` yields scale 0 and
serialises `"0"` — always cast `::numeric(19,4)` so an empty bucket is `"0.0000"`.

**Dates.** All ranges are inclusive on both ends. `txn.occurred_on` is a plain `DATE`.
Relative ranges resolve against an injectable clock in the instance's configured `TZ`,
never `date.today()` called inline, never `LocalDate.now()` without a `Clock`.

**TDD is mandatory** (CLAUDE.md) for anything with real logic — services, validation,
repository queries beyond trivial CRUD, hierarchy traversal, budget/plan calculations.
Failing test first, minimum code to pass, refactor green. Pure boilerplate (a bare
`@Entity`, a generated `JpaRepository` with no custom queries) may skip the cycle, and
the task says so in one line rather than silently omitting tests.

**Docs move with code** (CLAUDE.md). A change that diverges from `docs/SCHEMA.md`,
`docs/API.md`, `docs/INSIGHTS.md` or `ARCHITECTURE.md` updates that doc in the same
commit. Every non-trivial task appends a `docs/LESSONS.md` entry in the file's format —
`### lowercase-sentence title` under `## Entries`, with **What** / **Where** /
**Why it's this way** bullets, written for a Python-native reader. Repeated patterns
reference the earlier entry instead of restating it.

**Simplicity** (CLAUDE.md §2–§3). Minimum code that solves the problem. No speculative
abstraction, no unrequested configurability, no error handling for impossible states.
Touch only what the task requires; do not improve adjacent code. Match existing style
even where you would write it differently.

**Commits are conventional and frequent** — `feat(backend):`, `feat(analytics):`,
`feat(frontend):`, `test:`, `docs:`, `chore:`. One commit per task, at minimum.

---

## File Structure

Two independent additions. Neither adds a file to
`frontend/src/insights/renderers/` — that is the point of the renderer contract.

**Merchant (MY-33)** touches the transaction domain end to end and then flips two
switches in the executor:

```
backend/.../db/migration/V5__txn_merchant.sql        one nullable column
backend/.../model/Transaction.java · dto/Transaction{Request,Response}.java
backend/.../service/{Transaction,Backup}Service.java  merchant survives export/restore
backend/.../dto/MerchantBackfillRequest|Response|Suggestion.java
frontend/src/components/{TxnModal,MerchantBackfill}.tsx
analytics/src/analytics/{validation,sql,executor}.py  merchant_enabled flips to True
frontend/src/insights/chips/MerchantChip.tsx
```

**Forecast, anomaly, drift (MY-34)** all land in one new module rather than being
threaded through the executor:

```
analytics/src/analytics/postprocess.py    seasonal-naive projection, anomaly flags, drift
analytics/src/analytics/plan.py           SUPPORTED_VERSIONS {1} -> {1, 2}; the forecast field
frontend/src/insights/chartRows.ts        envelope -> Recharts rows, projected included
frontend/src/insights/chips/ForecastChip.tsx · insights/DriftBadge.tsx
```

`postprocess.py` runs on an envelope the executor has already produced, so the SQL
layer is untouched and every Stage 1 golden test stays valid unchanged — which is
what makes "a v1 plan still executes after the version bump" cheap to guarantee.

---

### Task 1: [MY-33] `txn.merchant` migration (V5) and the read-only grant it inherits

**Files:**
- Create: `backend/src/main/resources/db/migration/V5__txn_merchant.sql`
- Create: `backend/src/test/java/com/myfinance/backend/TxnMerchantMigrationTest.java`
- Modify: `docs/SCHEMA.md` (the `txn` column table, a new paragraph after "Why `occurred_on` is a `DATE`", the `txn` → Indexes "Deliberately absent" note, and the `txn.merchant` row in "Deliberately deferred")
- Modify: `docs/LESSONS.md` (append one entry under `## Entries`)

**Interfaces:**
- Consumes: `backend/src/main/resources/db/migration/V4__insights.sql` (Stage 1 / MY-30) — creates role `myfinance_ro` and grants it `SELECT ON ALL TABLES IN SCHEMA public`.
- Produces: column `txn.merchant TEXT NULL CHECK (char_length(merchant) <= 100)`, readable by `myfinance_ro`. Every later task in this fragment reads or writes it.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/myfinance/backend/TxnMerchantMigrationTest.java`:

```java
package com.myfinance.backend;

import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * V5__txn_merchant.sql (docs/SCHEMA.md "txn"): the column's shape, its length CHECK, and that the
 * analytics role can read it. The last one is asserted rather than assumed — whether a privilege
 * granted on a table follows a column added later is exactly the kind of thing to check once.
 */
@IntegrationTest
class TxnMerchantMigrationTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private TestFixtures fixtures;

    private Profile profile;
    private Category groceries;

    @BeforeEach
    void setUp() {
        User user = fixtures.user("chris@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
        groceries = fixtures.category(profile, null, "Groceries");
    }

    private void insertWithMerchant(String merchant) {
        jdbcTemplate.update("""
                INSERT INTO txn (profile_id, category_id, amount, currency, txn_type, occurred_on, merchant)
                VALUES (?, ?, 12.5000, 'PLN', 'EXPENSE', DATE '2026-07-21', ?)
                """, profile.getId(), groceries.getId(), merchant);
    }

    @Test
    void merchantIsANullableTextColumn() {
        Map<String, Object> column = jdbcTemplate.queryForMap("""
                SELECT data_type, is_nullable FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'txn' AND column_name = 'merchant'
                """);

        assertThat(column).containsEntry("data_type", "text").containsEntry("is_nullable", "YES");
    }

    @Test
    void merchantOfExactly100CharactersIsAccepted() {
        insertWithMerchant("L".repeat(100));

        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM txn WHERE merchant IS NOT NULL", Integer.class))
                .isEqualTo(1);
    }

    @Test
    void merchantOver100CharactersViolatesTheCheck() {
        assertThatThrownBy(() -> insertWithMerchant("L".repeat(101)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void analyticsRoleCanReadTheNewColumn() {
        Boolean granted = jdbcTemplate.queryForObject(
                "SELECT has_column_privilege('myfinance_ro', 'txn', 'merchant', 'SELECT')", Boolean.class);

        assertThat(granted).isTrue();
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw test -Dtest=TxnMerchantMigrationTest`
Expected: FAIL — `merchantIsANullableTextColumn` throws `EmptyResultDataAccessException: Incorrect result size: expected 1, actual 0` (no such column yet) and the insert tests fail with `ERROR: column "merchant" of relation "txn" does not exist`.

- [ ] **Step 3: Write the migration**

Create `backend/src/main/resources/db/migration/V5__txn_merchant.sql`:

```sql
-- Merchant on transactions (docs/SCHEMA.md "txn"): free text, typed in the transaction form or
-- backfilled from repeating descriptions. It is the categorical axis of the Insights merchant
-- dimension (docs/INSIGHTS.md "Plan DSL v1"), where NULL renders as "Unspecified".

ALTER TABLE txn ADD COLUMN merchant TEXT NULL CHECK (char_length(merchant) <= 100);
```

No index and no `GRANT`: the reasoning for both goes into `docs/SCHEMA.md` in Step 5.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw test -Dtest=TxnMerchantMigrationTest`
Expected: PASS (4 tests)

- [ ] **Step 5: Update `docs/SCHEMA.md`**

Three edits, all in the same change as the migration (CLAUDE.md: the doc and the schema move together).

1. In the `## txn (Transaction)` column table, add a row directly after `description`:

```
| `merchant` | `TEXT` | NULL, CHECK (`char_length(merchant) <= 100`) |
```

2. Immediately after the "**Why `occurred_on` is a `DATE`.**" paragraph, add:

```
**Why `merchant` is free text and not a lookup table.** A `merchant` table would buy referential
integrity over strings a user types once and never curates, and charge a second CRUD screen, a
rename story and a join on the most frequently written table in the app for it. The Insights
merchant axis groups by the string itself (`INSIGHTS.md` → Plan DSL v1), so equal strings are the
same merchant and `NULL` is rendered as "Unspecified" rather than dropped. `char_length <= 100`
mirrors `@Size(max = 100)` on the request DTO — the same rule stated in both places, as everywhere
else in this schema. Add the lookup table when merchant *metadata* is wanted (a logo, a default
category); until then it would be a table of its own primary key.
```

3. In `txn` → Indexes, extend the "**Deliberately absent:**" paragraph with a second sentence:

```
Also absent: an index on `merchant`. Every merchant query arrives already narrowed by
`profile_id` and a date range through `idx_txn_profile_date`, and the grouping then happens over
that small set — an index on a low-cardinality free-text column would be write cost for nothing.
```

4. In `## Deliberately deferred`, **delete** the row that begins `| `txn.merchant` (`TEXT NULL`, ≤ 100) + backfill from descriptions |`. The trigger fired and the column shipped in `V5`; the `txn` section above now owns it, and a table titled "add it when" should not carry rows that were added.

- [ ] **Step 6: Append the `docs/LESSONS.md` entry**

Append at the end of the file, under `## Entries`:

```markdown
### A table-level GRANT already covers columns added later

- **What** — `myfinance_ro` could read `txn.merchant` the moment `V5` created it; no new `GRANT`
  was needed, and the migration says nothing about privileges.
- **Where** — `db/migration/V5__txn_merchant.sql`, asserted in `TxnMerchantMigrationTest`
  (`analyticsRoleCanReadTheNewColumn`), granted by `db/migration/V4__insights.sql`.
- **Why it's this way** — Postgres privileges are per *table* unless you deliberately grant per
  column, so `GRANT SELECT ON ALL TABLES IN SCHEMA public` keeps covering a table through later
  `ALTER TABLE ... ADD COLUMN`. The clause that does *not* help here is `ALTER DEFAULT PRIVILEGES`,
  which covers tables **created** after it by the same role — a different question, and easy to
  conflate with this one. Rather than reason about which clause did the work, the migration test
  asks the database: `has_column_privilege('myfinance_ro', 'txn', 'merchant', 'SELECT')`. Coming
  from Python: this is the same instinct as asserting on a real query instead of trusting an ORM's
  documented behaviour.
```

- [ ] **Step 7: Run the whole backend suite**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -B test`
Expected: PASS — in particular `BackendApplicationTests.contextLoadsAndFlywayCreatesSchema`, which proves `V5` applies cleanly and `spring.jpa.hibernate.ddl-auto=validate` still accepts the entities (a column the entities do not map yet is fine; a missing one is not).

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/resources/db/migration/V5__txn_merchant.sql \
        backend/src/test/java/com/myfinance/backend/TxnMerchantMigrationTest.java \
        docs/SCHEMA.md
git commit -m "feat(backend): txn.merchant column (V5), free text with a length check"
```

---


### Task 2: [MY-33] merchant on the transaction entity, DTOs and endpoints

**Files:**
- Modify: `backend/src/main/java/com/myfinance/backend/model/Transaction.java` (new field + getter, both constructors, `update`)
- Modify: `backend/src/main/java/com/myfinance/backend/dto/TransactionRequest.java` (new component)
- Modify: `backend/src/main/java/com/myfinance/backend/dto/TransactionResponse.java` (new component + `from`)
- Modify: `backend/src/main/java/com/myfinance/backend/service/TransactionService.java` (`create`, `update`)
- Modify: `backend/src/main/java/com/myfinance/backend/service/SubscriptionChargePoster.java` (`chargeOne` — pass `null` merchant)
- Modify: `backend/src/main/java/com/myfinance/backend/service/BackupService.java` (`restore` — pass `null` merchant for now; Task 3 fills it in)
- Modify: `backend/src/test/java/com/myfinance/backend/support/TestFixtures.java` (`transaction`, `chargeTransaction`, plus one overload)
- Test: `backend/src/test/java/com/myfinance/backend/controller/TransactionControllerTest.java` (four new tests + one new body helper)
- Modify: `docs/API.md` (Transactions → `POST /api/transactions` request table and response sample)

**Interfaces:**
- Consumes: `txn.merchant` from Task 1.
- Produces:
  - `Transaction(Profile, Category, BigDecimal, String currency, TransactionType, LocalDate, String description, String merchant)` and `Transaction(..., String description, String merchant, Subscription)`
  - `Transaction.update(Category, BigDecimal, String, TransactionType, LocalDate, String description, String merchant)`, `Transaction.getMerchant()`
  - `TransactionRequest(Long categoryId, BigDecimal amount, String currency, TransactionType type, LocalDate occurredOn, String description, String merchant)`
  - `TransactionResponse(Long id, CategoryRef category, BigDecimal amount, String currency, TransactionType type, LocalDate occurredOn, String description, String merchant, Long subscriptionId, OffsetDateTime createdAt)`
  - `TestFixtures.transaction(Profile, Category, String amount, String currency, TransactionType, LocalDate, String description, String merchant)`

- [ ] **Step 1: Write the failing tests**

In `backend/src/test/java/com/myfinance/backend/controller/TransactionControllerTest.java`, add one body helper next to the existing `validBody()` and four tests at the end of the `// ---- POST` and `// ---- PUT` sections (leave `body(...)` and `validBody()` untouched — a request without `merchant` must keep working):

```java
    private String bodyWithMerchant(String merchantJson) {
        return """
                {"categoryId": %d, "amount": "34.99", "currency": "PLN", "type": "EXPENSE",
                 "occurredOn": "%s", "description": "weekly shop", "merchant": %s}
                """.formatted(groceries.getId(), TODAY.minusDays(1), merchantJson);
    }

    @Test
    void createStoresAndEchoesMerchant() throws Exception {
        mockMvc.perform(post("/api/transactions").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content(bodyWithMerchant("\"Lidl\"")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.merchant").value("Lidl"))
                .andExpect(jsonPath("$.description").value("weekly shop"));
    }

    @Test
    void createWithoutMerchantLeavesItNull() throws Exception {
        mockMvc.perform(post("/api/transactions").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content(validBody()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.merchant").value(nullValue()));
    }

    @Test
    void merchantOver100CharactersIs400() throws Exception {
        mockMvc.perform(post("/api/transactions").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bodyWithMerchant("\"" + "L".repeat(101) + "\"")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors[0].field").value("merchant"));
    }

    @Test
    void putIsAFullReplacementSoAnOmittedMerchantClearsIt() throws Exception {
        String created = mockMvc.perform(post("/api/transactions").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content(bodyWithMerchant("\"Lidl\"")))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long id = transactionRepository.findAll().get(0).getId();
        assertThat(created).contains("Lidl");

        mockMvc.perform(put("/api/transactions/" + id).with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content(validBody()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.merchant").value(nullValue()));
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw test -Dtest=TransactionControllerTest`
Expected: FAIL — `createStoresAndEchoesMerchant` fails with `No value at JSON path "$.merchant"` (the response record has no such component and the request field is ignored).

- [ ] **Step 3: Add the field to the entity**

In `backend/src/main/java/com/myfinance/backend/model/Transaction.java`, after the `description` field:

```java
    private String description;

    /** Free text, at most 100 chars (DB CHECK in V5). The Insights merchant axis groups by it. */
    private String merchant;
```

Replace both constructors and `update` (the field is set through `update` like every other editable field, so `PUT` semantics stay "full replacement"):

```java
    public Transaction(Profile profile, Category category, BigDecimal amount, String currency,
                       TransactionType type, LocalDate occurredOn, String description, String merchant) {
        this(profile, category, amount, currency, type, occurredOn, description, merchant, null);
    }

    /** Used by the subscription charge job to link the posted charge back to its subscription. */
    public Transaction(Profile profile, Category category, BigDecimal amount, String currency,
                       TransactionType type, LocalDate occurredOn, String description, String merchant,
                       Subscription subscription) {
        this.profile = profile;
        this.subscription = subscription;
        update(category, amount, currency, type, occurredOn, description, merchant);
    }

    /** Full replacement of the editable fields (PUT semantics — see docs/API.md). */
    public void update(Category category, BigDecimal amount, String currency, TransactionType type,
                       LocalDate occurredOn, String description, String merchant) {
        this.category = category;
        this.amount = Money.normalize(amount);
        this.currency = currency;
        this.type = type;
        this.occurredOn = occurredOn;
        this.description = description;
        this.merchant = merchant;
    }
```

And a getter next to `getDescription()`:

```java
    public String getMerchant() {
        return merchant;
    }
```

- [ ] **Step 4: Add the field to the DTOs**

`dto/TransactionRequest.java` — add the component after `description` (the `@AssertTrue` method below it is unchanged):

```java
public record TransactionRequest(
        @NotNull Long categoryId,
        @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 15, fraction = 4) BigDecimal amount,
        @NotBlank @Pattern(regexp = "^[A-Z]{3}$", message = "must be a 3-letter ISO 4217 code") String currency,
        @NotNull TransactionType type,
        @NotNull LocalDate occurredOn,
        @Size(max = 500) String description,
        @Size(max = 100) String merchant
) {
```

`dto/TransactionResponse.java` — component after `description`, and the matching argument in `from`:

```java
public record TransactionResponse(
        Long id,
        CategoryRef category,
        BigDecimal amount,
        String currency,
        TransactionType type,
        LocalDate occurredOn,
        String description,
        String merchant,
        Long subscriptionId,
        OffsetDateTime createdAt
) {

    public static TransactionResponse from(Transaction transaction) {
        return new TransactionResponse(
                transaction.getId(),
                CategoryRef.from(transaction.getCategory()),
                transaction.getAmount(),
                transaction.getCurrency(),
                transaction.getType(),
                transaction.getOccurredOn(),
                transaction.getDescription(),
                transaction.getMerchant(),
                transaction.getSubscriptionId(),
                transaction.getCreatedAt());
    }
}
```

- [ ] **Step 5: Update the three call sites the new signatures break**

`service/TransactionService.java`, in `create`:

```java
        Transaction transaction = new Transaction(profile, category, request.amount(), request.currency(),
                request.type(), request.occurredOn(), request.description(), request.merchant());
```

`service/TransactionService.java`, in `update`:

```java
        transaction.update(category, request.amount(), request.currency(), request.type(),
                request.occurredOn(), request.description(), request.merchant());
```

`service/SubscriptionChargePoster.java`, in `chargeOne`:

```java
            // A posted charge has no merchant: the subscription it came from is already on the row.
            transactionRepository.save(new Transaction(managed.getProfile(), managed.getCategory(),
                    managed.getAmount(), managed.getCurrency(), TransactionType.EXPENSE,
                    managed.getNextBillingOn(), managed.getName(), null, managed));
```

`service/BackupService.java`, in the restore loop — `null` for now; Task 3 replaces it with `transaction.merchant()` once the backup format carries the field:

```java
            transactionRepository.save(new Transaction(profile, categoriesByRef.get(transaction.categoryRef()),
                    transaction.amount(), transaction.currency(), TransactionType.valueOf(transaction.type()),
                    LocalDate.parse(transaction.occurredOn()), transaction.description(), null, subscription));
```

- [ ] **Step 6: Update the test fixtures**

In `backend/src/test/java/com/myfinance/backend/support/TestFixtures.java`, keep the existing six-argument `transaction(...)` (now passing `null` merchant), add an overload for merchant rows, and fix `chargeTransaction`:

```java
    public Transaction transaction(Profile profile, Category category, String amount, String currency,
                                   TransactionType type, LocalDate occurredOn) {
        return transactionRepository.save(new Transaction(profile, category, new BigDecimal(amount), currency,
                type, occurredOn, null, null));
    }

    /** A transaction carrying a description and a merchant — the raw material of the backfill suggester. */
    public Transaction transaction(Profile profile, Category category, String amount, String currency,
                                   TransactionType type, LocalDate occurredOn, String description, String merchant) {
        return transactionRepository.save(new Transaction(profile, category, new BigDecimal(amount), currency,
                type, occurredOn, description, merchant));
    }

    /** An EXPENSE transaction linked to a subscription, shaped exactly as the charge job posts it. */
    public Transaction chargeTransaction(Profile profile, Category category, String amount, String currency,
                                         LocalDate occurredOn, Subscription subscription) {
        return transactionRepository.save(new Transaction(profile, category, new BigDecimal(amount), currency,
                TransactionType.EXPENSE, occurredOn, subscription.getName(), null, subscription));
    }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -B test`
Expected: PASS — the whole suite, not just `TransactionControllerTest`: the entity signature change touches the charge job and backup restore, and their tests are the proof that nothing regressed.

- [ ] **Step 8: Update `docs/API.md`**

In `## Transactions` → `### POST /api/transactions`:

1. Add a row to the request table, after `description`:

```
| `merchant` | string or null | Optional, `@Size(max = 100)` |
```

2. In the `201` response sample, add `"merchant": "Lidl",` directly after the `"description"` line.

3. After the paragraph that begins "`currency` is not defaulted from the profile server-side", add:

```
`merchant` is free text (`SCHEMA.md` → `txn`), never normalized server-side: the same string is
the same merchant, so `"lidl"` and `"Lidl"` are two of them. That is a deliberate trade — a
normalizer would have to guess, and guessing wrong is invisible — and it is why the backfill
endpoints below exist to set many rows at once from what the user already typed. `PUT` is a full
replacement here as everywhere: a body without `merchant` clears it.
```

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/myfinance/backend/model/Transaction.java \
        backend/src/main/java/com/myfinance/backend/dto/TransactionRequest.java \
        backend/src/main/java/com/myfinance/backend/dto/TransactionResponse.java \
        backend/src/main/java/com/myfinance/backend/service/TransactionService.java \
        backend/src/main/java/com/myfinance/backend/service/SubscriptionChargePoster.java \
        backend/src/main/java/com/myfinance/backend/service/BackupService.java \
        backend/src/test/java/com/myfinance/backend/support/TestFixtures.java \
        backend/src/test/java/com/myfinance/backend/controller/TransactionControllerTest.java \
        docs/API.md
git commit -m "feat(backend): merchant on transaction requests and responses"
```

---


### Task 3: [MY-33] merchant survives export and restore

**Files:**
- Modify: `backend/src/main/java/com/myfinance/backend/dto/BackupFile.java` (`TransactionData`)
- Modify: `backend/src/main/java/com/myfinance/backend/service/BackupService.java` (`exportProfile`, and the restore loop line Task 2 left as `null`)
- Modify: `backend/src/main/java/com/myfinance/backend/service/BackupValidator.java` (`validateTransactions` + one helper)
- Test: `backend/src/test/java/com/myfinance/backend/service/BackupValidatorTest.java` (helper signature + one test)
- Test: `backend/src/test/java/com/myfinance/backend/controller/BackupControllerTest.java` (one test)
- Modify: `docs/API.md` (Backup → export sample and "Decisions pinned down")

**Interfaces:**
- Consumes: `Transaction.getMerchant()`, the nine-argument `Transaction` constructor (Task 2).
- Produces: `BackupFile.TransactionData(Long categoryRef, Long subscriptionRef, BigDecimal amount, String currency, String type, String occurredOn, String description, String merchant)` — `merchant` last, `formatVersion` still `1`.

- [ ] **Step 1: Write the failing tests**

In `backend/src/test/java/com/myfinance/backend/service/BackupValidatorTest.java`, update the `transaction` helper (it is the only place its arity is used) and add one test at the end of the transaction section:

```java
    private static BackupFile.TransactionData transaction(Long categoryRef, Long subscriptionRef, String amount) {
        return new BackupFile.TransactionData(categoryRef, subscriptionRef, new BigDecimal(amount), "PLN",
                "EXPENSE", "2026-08-03", null, null);
    }

    @Test
    void merchantOver100CharactersIsAProblem() {
        BackupFile.TransactionData tooLong = new BackupFile.TransactionData(1L, null, new BigDecimal("10.0000"),
                "PLN", "EXPENSE", "2026-08-03", null, "L".repeat(101));
        BackupFile backup = file(profile(
                List.of(category(1, null, "Shopping")), List.of(), List.of(tooLong), List.of()));

        assertThat(BackupValidator.validate(backup)).singleElement().asString()
                .contains("profiles[0].transactions[0].merchant").contains("100");
    }
```

In `backend/src/test/java/com/myfinance/backend/controller/BackupControllerTest.java`, add to the restore section (the extra row is created inside the test, so the counts asserted by the existing round-trip test do not move):

```java
    @Test
    void merchantIsExportedAndSurvivesRestore() throws Exception {
        fixtures.transaction(personal, shopping, "12.50", "PLN", TransactionType.EXPENSE,
                LocalDate.of(2026, 7, 22), "weekly shop", "Lidl");

        export(chris, "{\"profileIds\": [" + personal.getId() + "]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profiles[0].transactions[*].merchant", hasItem("Lidl")));

        mockMvc.perform(restore(chris, exportedFile())).andExpect(status().isOk());

        Profile restored = profileByName("Personal (restored)");
        assertThat(transactionRepository.findAllByProfileIdOrderByIdAsc(restored.getId()))
                .extracting(Transaction::getMerchant)
                .contains("Lidl");
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw test -Dtest=BackupValidatorTest,BackupControllerTest`
Expected: FAIL to compile — `constructor TransactionData cannot be applied to given types; required: 7 arguments, found: 8`.

- [ ] **Step 3: Add `merchant` to the file format**

`dto/BackupFile.java`:

```java
    public record TransactionData(Long categoryRef, Long subscriptionRef, BigDecimal amount, String currency,
                                  String type, String occurredOn, String description, String merchant) {
    }
```

`service/BackupService.java` — export it:

```java
                transactionRepository.findAllByProfileIdOrderByIdAsc(profile.getId()).stream()
                        .map(t -> new BackupFile.TransactionData(t.getCategory().getId(), t.getSubscriptionId(),
                                t.getAmount(), t.getCurrency(), t.getType().name(), t.getOccurredOn().toString(),
                                t.getDescription(), t.getMerchant()))
                        .toList(),
```

`service/BackupService.java` — restore it (replacing the `null` Task 2 put there):

```java
            transactionRepository.save(new Transaction(profile, categoriesByRef.get(transaction.categoryRef()),
                    transaction.amount(), transaction.currency(), TransactionType.valueOf(transaction.type()),
                    LocalDate.parse(transaction.occurredOn()), transaction.description(), transaction.merchant(),
                    subscription));
```

- [ ] **Step 4: Validate its length**

`service/BackupValidator.java` — one call in `validateTransactions`, after the `description` check:

```java
            checkLength(at + ".description", transaction.description(), problems);
            checkMerchant(at + ".merchant", transaction.merchant(), problems);
```

and one helper next to `checkLength` in the "field checks" section:

```java
    /** Optional, and shorter than a description: mirrors CHECK (char_length(merchant) <= 100) in V5. */
    private static void checkMerchant(String at, String merchant, List<String> problems) {
        if (merchant != null && merchant.length() > MAX_NAME_LENGTH) {
            problems.add(at + ": must be at most " + MAX_NAME_LENGTH + " characters");
        }
    }
```

Without it a hand-edited file with a 101-character merchant reaches the DB CHECK and comes back as a generic `409 /errors/conflict`, instead of the pinpointed `422` every other malformed field gets.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw -B test`
Expected: PASS

- [ ] **Step 6: Update `docs/API.md`**

In `## Backup` → `POST /api/backup/export`:

1. In the JSON sample, give the second transaction a merchant:

```
        { "categoryRef": 1, "subscriptionRef": null, "amount": "34.9900", "currency": "PLN",
          "type": "EXPENSE", "occurredOn": "2026-07-21", "description": "liquid refill",
          "merchant": "Lidl" }
```

2. Add a bullet to "Decisions pinned down":

```
- **`merchant` is optional and `formatVersion` stays `1`.** The field arrived in Phase 4b; files
  exported before it simply have no `merchant`, and restore leaves the column null. A version bump
  would have been the wrong tool: the restorer accepts exactly its own version, so bumping would
  make every existing backup unrestorable in exchange for a field whose absence already means
  something sensible.
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/myfinance/backend/dto/BackupFile.java \
        backend/src/main/java/com/myfinance/backend/service/BackupService.java \
        backend/src/main/java/com/myfinance/backend/service/BackupValidator.java \
        backend/src/test/java/com/myfinance/backend/service/BackupValidatorTest.java \
        backend/src/test/java/com/myfinance/backend/controller/BackupControllerTest.java \
        docs/API.md
git commit -m "feat(backend): carry merchant through backup export and restore"
```

---


### Task 4: [MY-33] merchant backfill suggester

**Files:**
- Create: `backend/src/main/java/com/myfinance/backend/repository/MerchantSuggestionRow.java`
- Create: `backend/src/main/java/com/myfinance/backend/dto/MerchantSuggestion.java`
- Create: `backend/src/main/java/com/myfinance/backend/dto/MerchantBackfillRequest.java`
- Create: `backend/src/main/java/com/myfinance/backend/dto/MerchantBackfillResponse.java`
- Modify: `backend/src/main/java/com/myfinance/backend/repository/TransactionRepository.java` (two query methods)
- Modify: `backend/src/main/java/com/myfinance/backend/model/Transaction.java` (`assignMerchant`)
- Modify: `backend/src/main/java/com/myfinance/backend/service/TransactionService.java` (two methods)
- Modify: `backend/src/main/java/com/myfinance/backend/controller/TransactionController.java` (two routes, declared above `@GetMapping("/{id}")`)
- Test: `backend/src/test/java/com/myfinance/backend/controller/MerchantBackfillControllerTest.java`
- Modify: `docs/API.md` (Transactions → two new endpoint subsections)

**Interfaces:**
- Consumes: `TestFixtures.transaction(..., String description, String merchant)` (Task 2), `txn.merchant` (Task 1).
- Produces: `GET /api/transactions/merchant-suggestions` → `[{"description": "Biedronka", "transactionCount": 3}]`; `POST /api/transactions/merchant-backfill` with `{"description": "Biedronka", "merchant": "Biedronka"}` → `{"updated": 3}`. Consumed by the frontend in Task 7.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/myfinance/backend/controller/MerchantBackfillControllerTest.java`:

```java
package com.myfinance.backend.controller;

import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.Transaction;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.TransactionRepository;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * GET /api/transactions/merchant-suggestions and POST /api/transactions/merchant-backfill
 * (docs/API.md "Transactions"). Both are profile-scoped like every other transaction endpoint.
 */
@IntegrationTest
class MerchantBackfillControllerTest {

    private static final LocalDate ON = LocalDate.of(2026, 7, 21);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    @Autowired
    private TransactionRepository transactionRepository;

    private User user;
    private Profile profile;
    private Category groceries;
    private Profile otherProfile;
    private Category otherCategory;

    @BeforeEach
    void setUp() {
        user = fixtures.user("chris@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
        groceries = fixtures.category(profile, null, "Groceries");
        otherProfile = fixtures.profile(user, "Company", "EUR");
        otherCategory = fixtures.category(otherProfile, null, "Office");
    }

    private void txn(Profile p, Category c, String amount, String description, String merchant) {
        fixtures.transaction(p, c, amount, "PLN", TransactionType.EXPENSE, ON, description, merchant);
    }

    private static String backfill(String description, String merchant) {
        return """
                {"description": "%s", "merchant": "%s"}
                """.formatted(description, merchant);
    }

    // ---------------------------------------------------------------- suggestions

    @Test
    void suggestionsGroupRepeatedDescriptionsMostFrequentFirst() throws Exception {
        txn(profile, groceries, "10.00", "Biedronka", null);
        txn(profile, groceries, "11.00", "Biedronka", null);
        txn(profile, groceries, "12.00", "Biedronka", null);
        txn(profile, groceries, "13.00", "Lidl", null);
        txn(profile, groceries, "14.00", "Lidl", null);
        txn(profile, groceries, "15.00", "a one-off", null);

        mockMvc.perform(get("/api/transactions/merchant-suggestions").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].description").value("Biedronka"))
                .andExpect(jsonPath("$[0].transactionCount").value(3))
                .andExpect(jsonPath("$[1].description").value("Lidl"))
                .andExpect(jsonPath("$[1].transactionCount").value(2));
    }

    @Test
    void suggestionsIgnoreRowsThatAlreadyHaveAMerchant() throws Exception {
        txn(profile, groceries, "10.00", "Biedronka", "Biedronka");
        txn(profile, groceries, "11.00", "Biedronka", "Biedronka");

        mockMvc.perform(get("/api/transactions/merchant-suggestions").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void suggestionsDoNotLeakAnotherProfile() throws Exception {
        txn(otherProfile, otherCategory, "10.00", "Biedronka", null);
        txn(otherProfile, otherCategory, "11.00", "Biedronka", null);

        mockMvc.perform(get("/api/transactions/merchant-suggestions").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void suggestionsWithoutActiveProfileIs409() throws Exception {
        mockMvc.perform(get("/api/transactions/merchant-suggestions").with(fixtures.as(user)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }

    // ---------------------------------------------------------------- backfill

    @Test
    void backfillSetsTheMerchantOnMatchingUnlabelledRowsOnly() throws Exception {
        txn(profile, groceries, "10.00", "Biedronka", null);
        txn(profile, groceries, "11.00", "Biedronka", null);
        txn(profile, groceries, "12.00", "Biedronka", "Left alone");
        txn(profile, groceries, "13.00", "Lidl", null);
        txn(otherProfile, otherCategory, "14.00", "Biedronka", null);

        mockMvc.perform(post("/api/transactions/merchant-backfill").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content(backfill("Biedronka", "Biedronka")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.updated").value(2));

        assertThat(transactionRepository.findAllByProfileIdOrderByIdAsc(profile.getId()))
                .extracting(Transaction::getMerchant)
                .containsExactly("Biedronka", "Biedronka", "Left alone", null);
        assertThat(transactionRepository.findAllByProfileIdOrderByIdAsc(otherProfile.getId()))
                .extracting(Transaction::getMerchant)
                .containsExactly((String) null);
    }

    @Test
    void backfillTwiceIsANoOp() throws Exception {
        txn(profile, groceries, "10.00", "Biedronka", null);

        mockMvc.perform(post("/api/transactions/merchant-backfill").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content(backfill("Biedronka", "Biedronka")))
                .andExpect(jsonPath("$.updated").value(1));
        mockMvc.perform(post("/api/transactions/merchant-backfill").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content(backfill("Biedronka", "Something else")))
                .andExpect(jsonPath("$.updated").value(0));

        assertThat(transactionRepository.findAllByProfileIdOrderByIdAsc(profile.getId()))
                .extracting(Transaction::getMerchant)
                .containsExactly("Biedronka");
    }

    @Test
    void backfillWithABlankMerchantIs400() throws Exception {
        mockMvc.perform(post("/api/transactions/merchant-backfill").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content(backfill("Biedronka", "")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors[0].field").value("merchant"));
    }

    @Test
    void unauthenticatedIs401() throws Exception {
        mockMvc.perform(get("/api/transactions/merchant-suggestions"))
                .andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw test -Dtest=MerchantBackfillControllerTest`
Expected: FAIL — `suggestionsGroupRepeatedDescriptionsMostFrequentFirst` gets `400`, not `200`: with no literal route declared, `/merchant-suggestions` falls into `GET /{id}`, the `Long` conversion fails, and the global type-mismatch handler answers `/errors/invalid-request`.

- [ ] **Step 3: Add the repository query and projection**

Create `backend/src/main/java/com/myfinance/backend/repository/MerchantSuggestionRow.java`:

```java
package com.myfinance.backend.repository;

/** Projection for {@link TransactionRepository#findMerchantSuggestions(Long)}. */
public interface MerchantSuggestionRow {

    String getDescription();

    long getTransactionCount();
}
```

Add to `backend/src/main/java/com/myfinance/backend/repository/TransactionRepository.java`:

```java
    /**
     * Backfill candidates: descriptions shared by two or more transactions that carry no merchant
     * yet, biggest group first (docs/API.md "GET /api/transactions/merchant-suggestions").
     * The count alias is quoted so Postgres keeps its camel case — an unquoted alias comes back
     * lower-cased and the projection cannot bind it.
     */
    @Query(value = """
            SELECT t.description AS description, count(*) AS "transactionCount"
              FROM txn t
             WHERE t.profile_id = :profileId
               AND t.merchant IS NULL
               AND t.description IS NOT NULL
               AND t.description <> ''
             GROUP BY t.description
            HAVING count(*) >= 2
             ORDER BY count(*) DESC, t.description ASC
             LIMIT 20
            """, nativeQuery = true)
    List<MerchantSuggestionRow> findMerchantSuggestions(@Param("profileId") Long profileId);

    List<Transaction> findAllByProfileIdAndMerchantIsNullAndDescription(Long profileId, String description);
```

- [ ] **Step 4: Add the DTOs**

`dto/MerchantSuggestion.java`:

```java
package com.myfinance.backend.dto;

/**
 * One backfill candidate: a description shared by several transactions that have no merchant yet.
 * The suggested merchant is the description itself — the client edits it before applying.
 */
public record MerchantSuggestion(String description, long transactionCount) {
}
```

`dto/MerchantBackfillRequest.java`:

```java
package com.myfinance.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Body of {@code POST /api/transactions/merchant-backfill} (docs/API.md "Transactions"). */
public record MerchantBackfillRequest(
        @NotBlank @Size(max = 500) String description,
        @NotBlank @Size(max = 100) String merchant) {
}
```

`dto/MerchantBackfillResponse.java`:

```java
package com.myfinance.backend.dto;

/** How many transactions the backfill actually touched. */
public record MerchantBackfillResponse(int updated) {
}
```

- [ ] **Step 5: Add the service methods and the entity mutator**

In `model/Transaction.java`, next to `update`:

```java
    /**
     * Backfill sets only the merchant (docs/API.md "POST /api/transactions/merchant-backfill").
     * Everything else on a transaction is replaced wholesale through {@link #update}.
     */
    public void assignMerchant(String merchant) {
        this.merchant = merchant;
    }
```

In `service/TransactionService.java`, after `list(...)`:

```java
    /**
     * Descriptions worth turning into merchants. Deliberately dumb: exact grouping on the
     * description, groups of two or more, twenty at most — see docs/API.md for what it does not do.
     */
    public List<MerchantSuggestion> merchantSuggestions() {
        Long profileId = activeProfile.requireId();
        return transactionRepository.findMerchantSuggestions(profileId).stream()
                .map(row -> new MerchantSuggestion(row.getDescription(), row.getTransactionCount()))
                .toList();
    }

    @Transactional
    public MerchantBackfillResponse backfillMerchant(MerchantBackfillRequest request) {
        Long profileId = activeProfile.requireId();
        List<Transaction> matches = transactionRepository
                .findAllByProfileIdAndMerchantIsNullAndDescription(profileId, request.description());
        for (Transaction transaction : matches) {
            transaction.assignMerchant(request.merchant());
        }
        // Managed entities: the changes are flushed on commit, no explicit save() needed.
        return new MerchantBackfillResponse(matches.size());
    }
```

with the new imports (`com.myfinance.backend.dto.MerchantBackfillRequest`, `...MerchantBackfillResponse`, `...MerchantSuggestion`).

- [ ] **Step 6: Add the two routes**

In `controller/TransactionController.java`, between `list(...)` and `get(...)`:

```java
    // An exact path segment always beats a path variable, so these never collide with /{id}.
    @GetMapping("/merchant-suggestions")
    public List<MerchantSuggestion> merchantSuggestions() {
        return transactionService.merchantSuggestions();
    }

    @PostMapping("/merchant-backfill")
    public MerchantBackfillResponse backfillMerchant(@Valid @RequestBody MerchantBackfillRequest request) {
        return transactionService.backfillMerchant(request);
    }
```

with imports for the three DTOs and `java.util.List`.

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/backend && ./mvnw test -Dtest=MerchantBackfillControllerTest`
Expected: PASS (8 tests)

- [ ] **Step 8: Document both endpoints in `docs/API.md`**

In `## Transactions`, after `### DELETE /api/transactions/{id}` and before the `---` that ends the section:

````
### `GET /api/transactions/merchant-suggestions`

Backfill candidates for the active profile: descriptions that repeat across transactions which
have **no merchant yet**.

**Response `200 OK`** — a bare array, biggest group first, twenty at most:

```json
[
  { "description": "Biedronka", "transactionCount": 14 },
  { "description": "Lidl", "transactionCount": 9 }
]
```

`transactionCount` is a JSON number (a row count, never money). The suggested merchant *is* the
description — the client prefills its input with it and the user edits before applying.

**What this deliberately does not do.** No case folding (`"lidl"` and `"Lidl"` are two
suggestions), no fuzzy or prefix matching, no tokenizing of bank-statement noise
(`"CARD PAYMENT LIDL 4123"` is its own group), no learning between calls, and no rewriting of the
`description` itself. It groups on the exact string, keeps groups of two or more — one occurrence
is not evidence of anything — and stops at twenty. A cleverer suggester guesses, and a wrong guess
applied in bulk is invisible; a dumb one plus an editable input is cheaper and honest.

| Status | When |
|---|---|
| `200` | OK (an empty array when there is nothing to suggest) |
| `401` / `409` | Not authenticated / no active profile |

### `POST /api/transactions/merchant-backfill`

**Request**

| Field | Type | Validation |
|---|---|---|
| `description` | string | `@NotBlank` `@Size(max = 500)` |
| `merchant` | string | `@NotBlank` `@Size(max = 100)` |

Sets `merchant` on every transaction of the active profile whose `description` equals the one sent
**and** whose `merchant` is still null. Exact match, same as the suggester — so applying twice is a
no-op and nothing already labelled is ever overwritten.

**Response `200 OK`**

```json
{ "updated": 14 }
```

`200` rather than `204`: the count is the whole point of the response — it is what the UI reports
back ("14 transactions updated"), and it is how a stale suggestion (rows changed since the list was
fetched) shows up as a smaller number instead of a lie.

| Status | When |
|---|---|
| `200` | Applied, possibly to zero rows |
| `400` | Validation failure |
| `401` / `409` | Not authenticated / no active profile |
````

- [ ] **Step 9: Append the LESSONS entry**

`docs/LESSONS.md` is gitignored (`.gitignore` → "Private / local-only") — write it,
never `git add` it. Append:

```markdown

### Interface projections, and why the SQL alias needs quotes

- **What** — a Spring Data *native* query can return rows as a small read-only
  interface instead of an entity, as long as each getter's name matches a column
  alias; Postgres folds unquoted aliases to lower case, so `AS "merchantName"`
  needs the quotes or `getMerchantName()` silently sees nothing.
- **Where** — `repository/MerchantSuggestionRow`,
  `TransactionRepository.findMerchantSuggestions`, `TransactionService.backfillMerchant`.
- **Why it's this way** — the closest Python habit is returning a `NamedTuple` or a
  `TypedDict` from a hand-written query; the difference is that Spring generates the
  implementation from the interface at runtime, so the interface *is* the mapping and
  there is nothing to keep in sync. The bulk update in `backfillMerchant` then relies
  on JPA dirty checking — the entities are managed inside the transaction, so setting
  the field is the write; there is no `save()` call, which reads as a missing line until
  you know the rule (same mechanism as the subscription rename, see the entity entries
  above).
```

- [ ] **Step 10: Commit**

```bash
git add backend/src/main/java/com/myfinance/backend/repository/MerchantSuggestionRow.java \
        backend/src/main/java/com/myfinance/backend/repository/TransactionRepository.java \
        backend/src/main/java/com/myfinance/backend/dto/MerchantSuggestion.java \
        backend/src/main/java/com/myfinance/backend/dto/MerchantBackfillRequest.java \
        backend/src/main/java/com/myfinance/backend/dto/MerchantBackfillResponse.java \
        backend/src/main/java/com/myfinance/backend/model/Transaction.java \
        backend/src/main/java/com/myfinance/backend/service/TransactionService.java \
        backend/src/main/java/com/myfinance/backend/controller/TransactionController.java \
        backend/src/test/java/com/myfinance/backend/controller/MerchantBackfillControllerTest.java \
        docs/API.md
git commit -m "feat(backend): merchant backfill suggester from repeating descriptions"
```

---


### Task 5: [MY-33] activate the merchant dimension in the executor

**Files:**
- Modify: `analytics/src/analytics/sql.py` (merchant group expression + merchant filter predicate)
- Modify: `analytics/src/analytics/plan.py` (flip `MERCHANT_ENABLED` to `True` — Stage 1 routes both the execute route *and* MY-37's interpret route through this one constant, so `main.py` needs no change)
- Modify: `analytics/src/analytics/validation.py` (verification only — see Step 5)
- Create: `analytics/tests/fixtures/seed_merchants.sql`
- Create: `analytics/tests/fixtures/plans/merchant_split.json`, `analytics/tests/fixtures/plans/merchant_breakdown.json`, `analytics/tests/fixtures/plans/merchant_filter.json`
- Create: `analytics/tests/test_executor_merchant.py`
- Modify: `analytics/tests/conftest.py` (one seeding fixture)
- Modify: `docs/INSIGHTS.md` (Plan DSL v1 → `filters.merchants` and `groupBy` rows; the validation paragraph)
- Modify: `docs/API.md` (`POST /api/insights/execute` → the `400` row)
- Modify: `docs/LESSONS.md` (append one entry)

**Interfaces:**
- Consumes:
  - `analytics.executor._rank_and_cap`, `MAX_GROUPS = 25`, `OTHER_KEY = "__other__"` — **Stage 1, MY-31 Task 25 already ships the entire bounded-output feature** for both `breakdown` and `timeseriesSplit`, including `meta.truncatedGroups`. It is axis-agnostic: once `sql.py` emits merchant group keys, the existing cap applies unchanged. Do **not** re-implement it, and do **not** introduce a second `Other` key — the envelope's is `{"key": "__other__", "label": "Other"}`, asserted by three Stage 1 goldens.
  - `analytics.executor.execute(conn, profile_id, raw_plan, *, today, merchant_enabled) -> dict` and `analytics.validation.validate_plan(raw, *, profile_id, conn, merchant_enabled) -> list[str]` (contract §3, Stage 1)
  - `txn.merchant` (Task 1)
  - Stage 1's pytest connection fixture, named `conn` below: it is the one `tests/test_executor_golden.py` already uses to reach the migrated test database. If Stage 1 named it differently, use that name — the test bodies are otherwise unchanged. The frozen clock is **not** consumed: `execute` takes `today` as a parameter, so these tests pass `date(2026, 9, 4)` explicitly.
- Produces: `filters.merchants` and `groupBy: "merchant"` executing for real; `NULL` merchant grouped as `"Unspecified"`; `meta.truncatedGroups` telling the truth. No plan `version` bump (spec A2) — `SUPPORTED_VERSIONS` is **not** touched by this fragment.

- [ ] **Step 1: Write the seed fixture**

Create `analytics/tests/fixtures/seed_merchants.sql`:

```sql
-- Phase 4b merchant fixtures for tests/test_executor_merchant.py.
-- Fixed ids (9000+) because the plan fixtures carry a literal categoryId, and OVERRIDING SYSTEM
-- VALUE because the id columns are GENERATED ALWAYS. Its own profile, so the Phase 4 goldens keep
-- their own numbers.

INSERT INTO app_user (id, email, password_hash, display_name)
OVERRIDING SYSTEM VALUE
VALUES (9000, 'merchants@example.com', 'not-a-real-hash', 'Merchant Fixtures');

INSERT INTO profile (id, user_id, name, default_currency)
OVERRIDING SYSTEM VALUE
VALUES (9000, 9000, 'Merchants', 'PLN');

INSERT INTO category (id, profile_id, parent_id, name)
OVERRIDING SYSTEM VALUE
VALUES (9000, 9000, NULL, 'Groceries');

-- Three months of two merchants, well inside the last-12-months window of a 2026-09-04 clock.
INSERT INTO txn (profile_id, category_id, amount, currency, txn_type, occurred_on, description, merchant) VALUES
    (9000, 9000, 243.5000, 'PLN', 'EXPENSE', DATE '2026-07-04', 'weekly shop', 'Lidl'),
    (9000, 9000, 310.0000, 'PLN', 'EXPENSE', DATE '2026-08-11', 'weekly shop', 'Lidl'),
    (9000, 9000, 120.0000, 'PLN', 'EXPENSE', DATE '2026-09-02', 'weekly shop', 'Lidl'),
    (9000, 9000, 180.0000, 'PLN', 'EXPENSE', DATE '2026-07-19', 'weekly shop', 'Biedronka'),
    (9000, 9000, 212.0000, 'PLN', 'EXPENSE', DATE '2026-08-23', 'weekly shop', 'Biedronka'),
    (9000, 9000,  95.0000, 'PLN', 'EXPENSE', DATE '2026-09-01', 'weekly shop', 'Biedronka'),
    -- No merchant at all: this row is the "Unspecified" group, not a missing row.
    (9000, 9000,  50.0000, 'PLN', 'EXPENSE', DATE '2026-08-05', 'cash', NULL);

-- A long tail of 26 merchants worth 1.00 … 26.00, so a merchant breakdown crosses the 25-group cap.
INSERT INTO txn (profile_id, category_id, amount, currency, txn_type, occurred_on, merchant)
SELECT 9000, 9000, n, 'PLN', 'EXPENSE', DATE '2026-08-15', 'M' || to_char(n, 'FM00')
  FROM generate_series(1, 26) AS n;
```

Add the fixture that applies it to `analytics/tests/conftest.py` (session-scoped, after the migrations):

```python
@pytest.fixture(scope="session")
def merchant_seed(dsn: str) -> None:
    """Phase 4b merchant rows under profile 9000 (tests/fixtures/seed_merchants.sql)."""
    seed = (Path(__file__).parent / "fixtures" / "seed_merchants.sql").read_text()
    with psycopg.connect(dsn, autocommit=True) as owner:
        owner.execute(seed)
```

Stage 1's session-scoped `dsn` fixture is both things at once: it applies the Flyway migrations (so `V5` exists) *and* yields the container's owner URL. There is no separate `migrated_database` or `OWNER_DSN` — `myfinance_ro` holds `SELECT` only (R16) and cannot run this file, so the seed must go through the owner connection the migrations already use, and it must depend on the migration fixture so `V5` exists before the `merchant` column is written.

- [ ] **Step 2: Write the failing goldens**

Create the three plan fixtures.

`analytics/tests/fixtures/plans/merchant_split.json` — the canonical plan from `docs/INSIGHTS.md`, with this profile's category id:

```json
{
  "version": 1,
  "metric": "spend",
  "filters": {
    "categoryId": 9000,
    "includeDescendants": true,
    "merchants": ["Lidl", "Biedronka"],
    "currency": "PLN"
  },
  "groupBy": "merchant",
  "interval": "month",
  "range": { "type": "lastMonths", "n": 12 }
}
```

`analytics/tests/fixtures/plans/merchant_breakdown.json`:

```json
{
  "version": 1,
  "metric": "spend",
  "filters": { "currency": "PLN" },
  "groupBy": "merchant",
  "interval": null,
  "range": { "type": "all" }
}
```

`analytics/tests/fixtures/plans/merchant_filter.json`:

```json
{
  "version": 1,
  "metric": "spend",
  "filters": { "merchants": ["Lidl"], "currency": "PLN" },
  "groupBy": null,
  "interval": null,
  "range": { "type": "all" }
}
```

Create `analytics/tests/test_executor_merchant.py`:

```python
"""Merchant-dimension goldens (docs/INSIGHTS.md "Plan DSL v1"): the canonical Lidl vs Biedronka
plan, the 25-group cap, and merchant filtering. Data comes from tests/fixtures/seed_merchants.sql
under profile 9000; the clock is passed in, not frozen globally (spec D6)."""

import json
from datetime import date
from pathlib import Path

from analytics.executor import execute
from analytics.validation import validate_plan

FIXTURES = Path(__file__).parent / "fixtures"
PROFILE_ID = 9000
TODAY = date(2026, 9, 4)
# lastMonths: 12 is 12 buckets ending with the current partial month (spec D5).
PERIODS = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
           "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]


def _plan(name: str) -> dict:
    return json.loads((FIXTURES / "plans" / name).read_text())


def test_canonical_merchant_split_is_gap_free_per_series(conn, merchant_seed):
    envelope = execute(conn, PROFILE_ID, _plan("merchant_split.json"), today=TODAY, merchant_enabled=True)

    assert envelope["meta"]["truncatedGroups"] is False
    (result,) = envelope["results"]
    assert result["currency"] == "PLN"
    assert result["shape"] == "timeseriesSplit"
    # Series are ordered by absolute total: Lidl 673.50, Biedronka 487.00.
    assert [series["label"] for series in result["series"]] == ["Lidl", "Biedronka"]

    by_label = {}
    for series in result["series"]:
        assert [point["period"] for point in series["points"]] == PERIODS  # zero-filled per series (D4)
        by_label[series["label"]] = {point["period"]: point["value"] for point in series["points"]}

    assert by_label["Lidl"]["2026-07"] == "243.5000"
    assert by_label["Lidl"]["2026-08"] == "310.0000"
    assert by_label["Lidl"]["2026-09"] == "120.0000"
    assert by_label["Biedronka"]["2026-07"] == "180.0000"
    assert by_label["Biedronka"]["2026-08"] == "212.0000"
    assert by_label["Biedronka"]["2026-09"] == "95.0000"
    assert by_label["Lidl"]["2026-01"] == "0.0000"
    assert by_label["Biedronka"]["2025-10"] == "0.0000"


def test_null_merchant_is_grouped_as_unspecified_and_the_tail_is_capped(conn, merchant_seed):
    envelope = execute(conn, PROFILE_ID, _plan("merchant_breakdown.json"), today=TODAY, merchant_enabled=True)

    assert envelope["meta"]["truncatedGroups"] is True
    (result,) = envelope["results"]
    assert result["shape"] == "breakdown"
    # 29 merchants (Lidl, Biedronka, Unspecified, M01..M26) -> 25 kept + one "Other".
    assert len(result["groups"]) == 26
    assert [group["label"] for group in result["groups"][:3]] == ["Lidl", "Biedronka", "Unspecified"]
    # The four smallest (M04 4.00 + M03 3.00 + M02 2.00 + M01 1.00) survive as one row.
    assert result["groups"][-1] == {"key": "__other__", "label": "Other", "value": "10.0000"}


def test_merchant_filter_is_literal_equality(conn, merchant_seed):
    envelope = execute(conn, PROFILE_ID, _plan("merchant_filter.json"), today=TODAY, merchant_enabled=True)

    (result,) = envelope["results"]
    assert result == {"currency": "PLN", "shape": "value", "value": "673.5000"}


def test_unspecified_is_a_label_not_a_filter_value(conn, merchant_seed):
    plan = _plan("merchant_breakdown.json")
    plan["filters"]["merchants"] = ["Lidl", "Unspecified"]

    envelope = execute(conn, PROFILE_ID, plan, today=TODAY, merchant_enabled=True)

    (result,) = envelope["results"]
    # A NULL merchant never satisfies an equality filter, so asking for "Unspecified" asks for nothing.
    assert [group["label"] for group in result["groups"]] == ["Lidl"]
    assert envelope["meta"]["truncatedGroups"] is False


def test_merchant_plan_is_accepted_when_the_column_is_enabled(conn, merchant_seed):
    assert validate_plan(_plan("merchant_split.json"), profile_id=PROFILE_ID, conn=conn,
                         merchant_enabled=True) == []


def test_merchant_plan_is_still_rejected_when_it_is_not(conn, merchant_seed):
    problems = validate_plan(_plan("merchant_split.json"), profile_id=PROFILE_ID, conn=conn,
                             merchant_enabled=False)

    assert any("not available yet" in problem for problem in problems)
```

- [ ] **Step 3: Run the goldens to verify they fail**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_executor_merchant.py -q`
Expected: FAIL — `test_canonical_merchant_split_is_gap_free_per_series` raises `PlanProblems` (the executor still has no merchant axis) or `psycopg.errors.UndefinedColumn` once it tries to group on a column its SQL never selected. `test_merchant_plan_is_still_rejected_when_it_is_not` passes from the start: it is the guard that Stage 1's behaviour is preserved, not a new requirement.

- [ ] **Step 4: Add the merchant axis to `sql.py`**

Add at module level:

```python
# docs/INSIGHTS.md "Plan DSL v1": a NULL merchant is a real group, not a missing row.
MERCHANT_GROUP_EXPR = "COALESCE(t.merchant, 'Unspecified')"


# Predicate for filters.merchants: literal equality against the column. A transaction with
# no merchant never matches, which is why "Unspecified" is a display label, never a filter
# value. Stage 1's build_query collects predicates in a `where: list[str]` and joins them
# with "\n   AND ", so this appends a BARE predicate — a leading " AND " would produce
# "... AND  AND t.merchant = ..." and fail to parse.
MERCHANT_PREDICATE = "t.merchant = ANY(%(merchants)s)"
```

Then wire both in:

- wherever `sql.py` maps `plan.group_by` to the grouping expression (Stage 1's `"category"` branch), add the `"merchant"` branch: the group **key** and the group **label** are both `MERCHANT_GROUP_EXPR`, and the same expression goes in the `GROUP BY`. Unlike `category`, there is no CTE — a merchant is a string on the row, not a node in a tree.
- in `build_query`, immediately after the currency predicate, add the merchant predicate to
  the same `where` list Stage 1 already joins:

```python
    if plan.filters.merchants is not None:
        params["merchants"] = list(plan.filters.merchants)
        where.append(MERCHANT_PREDICATE)
```

The `timeseriesSplit` builder needs no other change: the distinct group keys it cross-joins with the bucket series (R15) are now merchant strings instead of category ids, and the zero-fill it already does per series is exactly what D4 requires.

- [ ] **Step 5: Verify the validator, then flip the caller**

The two merchant rejections in `analytics/src/analytics/validation.py` stay exactly as they are — this task changes the *caller*, not the rule. Confirm both are behind the flag:

Run: `cd /home/chris/side-projects/my-finance/analytics && grep -n "merchant" src/analytics/validation.py`
Expected: both the `filters.merchants` and the `groupBy == "merchant"` problems appear inside a `if not merchant_enabled:` branch. If either is unconditional, move it under the flag — nothing else in that file changes.

Then in `analytics/src/analytics/main.py`, the `/internal/v1/execute` handler's call becomes:

```python
    envelope = execute(conn, body.profile_id, body.plan, today=today, merchant_enabled=True)
```

`merchant_enabled` stays a parameter rather than disappearing: it is what keeps the "not available yet" path testable now that production always passes `True`. If Stage 1 wrote an endpoint-level test asserting that a merchant plan is rejected through `POST /internal/v1/execute`, that test now describes the old world — update it to assert the same rejection through `validate_plan(..., merchant_enabled=False)` instead of deleting the coverage.

- [ ] **Step 6: Cap the grouped axis in `executor.py`**

Both grouped shapes are ordered by **absolute total descending** before the cap — that is the rank the cap needs, and it is what the goldens assert (`["Lidl", "Biedronka"]`, then `["Lidl", "Biedronka", "Unspecified"]`). `docs/INSIGHTS.md` pins that ordering explicitly for `breakdown` only, so if Stage 1 ordered `timeseriesSplit` series some other way (by label, or by tree order for the category split), **this task changes that ordering to match** — the golden is the specification, not the existing behaviour.

In `execute`, where each currency entry's `groups` / `series` are assembled — after that sort and after per-series zero-filling — pass them through Task 5's functions and let the flag reach `meta`:

Stage 1's `_rank_and_cap` already runs inside `_breakdown` and `_timeseries_split`
and already feeds `meta.truncatedGroups`, and it does not care what the group key
means. Once `sql.py` emits merchant keys the cap applies to the merchant axis with
**no executor change at all** — so there is nothing to write here beyond confirming it:

```bash
cd /home/chris/side-projects/my-finance/analytics
grep -n "_rank_and_cap\|MAX_GROUPS\|OTHER_KEY" src/analytics/executor.py
```

Expected: `MAX_GROUPS = 25`, `OTHER_KEY = "__other__"` and the two `_rank_and_cap`
call sites, all from Stage 1. If any of them is missing, Stage 1 Task 25 has not
landed and this task cannot proceed.


replacing Stage 1's hard-coded `False` (category grouping is bounded by the tree, so until merchants landed there was nothing to report).

- [ ] **Step 7: Run the goldens to verify they pass**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest -q`
Expected: PASS — the whole analytics suite, so the Phase 4 goldens prove the new seed profile did not disturb their numbers.

- [ ] **Step 8: Update `docs/INSIGHTS.md` and `docs/API.md`**

In `docs/INSIGHTS.md` → Plan DSL v1, replace the `filters.merchants` row with:

```
| `filters.merchants` | array of strings, optional | Restrict to these merchants. Literal equality on `txn.merchant` (`V5`, Phase 4b): a transaction with no merchant never matches, so `"Unspecified"` is a display label and never a filter value. |
```

and the `groupBy` row with (this keeps the partition sentence Stage 1 Task 23 added and
removes only the Phase-4b rejection clause — do not revert to the pre-Stage-1 wording):

```
| `groupBy` | `category` \| `merchant` \| `null` | The categorical axis. `category` groups by the *children* of the filtered category (or by root categories when no filter), each child including its own subtree, plus the filtered category itself as one more group holding the transactions filed directly on it — so the groups partition the filtered set exactly rather than silently dropping those rows, matching the dashboard's rollup. `merchant` groups by the merchant string, with `null` collected under `"Unspecified"`. |
```

In the "Validation is strict and structural" paragraph, **delete** the clause `` `merchants` without the feature, `` — that rejection is gone, and the remaining examples (unknown fields, unknown enum values, `from > to`, a `categoryId` not in the profile) still list only rules the validator actually enforces.

In `docs/API.md` → `POST /api/insights/execute`, the `400` row loses its now-stale
`merchants before Phase 4b` example. **The text you are editing is edit E9's**, applied by
Stage 1's doc-fix task — keep its structure: the backend checks only "is a JSON object",
and `unsupported version` stays on the executor's side of the sentence (spec D7). Replace
the row with:

```
| `400` | Not a JSON object (`/errors/invalid-plan`), or executor-rejected plan (`/errors/invalid-plan` with `problems` array — unsupported `version`, dangling `categoryId`, unknown field, unknown enum value, `from` after `to`, ...) |
```

- [ ] **Step 9: Append the `docs/LESSONS.md` entry**

```markdown
### Bounded output is part of a result contract, not a rendering detail

- **What** — the merchant axis returns at most 25 groups plus one `Other`, and says so in
  `meta.truncatedGroups`.
- **Where** — `analytics/src/analytics/executor.py` (`_rank_and_cap`, from Stage 1),
  `docs/INSIGHTS.md` → Execution semantics.
- **Why it's this way** — category groups are bounded by a five-deep tree, but merchants are
  user-typed strings with no upper bound, so "group by merchant" over a messy history can return
  thousands of series. Silently rendering 3,000 lines is unusable and silently dropping the tail is
  a lie, so the tail is *folded*: the total still adds up and the flag lets the UI say what
  happened. The ordering detail that matters in Python: the fold runs **after** the per-series
  zero-fill, so every dropped series already has one point per bucket and `Other` can be summed
  positionally — summing ragged lists with `zip` is where this quietly goes wrong.
```

- [ ] **Step 10: Commit**

```bash
git add analytics/src/analytics/sql.py analytics/src/analytics/executor.py \
        analytics/src/analytics/main.py analytics/src/analytics/validation.py \
        analytics/tests/conftest.py analytics/tests/test_executor_merchant.py \
        analytics/tests/fixtures/seed_merchants.sql analytics/tests/fixtures/plans \
        docs/INSIGHTS.md docs/API.md
git commit -m "feat(analytics): activate the merchant filter and groupBy axis"
```

---


### Task 6: [MY-33] merchant field in the transaction modal

**Files:**
- Modify: `frontend/src/api/types.ts` (`TransactionResponse`, `CreateTransactionRequest`)
- Modify: `frontend/src/components/TxnModal.tsx` (one state hook, one field)
- Test: `frontend/e2e/merchant.spec.ts` (new file, first test)

**Interfaces:**
- Consumes: `POST /api/transactions` accepting and echoing `merchant` (Task 2).
- Produces: `TransactionResponse.merchant: string | null`, `CreateTransactionRequest.merchant?: string | null`, and a `Merchant` labelled input in the add-transaction dialog. Task 7 reuses the types.

- [ ] **Step 1: Write the failing test**

Create `frontend/e2e/merchant.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

// Merchant entry and backfill against the REAL backend (Spring Boot on :8080, proxied by the Vite
// dev server), same shape as smoke.spec.ts: every test registers its own user, so runs repeat.

const PASSWORD = 'sturdy-password-1'; // the API requires >= 12 chars

async function registerAndLogin(page: Page, email: string, displayName: string) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/auth/);
  await page.getByRole('link', { name: 'Create account' }).click();
  await page.getByLabel('Display name').fill(displayName);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/picker/);
}

async function createProfileAndCategory(page: Page, profileName: string, categoryName: string) {
  await page.getByRole('button', { name: 'New profile' }).click();
  await page.getByLabel('Profile name').fill(profileName);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(profileName) }).click();
  await expect(page).toHaveURL('/');
  await page.getByRole('link', { name: 'Categories', exact: true }).click();
  await page.getByLabel('Category name').fill(categoryName);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('link', { name: categoryName, exact: true })).toBeVisible();
}

/** The merchant of every transaction in the active profile, oldest page first. */
async function merchants(page: Page): Promise<Array<string | null>> {
  return page.evaluate(async () => {
    const body: { content: Array<{ merchant: string | null }> } = await (
      await fetch('/api/transactions', { credentials: 'include' })
    ).json();
    return body.content.map((t) => t.merchant);
  });
}

test('the transaction modal saves a merchant', async ({ page }) => {
  await registerAndLogin(page, `e2e-merchant-${Date.now()}@example.com`, 'E2E Merchant');
  await createProfileAndCategory(page, 'Personal', 'Groceries');

  await page.getByRole('button', { name: 'Add transaction' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('34.99');
  await page.getByLabel('Description').fill('weekly shop');
  await page.getByLabel('Merchant').fill('Lidl');
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.getByRole('button', { name: 'Save transaction' })).toBeHidden();

  expect(await merchants(page)).toEqual(['Lidl']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (with the backend already on :8080 — see `README.md`; Playwright starts the Vite dev server itself):
`cd /home/chris/side-projects/my-finance/frontend && npm run e2e -- merchant.spec.ts`
Expected: FAIL with `locator.fill: Timeout ... waiting for getByLabel('Merchant')` — the dialog has no such field.

- [ ] **Step 3: Extend the DTO types**

In `frontend/src/api/types.ts`, in the `// — Transactions —` block:

```ts
export interface TransactionResponse {
  id: number;
  category: CategoryRef;
  amount: string;
  currency: string;
  type: TxnType;
  occurredOn: string;
  description: string | null;
  merchant: string | null;
  subscriptionId: number | null;
  createdAt: string;
}

export interface CreateTransactionRequest {
  categoryId: number;
  amount: string;
  currency: string;
  type: TxnType;
  occurredOn: string;
  description?: string | null;
  merchant?: string | null;
}
```

- [ ] **Step 4: Add the field to the dialog**

In `frontend/src/components/TxnModal.tsx`, add the state next to `description`:

```tsx
  const [description, setDescription] = useState('');
  const [merchant, setMerchant] = useState('');
```

send it (blank means "none", exactly like `description`):

```tsx
        description: description.trim() || null,
        merchant: merchant.trim() || null,
```

and render it directly after the description field, inside the same column stack:

```tsx
          <div className="field">
            <label htmlFor="txn-merchant">Merchant (optional)</label>
            <input
              id="txn-merchant"
              className="input"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="e.g. Lidl"
              aria-label="Merchant"
            />
            {fieldErrors.merchant && (
              <div className="error-box" style={{ marginTop: 6, fontSize: 12 }}>
                {fieldErrors.merchant}
              </div>
            )}
          </div>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/frontend && npm run e2e -- merchant.spec.ts`
Expected: PASS (1 test)

- [ ] **Step 6: Type-check the build**

Run: `cd /home/chris/side-projects/my-finance/frontend && npm run build`
Expected: exit 0 — `tsc -b` runs first with `noUnusedLocals`, so this also catches a state variable added and never used.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/components/TxnModal.tsx frontend/e2e/merchant.spec.ts
git commit -m "feat(frontend): merchant field in the transaction modal"
```

---


### Task 7: [MY-33] merchant backfill suggestions on the transactions screen

**Files:**
- Modify: `frontend/src/api/types.ts` (three interfaces, `// — Transactions —` block)
- Modify: `frontend/src/api/hooks.ts` (one query hook, one mutation hook, one line in `useInvalidateTransactionData`)
- Create: `frontend/src/components/MerchantBackfill.tsx`
- Modify: `frontend/src/screens/Transactions.tsx` (import + one element between the KPI tile grid and the table `Card`)
- Test: `frontend/e2e/merchant.spec.ts` (second test)

**Interfaces:**
- Consumes: `GET /api/transactions/merchant-suggestions`, `POST /api/transactions/merchant-backfill` (Task 4); the `merchants(page)` helper from Task 6's spec.
- Produces: `useMerchantSuggestions()`, `useBackfillMerchant()`, `<MerchantBackfill />` (renders nothing when there is nothing to suggest).

- [ ] **Step 1: Write the failing test**

Append to `frontend/e2e/merchant.spec.ts`:

```ts
test('the backfill suggester labels repeated descriptions', async ({ page }) => {
  await registerAndLogin(page, `e2e-backfill-${Date.now()}@example.com`, 'E2E Backfill');
  await createProfileAndCategory(page, 'Personal', 'Groceries');

  // Three transactions sharing a description and no merchant — the suggester's raw material.
  await page.evaluate(async () => {
    const xsrf = document.cookie
      .split('; ')
      .find((c) => c.startsWith('XSRF-TOKEN='))!
      .split('=')[1];
    const cats: Array<{ id: number; name: string }> = await (
      await fetch('/api/categories', { credentials: 'include' })
    ).json();
    const groceries = cats.find((c) => c.name === 'Groceries')!;
    for (const amount of ['12.00', '18.50', '9.90']) {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': decodeURIComponent(xsrf) },
        body: JSON.stringify({
          categoryId: groceries.id,
          amount,
          currency: 'PLN',
          type: 'EXPENSE',
          occurredOn: new Date().toISOString().slice(0, 10),
          description: 'Biedronka',
        }),
      });
      if (!res.ok) throw new Error(`txn seed failed: ${res.status} ${await res.text()}`);
    }
  });

  await page.getByRole('link', { name: 'Transactions', exact: true }).click();
  const card = page.locator('.blueprint', { hasText: 'Set merchants from descriptions' });
  await expect(card).toContainText('Biedronka');
  await expect(card).toContainText('3 transactions');

  await card.getByRole('button', { name: 'Apply' }).first().click();
  // Nothing left to suggest, so the card takes itself off the screen.
  await expect(card).toBeHidden();

  expect(await merchants(page)).toEqual(['Biedronka', 'Biedronka', 'Biedronka']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/frontend && npm run e2e -- merchant.spec.ts`
Expected: FAIL — `expect(card).toContainText('Biedronka')` times out; the transactions screen has no such card.

- [ ] **Step 3: Add the DTO types**

In `frontend/src/api/types.ts`, at the end of the `// — Transactions —` block:

```ts
/** One backfill candidate from GET /api/transactions/merchant-suggestions. */
export interface MerchantSuggestion {
  description: string;
  /** JSON number (a row count, never money). */
  transactionCount: number;
}

export interface MerchantBackfillRequest {
  description: string;
  merchant: string;
}

export interface MerchantBackfillResponse {
  updated: number;
}
```

- [ ] **Step 4: Add the hooks**

In `frontend/src/api/hooks.ts`, in the `// — Transactions —` section, add one line to the shared invalidator and the two hooks after `useCreateTransaction`:

```ts
/** Everything a transaction changes: lists, budget spend, subscription charges. */
function useInvalidateTransactionData() {
  const queryClient = useQueryClient();
  const profileId = useActiveProfileId();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['transactions', profileId] });
    queryClient.invalidateQueries({ queryKey: ['budgets', profileId] });
    queryClient.invalidateQueries({ queryKey: ['budget-status', profileId] });
    queryClient.invalidateQueries({ queryKey: ['subscription-dashboard', profileId] });
    queryClient.invalidateQueries({ queryKey: ['merchant-suggestions', profileId] });
  };
}

export function useMerchantSuggestions() {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: ['merchant-suggestions', profileId],
    queryFn: () => api<MerchantSuggestion[]>('/api/transactions/merchant-suggestions'),
    enabled: profileId !== null,
  });
}

export function useBackfillMerchant() {
  const invalidate = useInvalidateTransactionData();
  return useMutation({
    mutationFn: (body: MerchantBackfillRequest) =>
      api<MerchantBackfillResponse>('/api/transactions/merchant-backfill', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}
```

with the three new type imports added to the existing `import type { ... } from './types';` list.

- [ ] **Step 5: Build the component**

Create `frontend/src/components/MerchantBackfill.tsx`:

```tsx
import { useState } from 'react';
import { ApiError } from '../api/client';
import { useBackfillMerchant, useMerchantSuggestions } from '../api/hooks';
import { Card } from './Card';

/**
 * Turns repeated descriptions into merchants, one group at a time. The server suggests the
 * description itself (docs/API.md "GET /api/transactions/merchant-suggestions"); the value stays
 * editable here because the suggester deliberately does not guess.
 */
export function MerchantBackfill() {
  const suggestions = useMerchantSuggestions();
  const backfill = useBackfillMerchant();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const list = suggestions.data ?? [];
  if (list.length === 0) return null;

  const apply = (description: string) => {
    const merchant = (edits[description] ?? description).trim();
    if (!merchant) {
      setError('A merchant name is required.');
      return;
    }
    setError('');
    backfill.mutate(
      { description, merchant },
      {
        onError: (err) =>
          setError(err instanceof ApiError ? err.detail : 'Something went wrong — is the backend running?'),
      },
    );
  };

  return (
    <Card style={{ padding: '16px 20px', marginBottom: 24 }}>
      <div className="kicker">Set merchants from descriptions</div>
      <p className="text-muted" style={{ fontSize: 13, margin: '4px 0 12px' }}>
        These descriptions repeat and have no merchant yet. Applying one labels every matching
        transaction, so insights can compare merchant against merchant.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((suggestion) => (
          <div
            key={suggestion.description}
            style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
          >
            <span style={{ minWidth: 180 }}>{suggestion.description}</span>
            <span className="tag tag-neutral">{suggestion.transactionCount} transactions</span>
            <input
              className="input"
              style={{ width: 200, minHeight: 32, padding: '4px 10px', fontSize: 13 }}
              value={edits[suggestion.description] ?? suggestion.description}
              onChange={(e) =>
                setEdits({ ...edits, [suggestion.description]: e.target.value })
              }
              aria-label={`Merchant for ${suggestion.description}`}
            />
            <button
              className="btn btn-secondary"
              onClick={() => apply(suggestion.description)}
              disabled={backfill.isPending}
            >
              Apply
            </button>
          </div>
        ))}
      </div>
      {error && (
        <div className="error-box" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 6: Render it on the transactions screen**

In `frontend/src/screens/Transactions.tsx`, add the import next to the other component imports:

```tsx
import { MerchantBackfill } from '../components/MerchantBackfill';
```

and the element between the KPI tile grid's closing `</div>` and `<Card style={{ padding: '6px 18px 14px' }}>`:

```tsx
      <MerchantBackfill />
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/frontend && npm run e2e -- merchant.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 8: Type-check the build**

Run: `cd /home/chris/side-projects/my-finance/frontend && npm run build`
Expected: exit 0

- [ ] **Step 9: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/hooks.ts \
        frontend/src/components/MerchantBackfill.tsx frontend/src/screens/Transactions.tsx \
        frontend/e2e/merchant.spec.ts
git commit -m "feat(frontend): merchant backfill suggestions on the transactions screen"
```

---


### Task 8: [MY-33] the merchant chip and the merchant groupBy option go live

**Files:**
- Create: `frontend/src/insights/chips/MerchantChip.tsx`
- Modify: `frontend/src/insights/chips/ChipBar.tsx` (render the new chip)
- Modify: `frontend/src/insights/chips/GroupByChip.tsx` (add the `merchant` option)

**Interfaces:**
- Consumes (Stage 1, contract §5): the `Plan`, `PlanFilters` and `GroupBy` types in `frontend/src/api/types.ts` — `merchants?: string[]` and `'merchant'` are already part of them, so **no type change is needed here**; Stage 1's existing chips take **narrow** value/onChange props — `CategoryChip({ categories, value, onChange: (categoryId: number | undefined) => void })`, `GroupByChip({ value, onChange: (groupBy: GroupBy | null) => void })` — and `ChipBar` adapts them through its local `set(patch)` / `setFilter(patch)` helpers. `MerchantChip` is new and may take the wider `{ plan: Plan; onChange: (plan: Plan) => void }`, but it must then be rendered from `ChipBar` as `<MerchantChip plan={plan} onChange={onChange} />` — do **not** pass the wide props to the existing chips.
- Produces: `<MerchantChip />`, and `groupBy: "merchant"` selectable in the explorer.

No test-first cycle for this task: it is presentational wiring over already-typed props, with no logic beyond splitting a comma-separated string. The gates are `npm run build` (Step 3) and the end-to-end run in Task 9, which drives both controls for real.

- [ ] **Step 1: Write the chip**

Create `frontend/src/insights/chips/MerchantChip.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { Plan } from '../../api/types';

/**
 * filters.merchants as a comma-separated list. Free text on purpose: merchants are free text on
 * the transaction (docs/SCHEMA.md "txn"), matched by literal equality, so a picker would have to
 * fetch a list the profile may not have curated yet.
 */
export function MerchantChip({ plan, onChange }: { plan: Plan; onChange: (plan: Plan) => void }) {
  const merchants = plan.filters.merchants ?? [];
  const [text, setText] = useState(merchants.join(', '));

  // A template or a saved insight can replace the plan under us; follow it.
  useEffect(() => {
    setText(merchants.join(', '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchants.join(', ')]);

  const commit = () => {
    const parsed = text
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const filters = { ...plan.filters };
    if (parsed.length === 0) delete filters.merchants;
    else filters.merchants = parsed;
    onChange({ ...plan, filters });
  };

  return (
    <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="kicker">merchants</span>
      <input
        className="input"
        style={{ width: 200, minHeight: 32, padding: '4px 10px', fontSize: 13 }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        placeholder="Lidl, Biedronka"
        aria-label="Merchant filter"
      />
    </label>
  );
}
```

- [ ] **Step 2: Put it in the chip bar and open the groupBy option**

In `frontend/src/insights/chips/ChipBar.tsx`, import `MerchantChip` and render it directly after `<CategoryChip ... />`, passing the same props that chip receives.

In `frontend/src/insights/chips/GroupByChip.tsx`, add `'merchant'` to the list of options it renders (Stage 1 left it out because the executor rejected it — spec D2 activates both halves together, and Task 5 did the executor half). Label it `merchant`, lower case, like every other option in that control.

- [ ] **Step 3: Type-check the build**

Run: `cd /home/chris/side-projects/my-finance/frontend && npm run build`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add frontend/src/insights/chips/MerchantChip.tsx \
        frontend/src/insights/chips/ChipBar.tsx \
        frontend/src/insights/chips/GroupByChip.tsx
git commit -m "feat(frontend): merchant filter chip and merchant groupBy in the explorer"
```

---


### Task 9: [MY-33] the merchant comparison template, and the Phase 4b acceptance run

**Files:**
- Modify: `frontend/src/insights/templates.ts` (one entry)
- Modify: `docs/INSIGHTS.md` (Template gallery → the numbered list)

**Interfaces:**
- Consumes: Stage 1's template entry type in `frontend/src/insights/templates.ts` — a name plus a `Plan` (contract §5: "a curated list … each entry a name + a plan with explicit parameter slots"). Match the field names of the entries already in that file; only the object literal below changes if they differ.
- Produces: a template that lands in the explorer with `groupBy: "merchant"` and a merchants filter pre-filled — the acceptance vehicle for this whole fragment.

**No test-first cycle for this task**, per CLAUDE.md's "trivial tasks" tradeoff: it adds
one data literal to the template gallery plus a doc edit, with no branching logic to
express as a failing test. The gates are `npm run build` and the end-to-end acceptance
run in the closing steps.

- [ ] **Step 1: Add the template**

In `frontend/src/insights/templates.ts`, append to the exported list:

```ts
  {
    name: 'Two merchants compared, monthly — last 12 months',
    description: 'The Lidl vs Biedronka question: monthly spend, one line per merchant.',
    plan: {
      version: 1,
      metric: 'spend',
      filters: { includeDescendants: true, merchants: ['Lidl', 'Biedronka'] },
      groupBy: 'merchant',
      interval: 'month',
      range: { type: 'lastMonths', n: 12 },
    },
  },
```

The merchant names are a starting point the chip edits, exactly like the category slot in the other templates.

- [ ] **Step 2: Record it in `docs/INSIGHTS.md`**

In `## Template gallery`, add to the numbered "Initial set" list, after item 4:

```
5. Two merchants compared, monthly — last 12 months (`timeseriesSplit`, Phase 4b: needs
   `txn.merchant`)
```

and renumber the two entries that follow.

- [ ] **Step 3: Type-check the build**

Run: `cd /home/chris/side-projects/my-finance/frontend && npm run build`
Expected: exit 0

- [ ] **Step 4: Bring up the whole stack**

Run:

```bash
cd /home/chris/side-projects/my-finance && docker compose up -d --build
docker compose ps
```

Expected: `postgres`, `backend`, `analytics` and `frontend` all up, `analytics` healthy (its healthcheck is the interpreter itself — R4). The app is at http://localhost:3000.

- [ ] **Step 5: Seed real merchant data through the UI**

At http://localhost:3000: register an account, create profile "Personal", create category "Groceries", then add six transactions with the **Add transaction** dialog — three with merchant `Lidl` and three with merchant `Biedronka`, dated in three different recent months, all in PLN. Use the merchant field from Task 6; this is the whole path (browser → backend → Postgres) the acceptance is about.

- [ ] **Step 6: Run the canonical plan against the executor on that data**

Read the profile id, then execute the canonical plan inside the analytics container (it holds `ANALYTICS_TOKEN` in its environment, and the service is not reachable from outside the compose network by design):

```bash
cd /home/chris/side-projects/my-finance
docker compose exec -T postgres psql -U myfinance -d myfinance \
  -c "SELECT p.id AS profile_id, c.id AS category_id FROM profile p JOIN category c ON c.profile_id = p.id"

docker compose exec -T analytics python - <<'PY'
import json, os, urllib.request
plan = {"version": 1, "metric": "spend",
        "filters": {"categoryId": CATEGORY_ID, "includeDescendants": True,
                    "merchants": ["Lidl", "Biedronka"], "currency": "PLN"},
        "groupBy": "merchant", "interval": "month",
        "range": {"type": "lastMonths", "n": 12}}
request = urllib.request.Request(
    "http://localhost:8000/internal/v1/execute",
    data=json.dumps({"profileId": PROFILE_ID, "plan": plan}).encode(),
    headers={"Content-Type": "application/json",
             "Authorization": "Bearer " + os.environ["ANALYTICS_TOKEN"]})
print(json.dumps(json.load(urllib.request.urlopen(request)), indent=2))
PY
```

(substituting the two ids printed by `psql`.)

Expected: `results[0].shape == "timeseriesSplit"`, exactly two series labelled `Lidl` and `Biedronka`, **12 points each** with gap-free `period` keys ending in the current month, the seeded amounts in the right months and `"0.0000"` everywhere else, and `meta.truncatedGroups == false`. That is the fragment's acceptance criterion.

- [ ] **Step 7: Run the same plan through the explorer**

At http://localhost:3000/insights: open the "Two merchants compared, monthly" template, check that the **merchants** chip shows `Lidl, Biedronka` and the **groupBy** chip shows `merchant`, run it, and confirm the chart draws the same two series as Step 6. Then clear the merchants chip and re-run: the split should now include every merchant in the profile, plus `Unspecified` if any transaction has none.

Save a screenshot for the record:

```bash
mkdir -p /root/fe-shots   # the path e2e/smoke.spec.ts already writes to
```
and use the browser's own screenshot into `/root/fe-shots/06-insights-merchants.png`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/insights/templates.ts docs/INSIGHTS.md
git commit -m "feat(frontend): merchant comparison template for the explorer"
```

### Task 10: [MY-34] Plan DSL v2 — the optional `forecast` field

**Files:**
- Modify: `analytics/src/analytics/plan.py` (`SUPPORTED_VERSIONS`, new `Forecast` dataclass, `Plan.forecast`, `parse_plan`)
- Modify: `analytics/src/analytics/validation.py` (add `"forecast"` to the known top-level plan keys; new `forecast_problems()`; one call from `validate_plan`)
- Test: `analytics/tests/test_plan_v2.py` (new)
- Modify: `analytics/tests/test_validation.py` (Stage 1's `unsupported version` case now describes a *supported* version — see Step 5)
- Modify: `docs/INSIGHTS.md` (Contents, Plan DSL table, Result shapes sentence, new "Forecast, anomalies and drift" section, "Deliberately deferred" table)
- Modify: `docs/LESSONS.md` (append one entry)

**Interfaces:**
- Consumes: `SUPPORTED_VERSIONS: frozenset[int]`, `Plan` (frozen dataclass), `parse_plan()`, `validate_plan(raw, *, profile_id, conn, merchant_enabled) -> list[str]` — all from Stage 1, MY-31 (Tasks 20-21) — `plan.py` and `validation.py` are the executor's modules, not the backend's.
- Produces:
  - `analytics.plan.SUPPORTED_VERSIONS: frozenset[int]` — now `frozenset({1, 2})`
  - `analytics.plan.MAX_FORECAST_MONTHS: int` — `12`
  - `analytics.plan.Forecast` — `@dataclass(frozen=True)` with one field, `months: int`
  - `analytics.plan.Plan.forecast: Forecast | None` — defaults to `None`
  - `analytics.validation.forecast_problems(raw: object, *, version: object, interval: object) -> list[str]`

- [ ] **Step 1: Write the failing test**

Create `analytics/tests/test_plan_v2.py`:

```python
"""Plan DSL v2 — the optional `forecast` field (docs/INSIGHTS.md -> Forecast).

Pure: no database, no container. `forecast_problems` is a total function of the
raw plan, so the whole rule set is table-driven.
"""

import pytest

from analytics.plan import MAX_FORECAST_MONTHS, SUPPORTED_VERSIONS
from analytics.validation import forecast_problems


def test_the_executor_accepts_both_plan_versions():
    """A1: a v2 plan is a v1 plan plus `forecast`, so v1 is never dropped."""
    assert SUPPORTED_VERSIONS == frozenset({1, 2})


def test_the_horizon_is_capped_at_the_seasonal_period():
    """months <= 12 keeps the seasonal-naive lookback inside the observed series."""
    assert MAX_FORECAST_MONTHS == 12


def test_no_forecast_is_never_a_problem():
    assert forecast_problems(None, version=1, interval="month") == []
    assert forecast_problems(None, version=2, interval="week") == []
    assert forecast_problems(None, version=1, interval=None) == []


def test_a_valid_forecast_on_a_v2_monthly_plan_has_no_problems():
    assert forecast_problems({"months": 3}, version=2, interval="month") == []
    assert forecast_problems({"months": 1}, version=2, interval="month") == []
    assert forecast_problems({"months": 12}, version=2, interval="month") == []


@pytest.mark.parametrize(
    ("raw", "version", "interval", "expected"),
    [
        ({"months": 3}, 1, "month", ["forecast: requires plan version 2"]),
        ({"months": 3}, 2, "week", ['forecast: requires interval "month"']),
        ({"months": 3}, 2, None, ['forecast: requires interval "month"']),
        ({"months": 0}, 2, "month", ["forecast.months: must be an integer between 1 and 12"]),
        ({"months": 13}, 2, "month", ["forecast.months: must be an integer between 1 and 12"]),
        ({"months": "3"}, 2, "month", ["forecast.months: must be an integer between 1 and 12"]),
        # True is an int in Python; a boolean horizon is still a rejection.
        ({"months": True}, 2, "month", ["forecast.months: must be an integer between 1 and 12"]),
        ({"months": 3, "confidence": 0.9}, 2, "month", ["forecast: unknown field(s) confidence"]),
        ({}, 2, "month", ["forecast.months: must be an integer between 1 and 12"]),
        (3, 2, "month", ['forecast: must be an object with a "months" field']),
    ],
)
def test_forecast_problems(raw, version, interval, expected):
    assert forecast_problems(raw, version=version, interval=interval) == expected
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_plan_v2.py -q`

Expected: FAIL with `ImportError: cannot import name 'MAX_FORECAST_MONTHS' from 'analytics.plan'` (collection error, all tests errored).

- [ ] **Step 3: Bump the version set and add the `forecast` field to `plan.py`**

In `analytics/src/analytics/plan.py`, change the version set and add the constant next to it:

```python
SUPPORTED_VERSIONS: frozenset[int] = frozenset({1, 2})
"""v1, plus v2 = v1 + the optional `forecast` field (docs/INSIGHTS.md -> Forecast)."""

MAX_FORECAST_MONTHS = 12
"""Seasonal-naive looks 12 monthly buckets back, so a longer horizon would
project from its own projections. One year is the honest limit."""
```

Add the dataclass immediately above `Plan`:

```python
@dataclass(frozen=True)
class Forecast:
    """Plan v2's only addition: how many monthly buckets to project."""

    months: int
```

Add the field to `Plan` (it must stay last — it is the only one with a default):

```python
    forecast: Forecast | None = None
```

Add the parser and wire it into `parse_plan`'s `Plan(...)` construction:

```python
def _parse_forecast(raw: object) -> Forecast | None:
    """`validate_plan` has already checked the shape, so this only converts."""
    if not isinstance(raw, dict):
        return None
    return Forecast(months=int(raw["months"]))
```

```python
        forecast=_parse_forecast(raw.get("forecast")),
```

- [ ] **Step 4: Echo `forecast` back in the normalized plan**

The envelope's `plan` key is `Plan.to_json()` — `executor.py` only does
`{"plan": plan.to_json(), ...}`, so there is no `normalized` dict to add a key to.
In `analytics/src/analytics/plan.py`, extend `to_json` so a v2 plan round-trips
(and a v1 echo stays byte-identical):

```python
        payload = {
            "version": self.version,
            "metric": self.metric,
            "filters": filters,
            "groupBy": self.group_by,
            "interval": self.interval,
            "range": _range_to_json(self.range),
        }
        if self.forecast is not None:
            payload["forecast"] = {"months": self.forecast.months}
        return payload
```

Without this the explorer's forecast chip loses its horizon on every round trip,
and a saved v2 insight re-opens as a v1 plan.

- [ ] **Step 5: Add the validation rules to `validation.py`**

Add `"forecast"` to the collection of known top-level plan keys that drives the
strict unknown-field check (the known-top-level-keys constant in Stage 1 MY-31's `validation.py` — Task 21 is the authority for its name; use exactly what it
was given), then add the rule function:

```python
def forecast_problems(raw: object, *, version: object, interval: object) -> list[str]:
    """Plan-v2 `forecast` rules (docs/INSIGHTS.md -> Forecast).

    Two hard requirements: the plan must declare version 2 (a v1 plan carrying a
    v2 field would make `version` a lie about its own contents), and the time
    axis must be monthly, because the projection is seasonal-naive over months.
    """
    if raw is None:
        return []
    problems: list[str] = []
    if version != 2:
        problems.append("forecast: requires plan version 2")
    if not isinstance(raw, dict):
        problems.append('forecast: must be an object with a "months" field')
        return problems
    unknown = sorted(set(raw) - {"months"})
    if unknown:
        problems.append(f"forecast: unknown field(s) {', '.join(unknown)}")
    months = raw.get("months")
    # bool is a subclass of int, so `True` would otherwise pass as a horizon of 1.
    if (
        not isinstance(months, int)
        or isinstance(months, bool)
        or not 1 <= months <= MAX_FORECAST_MONTHS
    ):
        problems.append(
            f"forecast.months: must be an integer between 1 and {MAX_FORECAST_MONTHS}"
        )
    if interval != "month":
        problems.append('forecast: requires interval "month"')
    return problems
```

Import the constant at the top of the module, alongside the other `plan` imports:

```python
from analytics.plan import MAX_FORECAST_MONTHS
```

Call it from `validate_plan`, alongside the other per-field checks (`plan` below
is `validate_plan`'s local name for the raw plan dict — use exactly what Stage 1 MY-31 Task 21
gave it):

```python
    problems += forecast_problems(
        plan.get("forecast"),
        version=plan.get("version"),
        interval=plan.get("interval"),
    )
```

- [ ] **Step 6: Repair Stage 1's now-false validation case**

Stage 1's `analytics/tests/test_validation.py` CASES table contains:

```python
    ("unsupported version", {"version": 2, "metric": "spend", "range": {"type": "all"}},
     ["version: unsupported plan version 2"]),
```

Version 2 is now supported, so that case fails. Move the assertion to a version the
set will never contain, and add a companion proving 2 is accepted:

```python
    ("unsupported version", {"version": 3, "metric": "spend", "range": {"type": "all"}},
     ["version: unsupported plan version 3"]),
    ("version 2 is supported", {"version": 2, "metric": "spend", "range": {"type": "all"}},
     []),
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_plan_v2.py -q`

Expected: PASS (14 passed).

- [ ] **Step 8: Document plan v2 in `docs/INSIGHTS.md`**

In the Contents list, after `- [Result shapes](#result-shapes)`, insert:

```markdown
- [Forecast, anomalies and drift](#forecast-anomalies-and-drift)
```

In the Plan DSL table, replace the `version` row with:

```markdown
| `version` | `1` \| `2` | Plan schema version. Unknown versions are rejected (`unsupported plan version`), never guessed at — saved Insights outlive the DSL, and a version bump turns growth into a migration instead of silently broken tiles. v2 adds exactly one optional field, `forecast`; every saved v1 plan still executes unchanged, and a v1 plan carrying `forecast` is rejected. |
```

In the same table, after the `range` row, add:

```markdown
| `forecast` | `{ "months": 1–12 }`, optional, **v2 only** | Appends a seasonal-naive projection to the time axis. Requires `interval: "month"`. See [Forecast, anomalies and drift](#forecast-anomalies-and-drift). |
```

In "Result shapes", replace the sentence

```markdown
`key` is stable and
machine-usable (category id, merchant string, currency code); `label` is for
humans.
```

with

```markdown
`key` is stable and
machine-usable (category id, merchant string, currency code); `label` is for
humans. A point may additionally carry `"projected": true` or `"anomaly": true`
— see [Forecast, anomalies and drift](#forecast-anomalies-and-drift).
```

Insert a new section between "## Result shapes" and "## The analytics service":

```markdown
## Forecast, anomalies and drift

Phase 4b. All three are computed **after** the SQL, from the envelope's own
points: no extra query, no stored state, nothing to migrate. The analytics
service holds a `SELECT`-only role, so anything it "remembered" would have to
become a backend write path — re-deriving costs microseconds over a few dozen
points.

### Forecast (plan v2)

`forecast: { "months": 3 }` is the only thing v2 adds to v1.

| Rule | Value |
|---|---|
| Accepted versions | `1`, `2`. `forecast` on a v1 plan is a plan problem. |
| Required axis | `interval: "month"`; anything else is a plan problem. |
| Horizon | `months`, an integer 1–12. |
| Applies to | `timeseries`, and each series of a `timeseriesSplit`. |

**Seasonal-naive.** Projected bucket *h* (1-based, appended after the last
observed bucket) takes the value of the observed bucket **12 buckets earlier** —
this September looks like last September. When the series is too short to reach
back that far, every projected bucket falls back to the **mean of the last three
observed buckets** (all of them, if there are fewer than three), rounded
half-up to four decimal places. No trend term, no smoothing: the honest naive
baseline, so a dashed line never implies more confidence than "last year,
again".

Projected points are appended to `points` carrying `"projected": true`; the
frontend draws them as a dashed continuation of the same line. This is a
`timeseries` **variant, not a fifth shape** — the four renderers stay four.

```json
{ "currency": "PLN", "shape": "timeseries",
  "points": [ { "period": "2026-09", "value": "980.2100" },
              { "period": "2026-10", "value": "1012.0000", "projected": true } ] }
```
```

In "Deliberately deferred", replace the row

```markdown
| Forecast dimension (`forecast: {months: 3}`, seasonal-naive) + anomaly flags | Phase 4b, after the core loop is real. Dashed-projection rendering is a `timeseries` variant, not a new shape. |
```

with

```markdown
| Anomaly flags on timeseries points | Phase 4b, alongside the forecast dimension. |
```

- [ ] **Step 9: Append the LESSONS.md entry**

Append at the end of `docs/LESSONS.md`:

```markdown
### Versioning a DSL so yesterday's saved queries still run

- **What** — adding one optional field to the plan DSL bumped it to
  `version: 2`, and the executor accepts the *set* `{1, 2}` rather than
  replacing 1 with 2.
- **Where** — `analytics/src/analytics/plan.py` (`SUPPORTED_VERSIONS`),
  `analytics/src/analytics/validation.py` (`forecast_problems`),
  `docs/INSIGHTS.md` → Forecast.
- **Why it's this way** — `insight.plan` is JSONB the schema deliberately does
  not understand, so no migration can rewrite saved plans: the only place
  backward compatibility can live is the reader. Accepting a set of versions
  turns "we changed the DSL" into a data-format question with an explicit
  answer, the same move as a Python API that keeps parsing an old request
  schema instead of breaking every stored payload. The mirror rule earns its
  keep too — a v1 plan carrying a v2 field is rejected, so `version` never
  becomes a lie about what the object contains.
```

- [ ] **Step 10: Commit**

```bash
git add analytics/src/analytics/plan.py analytics/src/analytics/validation.py analytics/tests/test_plan_v2.py analytics/tests/test_validation.py docs/INSIGHTS.md
git commit -m "feat(analytics): plan DSL v2 — optional forecast field, executor accepts versions 1 and 2"
```

---


### Task 11: [MY-34] Seasonal-naive projection

**Files:**
- Create: `analytics/src/analytics/postprocess.py`
- Test: `analytics/tests/test_postprocess.py` (new)

**Interfaces:**
- Consumes: nothing (pure functions over envelope dicts).
- Produces:
  - `analytics.postprocess.Point` — type alias `dict[str, object]`
  - `analytics.postprocess.SEASONAL_PERIOD: int` = `12`
  - `analytics.postprocess.FALLBACK_WINDOW: int` = `3`
  - `analytics.postprocess.with_forecast(points: list[Point], months: int) -> list[Point]` — returns the observed points followed by `months` new points, each `{"period": str, "value": str, "projected": True}`
  - `analytics.postprocess._money(value: Decimal) -> str` — quantize to 4 dp, ROUND_HALF_UP (used by later tasks in this module)

- [ ] **Step 1: Write the failing test**

Create `analytics/tests/test_postprocess.py`:

```python
"""Envelope post-processing (docs/INSIGHTS.md -> Forecast, anomalies and drift).

Pure functions over the executor's own points: no database, no container. Every
expected number is hand-computed and spelled out in the test that asserts it.
"""

from analytics.postprocess import with_forecast


def _points(start_year: int, start_month: int, values: list[str]) -> list[dict]:
    """Chronological, gap-free month buckets starting at YYYY-MM, one per value."""
    out = []
    for offset, value in enumerate(values):
        index = start_year * 12 + start_month - 1 + offset
        out.append({"period": f"{index // 12:04d}-{index % 12 + 1:02d}", "value": value})
    return out


def test_seasonal_naive_reuses_the_bucket_twelve_months_back():
    # 14 buckets, 2025-08 .. 2026-09, values 100, 200, ... 1400.
    points = _points(2025, 8, [f"{(i + 1) * 100}.0000" for i in range(14)])
    assert points[-1]["period"] == "2026-09"

    result = with_forecast(points, 3)

    assert result[:14] == points  # observed points are handed back untouched
    assert result[14:] == [
        # 2026-10 repeats 2025-10 (index 2 = 300), 2026-11 repeats 2025-11, ...
        {"period": "2026-10", "value": "300.0000", "projected": True},
        {"period": "2026-11", "value": "400.0000", "projected": True},
        {"period": "2026-12", "value": "500.0000", "projected": True},
    ]


def test_seasonal_naive_crosses_the_year_boundary():
    # Exactly 12 buckets, 2026-01 .. 2026-12: h=1 reaches index 0, the earliest.
    points = _points(2026, 1, [f"{(i + 1) * 10}.0000" for i in range(12)])

    result = with_forecast(points, 1)

    assert result[-1] == {"period": "2027-01", "value": "10.0000", "projected": True}


def test_short_history_falls_back_to_the_mean_of_the_last_three_buckets():
    # Four buckets, so index 0 - 12 is out of range: (20 + 33 + 41) / 3
    # = 31.333333..., quantized to four places.
    points = _points(2026, 6, ["10.0000", "20.0000", "33.0000", "41.0000"])

    result = with_forecast(points, 2)

    assert result[4:] == [
        {"period": "2026-10", "value": "31.3333", "projected": True},
        {"period": "2026-11", "value": "31.3333", "projected": True},
    ]


def test_the_fallback_window_narrows_on_a_two_bucket_series():
    # Fewer than FALLBACK_WINDOW buckets: the window is what there is.
    # (0.0001 + 0.0003) / 2 = 0.0002 exactly, no rounding involved.
    points = _points(2026, 8, ["0.0001", "0.0003"])

    assert with_forecast(points, 1) == [
        *points,
        # Observed buckets are 2026-08 and 2026-09, so the projection is 2026-10.
        {"period": "2026-10", "value": "0.0002", "projected": True},
    ]


def test_the_fallback_rounds_a_true_tie_up():
    # (0.0002 + 0.0003) / 2 = 0.00025 — a genuine tie at the fifth place.
    # ROUND_HALF_UP gives 0.0003; Python's default ROUND_HALF_EVEN would give
    # 0.0002, so this is the case that pins the rounding mode down.
    points = _points(2026, 8, ["0.0002", "0.0003"])

    assert with_forecast(points, 1)[-1] == {
        "period": "2026-10",
        "value": "0.0003",  # half-even would round to 0.0002
        "projected": True,
    }


def test_an_empty_series_projects_nothing():
    assert with_forecast([], 3) == []
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_postprocess.py -q`

Expected: FAIL with `ModuleNotFoundError: No module named 'analytics.postprocess'`.

- [ ] **Step 3: Write `postprocess.py`**

Create `analytics/src/analytics/postprocess.py` (absolute `analytics.*` imports, matching every Stage 1 module,
matching the rest of `analytics/src/analytics/`):

```python
"""Post-processing over the executor's result envelope.

Forecast, anomaly flags and drift (docs/INSIGHTS.md -> "Forecast, anomalies and
drift"). Everything here is a pure function of the points the SQL already
produced: the service connects with a SELECT-only role, so derived state has
nowhere to live but the response it is derived for.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

Point = dict[str, object]

SEASONAL_PERIOD = 12
"""Seasonal-naive lag, in monthly buckets: this September looks like last September."""

FALLBACK_WINDOW = 3
"""Buckets averaged when the series is too short to reach SEASONAL_PERIOD back."""


def _money(value: Decimal) -> str:
    """The wire format for every amount: four decimal places, rounded half-up."""
    return str(value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP))


def _month_key_after(key: str, ahead: int) -> str:
    """"2026-09" + 3 -> "2026-12". Month buckets only — forecast requires interval=month."""
    year, month = (int(part) for part in key.split("-"))
    index = year * 12 + month - 1 + ahead
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def with_forecast(points: list[Point], months: int) -> list[Point]:
    """Append `months` seasonal-naive projections to a chronological month series.

    Projection h (1-based) reuses the observed bucket SEASONAL_PERIOD buckets
    earlier. `months` is capped at SEASONAL_PERIOD by validation, so that source
    index is always inside the observed series when it is non-negative — a
    projection is never built from another projection.

    The mode is decided **once, for the whole forecast**: a series shorter than
    SEASONAL_PERIOD uses the flat mean of the last FALLBACK_WINDOW observed
    buckets for every projected bucket. Deciding per bucket would let one forecast
    mix two algorithms (with 11 observed months and months=3, h=1 would be a mean
    and h=2..3 seasonal values) — surprising on a chart, and impossible to state
    honestly in the docs.
    """
    if not points:
        return list(points)
    values = [Decimal(str(point["value"])) for point in points]
    count = len(values)
    window = values[-min(FALLBACK_WINDOW, count):]
    fallback = _money(sum(window) / len(window))
    last_key = str(points[-1]["period"])

    seasonal = count >= SEASONAL_PERIOD

    projected: list[Point] = []
    for ahead in range(1, months + 1):
        value = _money(values[count + ahead - 1 - SEASONAL_PERIOD]) if seasonal else fallback
        projected.append(
            {"period": _month_key_after(last_key, ahead), "value": value, "projected": True}
        )
    return [*points, *projected]
```

- [ ] **Step 4: Pin the short-series boundary**

The interesting case is a series long enough that *some* projections could reach back
but not all — exactly where a per-bucket decision would have mixed modes. Append to
`analytics/tests/test_postprocess.py`:

```python
def test_a_series_shorter_than_a_full_period_uses_the_fallback_for_every_projection():
    """11 observed months with months=3: h=2 and h=3 could index back into the
    series, but the mode is chosen once, so all three are the flat mean."""
    points = [{"period": f"2025-{m:02d}", "value": f"{100 + m}.0000"} for m in range(1, 12)]
    result = with_forecast(points, 3)
    projected = [p for p in result if p.get("projected")]
    assert len(projected) == 3
    assert len({p["value"] for p in projected}) == 1
    # mean of the last FALLBACK_WINDOW (3) observed buckets: 109, 110, 111
    assert projected[0]["value"] == "110.0000"
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_postprocess.py -q`

Expected: PASS (6 passed).

- [ ] **Step 6: Commit**

```bash
git add analytics/src/analytics/postprocess.py analytics/tests/test_postprocess.py
git commit -m "feat(analytics): seasonal-naive monthly projection for timeseries points"
```

---


### Task 12: [MY-34] Anomaly flags on observed points

**Files:**
- Modify: `analytics/src/analytics/postprocess.py` (add `_median` and `with_anomaly_flags`)
- Test: `analytics/tests/test_postprocess.py` (add the anomaly cases)
- Modify: `docs/INSIGHTS.md` ("Forecast, anomalies and drift" gains a subsection; "Deliberately deferred" loses the anomaly row)

**Interfaces:**
- Consumes: `analytics.postprocess.Point`, `analytics.postprocess._money(value: Decimal) -> str`, and the test helper `_points(start_year, start_month, values)` already in `analytics/tests/test_postprocess.py`.
- Produces:
  - `analytics.postprocess.ANOMALY_MIN_POINTS: int` = `6`
  - `analytics.postprocess.ANOMALY_Z: Decimal` = `Decimal("3.5")`
  - `analytics.postprocess.with_anomaly_flags(points: list[Point]) -> list[Point]` — returns copies; a flagged point gains `"anomaly": True`, others are unchanged

- [ ] **Step 1: Write the failing test**

Append to `analytics/tests/test_postprocess.py`, and extend the import at the top
to `from analytics.postprocess import with_anomaly_flags, with_forecast`:

```python
# Twelve buckets whose value multiset is
# {90, 95, 95, 100, 100, 105, 105, 110, 110, 115, 120, 900}:
# median = (105 + 105) / 2 = 105
# deviations sorted = 0, 0, 5, 5, 5, 5, 10, 10, 10, 15, 15, 795
# MAD = (5 + 10) / 2 = 7.5
_SPIKY = [
    "100.0000", "110.0000", "105.0000", "95.0000", "100.0000", "120.0000",
    "900.0000", "115.0000", "90.0000", "105.0000", "110.0000", "95.0000",
]


def test_flags_the_single_outlier_by_the_median_mad_rule():
    # z(900) = 0.6745 * 795 / 7.5 = 71.5   -> flagged
    # z(120) = 0.6745 *  15 / 7.5 =  1.349 -> not flagged
    # z(90)  = 0.6745 * -15 / 7.5 = -1.349 -> not flagged
    points = _points(2025, 10, _SPIKY)

    result = with_anomaly_flags(points)

    assert [p.get("anomaly") for p in result] == [None] * 6 + [True] + [None] * 5
    assert result[6] == {"period": "2026-04", "value": "900.0000", "anomaly": True}


def test_flagging_does_not_mutate_the_input():
    points = _points(2025, 10, _SPIKY)

    with_anomaly_flags(points)

    assert all("anomaly" not in point for point in points)


def test_a_series_shorter_than_six_points_is_never_flagged():
    points = _points(2026, 5, ["100.0000", "100.0000", "100.0000", "100.0000", "9000.0000"])

    assert with_anomaly_flags(points) == points


def test_a_mostly_zero_series_is_never_flagged():
    # Zero-filled gap buckets drive MAD to 0. One purchase in an otherwise empty
    # stretch is not an anomaly — it is the only data there is.
    points = _points(2026, 1, ["0.0000"] * 7 + ["500.0000"])

    assert with_anomaly_flags(points) == points


def test_a_flat_series_is_never_flagged():
    points = _points(2026, 1, ["50.0000"] * 8)

    assert with_anomaly_flags(points) == points
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_postprocess.py -q`

Expected: FAIL with `ImportError: cannot import name 'with_anomaly_flags' from 'analytics.postprocess'`.

- [ ] **Step 3: Implement the median/MAD rule**

Append to `analytics/src/analytics/postprocess.py`:

```python
ANOMALY_MIN_POINTS = 6
"""Below this, a series has no shape to deviate from and nothing is flagged."""

ANOMALY_Z = Decimal("3.5")
"""Iglewicz & Hoaglin's cutoff for the modified z-score."""

_MAD_SCALE = Decimal("0.6745")
"""Consistency constant: 0.6745 * MAD estimates the standard deviation."""


def _median(values: list[Decimal]) -> Decimal:
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2


def with_anomaly_flags(points: list[Point]) -> list[Point]:
    """Flag outliers with the median/MAD (modified z-score) rule.

    z = 0.6745 * (value - median) / MAD, flagged at |z| > ANOMALY_Z. Median-based
    rather than mean-based because a mean drags itself toward the outlier it is
    meant to expose. Two guards keep it quiet: a series shorter than
    ANOMALY_MIN_POINTS, and a series whose MAD is 0 (flat, or the common
    mostly-zero-filled one), flag nothing at all.
    """
    values = [Decimal(str(point["value"])) for point in points]
    if len(values) < ANOMALY_MIN_POINTS:
        return list(points)
    median = _median(values)
    mad = _median([abs(value - median) for value in values])
    if mad == 0:
        return list(points)

    flagged: list[Point] = []
    for point, value in zip(points, values):
        score = _MAD_SCALE * (value - median) / mad
        flagged.append({**point, "anomaly": True} if abs(score) > ANOMALY_Z else dict(point))
    return flagged
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_postprocess.py -q`

Expected: PASS (11 passed).

- [ ] **Step 5: Document the rule in `docs/INSIGHTS.md`**

Append to the "Forecast, anomalies and drift" section, after the Forecast
subsection:

```markdown
### Anomaly flags

An observed point is flagged `"anomaly": true` when it is an outlier by the
**median / MAD** rule (Iglewicz & Hoaglin). With `median` the series median and
`MAD` the median absolute deviation from it:

```
z = 0.6745 × (value − median) / MAD        flagged when |z| > 3.5
```

Median-based, not mean-based: a mean drags itself toward the outlier it is
supposed to expose. Two guards keep it quiet — a series shorter than **6**
points is never flagged, and a series with `MAD == 0` (flat, or the common
mostly-zero-filled one) is never flagged either, so a single purchase in an
otherwise empty year is not an "anomaly".

Projected points are never flagged: the flag is a statement about recorded data,
and the anomaly pass runs before the projection is appended.

This is **result enrichment, not DSL.** It needs no plan field and runs for every
plan version, so a saved v1 insight gains it without being edited — which is
also why it does not (and must not) become a second meaning for `version`. The
frontend marks flagged buckets on the single-series `timeseries` chart; the
multi-line chart leaves them unmarked, where N sets of rings would be noise.
```

In "Deliberately deferred", delete the row:

```markdown
| Anomaly flags on timeseries points | Phase 4b, alongside the forecast dimension. |
```

- [ ] **Step 6: Commit**

```bash
git add analytics/src/analytics/postprocess.py analytics/tests/test_postprocess.py docs/INSIGHTS.md
git commit -m "feat(analytics): flag timeseries outliers with the median/MAD rule"
```

---


### Task 13: [MY-34] Lead-change drift between the last two complete buckets

**Files:**
- Modify: `analytics/src/analytics/postprocess.py` (add `_leader` and `detect_lead_change`)
- Test: `analytics/tests/test_postprocess.py` (add the drift cases)
- Modify: `docs/INSIGHTS.md` ("Forecast, anomalies and drift" gains a subsection; "Deliberately deferred" loses the drift row)

**Interfaces:**
- Consumes: `analytics.postprocess.Point`, `analytics.postprocess._money(value: Decimal) -> str`, and the test helper `_points(start_year, start_month, values)` in `analytics/tests/test_postprocess.py`.
- Produces:
  - `analytics.postprocess.detect_lead_change(series: list[dict], current_bucket: str) -> list[dict]` — `series` are `timeseriesSplit` entries (`{"key", "label", "points"}`); `current_bucket` is the bucket key containing the executor's `today`. Returns `[]` or a one-element list shaped `{"kind": "leadChange", "period", "previousPeriod", "leader", "previousLeader"}` where each leader is `{"key", "label", "value"}`.

- [ ] **Step 1: Write the failing test**

Append to `analytics/tests/test_postprocess.py`, and extend the import at the top
to `from analytics.postprocess import detect_lead_change, with_anomaly_flags, with_forecast`:

```python
def _series(key: str, label: str, values: list[str]) -> dict:
    """A timeseriesSplit entry over 2026-04 onward."""
    return {"key": key, "label": label, "points": _points(2026, 4, values)}


def test_reports_the_lead_change_between_the_last_two_complete_buckets():
    # 2026-06 is the bucket containing today and is excluded, so the comparison
    # is 2026-04 (Lidl ahead) against 2026-05 (Biedronka ahead).
    lidl = _series("Lidl", "Lidl", ["500.0000", "300.0000", "10.0000"])
    biedronka = _series("Biedronka", "Biedronka", ["400.0000", "600.0000", "20.0000"])

    assert detect_lead_change([lidl, biedronka], "2026-06") == [
        {
            "kind": "leadChange",
            "period": "2026-05",
            "previousPeriod": "2026-04",
            "leader": {"key": "Biedronka", "label": "Biedronka", "value": "600.0000"},
            "previousLeader": {"key": "Lidl", "label": "Lidl", "value": "500.0000"},
        }
    ]


def test_no_lead_change_when_the_same_series_stays_ahead():
    lidl = _series("Lidl", "Lidl", ["500.0000", "600.0000", "10.0000"])
    biedronka = _series("Biedronka", "Biedronka", ["400.0000", "300.0000", "20.0000"])

    assert detect_lead_change([lidl, biedronka], "2026-06") == []


def test_a_tie_is_not_an_overtake():
    lidl = _series("Lidl", "Lidl", ["500.0000", "600.0000", "10.0000"])
    biedronka = _series("Biedronka", "Biedronka", ["400.0000", "600.0000", "20.0000"])

    assert detect_lead_change([lidl, biedronka], "2026-06") == []


def test_an_all_zero_bucket_has_no_leader():
    lidl = _series("Lidl", "Lidl", ["0.0000", "600.0000", "10.0000"])
    biedronka = _series("Biedronka", "Biedronka", ["0.0000", "300.0000", "20.0000"])

    assert detect_lead_change([lidl, biedronka], "2026-06") == []


def test_projected_buckets_are_never_compared():
    # The flip lives entirely in the projected tail: nothing is reported.
    lidl = {
        "key": "Lidl",
        "label": "Lidl",
        "points": [
            {"period": "2026-04", "value": "500.0000"},
            {"period": "2026-05", "value": "600.0000"},
            {"period": "2026-06", "value": "10.0000", "projected": True},
            {"period": "2026-07", "value": "10.0000", "projected": True},
        ],
    }
    biedronka = {
        "key": "Biedronka",
        "label": "Biedronka",
        "points": [
            {"period": "2026-04", "value": "400.0000"},
            {"period": "2026-05", "value": "300.0000"},
            {"period": "2026-06", "value": "900.0000", "projected": True},
            {"period": "2026-07", "value": "900.0000", "projected": True},
        ],
    }

    assert detect_lead_change([lidl, biedronka], "2026-06") == []


def test_one_series_has_no_lead_to_lose():
    assert detect_lead_change([_series("Lidl", "Lidl", ["500.0000", "600.0000", "0.0000"])], "2026-06") == []


def test_one_complete_bucket_is_not_a_comparison():
    lidl = _series("Lidl", "Lidl", ["500.0000", "300.0000"])
    biedronka = _series("Biedronka", "Biedronka", ["400.0000", "600.0000"])

    # 2026-05 is the current bucket, leaving only 2026-04 to compare against.
    assert detect_lead_change([lidl, biedronka], "2026-05") == []
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_postprocess.py -q`

Expected: FAIL with `ImportError: cannot import name 'detect_lead_change' from 'analytics.postprocess'`.

- [ ] **Step 3: Implement drift detection**

Append to `analytics/src/analytics/postprocess.py`:

```python
def _leader(series: list[dict], period: str) -> dict | None:
    """The strictly-largest series in `period`, or None on a tie or an empty bucket."""
    ranked: list[tuple[Decimal, dict]] = []
    for entry in series:
        value = next(
            (
                Decimal(str(point["value"]))
                for point in entry["points"]
                if point["period"] == period
            ),
            None,
        )
        if value is not None:
            ranked.append((value, entry))
    if len(ranked) < 2:
        return None
    ranked.sort(key=lambda item: item[0], reverse=True)
    if ranked[0][0] == ranked[1][0] or ranked[0][0] <= 0:
        return None
    top = ranked[0][1]
    return {"key": str(top["key"]), "label": str(top["label"]), "value": _money(ranked[0][0])}


def detect_lead_change(series: list[dict], current_bucket: str) -> list[dict]:
    """"Biedronka overtook Lidl" — a lead change between the last two complete buckets.

    `current_bucket` is the key of the bucket containing the executor's today; it
    is excluded, along with any projection, because a partial month always looks
    like a collapse and would report a lead change every time a month rolls over.
    Stateless by construction: nothing is remembered between executions, which is
    what lets a SELECT-only service own this at all.
    """
    if len(series) < 2:
        return []
    periods = [
        str(point["period"])
        # Every series is gap-filled over the same buckets (D4), so the first
        # series' bucket list is the bucket list.
        for point in series[0]["points"]
        if not point.get("projected") and str(point["period"]) != current_bucket
    ]
    if len(periods) < 2:
        return []

    previous_period, period = periods[-2], periods[-1]
    previous_leader = _leader(series, previous_period)
    leader = _leader(series, period)
    if previous_leader is None or leader is None or previous_leader["key"] == leader["key"]:
        return []
    return [
        {
            "kind": "leadChange",
            "period": period,
            "previousPeriod": previous_period,
            "leader": leader,
            "previousLeader": previous_leader,
        }
    ]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_postprocess.py -q`

Expected: PASS (18 passed).

- [ ] **Step 5: Document drift in `docs/INSIGHTS.md`**

Append to the "Forecast, anomalies and drift" section, after the Anomaly flags
subsection:

```markdown
### Drift on pinned insights

"Biedronka overtook Lidl." A `timeseriesSplit` result carries an optional
`drift` array describing a **lead change**:

```json
"drift": [ { "kind": "leadChange", "period": "2026-08", "previousPeriod": "2026-07",
             "leader":         { "key": "Biedronka", "label": "Biedronka", "value": "512.0000" },
             "previousLeader": { "key": "Lidl",      "label": "Lidl",      "value": "480.0000" } } ]
```

- **Comparison window** — the last two buckets that are neither projections nor
  the bucket containing the executor's `today` (the clock from Execution
  semantics). A partial current month always looks like a collapse, so including
  it would announce a lead change every time a month rolls over.
- **Strict winners only** — a tie for the lead in either bucket, or a bucket
  whose leader is `<= 0`, yields nothing. "Overtook" needs a winner on both
  sides.
- **Stateless** — nothing is remembered between executions and nothing is
  written: the analytics role holds `SELECT` and the backend owns every write in
  this system. Drift is re-derived from the same envelope on every run, which is
  why it needs no table, no migration and no dismissal state.
- **Where it surfaces** — pinned insights render as dashboard tiles, and a tile
  whose envelope carries `drift` shows it as a one-line badge under the chart.
  Unpinned exploration returns the same field; nothing else reads it yet.
- **Shape** — `timeseriesSplit` only. `breakdown` has no time axis to drift
  along, and a single-series `timeseries` has no rival to lose to.
```

In "Deliberately deferred", delete the row:

```markdown
| Drift detection on pinned insights ("Biedronka overtook Lidl") | Phase 4b/5 — the insights feed's raw material. |
```

- [ ] **Step 6: Commit**

```bash
git add analytics/src/analytics/postprocess.py analytics/tests/test_postprocess.py docs/INSIGHTS.md
git commit -m "feat(analytics): detect lead changes between the last two complete buckets"
```

---


### Task 14: [MY-34] Wire post-processing into the executor

**Files:**
- Modify: `analytics/src/analytics/postprocess.py` (add the `postprocess()` entry point)
- Modify: `analytics/src/analytics/executor.py` (one call at the end of `execute()`; include `forecast` in the normalized plan echo)
- Test: `analytics/tests/test_executor_golden.py` (append two DB-backed tests)
- Modify: `docs/LESSONS.md` (append one entry)

**Interfaces:**
- Consumes:
  - `analytics.postprocess.with_forecast(points: list[Point], months: int) -> list[Point]`
  - `analytics.postprocess.with_anomaly_flags(points: list[Point]) -> list[Point]`
  - `analytics.postprocess.detect_lead_change(series: list[dict], current_bucket: str) -> list[dict]`
  - `analytics.ranges.bucket_starts(interval: str, start: date, end: date) -> list[str]`
  - `analytics.executor.execute(conn, profile_id: int, raw_plan: object, *, today: date, merchant_enabled: bool) -> dict`
  - `analytics.plan.Plan.forecast: Forecast | None` (field `months: int`)
- Produces:
  - `analytics.postprocess.postprocess(results: list[dict], *, interval: str | None, forecast_months: int | None, today: date) -> list[dict]` — the single call site for all three features

- [ ] **Step 1: Write the failing test**

Append to `analytics/tests/test_executor_golden.py`. Add `from datetime import date`,
`from uuid import uuid4` and `from analytics.executor import execute` to the
imports if the file does not already have them. `conn` is the psycopg connection
fixture the existing tests in this file already take.

```python
def _seed_forecast_profile(conn) -> int:
    """A user, profile, category and two expenses of this test's own.

    Every executor query is profile-scoped, so a private profile can never
    collide with the shared seed fixture — no cleanup needed either.

    Inserting without explicit ids is safe because Stage 1's conftest advances the
    identity sequences past the fixture range (`_advance_identity_sequences`, set to
    10000) after loading seed.sql, which itself supplies ids with OVERRIDING SYSTEM
    VALUE. Without that, the first RETURNING id here would generate 1 and collide.
    """
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO app_user (email, password_hash, display_name)"
            " VALUES (%s, 'x', 'Forecast') RETURNING id",
            (f"forecast-{uuid4()}@example.test",),
        )
        user_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO profile (user_id, name, default_currency)"
            " VALUES (%s, 'Forecast', 'PLN') RETURNING id",
            (user_id,),
        )
        profile_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO category (profile_id, parent_id, name)"
            " VALUES (%s, NULL, 'Groceries') RETURNING id",
            (profile_id,),
        )
        category_id = cur.fetchone()[0]
        for occurred_on, amount in (("2025-10-04", "300.0000"), ("2025-11-04", "400.0000")):
            cur.execute(
                "INSERT INTO txn (profile_id, category_id, amount, currency, txn_type, occurred_on)"
                " VALUES (%s, %s, %s, 'PLN', 'EXPENSE', %s)",
                (profile_id, category_id, amount, occurred_on),
            )
    conn.commit()
    return profile_id


_FORECAST_V1_PLAN = {
    "version": 1,
    "metric": "spend",
    "filters": {"currency": "PLN"},
    "groupBy": None,
    "interval": "month",
    "range": {"type": "absolute", "from": "2025-10-01", "to": "2026-09-30"},
}

# Twelve gap-free monthly buckets; only the first two carry rows. The value
# multiset is {300, 400, 0 x 10}, so median = 0 and MAD = 0: the anomaly pass
# flags nothing and the envelope below is exact, not approximately exact.
_FORECAST_OBSERVED = [
    {"period": "2025-10", "value": "300.0000"},
    {"period": "2025-11", "value": "400.0000"},
    *(
        {"period": period, "value": "0.0000"}
        for period in (
            "2025-12", "2026-01", "2026-02", "2026-03", "2026-04",
            "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
        )
    ),
]


def test_a_v1_plan_still_executes_after_the_version_bump(conn):
    """A1: bumping SUPPORTED_VERSIONS must change nothing about a saved v1 plan."""
    profile_id = _seed_forecast_profile(conn)

    envelope = execute(
        conn, profile_id, dict(_FORECAST_V1_PLAN),
        today=date(2026, 9, 4), merchant_enabled=True,
    )

    result = envelope["results"][0]
    assert result["shape"] == "timeseries"
    assert result["points"] == _FORECAST_OBSERVED
    assert "forecast" not in envelope["plan"]
    assert "drift" not in result


def test_a_v2_plan_appends_seasonal_naive_projections(conn):
    profile_id = _seed_forecast_profile(conn)
    plan = {**_FORECAST_V1_PLAN, "version": 2, "forecast": {"months": 2}}

    envelope = execute(
        conn, profile_id, plan,
        today=date(2026, 9, 4), merchant_enabled=True,
    )

    assert envelope["plan"]["forecast"] == {"months": 2}
    assert envelope["results"][0]["points"] == [
        *_FORECAST_OBSERVED,
        # Twelve buckets back from 2026-10 is 2025-10 (300); from 2026-11, 2025-11 (400).
        {"period": "2026-10", "value": "300.0000", "projected": True},
        {"period": "2026-11", "value": "400.0000", "projected": True},
    ]


def test_a_v1_plan_carrying_a_forecast_is_rejected(conn):
    profile_id = _seed_forecast_profile(conn)
    plan = {**_FORECAST_V1_PLAN, "forecast": {"months": 2}}

    with pytest.raises(PlanProblems) as caught:
        execute(conn, profile_id, plan, today=date(2026, 9, 4), merchant_enabled=True)

    assert "forecast: requires plan version 2" in caught.value.problems
```

`PlanProblems` comes from `analytics.executor`; add it to that import and add
`import pytest` if the file lacks it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest tests/test_executor_golden.py -q`

Expected: FAIL — `test_a_v2_plan_appends_seasonal_naive_projections` fails on
`KeyError: 'forecast'` for the plan echo (and, once that passes, on the two
missing `"projected": True` points).

- [ ] **Step 3: Add the `postprocess()` entry point**

Append to `analytics/src/analytics/postprocess.py`, adding
`from datetime import date` and `from analytics.ranges import bucket_starts` to the
imports at the top of the file:

```python
def postprocess(
    results: list[dict],
    *,
    interval: str | None,
    forecast_months: int | None,
    today: date,
) -> list[dict]:
    """Anomaly flags, projection and drift, applied to the executor's results.

    Order is load-bearing: anomalies are a statement about recorded data, so they
    are computed before the projection is appended. Shapes without a time axis
    (`value`, `breakdown`) pass through untouched.
    """
    # The bucket containing today — the one drift must ignore because it is still
    # being filled. bucket_starts over a single day returns exactly that bucket.
    current_bucket = bucket_starts(interval, today, today)[0] if interval else ""

    processed: list[dict] = []
    for result in results:
        shape = result["shape"]
        if shape == "timeseries":
            points = with_anomaly_flags(result["points"])
            if forecast_months:
                points = with_forecast(points, forecast_months)
            processed.append({**result, "points": points})
        elif shape == "timeseriesSplit":
            series = []
            for entry in result["series"]:
                points = with_anomaly_flags(entry["points"])
                if forecast_months:
                    points = with_forecast(points, forecast_months)
                series.append({**entry, "points": points})
            enriched = {**result, "series": series}
            drift = detect_lead_change(series, current_bucket)
            if drift:
                enriched["drift"] = drift
            processed.append(enriched)
        else:
            processed.append(result)
    return processed
```

- [ ] **Step 4: Call it from the executor**

In `analytics/src/analytics/executor.py`, add the import alongside the other
intra-package imports:

```python
from analytics.postprocess import postprocess
```

and, in `execute()`, immediately before the envelope dict is built, replace the
per-currency results list (`results` — use whichever local name MY-30 gave it)
with its post-processed form:

```python
    results = postprocess(
        results,
        interval=plan.interval,
        forecast_months=plan.forecast.months if plan.forecast else None,
        today=today,
    )
```

If the normalized plan echo is assembled field by field rather than by dumping
the dataclass, add `forecast` to it, omitted when the plan has none, so a v1
echo stays byte-identical:

```python
    if plan.forecast is not None:
        normalized["forecast"] = {"months": plan.forecast.months}
```

- [ ] **Step 5: Run the whole analytics suite to verify it passes**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest -q`

Expected: PASS — the two new golden tests plus every stage-1 golden still green.
(If a stage-1 fixture happens to contain a genuine outlier, its expected envelope
now carries `"anomaly": true` on that point; update that fixture's expectation,
which is the anomaly rule doing its job.)

- [ ] **Step 6: Append the LESSONS.md entry**

Append at the end of `docs/LESSONS.md`:

```markdown
### Deriving instead of storing, when the service can only read

- **What** — forecasts, anomaly flags and drift are computed from the result
  envelope in one post-processing pass after the SQL, and never persisted.
- **Where** — `analytics/src/analytics/postprocess.py`, called once at the end
  of `executor.execute`.
- **Why it's this way** — the analytics service connects as `myfinance_ro`,
  which holds `SELECT` and nothing else (`docs/SCHEMA.md` → the read-only
  analytics role), so "remember last month's leader" is not an option that
  exists: it would have to become a table, a backend write path and a migration.
  Recomputing costs microseconds over a few dozen points, and the privilege
  boundary stays a database guarantee rather than a promise someone can forget.
  The shape of the code follows from the constraint — the executor still returns
  one envelope and the whole feature is a pure function over it, which is why
  `tests/test_postprocess.py` needs no container at all while the golden tests
  that prove the wiring do.
```

- [ ] **Step 7: Commit**

```bash
git add analytics/src/analytics/postprocess.py analytics/src/analytics/executor.py analytics/tests/test_executor_golden.py
git commit -m "feat(analytics): apply forecast, anomaly and drift post-processing in the executor"
```

---


### Task 15: [MY-34] Frontend — dashed projection, anomaly markers, forecast chip

**Files:**
- Modify: `frontend/src/api/types.ts` (`Point` in the Insights block gains `anomaly`)
- Create: `frontend/src/insights/chartRows.ts`
- Create: `frontend/src/insights/chips/ForecastChip.tsx`
- Modify: `frontend/src/insights/chips/ChipBar.tsx` (normalize every chip edit; render the new chip)
- Modify: `frontend/src/insights/renderers/TimeseriesChart.tsx` (two `<Line>`s + the anomaly dot)
- Modify: `frontend/src/insights/renderers/TimeseriesSplitChart.tsx` (two `<Line>`s per series)
- Test: `frontend/e2e/smoke.spec.ts` (new test + two module-level helpers)

**Interfaces:**
- Consumes: `Plan`, `Point`, `Series` from `src/api/types.ts`; the chip components in `src/insights/chips/`; the renderers in `src/insights/renderers/`; `POST /api/insights` (`InsightRequest { name, plan, viz?, pinned? }`) and `POST /api/transactions` (`CreateTransactionRequest { categoryId, amount, currency, type, occurredOn, description? }`).
- Produces:
  - `src/insights/chartRows.ts`: `interface TimeseriesRow { period: string; observed: number | null; projected: number | null; anomaly: boolean }`, `interface SplitRow { period: string; [seriesKey: string]: number | string | null }`, `const FORECAST_SUFFIX = '~forecast'`, `timeseriesRows(points: Point[]): TimeseriesRow[]`, `splitRows(series: Series[]): SplitRow[]`
  - `src/insights/chips/ForecastChip.tsx`: `normalizePlanVersion(plan: Plan): Plan`, `ForecastChip({ plan, onChange }: { plan: Plan; onChange: (next: Plan) => void })`
  - `frontend/e2e/smoke.spec.ts`: `apiPost<T>(page: Page, path: string, body: unknown): Promise<T>`, `monthStart(monthsAgo: number): string`

- [ ] **Step 1: Write the failing test**

Add these two helpers to `frontend/e2e/smoke.spec.ts`, next to the existing
`isoToday` / `currentMonthBounds` helpers:

```ts
/** POST JSON with the browser's own session + CSRF cookie (the budget-seed trick, reusable). */
async function apiPost<T>(page: Page, path: string, body: unknown): Promise<T> {
  const result = await page.evaluate(
    async ({ path, body }) => {
      const xsrf = document.cookie
        .split('; ')
        .find((c) => c.startsWith('XSRF-TOKEN='))!
        .split('=')[1];
      const res = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-XSRF-TOKEN': decodeURIComponent(xsrf),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${path} seed failed: ${res.status} ${await res.text()}`);
      return res.json();
    },
    { path, body },
  );
  return result as T;
}

/** First day of the month `monthsAgo` back — never in the future, so the API accepts it. */
function monthStart(monthsAgo: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
```

Append the test at the end of the file:

```ts
test('insights: a pinned forecast tile draws a dashed projection and marks the outlier', async ({
  page,
}) => {
  const email = `e2e-forecast-${Date.now()}@example.com`;
  await registerAndLogin(page, email, 'E2E Forecast');
  await createProfile(page, 'Forecast');
  await page.getByRole('button', { name: /Forecast/ }).click();
  await expect(page).toHaveURL('/');

  const category = await apiPost<{ id: number }>(page, '/api/categories', { name: 'Groceries' });

  // One expense per month for twelve months. The value multiset
  // {90, 95, 95, 100, 100, 105, 105, 110, 110, 115, 120, 900} has median 105 and
  // MAD 7.5, so only the 900 clears |z| > 3.5.
  const amounts = [
    '100.00', '110.00', '105.00', '95.00', '100.00', '120.00',
    '900.00', '115.00', '90.00', '105.00', '110.00', '95.00',
  ];
  for (let i = 0; i < amounts.length; i++) {
    await apiPost(page, '/api/transactions', {
      categoryId: category.id,
      amount: amounts[i],
      currency: 'PLN',
      type: 'EXPENSE',
      occurredOn: monthStart(amounts.length - 1 - i),
      description: 'monthly shop',
    });
  }

  await apiPost(page, '/api/insights', {
    name: 'Monthly groceries, forecast',
    pinned: true,
    plan: {
      version: 2,
      metric: 'spend',
      filters: { currency: 'PLN' },
      groupBy: null,
      interval: 'month',
      range: { type: 'lastMonths', n: 12 },
      forecast: { months: 3 },
    },
  });

  await page.goto('/');
  // The dashed tail is the only <path> with a dash pattern — the grid draws <line>s.
  await expect(page.locator('path[stroke-dasharray="4 4"]').first()).toBeVisible();
  // The outlier ring.
  await expect(page.locator('circle[stroke="#eeaabc"]').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/06-insights-forecast.png`, fullPage: true });

  // …and the explorer offers the horizon as a chip.
  await page.getByRole('link', { name: 'Insights', exact: true }).click();
  await expect(page.getByLabel('Forecast')).toBeVisible();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Start the stack, then run the one test:

Run: `cd /home/chris/side-projects/my-finance && docker compose up -d --build postgres analytics backend && cd frontend && npm run e2e -- -g "dashed projection"`

Expected: FAIL with a Playwright timeout — `locator('path[stroke-dasharray="4 4"]').first()` resolved to 0 elements (the tile draws one solid line for all fifteen buckets).

- [ ] **Step 3: Add the `anomaly` flag to the DTO types**

In `frontend/src/api/types.ts`, in the `// — Insights —` block, replace the
`Point` interface with:

```ts
export interface Point {
  period: string;
  value: string;
  /** Seasonal-naive projection appended by the executor — drawn as a dashed continuation. */
  projected?: boolean;
  /** Outlier by the median/MAD rule (docs/INSIGHTS.md → Anomaly flags). */
  anomaly?: boolean;
}
```

- [ ] **Step 4: Add the chart-row builders**

Create `frontend/src/insights/chartRows.ts`:

```ts
// Chart rows for the two timeseries renderers.
//
// Recharts wants one row per bucket. The dashed forecast tail is a second data
// key rather than a second chart: the last observed bucket carries BOTH values,
// so the solid line and the dashed one meet instead of leaving a gap.

import type { Point, Series } from '../api/types';

export interface TimeseriesRow {
  period: string;
  observed: number | null;
  projected: number | null;
  anomaly: boolean;
}

/** Suffix for a series' dashed forecast key in a timeseriesSplit chart. */
export const FORECAST_SUFFIX = '~forecast';

export function timeseriesRows(points: Point[]): TimeseriesRow[] {
  const hasProjection = points.some((p) => p.projected);
  const lastObserved = points.reduce((last, p, i) => (p.projected ? last : i), -1);
  return points.map((p, i) => ({
    period: p.period,
    observed: p.projected ? null : parseFloat(p.value),
    projected: p.projected || (hasProjection && i === lastObserved) ? parseFloat(p.value) : null,
    anomaly: p.anomaly === true,
  }));
}

export interface SplitRow {
  period: string;
  [seriesKey: string]: number | string | null;
}

/**
 * One row per bucket, two keys per series: `key` (solid) and
 * `key + FORECAST_SUFFIX` (dashed). Series are gap-free over the same buckets,
 * so index alignment is safe.
 */
export function splitRows(series: Series[]): SplitRow[] {
  const built = series.map((s) => ({ key: s.key, rows: timeseriesRows(s.points) }));
  const periods = built[0]?.rows.map((r) => r.period) ?? [];
  return periods.map((period, index) => {
    const row: SplitRow = { period };
    for (const { key, rows } of built) {
      row[key] = rows[index]?.observed ?? null;
      row[key + FORECAST_SUFFIX] = rows[index]?.projected ?? null;
    }
    return row;
  });
}
```

- [ ] **Step 5: Draw the dashed tail and the outlier ring in `TimeseriesChart.tsx`**

In `frontend/src/insights/renderers/TimeseriesChart.tsx`, add to the imports:

```tsx
import { timeseriesRows, type TimeseriesRow } from '../chartRows';
```

Add above the component:

```tsx
const ANOMALY_COLOR = '#eeaabc'; // the same rose Budgets uses for "over"

/** Recharts dot renderer: nothing on an ordinary bucket, a rose ring on an outlier. */
function AnomalyDot(
  { cx, cy, payload, color }:
  { cx?: number; cy?: number; payload?: TimeseriesRow; color: string },
) {
  if (cx === undefined || cy === undefined) return null;
  // Stage 1 draws a small filled dot on every bucket. Returning null for ordinary
  // points would silently delete all of them; this only *adds* the outlier ring.
  if (!payload?.anomaly) return <circle cx={cx} cy={cy} r={2} fill={color} />;
  return (
    <circle cx={cx} cy={cy} r={4} fill="var(--color-bg)" stroke={ANOMALY_COLOR} strokeWidth={2} />
  );
}
```

Stage 1's component signature is `TimeseriesChart({ currency, points, color })` —
there is no `result` prop, and `color` is threaded in by the caller from the design
tokens, so it must survive this edit (spec D8). Replace the expression that built the
chart's `data` array with:

```tsx
  const rows = timeseriesRows(points);
```

and pass `data={rows}` to `<LineChart>`. Replace the single `<Line>` with these
two — every other prop on `<LineChart>`, `<XAxis>`, `<YAxis>`, `<CartesianGrid>`
and `<Tooltip>` stays exactly as it is:

```tsx
        <Line
          type="monotone"
          dataKey="observed"
          name={currency}
          stroke={color}
          strokeWidth={2}
          dot={<AnomalyDot color={color} />}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="projected"
          stroke={color}
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={false}
          legendType="none"
          isAnimationActive={false}
        />
```

- [ ] **Step 6: Do the same per series in `TimeseriesSplitChart.tsx`**

In `frontend/src/insights/renderers/TimeseriesSplitChart.tsx`, add to the
imports:

```tsx
import { FORECAST_SUFFIX, splitRows } from '../chartRows';
```

Stage 1's component signature is `TimeseriesSplitChart({ currency, series, colorFor })`
— there is no `result` prop, and the colour accessor is `colorFor(key, index)`, which
needs the index. Note this file renders **two** charts: a `<BarChart>` when
`periods.length <= 3` and a `<LineChart>` otherwise.

Replace the expression that built the shared `data` array with:

```tsx
  const rows = splitRows(series);
```

and pass `data={rows}` to **both** the `<BarChart>` and the `<LineChart>` (Stage 1
names the variable `data`; either rename both call sites or keep the name as
`const data = splitRows(series)`). **Leave the `<BarChart>` branch's `series.map(...)`
alone** — a projection over three or fewer buckets is not charted, so the bar branch
keeps drawing solid bars only.

In the `<LineChart>` branch, replace the `series.map(...)` that renders one `<Line>`
per series with a `flatMap` that renders two (an array, not a `<Fragment>` — Recharts
flattens arrays of children):

```tsx
        {series.flatMap((one, index) => {
          const color = colorFor(one.key, index);
          return [
            <Line
              key={one.key}
              type="monotone"
              dataKey={one.key}
              name={one.label}
              stroke={color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />,
            <Line
              key={`${one.key}${FORECAST_SUFFIX}`}
              type="monotone"
              dataKey={`${one.key}${FORECAST_SUFFIX}`}
              name={`${one.label} (forecast)`}
              stroke={color}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              legendType="none"
              isAnimationActive={false}
            />,
          ];
        })}
```

- [ ] **Step 7: Add the forecast chip and keep `version` honest**

Create `frontend/src/insights/chips/ForecastChip.tsx`:

```tsx
import type { Plan } from '../../api/types';

const HORIZON_MONTHS = 3;

/**
 * Keeps `version` and `forecast` consistent after any chip edit. The executor
 * rejects `forecast` on a v1 plan and on any interval but `month`, so the chip
 * bar normalizes instead of letting the user assemble a plan that cannot run
 * (docs/INSIGHTS.md → Forecast).
 */
export function normalizePlanVersion(plan: Plan): Plan {
  if (plan.forecast && plan.interval === 'month') {
    return { ...plan, version: 2 };
  }
  const next: Plan = { ...plan, version: 1 };
  delete next.forecast;
  return next;
}

/** Forecast horizon. Only a monthly time axis can carry a seasonal-naive projection. */
export function ForecastChip({
  plan,
  onChange,
}: {
  plan: Plan;
  onChange: (next: Plan) => void;
}) {
  const monthly = plan.interval === 'month';
  return (
    <select
      className="input"
      style={{ width: 'auto', minHeight: 32, padding: '4px 8px', fontSize: 13 }}
      value={monthly && plan.forecast ? String(plan.forecast.months) : 'off'}
      disabled={!monthly}
      onChange={(e) =>
        onChange(
          e.target.value === 'off'
            ? { ...plan, forecast: undefined }
            : { ...plan, forecast: { months: Number(e.target.value) } },
        )
      }
      aria-label="Forecast"
    >
      <option value="off">no forecast</option>
      <option value={String(HORIZON_MONTHS)}>+{HORIZON_MONTHS} months</option>
    </select>
  );
}
```

In `frontend/src/insights/chips/ChipBar.tsx`, import it:

```tsx
import { ForecastChip, normalizePlanVersion } from './ForecastChip';
```

Stage 1's other chips take **narrow** value/onChange props, so `emit` cannot be handed
to them directly — that would be a type error against six different callback
signatures. Normalize inside `ChipBar`'s existing adapters instead, which every chip
already funnels through, so switching the interval away from `month` still drops the
forecast and returns the plan to v1:

```tsx
  const emit = (next: Plan) => onChange(normalizePlanVersion(next));
  const set = (patch: Partial<Plan>) => emit({ ...plan, ...patch });
  const setFilter = (patch: Partial<Plan['filters']>) =>
    set({ filters: { ...plan.filters, ...patch } });
```

(`set` and `setFilter` already exist in `ChipBar`; the only change is that they now
route through `emit` instead of calling `onChange` directly.)

and render the chip immediately after `<IntervalChip …/>`:

```tsx
      <ForecastChip plan={plan} onChange={emit} />
```

- [ ] **Step 8: Run the type-check and the test to verify they pass**

Run: `cd /home/chris/side-projects/my-finance/frontend && npm run build && npm run e2e -- -g "dashed projection"`

Expected: PASS — `tsc -b` clean, the Vite bundle built, 1 passed.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/insights/chartRows.ts frontend/src/insights/chips/ForecastChip.tsx frontend/src/insights/chips/ChipBar.tsx frontend/src/insights/renderers/TimeseriesChart.tsx frontend/src/insights/renderers/TimeseriesSplitChart.tsx frontend/e2e/smoke.spec.ts
git commit -m "feat(frontend): dashed forecast tail, anomaly markers, and the forecast chip"
```

---


### Task 16: [MY-34] Frontend — surface drift on pinned insight tiles

**Files:**
- Modify: `frontend/src/api/types.ts` (`DriftEvent`, `DriftLeader`, `drift` on the `timeseriesSplit` result)
- Create: `frontend/src/insights/DriftBadge.tsx`
- Modify: `frontend/src/components/PinnedInsights.tsx` (render the badge under each tile's result)
- Test: `frontend/e2e/smoke.spec.ts` (new test)

**Interfaces:**
- Consumes: `apiPost<T>(page, path, body)` and `monthStart(monthsAgo)` from `frontend/e2e/smoke.spec.ts`; `CurrencyResult` from `src/api/types.ts`; the tile markup in `src/components/PinnedInsights.tsx`.
- Produces:
  - `src/api/types.ts`: `interface DriftLeader { key: string; label: string; value: string }`, `interface DriftEvent { kind: 'leadChange'; period: string; previousPeriod: string; leader: DriftLeader; previousLeader: DriftLeader }`, and `drift?: DriftEvent[]` on the `timeseriesSplit` member of `CurrencyResult`
  - `src/insights/DriftBadge.tsx`: `DriftBadge({ drift }: { drift: DriftEvent[] | undefined })`

- [ ] **Step 1: Write the failing test**

Append to `frontend/e2e/smoke.spec.ts`:

```ts
test('insights: a pinned split tile reports the lead change', async ({ page }) => {
  const email = `e2e-drift-${Date.now()}@example.com`;
  await registerAndLogin(page, email, 'E2E Drift');
  await createProfile(page, 'Drift');
  await page.getByRole('button', { name: /Drift/ }).click();
  await expect(page).toHaveURL('/');

  // groupBy "category" splits on the children of the filtered category.
  const shops = await apiPost<{ id: number }>(page, '/api/categories', { name: 'Shops' });
  const lidl = await apiPost<{ id: number }>(page, '/api/categories', {
    name: 'Lidl',
    parentId: shops.id,
  });
  const biedronka = await apiPost<{ id: number }>(page, '/api/categories', {
    name: 'Biedronka',
    parentId: shops.id,
  });

  // Two complete months: Lidl leads two months back, Biedronka leads last month.
  // The current (partial) month is excluded from the comparison, so a run on the
  // 1st reports the same thing as a run on the 28th.
  const seeded: Array<[number, number, string]> = [
    [lidl.id, 2, '500.00'],
    [biedronka.id, 2, '400.00'],
    [lidl.id, 1, '300.00'],
    [biedronka.id, 1, '600.00'],
  ];
  for (const [categoryId, monthsAgo, amount] of seeded) {
    await apiPost(page, '/api/transactions', {
      categoryId,
      amount,
      currency: 'PLN',
      type: 'EXPENSE',
      occurredOn: monthStart(monthsAgo),
      description: 'shop',
    });
  }

  await apiPost(page, '/api/insights', {
    name: 'Lidl vs Biedronka',
    pinned: true,
    plan: {
      version: 1,
      metric: 'spend',
      filters: { categoryId: shops.id, includeDescendants: true, currency: 'PLN' },
      groupBy: 'category',
      interval: 'month',
      range: { type: 'lastMonths', n: 3 },
    },
  });

  await page.goto('/');
  await expect(page.getByText('Biedronka overtook Lidl')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/07-insights-drift.png`, fullPage: true });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/chris/side-projects/my-finance && docker compose up -d --build postgres analytics backend && cd frontend && npm run e2e -- -g "lead change"`

Expected: FAIL with a Playwright timeout — `getByText('Biedronka overtook Lidl')` resolved to 0 elements (the tile renders the chart and nothing else).

- [ ] **Step 3: Add the drift types**

In `frontend/src/api/types.ts`, in the `// — Insights —` block, add above
`CurrencyResult`:

```ts
export interface DriftLeader {
  key: string;
  label: string;
  value: string;
}

/** A lead change between the last two complete buckets (docs/INSIGHTS.md → Drift). */
export interface DriftEvent {
  kind: 'leadChange';
  period: string;
  previousPeriod: string;
  leader: DriftLeader;
  previousLeader: DriftLeader;
}
```

and replace `CurrencyResult` with:

```ts
export type CurrencyResult =
  | { currency: string; shape: 'value'; value: string }
  | { currency: string; shape: 'timeseries'; points: Point[] }
  | { currency: string; shape: 'breakdown'; groups: Group[] }
  | { currency: string; shape: 'timeseriesSplit'; series: Series[]; drift?: DriftEvent[] };
```

- [ ] **Step 4: Add the badge and render it on pinned tiles**

Create `frontend/src/insights/DriftBadge.tsx`:

```tsx
import type { DriftEvent } from '../api/types';

/**
 * "Biedronka overtook Lidl in 2026-08" — the lead change the executor found
 * between the last two complete buckets (docs/INSIGHTS.md → Drift on pinned
 * insights). Stateless: it is re-derived on every execution, so there is nothing
 * to dismiss and nothing to store.
 */
export function DriftBadge({ drift }: { drift: DriftEvent[] | undefined }) {
  const event = drift?.[0];
  if (!event) return null;
  return (
    <div className="tag tag-accent" style={{ marginTop: 8, fontSize: 12 }}>
      {event.leader.label} overtook {event.previousLeader.label} in {event.period}
    </div>
  );
}
```

In `frontend/src/components/PinnedInsights.tsx`, import it:

```tsx
import { DriftBadge } from '../insights/DriftBadge';
```

and render it as a **sibling** of the `<ResultRenderer …/>`. That element is the sole
return value of an arrow-function `.map()` callback, so a sibling cannot just be appended
— wrap the pair in a `Fragment` and move the `key` onto it (add `Fragment` to the `react`
import):

```tsx
      {envelope.results.map((result) => (
        <Fragment key={result.currency}>
          <ResultRenderer
            result={result}
            colorFor={seriesColors(byId, insight.plan.groupBy)}
            view="chart"
          />
          <DriftBadge drift={result.shape === 'timeseriesSplit' ? result.drift : undefined} />
        </Fragment>
      ))}
```

This shows the badge for the currency result
the tile is showing (`result` is that `CurrencyResult`; the narrowing is what
makes `drift` reachable, since only the split shape carries it):

```tsx
      <DriftBadge drift={result.shape === 'timeseriesSplit' ? result.drift : undefined} />
```

- [ ] **Step 5: Run the type-check and the test to verify they pass**

Run: `cd /home/chris/side-projects/my-finance/frontend && npm run build && npm run e2e -- -g "lead change"`

Expected: PASS — `tsc -b` clean, 1 passed.

- [ ] **Step 6: Run the whole suite once, both sides**

Run: `cd /home/chris/side-projects/my-finance/analytics && uv run pytest -q && cd ../frontend && npm run build && npm run e2e`

Expected: PASS — the analytics suite green, the frontend bundle built, and all six
e2e tests green against the running stack.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/insights/DriftBadge.tsx frontend/src/components/PinnedInsights.tsx frontend/e2e/smoke.spec.ts
git commit -m "feat(frontend): surface drift on pinned insight tiles"
```
