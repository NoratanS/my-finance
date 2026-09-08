package com.myfinance.backend.controller;

import com.myfinance.backend.model.BillingPeriod;
import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.SubscriptionStatus;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.model.User;
import com.myfinance.backend.repository.BudgetRepository;
import com.myfinance.backend.repository.CategoryRepository;
import com.myfinance.backend.repository.InsightRepository;
import com.myfinance.backend.repository.ProfileRepository;
import com.myfinance.backend.repository.SubscriptionRepository;
import com.myfinance.backend.repository.TransactionRepository;
import com.myfinance.backend.security.ActiveProfile;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

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

@IntegrationTest
class ProfileControllerTest {

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

    @Test
    void listReturnsOnlyOwnProfilesOrderedByCreation() throws Exception {
        User chris = fixtures.user("chris@example.com");
        Profile personal = fixtures.profile(chris, "Personal", "PLN");
        Profile company = fixtures.profile(chris, "Company", "EUR");
        User other = fixtures.user("other@example.com");
        fixtures.profile(other, "Personal", "USD");

        mockMvc.perform(get("/api/profiles").with(fixtures.as(chris)))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].id").value(personal.getId()))
                .andExpect(jsonPath("$[0].name").value("Personal"))
                .andExpect(jsonPath("$[0].defaultCurrency").value("PLN"))
                .andExpect(jsonPath("$[0].createdAt").isString())
                .andExpect(jsonPath("$[1].id").value(company.getId()));
    }

    @Test
    void listIsEmptyArrayForNewUser() throws Exception {
        User chris = fixtures.user("chris@example.com");
        mockMvc.perform(get("/api/profiles").with(fixtures.as(chris)))
                .andExpect(status().isOk())
                .andExpect(content().json("[]"));
    }

    @Test
    void listUnauthenticatedIs401() throws Exception {
        mockMvc.perform(get("/api/profiles")).andExpect(status().isUnauthorized());
    }

    @Test
    void createReturns201WithLocationAndDoesNotSwitchActiveProfile() throws Exception {
        fixtures.user("chris@example.com");
        MockHttpSession session = loginSession("chris@example.com");

        MvcResult result = mockMvc.perform(post("/api/profiles").session(session).with(TestFixtures.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Personal\",\"defaultCurrency\":\"PLN\"}"))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", matchesPattern("/api/profiles/\\d+")))
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.name").value("Personal"))
                .andExpect(jsonPath("$.defaultCurrency").value("PLN"))
                .andExpect(jsonPath("$.createdAt").isString())
                .andReturn();

        assertThat(session.getAttribute(ActiveProfile.SESSION_KEY)).isNull();
        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(jsonPath("$.activeProfileId").value((Object) null))
                .andExpect(jsonPath("$.profiles", hasSize(1)));
        assertThat(profileRepository.count()).isEqualTo(1);
        assertThat(result.getResponse().getHeader("Location"))
                .endsWith("/" + profileRepository.findAll().get(0).getId());
    }

    @Test
    void createRejectsInvalidBodyWith400() throws Exception {
        User chris = fixtures.user("chris@example.com");
        mockMvc.perform(post("/api/profiles").with(fixtures.as(chris))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\",\"defaultCurrency\":\"pln\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors", hasSize(2)));
    }

    @Test
    void createWithDuplicateNameForSameUserIs409() throws Exception {
        User chris = fixtures.user("chris@example.com");
        fixtures.profile(chris, "Personal", "PLN");
        mockMvc.perform(post("/api/profiles").with(fixtures.as(chris))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Personal\",\"defaultCurrency\":\"EUR\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/profile-name-taken"));
    }

    @Test
    void sameProfileNameIsAllowedForDifferentUsers() throws Exception {
        User other = fixtures.user("other@example.com");
        fixtures.profile(other, "Personal", "PLN");
        User chris = fixtures.user("chris@example.com");
        mockMvc.perform(post("/api/profiles").with(fixtures.as(chris))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Personal\",\"defaultCurrency\":\"PLN\"}"))
                .andExpect(status().isCreated());
    }

    // ---------------------------------------------------------------- GET /{id}

    @Test
    void getReturnsOwnProfile() throws Exception {
        User chris = fixtures.user("chris@example.com");
        Profile personal = fixtures.profile(chris, "Personal", "PLN");
        mockMvc.perform(get("/api/profiles/{id}", personal.getId()).with(fixtures.as(chris)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(personal.getId()))
                .andExpect(jsonPath("$.name").value("Personal"))
                .andExpect(jsonPath("$.defaultCurrency").value("PLN"));
    }

    @Test
    void getClosesTheLocationHeaderFromCreate() throws Exception {
        fixtures.user("chris@example.com");
        MockHttpSession session = loginSession("chris@example.com");

        MvcResult created = mockMvc.perform(post("/api/profiles").session(session).with(TestFixtures.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Personal\",\"defaultCurrency\":\"PLN\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        String location = created.getResponse().getHeader("Location");

        mockMvc.perform(get(location).session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Personal"));
    }

    @Test
    void getAnotherUsersProfileIs404() throws Exception {
        User other = fixtures.user("other@example.com");
        Profile theirs = fixtures.profile(other, "Personal", "PLN");
        User chris = fixtures.user("chris@example.com");
        mockMvc.perform(get("/api/profiles/{id}", theirs.getId()).with(fixtures.as(chris)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/not-found"));
    }

    // ---------------------------------------------------------------- PUT /{id} (rename)

    @Test
    void renameReturns200WithUpdatedName() throws Exception {
        User chris = fixtures.user("chris@example.com");
        Profile personal = fixtures.profile(chris, "Personal", "PLN");
        mockMvc.perform(put("/api/profiles/{id}", personal.getId()).with(fixtures.as(chris))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Household\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(personal.getId()))
                .andExpect(jsonPath("$.name").value("Household"))
                .andExpect(jsonPath("$.defaultCurrency").value("PLN"));
        assertThat(profileRepository.findById(personal.getId()).orElseThrow().getName()).isEqualTo("Household");
    }

    @Test
    void renameToOwnCurrentNameIsAllowed() throws Exception {
        User chris = fixtures.user("chris@example.com");
        Profile personal = fixtures.profile(chris, "Personal", "PLN");
        mockMvc.perform(put("/api/profiles/{id}", personal.getId()).with(fixtures.as(chris))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Personal\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void renameToAnotherOwnProfilesNameIs409() throws Exception {
        User chris = fixtures.user("chris@example.com");
        Profile personal = fixtures.profile(chris, "Personal", "PLN");
        fixtures.profile(chris, "Company", "EUR");
        mockMvc.perform(put("/api/profiles/{id}", personal.getId()).with(fixtures.as(chris))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Company\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/profile-name-taken"));
    }

    @Test
    void renameAnotherUsersProfileIs404() throws Exception {
        User other = fixtures.user("other@example.com");
        Profile theirs = fixtures.profile(other, "Personal", "PLN");
        User chris = fixtures.user("chris@example.com");
        mockMvc.perform(put("/api/profiles/{id}", theirs.getId()).with(fixtures.as(chris))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Renamed\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void renameRejectsBlankNameWith400() throws Exception {
        User chris = fixtures.user("chris@example.com");
        Profile personal = fixtures.profile(chris, "Personal", "PLN");
        mockMvc.perform(put("/api/profiles/{id}", personal.getId()).with(fixtures.as(chris))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    // ---------------------------------------------------------------- DELETE /{id}

    @Test
    void deleteReturns204AndCascadesEverythingItOwns() throws Exception {
        User chris = fixtures.user("chris@example.com");
        Profile personal = fixtures.profile(chris, "Personal", "PLN");
        fixtures.profile(chris, "Company", "EUR"); // keep this the non-last profile

        Category parent = fixtures.category(personal, null, "Groceries");
        Category child = fixtures.category(personal, parent, "Supermarket");
        fixtures.transaction(personal, child, "10.00", "PLN", TransactionType.EXPENSE, LocalDate.of(2026, 1, 5));
        fixtures.budget(personal, parent, "500.00", "PLN", LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31));
        fixtures.subscription(personal, parent, "Netflix", "43", "PLN",
                BillingPeriod.MONTHLY, LocalDate.of(2026, 2, 1), SubscriptionStatus.ACTIVE);
        fixtures.insight(personal, "Groceries per month", "{\"metric\":\"total\"}", false);

        mockMvc.perform(delete("/api/profiles/{id}", personal.getId()).with(fixtures.as(chris)))
                .andExpect(status().isNoContent());

        assertThat(profileRepository.findById(personal.getId())).isEmpty();
        assertThat(categoryRepository.findAllByProfileIdOrderByNameAsc(personal.getId())).isEmpty();
        assertThat(transactionRepository.count()).isZero();
        assertThat(budgetRepository.count()).isZero();
        assertThat(subscriptionRepository.count()).isZero();
        assertThat(insightRepository.count()).isZero();
    }

    @Test
    void deleteClearsActiveProfileWhenTheDeletedProfileWasActive() throws Exception {
        User chris = fixtures.user("chris@example.com");
        Profile personal = fixtures.profile(chris, "Personal", "PLN");
        fixtures.profile(chris, "Company", "EUR");
        MockHttpSession session = loginSession("chris@example.com");
        session.setAttribute(ActiveProfile.SESSION_KEY, personal.getId());

        mockMvc.perform(delete("/api/profiles/{id}", personal.getId()).session(session).with(TestFixtures.csrf()))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(jsonPath("$.activeProfileId").value((Object) null));
    }

    @Test
    void deletingTheOnlyProfileIs409AndDoesNotDeleteIt() throws Exception {
        User chris = fixtures.user("chris@example.com");
        Profile onlyProfile = fixtures.profile(chris, "Personal", "PLN");
        mockMvc.perform(delete("/api/profiles/{id}", onlyProfile.getId()).with(fixtures.as(chris)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/last-profile"));
        assertThat(profileRepository.findById(onlyProfile.getId())).isPresent();
    }

    @Test
    void deleteAnotherUsersProfileIs404() throws Exception {
        User other = fixtures.user("other@example.com");
        Profile theirs = fixtures.profile(other, "Personal", "PLN");
        User chris = fixtures.user("chris@example.com");
        mockMvc.perform(delete("/api/profiles/{id}", theirs.getId()).with(fixtures.as(chris)))
                .andExpect(status().isNotFound());
        assertThat(profileRepository.findById(theirs.getId())).isPresent();
    }

    // TOCTOU: two concurrent deletes of a user's last two DIFFERENT profiles must not both
    // pass the "not the last profile" check — that would leave the user with zero.

    @Test
    void concurrentDeletesOfBothLastTwoProfilesLeaveExactlyOneStanding() throws Exception {
        User chris = fixtures.user("chris@example.com");
        Profile first = fixtures.profile(chris, "First", "PLN");
        Profile second = fixtures.profile(chris, "Second", "EUR");
        MockHttpSession sessionA = loginSession("chris@example.com");
        MockHttpSession sessionB = loginSession("chris@example.com");

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CyclicBarrier barrier = new CyclicBarrier(2);
        try {
            Callable<Integer> deleteFirst = () -> {
                barrier.await();
                return mockMvc.perform(delete("/api/profiles/{id}", first.getId())
                                .session(sessionA).with(TestFixtures.csrf()))
                        .andReturn().getResponse().getStatus();
            };
            Callable<Integer> deleteSecond = () -> {
                barrier.await();
                return mockMvc.perform(delete("/api/profiles/{id}", second.getId())
                                .session(sessionB).with(TestFixtures.csrf()))
                        .andReturn().getResponse().getStatus();
            };
            Future<Integer> resultA = pool.submit(deleteFirst);
            Future<Integer> resultB = pool.submit(deleteSecond);
            int statusA = resultA.get(10, TimeUnit.SECONDS);
            int statusB = resultB.get(10, TimeUnit.SECONDS);

            // Exactly one delete wins (204) and the other is refused as the last profile (409) —
            // never both succeeding (which would leave zero) and never both refused (which
            // would mean the guard is now wrongly blocking a legitimate delete).
            assertThat(List.of(statusA, statusB)).containsExactlyInAnyOrder(204, 409);
            assertThat(profileRepository.findAllByUserIdOrderByCreatedAtAsc(chris.getId())).hasSize(1);
        } finally {
            pool.shutdownNow();
        }
    }

    private MockHttpSession loginSession(String email) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/login").with(TestFixtures.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + TestFixtures.DEFAULT_PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return (MockHttpSession) result.getRequest().getSession(false);
    }
}
