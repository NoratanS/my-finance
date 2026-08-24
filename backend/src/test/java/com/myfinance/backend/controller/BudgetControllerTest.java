package com.myfinance.backend.controller;

import com.myfinance.backend.model.Budget;
import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
class BudgetControllerTest {

    private static final LocalDate JUL_1 = LocalDate.of(2026, 7, 1);
    private static final LocalDate JUL_31 = LocalDate.of(2026, 7, 31);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    private User user;
    private Profile profile;
    private Profile otherProfile;
    private Category shopping;
    private Category otherCategory;

    @BeforeEach
    void setUp() {
        user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
        shopping = fixtures.category(profile, null, "Shopping");

        User other = fixtures.user("other@example.com");
        otherProfile = fixtures.profile(other, "Other", "EUR");
        otherCategory = fixtures.category(otherProfile, null, "Their Shopping");
    }

    private Budget budget(Profile p, Category c, String limit, String currency, LocalDate start, LocalDate end) {
        return fixtures.budget(p, c, limit, currency, start, end);
    }

    private void expense(Category c, String amount, String currency, LocalDate on) {
        fixtures.transaction(profile, c, amount, currency, TransactionType.EXPENSE, on);
    }

    private static String body(Long categoryId, String amount, String currency, String start, String end) {
        return """
                {"categoryId": %d, "amountLimit": "%s", "currency": "%s", "periodStart": "%s", "periodEnd": "%s"}
                """.formatted(categoryId, amount, currency, start, end);
    }

    // ---- POST /api/budgets ----

