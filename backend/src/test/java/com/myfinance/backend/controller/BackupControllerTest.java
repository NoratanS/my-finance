package com.myfinance.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import com.myfinance.backend.model.BillingPeriod;
import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.Subscription;
import com.myfinance.backend.model.SubscriptionStatus;
import com.myfinance.backend.model.Transaction;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.BudgetRepository;
import com.myfinance.backend.repository.CategoryRepository;
import com.myfinance.backend.repository.ProfileRepository;
import com.myfinance.backend.repository.SubscriptionRepository;
import com.myfinance.backend.repository.TransactionRepository;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;

/**
 * POST /api/backup/export and POST /api/backup/restore (docs/API.md "Backup"). Both endpoints
 * sit above the profile boundary, so every request here authenticates with {@code fixtures.as}
 * and never selects an active profile. The context clock is fixed at 2026-08-25 so the export
 * filename, {@code exportedAt} and the nextBillingOn catch-up rule are deterministic.
 */
@IntegrationTest
class BackupControllerTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 8, 25);

    @TestConfiguration
    static class FixedClock {

        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(TODAY.atTime(12, 0).toInstant(ZoneOffset.UTC), ZoneOffset.UTC);
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    @Autowired
    private ProfileRepository profileRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private BudgetRepository budgetRepository;

    private User chris;
    private Profile personal;
    private Category shopping;
    private Category stimulants;
    private Subscription netflix;

    @BeforeEach
    void setUp() {
        chris = fixtures.user("chris@example.com");
        personal = fixtures.profile(chris, "Personal", "PLN");
        shopping = categoryRepository.save(new Category(personal, null, "Shopping", "#c3b3ee"));
        stimulants = fixtures.category(personal, shopping, "Stimulants");
        netflix = fixtures.subscription(
                personal,
                stimulants,
                "Netflix",
                "43",
                "PLN",
                BillingPeriod.MONTHLY,
                LocalDate.of(2026, 9, 3),
                SubscriptionStatus.ACTIVE);
        fixtures.chargeTransaction(personal, stimulants, "43", "PLN", LocalDate.of(2026, 8, 3), netflix);
        fixtures.transaction(personal, shopping, "34.99", "PLN", TransactionType.EXPENSE, LocalDate.of(2026, 7, 21));
        fixtures.budget(personal, shopping, "2000", "PLN", LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 31));
    }

    private ResultActions export(User user, String body) throws Exception {
        return mockMvc.perform(post("/api/backup/export")
                .with(fixtures.as(user))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private MockMultipartHttpServletRequestBuilder restore(User user, byte[] content) {
        return multipart("/api/backup/restore")
                .file(new MockMultipartFile("file", "backup.json", MediaType.APPLICATION_JSON_VALUE, content))
                .with(fixtures.as(user));
    }

    private MockMultipartHttpServletRequestBuilder restore(User user, String json) {
        return restore(user, json.getBytes(StandardCharsets.UTF_8));
    }

    private byte[] exportedFile() throws Exception {
        return export(chris, "{\"profileIds\": [" + personal.getId() + "]}")
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsByteArray();
    }

    // ---------------------------------------------------------------- export

    @Test
    void exportReturnsTheDocumentedFileWithAttachmentFilename() throws Exception {
        export(chris, "{\"profileIds\": [" + personal.getId() + "]}")
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(header().string("Content-Disposition", containsString("attachment")))
                .andExpect(header().string("Content-Disposition", containsString("my-finance-backup-2026-08-25.json")))
                .andExpect(jsonPath("$.app").value("my-finance"))
                .andExpect(jsonPath("$.formatVersion").value(1))
                .andExpect(jsonPath("$.exportedAt").value("2026-08-25T12:00:00Z"))
                .andExpect(jsonPath("$.profiles", hasSize(1)))
                .andExpect(jsonPath("$.profiles[0].name").value("Personal"))
                .andExpect(jsonPath("$.profiles[0].defaultCurrency").value("PLN"))
                // Categories: refs are the db ids, parents precede children.
                .andExpect(jsonPath("$.profiles[0].categories", hasSize(2)))
                .andExpect(jsonPath("$.profiles[0].categories[0].ref").value(shopping.getId()))
                .andExpect(jsonPath("$.profiles[0].categories[0].parentRef").value((Object) null))
                .andExpect(jsonPath("$.profiles[0].categories[0].name").value("Shopping"))
                .andExpect(jsonPath("$.profiles[0].categories[0].color").value("#c3b3ee"))
                .andExpect(jsonPath("$.profiles[0].categories[1].ref").value(stimulants.getId()))
                .andExpect(jsonPath("$.profiles[0].categories[1].parentRef").value(shopping.getId()))
                .andExpect(jsonPath("$.profiles[0].categories[1].color").value((Object) null))
                .andExpect(jsonPath("$.profiles[0].subscriptions", hasSize(1)))
                .andExpect(jsonPath("$.profiles[0].subscriptions[0].ref").value(netflix.getId()))
                .andExpect(
                        jsonPath("$.profiles[0].subscriptions[0].categoryRef").value(stimulants.getId()))
                .andExpect(jsonPath("$.profiles[0].subscriptions[0].name").value("Netflix"))
                .andExpect(jsonPath("$.profiles[0].subscriptions[0].amount").value("43.0000"))
                .andExpect(jsonPath("$.profiles[0].subscriptions[0].currency").value("PLN"))
                .andExpect(
                        jsonPath("$.profiles[0].subscriptions[0].billingPeriod").value("MONTHLY"))
                .andExpect(
                        jsonPath("$.profiles[0].subscriptions[0].nextBillingOn").value("2026-09-03"))
                .andExpect(jsonPath("$.profiles[0].subscriptions[0].status").value("ACTIVE"))
                .andExpect(jsonPath("$.profiles[0].subscriptions[0].notes").value((Object) null))
                .andExpect(jsonPath("$.profiles[0].transactions", hasSize(2)))
                .andExpect(jsonPath("$.profiles[0].transactions[0].categoryRef").value(stimulants.getId()))
                .andExpect(jsonPath("$.profiles[0].transactions[0].subscriptionRef")
                        .value(netflix.getId()))
                .andExpect(jsonPath("$.profiles[0].transactions[0].amount").value("43.0000"))
                .andExpect(jsonPath("$.profiles[0].transactions[0].occurredOn").value("2026-08-03"))
                .andExpect(jsonPath("$.profiles[0].transactions[1].categoryRef").value(shopping.getId()))
                .andExpect(jsonPath("$.profiles[0].transactions[1].subscriptionRef")
                        .value((Object) null))
                .andExpect(jsonPath("$.profiles[0].transactions[1].amount").value("34.9900"))
                .andExpect(jsonPath("$.profiles[0].transactions[1].currency").value("PLN"))
                .andExpect(jsonPath("$.profiles[0].transactions[1].type").value("EXPENSE"))
                .andExpect(jsonPath("$.profiles[0].transactions[1].occurredOn").value("2026-07-21"))
                .andExpect(jsonPath("$.profiles[0].budgets", hasSize(1)))
                .andExpect(jsonPath("$.profiles[0].budgets[0].categoryRef").value(shopping.getId()))
                .andExpect(jsonPath("$.profiles[0].budgets[0].amountLimit").value("2000.0000"))
                .andExpect(jsonPath("$.profiles[0].budgets[0].currency").value("PLN"))
                .andExpect(jsonPath("$.profiles[0].budgets[0].periodStart").value("2026-07-01"))
                .andExpect(jsonPath("$.profiles[0].budgets[0].periodEnd").value("2026-07-31"))
                // Audit metadata and account data stay out of the file.
                .andExpect(jsonPath("$.profiles[0].transactions[0].createdAt").doesNotExist())
                .andExpect(jsonPath("$.email").doesNotExist());
    }

    @Test
    void exportOrdersParentsBeforeChildrenEvenAfterReparenting() throws Exception {
        // The child was created before its parent, so the child's db id (= ref) is the lower one;
        // a naive "order by id" would emit it first. The exporter must still put the parent first.
        Profile reparented = fixtures.profile(chris, "Reparented", "PLN");
        Category child = fixtures.category(reparented, null, "Child");
        Category parent = fixtures.category(reparented, null, "Parent");
        child.moveTo(parent);
        categoryRepository.save(child);

        export(chris, "{\"profileIds\": [" + reparented.getId() + "]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profiles[0].categories[0].name").value("Parent"))
                .andExpect(jsonPath("$.profiles[0].categories[0].parentRef").value((Object) null))
                .andExpect(jsonPath("$.profiles[0].categories[1].name").value("Child"))
                .andExpect(jsonPath("$.profiles[0].categories[1].parentRef").value(parent.getId()));
    }

    @Test
    void exportContainsEveryRequestedProfileInRequestOrder() throws Exception {
        Profile company = fixtures.profile(chris, "Company", "EUR");
        export(chris, "{\"profileIds\": [" + company.getId() + ", " + personal.getId() + "]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profiles", hasSize(2)))
                .andExpect(jsonPath("$.profiles[0].name").value("Company"))
                .andExpect(jsonPath("$.profiles[0].categories", hasSize(0)))
                .andExpect(jsonPath("$.profiles[1].name").value("Personal"));
    }

    @Test
    void exportWithEmptyProfileIdsIs400() throws Exception {
        export(chris, "{\"profileIds\": []}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"));
    }

    @Test
    void exportWithNullProfileIdIs400() throws Exception {
        export(chris, "{\"profileIds\": [null]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"));
    }

    @Test
    void exportNamingAnotherUsersProfileIs404() throws Exception {
        User other = fixtures.user("other@example.com");
        Profile theirs = fixtures.profile(other, "Theirs", "USD");
        export(chris, "{\"profileIds\": [" + personal.getId() + ", " + theirs.getId() + "]}")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/not-found"));
    }

    // ---------------------------------------------------------------- restore

    @Test
    void merchantIsExportedAndSurvivesRestore() throws Exception {
        fixtures.transaction(
                personal,
                shopping,
                "12.50",
                "PLN",
                TransactionType.EXPENSE,
                LocalDate.of(2026, 7, 22),
                "weekly shop",
                "Lidl");

        export(chris, "{\"profileIds\": [" + personal.getId() + "]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profiles[0].transactions[*].merchant", hasItem("Lidl")));

        mockMvc.perform(restore(chris, exportedFile())).andExpect(status().isOk());

        Profile restored = profileByName("Personal (restored)");
        assertThat(transactionRepository.findAllByProfileIdOrderByIdAsc(restored.getId()))
                .extracting(Transaction::getMerchant)
                .contains("Lidl");
    }

    @Test
    void restoreOfAPreMerchantFileStillRestoresWithNullMerchant() throws Exception {
        // Simulates a file exported before Task 3: the transaction object has no "merchant" key
        // at all (not merchant: null) — exactly what every backup written under formatVersion 1
        // before this change looks like. It must still restore, and read as a null merchant,
        // rather than be rejected by the validator or fail to parse.
        String json = """
                {"app": "my-finance", "formatVersion": 1, "exportedAt": "2026-08-25T12:00:00Z",
                 "profiles": [{"name": "PreMerchant", "defaultCurrency": "PLN",
                   "categories": [{"ref": 1, "parentRef": null, "name": "Food", "color": null}],
                   "subscriptions": [], "transactions": [
                     {"categoryRef": 1, "subscriptionRef": null, "amount": "10.0000", "currency": "PLN",
                      "type": "EXPENSE", "occurredOn": "2026-08-01", "description": null}],
                   "budgets": []}]}
                """;

        mockMvc.perform(restore(chris, json)).andExpect(status().isOk());

        Profile restored = profileByName("PreMerchant");
        assertThat(transactionRepository.findAllByProfileIdOrderByIdAsc(restored.getId()))
                .extracting(Transaction::getMerchant)
                .containsExactly((String) null);
    }

    @Test
    void restoreOfAnExportedFileRecreatesTheDataUnderANewProfile() throws Exception {
        byte[] file = exportedFile();

        mockMvc.perform(restore(chris, file))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profiles", hasSize(1)))
                .andExpect(jsonPath("$.profiles[0].id").isNumber())
                .andExpect(jsonPath("$.profiles[0].name").value("Personal (restored)"))
                .andExpect(jsonPath("$.profiles[0].categories").value(2))
                .andExpect(jsonPath("$.profiles[0].transactions").value(2))
                .andExpect(jsonPath("$.profiles[0].budgets").value(1))
                .andExpect(jsonPath("$.profiles[0].subscriptions").value(1));

        Profile restored = profileByName("Personal (restored)");
        assertThat(restored.getDefaultCurrency()).isEqualTo("PLN");

        List<Category> categories = categoryRepository.findAllByProfileIdOrderByNameAsc(restored.getId());
        assertThat(categories).hasSize(2);
        Category newShopping = categories.get(0);
        Category newStimulants = categories.get(1);
        assertThat(newShopping.getName()).isEqualTo("Shopping");
        assertThat(newShopping.getId()).isNotEqualTo(shopping.getId()); // fresh ids, refs are file-internal
        assertThat(newShopping.getColor()).isEqualTo("#c3b3ee");
        assertThat(newShopping.getParentId()).isNull();
        assertThat(newStimulants.getName()).isEqualTo("Stimulants");
        assertThat(newStimulants.getParentId()).isEqualTo(newShopping.getId()); // tree stitched via refs

        List<Subscription> subscriptions = subscriptionRepository.findAllByProfileIdOrderByIdAsc(restored.getId());
        assertThat(subscriptions).hasSize(1);
        Subscription newNetflix = subscriptions.get(0);
        assertThat(newNetflix.getId()).isNotEqualTo(netflix.getId());
        assertThat(newNetflix.getCategory().getId()).isEqualTo(newStimulants.getId());
        assertThat(newNetflix.getAmount()).isEqualByComparingTo("43");
        assertThat(newNetflix.getBillingPeriod()).isEqualTo(BillingPeriod.MONTHLY);
        assertThat(newNetflix.getNextBillingOn()).isEqualTo(LocalDate.of(2026, 9, 3)); // already >= today
        assertThat(newNetflix.getStatus()).isEqualTo(SubscriptionStatus.ACTIVE);

        List<Transaction> transactions = transactionRepository.findAllByProfileIdOrderByIdAsc(restored.getId());
        assertThat(transactions).hasSize(2);
        assertThat(transactions.get(0).getCategory().getId()).isEqualTo(newStimulants.getId());
        assertThat(transactions.get(0).getSubscriptionId()).isEqualTo(newNetflix.getId()); // remapped, not the old id
        assertThat(transactions.get(0).getAmount()).isEqualByComparingTo("43");
        assertThat(transactions.get(0).getOccurredOn()).isEqualTo(LocalDate.of(2026, 8, 3));
        assertThat(transactions.get(1).getCategory().getId()).isEqualTo(newShopping.getId());
        assertThat(transactions.get(1).getSubscriptionId()).isNull();
        assertThat(transactions.get(1).getAmount()).isEqualByComparingTo("34.99");
        assertThat(transactions.get(1).getType()).isEqualTo(TransactionType.EXPENSE);

        assertThat(budgetRepository.findAllByProfileIdOrderByIdAsc(restored.getId()))
                .singleElement()
                .satisfies(b -> {
                    assertThat(b.getCategory().getId()).isEqualTo(newShopping.getId());
                    assertThat(b.getAmountLimit()).isEqualByComparingTo(new BigDecimal("2000"));
                    assertThat(b.getCurrency()).isEqualTo("PLN");
                    assertThat(b.getPeriodStart()).isEqualTo(LocalDate.of(2026, 7, 1));
                    assertThat(b.getPeriodEnd()).isEqualTo(LocalDate.of(2026, 7, 31));
                });
    }

    @Test
    void restoreIntoAnotherAccountKeepsTheOriginalProfileName() throws Exception {
        byte[] file = exportedFile();
        User other = fixtures.user("other@example.com");

        mockMvc.perform(restore(other, file))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profiles[0].name").value("Personal"));

        Profile restored = profileRepository
                .findAllByUserIdOrderByCreatedAtAsc(other.getId())
                .get(0);
        assertThat(restored.getName()).isEqualTo("Personal");
    }

    @Test
    void restoreSuffixesConflictingProfileNames() throws Exception {
        byte[] file = exportedFile();

        mockMvc.perform(restore(chris, file))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profiles[0].name").value("Personal (restored)"));
        mockMvc.perform(restore(chris, file))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profiles[0].name").value("Personal (restored 2)"));
    }

    @Test
    void restoreAdvancesPastNextBillingOnOfActiveSubscriptionsPreservingCadence() throws Exception {
        // Today is 2026-08-25. The ACTIVE monthly subscription billed on the 3rd must resume on
        // 2026-09-03 (whole periods: 06-03 -> 07-03 -> 08-03 -> 09-03), so the charge job never
        // posts catch-up charges that the file's transactions already contain. PAUSED is untouched.
        String json = """
                {"app": "my-finance", "formatVersion": 1, "exportedAt": "2026-08-25T12:00:00Z",
                 "profiles": [{"name": "Imported", "defaultCurrency": "PLN",
                   "categories": [{"ref": 1, "parentRef": null, "name": "Streaming", "color": null}],
                   "subscriptions": [
                     {"ref": 10, "categoryRef": 1, "name": "Netflix", "amount": "43.0000", "currency": "PLN",
                      "billingPeriod": "MONTHLY", "nextBillingOn": "2026-06-03", "status": "ACTIVE", "notes": null},
                     {"ref": 11, "categoryRef": 1, "name": "Gym", "amount": "99.0000", "currency": "PLN",
                      "billingPeriod": "MONTHLY", "nextBillingOn": "2026-06-15", "status": "PAUSED", "notes": null}],
                   "transactions": [], "budgets": []}]}
                """;

        mockMvc.perform(restore(chris, json)).andExpect(status().isOk());

        Profile imported = profileByName("Imported");
        List<Subscription> subscriptions = subscriptionRepository.findAllByProfileIdOrderByIdAsc(imported.getId());
        assertThat(subscriptions).hasSize(2);
        assertThat(subscriptions.get(0).getName()).isEqualTo("Netflix");
        assertThat(subscriptions.get(0).getNextBillingOn()).isEqualTo(LocalDate.of(2026, 9, 3));
        assertThat(subscriptions.get(1).getName()).isEqualTo("Gym");
        assertThat(subscriptions.get(1).getNextBillingOn()).isEqualTo(LocalDate.of(2026, 6, 15));
    }

    @Test
    void restoreOfAFileWithOneInvalidEntryRestoresNothing() throws Exception {
        long profilesBefore = profileRepository.count();
        // First profile is fully valid; the second's transaction points at a category ref
        // that does not exist. One 422, zero inserts — never a half-restored file.
        String json = """
                {"app": "my-finance", "formatVersion": 1, "exportedAt": "2026-08-25T12:00:00Z",
                 "profiles": [
                   {"name": "Good", "defaultCurrency": "PLN",
                    "categories": [{"ref": 1, "parentRef": null, "name": "Food", "color": null}],
                    "subscriptions": [], "transactions": [], "budgets": []},
                   {"name": "Bad", "defaultCurrency": "PLN",
                    "categories": [{"ref": 1, "parentRef": null, "name": "Food", "color": null}],
                    "subscriptions": [],
                    "transactions": [{"categoryRef": 99, "subscriptionRef": null, "amount": "10.0000",
                      "currency": "PLN", "type": "EXPENSE", "occurredOn": "2026-08-01", "description": null}],
                    "budgets": []}]}
                """;

        mockMvc.perform(restore(chris, json))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.type").value("/errors/backup-invalid"))
                .andExpect(jsonPath("$.problems", hasItem(containsString("profiles[1].transactions[0]"))));

        assertThat(profileRepository.count()).isEqualTo(profilesBefore);
    }

    @Test
    void restoreOfNonJsonIs400() throws Exception {
        mockMvc.perform(restore(chris, "definitely not json {{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-backup-file"));
    }

    @Test
    void restoreOfTheJsonLiteralNullIs400() throws Exception {
        // Valid JSON, but the mapper returns null — not a backup, same as a foreign-app file.
        mockMvc.perform(restore(chris, "null"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-backup-file"));
    }

    @Test
    void restoreOfAForeignAppFileIs400() throws Exception {
        mockMvc.perform(restore(chris, "{\"app\": \"other-tool\", \"formatVersion\": 1, \"profiles\": []}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-backup-file"));
    }

    @Test
    void restoreOfAnUnsupportedFormatVersionIs400() throws Exception {
        mockMvc.perform(restore(chris, "{\"app\": \"my-finance\", \"formatVersion\": 2, \"profiles\": []}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-backup-file"));
    }

    @Test
    void restoreReportsEveryDomainViolationInTheProblemsArray() throws Exception {
        // A parseable backup file whose content breaks several domain rules at once:
        // forward parentRef, bad currency, unknown billing period, invalid date, negative amount.
        String json = """
                {"app": "my-finance", "formatVersion": 1, "exportedAt": "2026-08-25T12:00:00Z",
                 "profiles": [{"name": "Broken", "defaultCurrency": "pln",
                   "categories": [
                     {"ref": 1, "parentRef": 2, "name": "Child", "color": null},
                     {"ref": 2, "parentRef": null, "name": "Parent", "color": null}],
                   "subscriptions": [
                     {"ref": 10, "categoryRef": 2, "name": "Netflix", "amount": "43.0000", "currency": "PLN",
                      "billingPeriod": "FORTNIGHTLY", "nextBillingOn": "not-a-date", "status": "ACTIVE", "notes": null}],
                   "transactions": [
                     {"categoryRef": 2, "subscriptionRef": null, "amount": "-1.0000", "currency": "PLN",
                      "type": "EXPENSE", "occurredOn": "2026-08-01", "description": null}],
                   "budgets": []}]}
                """;

        mockMvc.perform(restore(chris, json))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.type").value("/errors/backup-invalid"))
                .andExpect(jsonPath("$.problems").isArray())
                .andExpect(jsonPath("$.problems", hasItem(containsString("profiles[0].categories[0]"))))
                .andExpect(jsonPath("$.problems", hasItem(containsString("defaultCurrency"))))
                .andExpect(jsonPath("$.problems", hasItem(containsString("FORTNIGHTLY"))))
                .andExpect(jsonPath("$.problems", hasItem(containsString("not-a-date"))))
                .andExpect(jsonPath("$.problems", hasItem(containsString("profiles[0].transactions[0]"))));
    }

    private Profile profileByName(String name) {
        return profileRepository.findAll().stream()
                .filter(p -> p.getName().equals(name))
                .findFirst()
                .orElseThrow();
    }
}
