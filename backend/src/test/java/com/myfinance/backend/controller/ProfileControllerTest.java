package com.myfinance.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;
import com.myfinance.backend.model.BillingPeriod;
import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.SubscriptionStatus;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.repository.BudgetRepository;
import com.myfinance.backend.repository.CategoryRepository;
import com.myfinance.backend.repository.InsightRepository;
import com.myfinance.backend.repository.ProfileRepository;
import com.myfinance.backend.repository.SubscriptionRepository;
import com.myfinance.backend.repository.TransactionRepository;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;

/**
 * docs/API.md "Profiles". These endpoints sit above the profile boundary: a request names no
 * active profile, so the header every changing request must carry is sent empty.
 */
@IntegrationTest
class ProfileControllerTest {

    private static final String PROFILE_HEADER = "X-Profile-Id";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    @Autowired
    private ProfileRepository profileRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private BudgetRepository budgetRepository;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @Autowired
    private InsightRepository insightRepository;

    // ---------------------------------------------------------------- GET (list)

    @Test
    void listReturnsEveryProfileOrderedByCreation() throws Exception {
        long personal = createProfile("Personal", "PLN");
        long company = createProfile("Company", "EUR");

        mockMvc.perform(get("/api/profiles"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].id").value(personal))
                .andExpect(jsonPath("$[0].name").value("Personal"))
                .andExpect(jsonPath("$[0].defaultCurrency").value("PLN"))
                .andExpect(jsonPath("$[0].createdAt").isString())
                .andExpect(jsonPath("$[1].id").value(company));
    }

    @Test
    void listIsAnEmptyArrayOnAnInstanceWithNoProfiles() throws Exception {
        mockMvc.perform(get("/api/profiles"))
                .andExpect(status().isOk())
                .andExpect(content().json("[]"));
    }

    // ---------------------------------------------------------------- POST

    @Test
    void createReturns201WithALocationThatResolves() throws Exception {
        MvcResult created = create("Personal", "PLN")
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", matchesPattern("/api/profiles/\\d+")))
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.name").value("Personal"))
                .andExpect(jsonPath("$.defaultCurrency").value("PLN"))
                .andExpect(jsonPath("$.createdAt").isString())
                .andReturn();

        mockMvc.perform(get(created.getResponse().getHeader("Location")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Personal"));
    }

    @Test
    void createRejectsInvalidBodyWith400() throws Exception {
        create("", "pln")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors", hasSize(2)));
    }

    /** A profile's name is unique in the instance: the picker never shows two alike. */
    @Test
    void createWithANameAlreadyTakenIs409() throws Exception {
        createProfile("Personal", "PLN");

        create("Personal", "EUR")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/profile-name-taken"));

        mockMvc.perform(get("/api/profiles")).andExpect(jsonPath("$", hasSize(1)));
    }

    // ---------------------------------------------------------------- GET /{id}

    @Test
    void getReturnsTheProfile() throws Exception {
        long personal = createProfile("Personal", "PLN");

        mockMvc.perform(get("/api/profiles/{id}", personal))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(personal))
                .andExpect(jsonPath("$.name").value("Personal"))
                .andExpect(jsonPath("$.defaultCurrency").value("PLN"));
    }

    @Test
    void getOfAProfileThatDoesNotExistIs404() throws Exception {
        mockMvc.perform(get("/api/profiles/{id}", 999_999))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/not-found"));
    }

    // ---------------------------------------------------------------- PUT /{id} (rename)

    @Test
    void renameReturns200WithUpdatedName() throws Exception {
        long personal = createProfile("Personal", "PLN");

        rename(personal, "Household")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(personal))
                .andExpect(jsonPath("$.name").value("Household"))
                .andExpect(jsonPath("$.defaultCurrency").value("PLN"));

        mockMvc.perform(get("/api/profiles/{id}", personal))
                .andExpect(jsonPath("$.name").value("Household"));
    }

    @Test
    void renameToItsOwnCurrentNameIsNotAConflict() throws Exception {
        long personal = createProfile("Personal", "PLN");

        rename(personal, "Personal").andExpect(status().isOk());
    }

    @Test
    void renameToAnotherProfilesNameIs409() throws Exception {
        long personal = createProfile("Personal", "PLN");
        createProfile("Company", "EUR");

        rename(personal, "Company")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/profile-name-taken"));

        mockMvc.perform(get("/api/profiles/{id}", personal))
                .andExpect(jsonPath("$.name").value("Personal"));
    }

    @Test
    void renameOfAProfileThatDoesNotExistIs404() throws Exception {
        rename(999_999, "Renamed").andExpect(status().isNotFound());
    }

    @Test
    void renameRejectsBlankNameWith400() throws Exception {
        long personal = createProfile("Personal", "PLN");

        rename(personal, "").andExpect(status().isBadRequest());
    }

    // ---------------------------------------------------------------- DELETE /{id}

    @Test
    void deleteReturns204AndCascadesEverythingItOwns() throws Exception {
        long personalId = createProfile("Personal", "PLN");
        createProfile("Company", "EUR");
        Profile personal = profileRepository.findById(personalId).orElseThrow();

        Category parent = fixtures.category(personal, null, "Groceries");
        Category child = fixtures.category(personal, parent, "Supermarket");
        fixtures.transaction(personal, child, "10.00", "PLN", TransactionType.EXPENSE, LocalDate.of(2026, 1, 5));
        fixtures.budget(personal, parent, "500.00", "PLN", LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31));
        fixtures.subscription(
                personal,
                parent,
                "Netflix",
                "43",
                "PLN",
                BillingPeriod.MONTHLY,
                LocalDate.of(2026, 2, 1),
                SubscriptionStatus.ACTIVE);
        fixtures.insight(personal, "Groceries per month", "{\"metric\":\"total\"}", false);

        deleteProfile(personalId).andExpect(status().isNoContent());

        assertThat(profileRepository.findById(personalId)).isEmpty();
        assertThat(categoryRepository.findAllByProfileIdOrderByNameAsc(personalId))
                .isEmpty();
        assertThat(transactionRepository.count()).isZero();
        assertThat(budgetRepository.count()).isZero();
        assertThat(subscriptionRepository.count()).isZero();
        assertThat(insightRepository.count()).isZero();
        mockMvc.perform(get("/api/profiles"))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].name").value("Company"));
    }

    /** An instance may have no profiles: that is the first-run state, and it must work anyway. */
    @Test
    void deletingTheOnlyProfileSucceedsAndLeavesAnEmptyList() throws Exception {
        long onlyProfile = createProfile("Personal", "PLN");

        deleteProfile(onlyProfile).andExpect(status().isNoContent());

        mockMvc.perform(get("/api/profiles"))
                .andExpect(status().isOk())
                .andExpect(content().json("[]"));
    }

    @Test
    void deleteOfAProfileThatDoesNotExistIs404() throws Exception {
        createProfile("Personal", "PLN");

        deleteProfile(999_999).andExpect(status().isNotFound());

        mockMvc.perform(get("/api/profiles")).andExpect(jsonPath("$", hasSize(1)));
    }

    // ---------------------------------------------------------------- helpers

    private ResultActions create(String name, String currency) throws Exception {
        return mockMvc.perform(post("/api/profiles")
                .header(PROFILE_HEADER, "")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"" + name + "\",\"defaultCurrency\":\"" + currency + "\"}"));
    }

    private long createProfile(String name, String currency) throws Exception {
        String body = create(name, currency)
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return JsonPath.<Number>read(body, "$.id").longValue();
    }

    private ResultActions rename(long id, String name) throws Exception {
        return mockMvc.perform(put("/api/profiles/{id}", id)
                .header(PROFILE_HEADER, "")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"" + name + "\"}"));
    }

    private ResultActions deleteProfile(long id) throws Exception {
        return mockMvc.perform(delete("/api/profiles/{id}", id).header(PROFILE_HEADER, ""));
    }
}