    @Test
    void createReturns201WithLocationAndBody() throws Exception {
        mockMvc.perform(post("/api/budgets").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(shopping.getId(), "2000", "PLN", "2026-07-01", "2026-07-31")))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", matchesPattern("/api/budgets/\\d+")))
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.category.id").value(shopping.getId()))
                .andExpect(jsonPath("$.category.name").value("Shopping"))
                .andExpect(jsonPath("$.amountLimit").value("2000.0000"))
                .andExpect(jsonPath("$.currency").value("PLN"))
                .andExpect(jsonPath("$.periodStart").value("2026-07-01"))
                .andExpect(jsonPath("$.periodEnd").value("2026-07-31"))
                .andExpect(jsonPath("$.createdAt").isString());
    }

    @Test
    void createWithCategoryFromAnotherProfileIs404() throws Exception {
        mockMvc.perform(post("/api/budgets").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(otherCategory.getId(), "100", "PLN", "2026-07-01", "2026-07-31")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/not-found"));
    }

    @Test
    void createDuplicateExactPeriodIs409ButOverlappingPeriodIsAllowed() throws Exception {
        budget(profile, shopping, "2000", "PLN", JUL_1, JUL_31);

        mockMvc.perform(post("/api/budgets").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(shopping.getId(), "500", "PLN", "2026-07-01", "2026-07-31")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/budget-exists"));

        mockMvc.perform(post("/api/budgets").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(shopping.getId(), "500", "PLN", "2026-07-15", "2026-08-15")))
                .andExpect(status().isCreated());
    }

    @Test
    void createWithPeriodEndBeforeStartIs400ValidationFailed() throws Exception {
        mockMvc.perform(post("/api/budgets").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(shopping.getId(), "100", "PLN", "2026-07-31", "2026-07-01")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors[*].field").value(hasItem("periodValid")));
    }

    @Test
    void createWithInvalidFieldsIs400ValidationFailed() throws Exception {
        mockMvc.perform(post("/api/budgets").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"amountLimit": "0", "currency": "pln", "periodStart": "2026-07-01"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors[*].field").value(hasItem("categoryId")))
                .andExpect(jsonPath("$.errors[*].field").value(hasItem("amountLimit")))
                .andExpect(jsonPath("$.errors[*].field").value(hasItem("currency")))
                .andExpect(jsonPath("$.errors[*].field").value(hasItem("periodEnd")));
    }

    @Test
    void createWithoutActiveProfileIs409() throws Exception {
        mockMvc.perform(post("/api/budgets").with(fixtures.as(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(shopping.getId(), "100", "PLN", "2026-07-01", "2026-07-31")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }

    @Test
    void unauthenticatedIs401() throws Exception {
        // A GET: for a POST without CSRF token the CSRF filter answers 403 before authentication runs.
        mockMvc.perform(get("/api/budgets"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.type").value("/errors/unauthenticated"));
    }

    // ---- GET /api/budgets ----

    @Test
    void listReturnsOnlyOwnBudgetsSortedByPeriodStartDesc() throws Exception {
        Budget june = budget(profile, shopping, "100", "PLN", LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 30));
        Budget july = budget(profile, shopping, "100", "PLN", JUL_1, JUL_31);
        Budget aug = budget(profile, shopping, "100", "PLN", LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 31));
        budget(otherProfile, otherCategory, "100", "EUR", JUL_1, JUL_31);

        mockMvc.perform(get("/api/budgets").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(3)))
                .andExpect(jsonPath("$[*].id").value(contains(
                        aug.getId().intValue(), july.getId().intValue(), june.getId().intValue())))
                .andExpect(jsonPath("$[0].category.name").value("Shopping"))
                .andExpect(jsonPath("$[0].amountLimit").value("100.0000"));
    }

    @Test
    void listActiveOnIsInclusiveAtBothEnds() throws Exception {
        Budget july = budget(profile, shopping, "100", "PLN", JUL_1, JUL_31);

        mockMvc.perform(get("/api/budgets").param("activeOn", "2026-07-01").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(july.getId()));

        mockMvc.perform(get("/api/budgets").param("activeOn", "2026-07-31").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));

        mockMvc.perform(get("/api/budgets").param("activeOn", "2026-06-30").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", empty()));

        mockMvc.perform(get("/api/budgets").param("activeOn", "2026-08-01").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", empty()));
    }

    @Test
    void listFiltersByCategoryId() throws Exception {
        Category food = fixtures.category(profile, null, "Food");
        budget(profile, shopping, "100", "PLN", JUL_1, JUL_31);
        Budget foodBudget = budget(profile, food, "100", "PLN", JUL_1, JUL_31);

        mockMvc.perform(get("/api/budgets").param("categoryId", food.getId().toString()).with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(foodBudget.getId()));
    }

    @Test
    void listWithCategoryFromAnotherProfileIs404() throws Exception {
        mockMvc.perform(get("/api/budgets").param("categoryId", otherCategory.getId().toString())
                        .with(fixtures.in(profile)))
                .andExpect(status().isNotFound());
    }

    @Test
    void listWithMalformedDateIs400() throws Exception {
        mockMvc.perform(get("/api/budgets").param("activeOn", "not-a-date").with(fixtures.in(profile)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-request"));
    }

    // ---- GET /api/budgets/{id}/status ----

    @Test
    void statusSumsExpensesInSubtreeForBudgetCurrencyWithinPeriod() throws Exception {
        Category stimulants = fixtures.category(profile, shopping, "Stimulants");
        Category vaping = fixtures.category(profile, stimulants, "Vaping");
        Category food = fixtures.category(profile, null, "Food");
        Budget b = budget(profile, shopping, "2000", "PLN", JUL_1, JUL_31);

        expense(shopping, "1000", "PLN", JUL_1);           // root, first day
        expense(stimulants, "400", "PLN", LocalDate.of(2026, 7, 15));
        expense(vaping, "50.75", "PLN", JUL_31);           // 3rd level, last day
        expense(food, "999", "PLN", LocalDate.of(2026, 7, 10));   // other subtree
        expense(shopping, "10", "PLN", LocalDate.of(2026, 6, 30)); // before period
        expense(vaping, "10", "PLN", LocalDate.of(2026, 8, 1));   // after period
        expense(vaping, "30", "EUR", LocalDate.of(2026, 7, 5));   // other currency
        expense(shopping, "5", "USD", LocalDate.of(2026, 7, 5));  // other currency
        fixtures.transaction(profile, shopping, "5000", "PLN", TransactionType.INCOME, LocalDate.of(2026, 7, 5));

        mockMvc.perform(get("/api/budgets/{id}/status", b.getId()).with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.budget.id").value(b.getId()))
                .andExpect(jsonPath("$.budget.category.id").value(shopping.getId()))
                .andExpect(jsonPath("$.budget.category.name").value("Shopping"))
                .andExpect(jsonPath("$.budget.amountLimit").value("2000.0000"))
                .andExpect(jsonPath("$.budget.currency").value("PLN"))
                .andExpect(jsonPath("$.budget.periodStart").value("2026-07-01"))
                .andExpect(jsonPath("$.budget.periodEnd").value("2026-07-31"))
                .andExpect(jsonPath("$.budget.createdAt").doesNotExist())
                .andExpect(jsonPath("$.spent").value("1450.7500"))
                .andExpect(jsonPath("$.remaining").value("549.2500"))
                .andExpect(jsonPath("$.percentUsed").value(72.54))
                .andExpect(jsonPath("$.overBudget").value(false))
                .andExpect(jsonPath("$.includesDescendants").value(true))
                .andExpect(jsonPath("$.excludedCurrencies").value(contains("EUR", "USD")));
    }

    @Test
    void statusOverBudgetHasNegativeRemaining() throws Exception {
        Budget b = budget(profile, shopping, "100", "PLN", JUL_1, JUL_31);
        expense(shopping, "150", "PLN", LocalDate.of(2026, 7, 10));

        mockMvc.perform(get("/api/budgets/{id}/status", b.getId()).with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.spent").value("150.0000"))
                .andExpect(jsonPath("$.remaining").value("-50.0000"))
                .andExpect(jsonPath("$.percentUsed").value(150.0))
                .andExpect(jsonPath("$.overBudget").value(true))
                .andExpect(jsonPath("$.excludedCurrencies").value(empty()));
    }

    @Test
    void statusWithNoTransactionsIsZero() throws Exception {
        Budget b = budget(profile, shopping, "100", "PLN", JUL_1, JUL_31);

        mockMvc.perform(get("/api/budgets/{id}/status", b.getId()).with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.spent").value("0.0000"))
                .andExpect(jsonPath("$.remaining").value("100.0000"))
                .andExpect(jsonPath("$.percentUsed").value(0.0))
                .andExpect(jsonPath("$.overBudget").value(false))
                .andExpect(jsonPath("$.excludedCurrencies").value(empty()));
    }

    @Test
    void statusOfBudgetInAnotherProfileIs404() throws Exception {
        Budget theirs = budget(otherProfile, otherCategory, "100", "EUR", JUL_1, JUL_31);

        mockMvc.perform(get("/api/budgets/{id}/status", theirs.getId()).with(fixtures.in(profile)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/not-found"))
                .andExpect(jsonPath("$.detail").value(containsString("budget")));
    }

    @Test
    void statusOfUnknownBudgetIs404() throws Exception {
        mockMvc.perform(get("/api/budgets/{id}/status", 999999).with(fixtures.in(profile)))
                .andExpect(status().isNotFound());
    }
}
