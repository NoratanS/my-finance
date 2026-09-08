package com.myfinance.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.Transaction;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.TransactionRepository;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;

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

        mockMvc.perform(post("/api/transactions/merchant-backfill")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(backfill("Biedronka", "Biedronka")))
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

        mockMvc.perform(post("/api/transactions/merchant-backfill")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(backfill("Biedronka", "Biedronka")))
                .andExpect(jsonPath("$.updated").value(1));
        mockMvc.perform(post("/api/transactions/merchant-backfill")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(backfill("Biedronka", "Something else")))
                .andExpect(jsonPath("$.updated").value(0));

        assertThat(transactionRepository.findAllByProfileIdOrderByIdAsc(profile.getId()))
                .extracting(Transaction::getMerchant)
                .containsExactly("Biedronka");
    }

    @Test
    void backfillWithABlankMerchantIs400() throws Exception {
        mockMvc.perform(post("/api/transactions/merchant-backfill")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(backfill("Biedronka", "")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors[0].field").value("merchant"));
    }

    @Test
    void unauthenticatedIs401() throws Exception {
        mockMvc.perform(get("/api/transactions/merchant-suggestions")).andExpect(status().isUnauthorized());
    }
}
