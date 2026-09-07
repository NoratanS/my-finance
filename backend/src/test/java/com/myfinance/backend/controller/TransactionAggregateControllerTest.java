package com.myfinance.backend.controller;

import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.time.ZoneOffset;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The three server-side aggregates behind the money tiles, the category counts and the dashboard
 * chart (docs/API.md "GET /api/transactions/summary", ".../category-counts", ".../category-totals").
 * <p>
 * The seed deliberately holds <b>more than one page</b> of transactions ({@link #BULK} rows in one
 * category, against a 200-row max page size): a fixture of 200 rows or fewer cannot tell a real
 * aggregate apart from the client-side "sum the first page" bug these endpoints replace.
 */
@IntegrationTest
class TransactionAggregateControllerTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);
    private static final LocalDate YESTERDAY = TODAY.minusDays(1);
    private static final LocalDate LAST_MONTH = TODAY.minusDays(30);

    /** Above TransactionService.MAX_PAGE_SIZE on purpose — see the class comment. */
    private static final int BULK = 205;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    private Profile profile;
    private Category food;
    private Category groceries;   // child of food
    private Category vegetables;  // child of groceries
    private Category salary;
    private Category otherCategory;

    @BeforeEach
    void setUp() {
        User user = fixtures.user("chris@example.com");
        profile = fixtures.profile(user, "Household", "PLN");
        food = fixtures.category(profile, null, "Food");
        groceries = fixtures.category(profile, food, "Groceries");
        vegetables = fixtures.category(profile, groceries, "Vegetables");
        salary = fixtures.category(profile, null, "Salary");

        // PLN expenses: 205 × 10.00 on Groceries, plus one row on the parent and one on the leaf.
        fixtures.transactions(profile, groceries, BULK, "10.00", "PLN", TransactionType.EXPENSE, YESTERDAY);
        fixtures.transaction(profile, food, "7.50", "PLN", TransactionType.EXPENSE, LAST_MONTH);
        fixtures.transaction(profile, vegetables, "3.25", "PLN", TransactionType.EXPENSE, YESTERDAY);
        // PLN income: 3 × 100.00.
        fixtures.transactions(profile, salary, 3, "100.00", "PLN", TransactionType.INCOME, TODAY);
        // EUR, which must never be summed into the PLN figures.
        fixtures.transaction(profile, vegetables, "50.00", "EUR", TransactionType.EXPENSE, YESTERDAY);
        fixtures.transaction(profile, salary, "20.00", "EUR", TransactionType.INCOME, TODAY);

        // Another profile of the same user: none of its money may ever leak into the aggregates.
        Profile otherProfile = fixtures.profile(user, "Company", "PLN");
        otherCategory = fixtures.category(otherProfile, null, "Office");
        fixtures.transaction(otherProfile, otherCategory, "500.00", "PLN", TransactionType.EXPENSE, YESTERDAY);
    }

    // ------------------------------------------------------------- summary

    @Test
    void summaryCoversEveryMatchingRowNotJustTheFirstPage() throws Exception {
        // 205 × 10.00 + 7.50 + 3.25 = 2060.75 across 210 PLN rows — ten more than one page holds.
        mockMvc.perform(get("/api/transactions/summary").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].currency").value("EUR"))
                .andExpect(jsonPath("$[0].income").value("20.0000"))
                .andExpect(jsonPath("$[0].expense").value("50.0000"))
                .andExpect(jsonPath("$[0].net").value("-30.0000"))
                .andExpect(jsonPath("$[0].count").value(2))
                .andExpect(jsonPath("$[1].currency").value("PLN"))
                .andExpect(jsonPath("$[1].income").value("300.0000"))
                .andExpect(jsonPath("$[1].expense").value("2060.7500"))
                .andExpect(jsonPath("$[1].net").value("-1760.7500"))
                .andExpect(jsonPath("$[1].count").value(210));
    }

    @Test
    void summaryRespectsTheDateAndTypeFilters() throws Exception {
        // from=yesterday drops the 7.50 row that sits a month back.
        mockMvc.perform(get("/api/transactions/summary")
                        .param("from", YESTERDAY.toString())
                        .param("type", "EXPENSE")
                        .with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[1].currency").value("PLN"))
                .andExpect(jsonPath("$[1].expense").value("2053.2500"))
                .andExpect(jsonPath("$[1].income").value("0.0000"))
                .andExpect(jsonPath("$[1].net").value("-2053.2500"))
                .andExpect(jsonPath("$[1].count").value(206));
    }

    @Test
    void summaryHonoursTheCategoryFilterWithAndWithoutDescendants() throws Exception {
        mockMvc.perform(get("/api/transactions/summary")
                        .param("categoryId", groceries.getId().toString())
                        .with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].currency").value("PLN"))
                .andExpect(jsonPath("$[0].expense").value("2050.0000"))
                .andExpect(jsonPath("$[0].count").value(BULK));

        // The subtree adds the two rows filed on Vegetables — one PLN, one EUR, never merged.
        mockMvc.perform(get("/api/transactions/summary")
                        .param("categoryId", groceries.getId().toString())
                        .param("includeDescendants", "true")
                        .with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].currency").value("EUR"))
                .andExpect(jsonPath("$[0].expense").value("50.0000"))
                .andExpect(jsonPath("$[0].count").value(1))
                .andExpect(jsonPath("$[1].currency").value("PLN"))
                .andExpect(jsonPath("$[1].expense").value("2053.2500"))
                .andExpect(jsonPath("$[1].count").value(BULK + 1));
    }

    @Test
    void summaryRejectsTheSameBadFiltersAsTheList() throws Exception {
        mockMvc.perform(get("/api/transactions/summary")
                        .param("from", TODAY.toString()).param("to", LAST_MONTH.toString())
                        .with(fixtures.in(profile)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-request"));

        mockMvc.perform(get("/api/transactions/summary")
                        .param("includeDescendants", "true").with(fixtures.in(profile)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void summaryWithACategoryFromAnotherProfileIs404() throws Exception {
        mockMvc.perform(get("/api/transactions/summary")
                        .param("categoryId", otherCategory.getId().toString())
                        .with(fixtures.in(profile)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/not-found"));
    }

    // ------------------------------------------------------ category-counts

    @Test
    void categoryCountsCoverEveryRowAndOnlyThisProfile() throws Exception {
        mockMvc.perform(get("/api/transactions/category-counts").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(4)))
                .andExpect(jsonPath("$[0].categoryId").value(food.getId()))
                .andExpect(jsonPath("$[0].count").value(1))
                .andExpect(jsonPath("$[1].categoryId").value(groceries.getId()))
                .andExpect(jsonPath("$[1].count").value(BULK))
                .andExpect(jsonPath("$[2].categoryId").value(vegetables.getId()))
                .andExpect(jsonPath("$[2].count").value(2))
                .andExpect(jsonPath("$[3].categoryId").value(salary.getId()))
                .andExpect(jsonPath("$[3].count").value(4));
    }

    // ------------------------------------------------------ category-totals

    @Test
    void categoryTotalsCoverEveryRowAndKeepCurrenciesApart() throws Exception {
        mockMvc.perform(get("/api/transactions/category-totals")
                        .param("type", "EXPENSE").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(4)))
                .andExpect(jsonPath("$[0].categoryId").value(food.getId()))
                .andExpect(jsonPath("$[0].currency").value("PLN"))
                .andExpect(jsonPath("$[0].total").value("7.5000"))
                .andExpect(jsonPath("$[1].categoryId").value(groceries.getId()))
                .andExpect(jsonPath("$[1].currency").value("PLN"))
                .andExpect(jsonPath("$[1].total").value("2050.0000"))
                .andExpect(jsonPath("$[2].categoryId").value(vegetables.getId()))
                .andExpect(jsonPath("$[2].currency").value("EUR"))
                .andExpect(jsonPath("$[2].total").value("50.0000"))
                .andExpect(jsonPath("$[3].categoryId").value(vegetables.getId()))
                .andExpect(jsonPath("$[3].currency").value("PLN"))
                .andExpect(jsonPath("$[3].total").value("3.2500"));
    }

    @Test
    void categoryTotalsRespectTheDateWindow() throws Exception {
        mockMvc.perform(get("/api/transactions/category-totals")
                        .param("from", YESTERDAY.toString()).param("to", YESTERDAY.toString())
                        .param("type", "EXPENSE").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(3)))
                .andExpect(jsonPath("$[0].categoryId").value(groceries.getId()))
                .andExpect(jsonPath("$[0].total").value("2050.0000"));
    }

    @Test
    void categoryTotalsWithACategoryFromAnotherProfileIs404() throws Exception {
        mockMvc.perform(get("/api/transactions/category-totals")
                        .param("categoryId", otherCategory.getId().toString())
                        .with(fixtures.in(profile)))
                .andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------- scoping

    @Test
    void everyAggregateIs409WithoutAnActiveProfile() throws Exception {
        User stranger = fixtures.user("stranger@example.com");
        for (String path : new String[]{"/summary", "/category-counts", "/category-totals"}) {
            mockMvc.perform(get("/api/transactions" + path).with(fixtures.as(stranger)))
                    .andExpect(status().isConflict());
        }
    }
}
