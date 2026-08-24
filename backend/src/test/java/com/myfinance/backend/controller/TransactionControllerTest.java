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
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
class TransactionControllerTest {

    private static final LocalDate TODAY = LocalDate.now();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    @Autowired
    private TransactionRepository transactionRepository;

    private User user;
    private Profile profile;
    private Category food;
    private Category groceries;      // child of food
    private Category vegetables;     // child of groceries
    private Category salary;

    private Profile otherProfile;    // same user, other profile
    private Category otherCategory;
    private Profile strangerProfile; // other user
    private Category strangerCategory;

    @BeforeEach
    void setUp() {
        user = fixtures.user("chris@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
        food = fixtures.category(profile, null, "Food");
        groceries = fixtures.category(profile, food, "Groceries");
        vegetables = fixtures.category(profile, groceries, "Vegetables");
        salary = fixtures.category(profile, null, "Salary");

        otherProfile = fixtures.profile(user, "Company", "EUR");
        otherCategory = fixtures.category(otherProfile, null, "Office");

        User stranger = fixtures.user("stranger@example.com");
        strangerProfile = fixtures.profile(stranger, "Personal", "USD");
        strangerCategory = fixtures.category(strangerProfile, null, "Secret");
    }

    private Transaction txn(Profile p, Category c, String amount, LocalDate on, TransactionType type) {
        return fixtures.transaction(p, c, amount, "PLN", type, on);
    }

    private static String body(Long categoryId, String amountJson, String type, LocalDate on, String descriptionJson) {
        return """
                {"categoryId": %d, "amount": %s, "currency": "PLN", "type": "%s",
                 "occurredOn": "%s", "description": %s}
                """.formatted(categoryId, amountJson, type, on, descriptionJson);
    }

    private String validBody() {
        return body(groceries.getId(), "\"34.99\"", "EXPENSE", TODAY.minusDays(1), "\"liquid refill\"");
    }

    // ---------------------------------------------------------------- POST

    @Test
    void createReturns201WithLocationAndMoneyAtScale4() throws Exception {
        mockMvc.perform(post("/api/transactions").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content(validBody()))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", matchesPattern("/api/transactions/\\d+")))
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.category.id").value(groceries.getId()))
                .andExpect(jsonPath("$.category.name").value("Groceries"))
                .andExpect(jsonPath("$.amount").value("34.9900"))
                .andExpect(jsonPath("$.currency").value("PLN"))
                .andExpect(jsonPath("$.type").value("EXPENSE"))
                .andExpect(jsonPath("$.occurredOn").value(TODAY.minusDays(1).toString()))
                .andExpect(jsonPath("$.description").value("liquid refill"))
                .andExpect(jsonPath("$.createdAt").isString())
                .andExpect(jsonPath("$.profileId").doesNotExist());

        assertThat(transactionRepository.count()).isEqualTo(1);
    }

    @Test
    void createAcceptsAmountAsJsonNumberToo() throws Exception {
        String json = body(groceries.getId(), "34.99", "EXPENSE", TODAY, "null");
        mockMvc.perform(post("/api/transactions").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.amount").value("34.9900"))
                .andExpect(jsonPath("$.description").value(nullValue()));
    }

    @Test
    void createRejectsFiveDecimals() throws Exception {
        String json = body(groceries.getId(), "\"1.23456\"", "EXPENSE", TODAY, "null");
        mockMvc.perform(post("/api/transactions").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors[0].field").value("amount"));
    }

    @Test
    void createRejectsZeroAmountAndBadCurrencyAndFutureDate() throws Exception {
        String json = """
                {"categoryId": %d, "amount": "0", "currency": "pln", "type": "EXPENSE",
                 "occurredOn": "%s", "description": null}
                """.formatted(groceries.getId(), TODAY.plusDays(1));
        mockMvc.perform(post("/api/transactions").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors", hasSize(3)))
                .andExpect(jsonPath("$.errors[*].field").value(
                        org.hamcrest.Matchers.containsInAnyOrder("amount", "currency", "occurredOn")));
    }

    @Test
    void createRejectsMissingFields() throws Exception {
        mockMvc.perform(post("/api/transactions").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors", hasSize(5)));
    }

    @Test
    void createRejectsMalformedBody() throws Exception {
        String json = body(groceries.getId(), "\"abc\"", "EXPENSE", TODAY, "null");
        mockMvc.perform(post("/api/transactions").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-request"));
    }

    @Test
    void createWithCategoryFromAnotherProfileIs404() throws Exception {
        String json = body(otherCategory.getId(), "\"5\"", "EXPENSE", TODAY, "null");
        mockMvc.perform(post("/api/transactions").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/not-found"))
                .andExpect(jsonPath("$.detail").value("No category with id " + otherCategory.getId() + "."));
        assertThat(transactionRepository.count()).isZero();
    }

    @Test
    void createWithAnotherUsersCategoryIs404() throws Exception {
        String json = body(strangerCategory.getId(), "\"5\"", "EXPENSE", TODAY, "null");
        mockMvc.perform(post("/api/transactions").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isNotFound());
    }

    @Test
    void createWithoutActiveProfileIs409() throws Exception {
        mockMvc.perform(post("/api/transactions").with(fixtures.as(user))
                        .contentType(MediaType.APPLICATION_JSON).content(validBody()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }

    @Test
    void unauthenticatedIs401() throws Exception {
        mockMvc.perform(get("/api/transactions"))
                .andExpect(status().isUnauthorized());
    }

    // ---------------------------------------------------------------- GET /{id}

    @Test
    void getByIdReturnsTransaction() throws Exception {
        Transaction t = txn(profile, food, "12.5", TODAY, TransactionType.EXPENSE);
        mockMvc.perform(get("/api/transactions/{id}", t.getId()).with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(t.getId()))
                .andExpect(jsonPath("$.amount").value("12.5000"))
                .andExpect(jsonPath("$.category.name").value("Food"));
    }

    @Test
    void getByIdIs404ForMissingOrOtherProfilesTransaction() throws Exception {
        Transaction mine = txn(profile, food, "1", TODAY, TransactionType.EXPENSE);
        Transaction strangers = txn(strangerProfile, strangerCategory, "1", TODAY, TransactionType.EXPENSE);

        mockMvc.perform(get("/api/transactions/{id}", 999_999).with(fixtures.in(profile)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/not-found"));
        mockMvc.perform(get("/api/transactions/{id}", strangers.getId()).with(fixtures.in(profile)))
                .andExpect(status().isNotFound());
        // and my transaction is invisible from my other profile
        mockMvc.perform(get("/api/transactions/{id}", mine.getId()).with(fixtures.in(otherProfile)))
                .andExpect(status().isNotFound());
    }

    // ---------------------------------------------------------------- GET list

    @Test
    void listReturnsEnvelopeSortedByDateDescThenIdDescAndOnlyThisProfile() throws Exception {
        Transaction a = txn(profile, food, "1", TODAY.minusDays(2), TransactionType.EXPENSE);
        Transaction b = txn(profile, food, "2", TODAY, TransactionType.EXPENSE);
        Transaction c = txn(profile, food, "3", TODAY, TransactionType.EXPENSE);
        txn(otherProfile, otherCategory, "4", TODAY, TransactionType.EXPENSE);
        txn(strangerProfile, strangerCategory, "5", TODAY, TransactionType.EXPENSE);

        mockMvc.perform(get("/api/transactions").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(50))
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.totalPages").value(1))
                .andExpect(jsonPath("$.content", hasSize(3)))
                .andExpect(jsonPath("$.content[0].id").value(c.getId()))
                .andExpect(jsonPath("$.content[1].id").value(b.getId()))
                .andExpect(jsonPath("$.content[2].id").value(a.getId()))
                .andExpect(jsonPath("$.content[0].amount").value("3.0000"))
                .andExpect(jsonPath("$.content[0].category.name").value("Food"));
    }

    @Test
    void paginationIsStableAcrossPages() throws Exception {
        Transaction t1 = txn(profile, food, "1", TODAY, TransactionType.EXPENSE);
        Transaction t2 = txn(profile, food, "2", TODAY, TransactionType.EXPENSE);
        Transaction t3 = txn(profile, food, "3", TODAY, TransactionType.EXPENSE);
        Transaction t4 = txn(profile, food, "4", TODAY.minusDays(1), TransactionType.EXPENSE);
        Transaction t5 = txn(profile, food, "5", TODAY.minusDays(1), TransactionType.EXPENSE);

        mockMvc.perform(get("/api/transactions").param("size", "2").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(2))
                .andExpect(jsonPath("$.totalElements").value(5))
                .andExpect(jsonPath("$.totalPages").value(3))
                .andExpect(jsonPath("$.content[0].id").value(t3.getId()))
                .andExpect(jsonPath("$.content[1].id").value(t2.getId()));

        mockMvc.perform(get("/api/transactions").param("size", "2").param("page", "1").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.content[0].id").value(t1.getId()))
                .andExpect(jsonPath("$.content[1].id").value(t5.getId()));

        mockMvc.perform(get("/api/transactions").param("size", "2").param("page", "2").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(1)))
                .andExpect(jsonPath("$.content[0].id").value(t4.getId()));
    }

    @Test
    void fromAndToAreInclusiveOnBothEnds() throws Exception {
        txn(profile, food, "1", LocalDate.of(2026, 1, 9), TransactionType.EXPENSE);
        Transaction lo = txn(profile, food, "2", LocalDate.of(2026, 1, 10), TransactionType.EXPENSE);
        Transaction mid = txn(profile, food, "3", LocalDate.of(2026, 1, 15), TransactionType.EXPENSE);
        Transaction hi = txn(profile, food, "4", LocalDate.of(2026, 1, 20), TransactionType.EXPENSE);
        txn(profile, food, "5", LocalDate.of(2026, 1, 21), TransactionType.EXPENSE);

        mockMvc.perform(get("/api/transactions").param("from", "2026-01-10").param("to", "2026-01-20")
                        .with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.content[0].id").value(hi.getId()))
                .andExpect(jsonPath("$.content[1].id").value(mid.getId()))
                .andExpect(jsonPath("$.content[2].id").value(lo.getId()));

        // open-ended bounds work independently
        mockMvc.perform(get("/api/transactions").param("from", "2026-01-20").with(fixtures.in(profile)))
                .andExpect(jsonPath("$.totalElements").value(2));
        mockMvc.perform(get("/api/transactions").param("to", "2026-01-10").with(fixtures.in(profile)))
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void fromAfterToIs400() throws Exception {
        mockMvc.perform(get("/api/transactions").param("from", "2026-02-01").param("to", "2026-01-01")
                        .with(fixtures.in(profile)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-request"));
    }

    @Test
    void malformedDateIs400() throws Exception {
        mockMvc.perform(get("/api/transactions").param("from", "not-a-date").with(fixtures.in(profile)))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("/errors/invalid-request"));
    }

    @Test
    void invalidPagingParamsAre400() throws Exception {
        mockMvc.perform(get("/api/transactions").param("size", "201").with(fixtures.in(profile)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-request"));
        mockMvc.perform(get("/api/transactions").param("size", "0").with(fixtures.in(profile)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/transactions").param("page", "-1").with(fixtures.in(profile)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/transactions").param("size", "200").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(200));
    }

    @Test
    void includeDescendantsWithoutCategoryIdIs400() throws Exception {
        mockMvc.perform(get("/api/transactions").param("includeDescendants", "true").with(fixtures.in(profile)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-request"));
    }

    @Test
    void categoryFilterFromAnotherProfileIs404() throws Exception {
        mockMvc.perform(get("/api/transactions").param("categoryId", otherCategory.getId().toString())
                        .with(fixtures.in(profile)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/not-found"));
        mockMvc.perform(get("/api/transactions").param("categoryId", strangerCategory.getId().toString())
                        .with(fixtures.in(profile)))
                .andExpect(status().isNotFound());
    }

    @Test
    void categoryFilterExcludesChildrenUnlessIncludeDescendants() throws Exception {
        Transaction onFood = txn(profile, food, "1", TODAY, TransactionType.EXPENSE);
        Transaction onGroceries = txn(profile, groceries, "2", TODAY, TransactionType.EXPENSE);
        Transaction onVegetables = txn(profile, vegetables, "3", TODAY, TransactionType.EXPENSE);
        txn(profile, salary, "4", TODAY, TransactionType.INCOME);

        mockMvc.perform(get("/api/transactions").param("categoryId", food.getId().toString())
                        .with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(onFood.getId()));

        mockMvc.perform(get("/api/transactions").param("categoryId", food.getId().toString())
                        .param("includeDescendants", "true").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.content[0].id").value(onVegetables.getId()))
                .andExpect(jsonPath("$.content[1].id").value(onGroceries.getId()))
                .andExpect(jsonPath("$.content[2].id").value(onFood.getId()));

        // subtree from the middle node
        mockMvc.perform(get("/api/transactions").param("categoryId", groceries.getId().toString())
                        .param("includeDescendants", "true").with(fixtures.in(profile)))
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void includeDescendantsOnLeafReturnsJustTheLeafsRows() throws Exception {
        txn(profile, food, "1", TODAY, TransactionType.EXPENSE);
        txn(profile, groceries, "2", TODAY, TransactionType.EXPENSE);
        Transaction onVegetables = txn(profile, vegetables, "3", TODAY, TransactionType.EXPENSE);

        mockMvc.perform(get("/api/transactions").param("categoryId", vegetables.getId().toString())
                        .param("includeDescendants", "true").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(onVegetables.getId()));
    }

    @Test
    void typeFilterAndCombinedFilters() throws Exception {
        txn(profile, food, "1", TODAY, TransactionType.EXPENSE);
        Transaction pay = txn(profile, salary, "100", TODAY.minusDays(3), TransactionType.INCOME);
        txn(profile, salary, "50", TODAY.minusDays(40), TransactionType.INCOME);

        mockMvc.perform(get("/api/transactions").param("type", "INCOME").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));

        mockMvc.perform(get("/api/transactions").param("type", "INCOME")
                        .param("from", TODAY.minusDays(10).toString())
                        .param("categoryId", salary.getId().toString())
                        .with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(pay.getId()));

        mockMvc.perform(get("/api/transactions").param("type", "REFUND").with(fixtures.in(profile)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-request"));
    }

    // ---------------------------------------------------------------- PUT

    @Test
    void putReplacesEveryField() throws Exception {
        Transaction t = txn(profile, food, "1", TODAY.minusDays(5), TransactionType.EXPENSE);
        String json = """
                {"categoryId": %d, "amount": "250", "currency": "EUR", "type": "INCOME",
                 "occurredOn": "%s", "description": "refund"}
                """.formatted(salary.getId(), TODAY);

        mockMvc.perform(put("/api/transactions/{id}", t.getId()).with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(t.getId()))
                .andExpect(jsonPath("$.category.id").value(salary.getId()))
                .andExpect(jsonPath("$.category.name").value("Salary"))
                .andExpect(jsonPath("$.amount").value("250.0000"))
                .andExpect(jsonPath("$.currency").value("EUR"))
                .andExpect(jsonPath("$.type").value("INCOME"))
                .andExpect(jsonPath("$.occurredOn").value(TODAY.toString()))
                .andExpect(jsonPath("$.description").value("refund"));

        Transaction reloaded = transactionRepository.findById(t.getId()).orElseThrow();
        assertThat(reloaded.getAmount()).isEqualByComparingTo("250");
        assertThat(reloaded.getCurrency()).isEqualTo("EUR");
        assertThat(reloaded.getType()).isEqualTo(TransactionType.INCOME);
    }

    @Test
    void putIs404ForOtherProfilesTransactionOrCategory() throws Exception {
        Transaction strangers = txn(strangerProfile, strangerCategory, "1", TODAY, TransactionType.EXPENSE);
        mockMvc.perform(put("/api/transactions/{id}", strangers.getId()).with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content(validBody()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No transaction with id " + strangers.getId() + "."));

        Transaction mine = txn(profile, food, "1", TODAY, TransactionType.EXPENSE);
        String json = body(otherCategory.getId(), "\"5\"", "EXPENSE", TODAY, "null");
        mockMvc.perform(put("/api/transactions/{id}", mine.getId()).with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("No category with id " + otherCategory.getId() + "."));
        assertThat(transactionRepository.findById(mine.getId()).orElseThrow().getCategory().getId())
                .isEqualTo(food.getId());
    }

    @Test
    void putValidatesLikePost() throws Exception {
        Transaction t = txn(profile, food, "1", TODAY, TransactionType.EXPENSE);
        String json = body(food.getId(), "\"1.23456\"", "EXPENSE", TODAY.plusDays(1), "null");
        mockMvc.perform(put("/api/transactions/{id}", t.getId()).with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors", hasSize(2)));
    }

    @Test
    void putWithTooLongDescriptionIs400() throws Exception {
        Transaction t = txn(profile, food, "1", TODAY, TransactionType.EXPENSE);
        String json = body(food.getId(), "\"1\"", "EXPENSE", TODAY, "\"" + "x".repeat(501) + "\"");
        mockMvc.perform(put("/api/transactions/{id}", t.getId()).with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors[0].field").value("description"));
    }

    // ---------------------------------------------------------------- DELETE

    @Test
    void deleteReturns204ThenNotFound() throws Exception {
        Transaction t = txn(profile, food, "1", TODAY, TransactionType.EXPENSE);
        mockMvc.perform(delete("/api/transactions/{id}", t.getId()).with(fixtures.in(profile)))
                .andExpect(status().isNoContent());
        assertThat(transactionRepository.existsById(t.getId())).isFalse();
        mockMvc.perform(delete("/api/transactions/{id}", t.getId()).with(fixtures.in(profile)))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteIs404ForOtherProfilesTransaction() throws Exception {
        Transaction mine = txn(profile, food, "1", TODAY, TransactionType.EXPENSE);
        mockMvc.perform(delete("/api/transactions/{id}", mine.getId()).with(fixtures.in(otherProfile)))
                .andExpect(status().isNotFound());
        assertThat(transactionRepository.existsById(mine.getId())).isTrue();
    }
}
