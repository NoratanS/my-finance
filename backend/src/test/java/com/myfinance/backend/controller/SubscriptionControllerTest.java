package com.myfinance.backend.controller;

import com.myfinance.backend.model.BillingPeriod;
import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.Subscription;
import com.myfinance.backend.model.SubscriptionStatus;
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
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The 5 CRUD endpoints of docs/API.md "Subscriptions" (the dashboard has its own test class). */
@IntegrationTest
class SubscriptionControllerTest {

    private static final LocalDate SEP_3 = LocalDate.of(2026, 9, 3);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    private User user;
    private Profile profile;
    private Category streaming;
    private Profile otherProfile;
    private Category otherCategory;

    @BeforeEach
    void setUp() {
        user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
        streaming = fixtures.category(profile, null, "Streaming");

        User other = fixtures.user("other@example.com");
        otherProfile = fixtures.profile(other, "Other", "EUR");
        otherCategory = fixtures.category(otherProfile, null, "Their Streaming");
    }

    private Subscription netflix() {
        return fixtures.subscription(profile, streaming, "Netflix", "43", "PLN",
                BillingPeriod.MONTHLY, SEP_3, SubscriptionStatus.ACTIVE);
    }

    private static String body(String name, Long categoryId) {
        return """
                {"name": "%s", "categoryId": %d, "amount": "43.00", "currency": "PLN",
                 "billingPeriod": "MONTHLY", "nextBillingOn": "2026-09-03", "notes": null}
                """.formatted(name, categoryId);
    }

    private static String updateBody(String name, Long categoryId, String status) {
        return """
                {"name": "%s", "categoryId": %d, "amount": "50.00", "currency": "PLN",
                 "billingPeriod": "YEARLY", "nextBillingOn": "2027-01-01", "status": "%s", "notes": "annual plan"}
                """.formatted(name, categoryId, status);
    }

    // ---------------------------------------------------------------- POST

    @Test
    void createReturns201WithLocationBodyAndMonthlyAmount() throws Exception {
        mockMvc.perform(post("/api/subscriptions").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Netflix", streaming.getId())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.name").value("Netflix"))
                .andExpect(jsonPath("$.category.id").value(streaming.getId()))
                .andExpect(jsonPath("$.category.name").value("Streaming"))
                .andExpect(jsonPath("$.amount").value("43.0000"))
                .andExpect(jsonPath("$.currency").value("PLN"))
                .andExpect(jsonPath("$.billingPeriod").value("MONTHLY"))
                .andExpect(jsonPath("$.nextBillingOn").value("2026-09-03"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.notes").value((Object) null))
                .andExpect(jsonPath("$.monthlyAmount").value("43.0000"))
                .andExpect(jsonPath("$.createdAt").isString())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Location", matchesPattern("/api/subscriptions/\\d+")));
    }

    @Test
    void createWithMissingFieldsIs400() throws Exception {
        mockMvc.perform(post("/api/subscriptions").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Netflix\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"));
    }

    @Test
    void createWithUnknownBillingPeriodIs400() throws Exception {
        mockMvc.perform(post("/api/subscriptions").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Netflix", streaming.getId()).replace("MONTHLY", "FORTNIGHTLY")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createWithCategoryFromAnotherProfileIs404() throws Exception {
        mockMvc.perform(post("/api/subscriptions").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Netflix", otherCategory.getId())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/not-found"));
    }

    @Test
    void createWithTakenNameIs409() throws Exception {
        netflix();
        mockMvc.perform(post("/api/subscriptions").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Netflix", streaming.getId())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/subscription-name-taken"));
    }

    @Test
    void sameNameInAnotherProfileIsFine() throws Exception {
        fixtures.subscription(otherProfile, otherCategory, "Netflix", "10", "EUR",
                BillingPeriod.MONTHLY, SEP_3, SubscriptionStatus.ACTIVE);
        mockMvc.perform(post("/api/subscriptions").with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Netflix", streaming.getId())))
                .andExpect(status().isCreated());
    }

    @Test
    void createWithoutActiveProfileIs409() throws Exception {
        mockMvc.perform(post("/api/subscriptions").with(fixtures.as(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Netflix", streaming.getId())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }

    @Test
    void unauthenticatedIs401() throws Exception {
        mockMvc.perform(get("/api/subscriptions"))
                .andExpect(status().isUnauthorized());
    }

    // ---------------------------------------------------------------- GET list

    @Test
    void listDefaultsToActiveAndPausedSortedByNextBillingThenId() throws Exception {
        Subscription later = fixtures.subscription(profile, streaming, "Gym", "100", "PLN",
                BillingPeriod.MONTHLY, SEP_3.plusDays(5), SubscriptionStatus.PAUSED);
        Subscription sooner = netflix();
        fixtures.subscription(profile, streaming, "Old Paper", "20", "PLN",
                BillingPeriod.MONTHLY, SEP_3, SubscriptionStatus.CANCELLED);

        mockMvc.perform(get("/api/subscriptions").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id").value(contains(
                        sooner.getId().intValue(), later.getId().intValue())));
    }

    @Test
    void listWithExplicitStatusFilters() throws Exception {
        netflix();
        Subscription cancelled = fixtures.subscription(profile, streaming, "Old Paper", "20", "PLN",
                BillingPeriod.MONTHLY, SEP_3, SubscriptionStatus.CANCELLED);

        mockMvc.perform(get("/api/subscriptions").param("status", "CANCELLED").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id").value(contains(cancelled.getId().intValue())))
                .andExpect(jsonPath("$[0].status").value("CANCELLED"));
    }

    @Test
    void listWithUnknownStatusIs400() throws Exception {
        mockMvc.perform(get("/api/subscriptions").param("status", "SLEEPING").with(fixtures.in(profile)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-request"));
    }

    @Test
    void listDoesNotLeakOtherProfiles() throws Exception {
        fixtures.subscription(otherProfile, otherCategory, "Their Netflix", "10", "EUR",
                BillingPeriod.MONTHLY, SEP_3, SubscriptionStatus.ACTIVE);
        mockMvc.perform(get("/api/subscriptions").with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    // ---------------------------------------------------------------- GET one

    @Test
    void getReturnsSubscription() throws Exception {
        Subscription subscription = netflix();
        mockMvc.perform(get("/api/subscriptions/{id}", subscription.getId()).with(fixtures.in(profile)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(subscription.getId()))
                .andExpect(jsonPath("$.monthlyAmount").value("43.0000"));
    }

    @Test
    void getFromAnotherProfileIs404() throws Exception {
        Subscription theirs = fixtures.subscription(otherProfile, otherCategory, "Their Netflix", "10", "EUR",
                BillingPeriod.MONTHLY, SEP_3, SubscriptionStatus.ACTIVE);
        mockMvc.perform(get("/api/subscriptions/{id}", theirs.getId()).with(fixtures.in(profile)))
                .andExpect(status().isNotFound());
    }

    @Test
    void getUnknownIdIs404() throws Exception {
        mockMvc.perform(get("/api/subscriptions/999").with(fixtures.in(profile)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("/errors/not-found"));
    }

    // ---------------------------------------------------------------- PUT

    @Test
    void updateReplacesAllFieldsIncludingStatus() throws Exception {
        Subscription subscription = netflix();
        mockMvc.perform(put("/api/subscriptions/{id}", subscription.getId()).with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody("Netflix Premium", streaming.getId(), "PAUSED")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Netflix Premium"))
                .andExpect(jsonPath("$.amount").value("50.0000"))
                .andExpect(jsonPath("$.billingPeriod").value("YEARLY"))
                .andExpect(jsonPath("$.nextBillingOn").value("2027-01-01"))
                .andExpect(jsonPath("$.status").value("PAUSED"))
                .andExpect(jsonPath("$.notes").value("annual plan"))
                .andExpect(jsonPath("$.monthlyAmount").value("4.1667")); // 50 / 12
    }

    @Test
    void updateWithoutStatusIs400() throws Exception {
        Subscription subscription = netflix();
        mockMvc.perform(put("/api/subscriptions/{id}", subscription.getId()).with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Netflix", streaming.getId())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/validation-failed"))
                .andExpect(jsonPath("$.errors[0].field").value("status"));
    }

    @Test
    void updateRenamingToItsOwnNameIsNotACollision() throws Exception {
        Subscription subscription = netflix();
        mockMvc.perform(put("/api/subscriptions/{id}", subscription.getId()).with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody("Netflix", streaming.getId(), "ACTIVE")))
                .andExpect(status().isOk());
    }

    @Test
    void updateRenamingToAnotherSubscriptionsNameIs409() throws Exception {
        fixtures.subscription(profile, streaming, "Gym", "100", "PLN",
                BillingPeriod.MONTHLY, SEP_3, SubscriptionStatus.ACTIVE);
        Subscription subscription = netflix();
        mockMvc.perform(put("/api/subscriptions/{id}", subscription.getId()).with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody("Gym", streaming.getId(), "ACTIVE")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/subscription-name-taken"));
    }

    @Test
    void updateWithCategoryFromAnotherProfileIs404() throws Exception {
        Subscription subscription = netflix();
        mockMvc.perform(put("/api/subscriptions/{id}", subscription.getId()).with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody("Netflix", otherCategory.getId(), "ACTIVE")))
                .andExpect(status().isNotFound());
    }

    @Test
    void updateSubscriptionFromAnotherProfileIs404() throws Exception {
        Subscription theirs = fixtures.subscription(otherProfile, otherCategory, "Their Netflix", "10", "EUR",
                BillingPeriod.MONTHLY, SEP_3, SubscriptionStatus.ACTIVE);
        mockMvc.perform(put("/api/subscriptions/{id}", theirs.getId()).with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody("Their Netflix", streaming.getId(), "ACTIVE")))
                .andExpect(status().isNotFound());
    }

    // ---------------------------------------------------------------- DELETE

    @Test
    void deleteReturns204AndClearsLinkedTransactionsSubscriptionId() throws Exception {
        Subscription subscription = fixtures.subscription(profile, streaming, "Netflix", "43", "PLN",
                BillingPeriod.MONTHLY, LocalDate.of(2026, 8, 1), SubscriptionStatus.ACTIVE);
        // a posted charge linked to it (via the charge job's constructor path)
        fixtures.chargeTransaction(profile, streaming, "43", "PLN", LocalDate.of(2026, 8, 1), subscription);

        mockMvc.perform(delete("/api/subscriptions/{id}", subscription.getId()).with(fixtures.in(profile)))
                .andExpect(status().isNoContent());

        // history is kept, just unlinked (ON DELETE SET NULL)
        mockMvc.perform(get("/api/transactions").with(fixtures.in(profile)))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].subscriptionId").value((Object) null));
    }

    @Test
    void deleteFromAnotherProfileIs404() throws Exception {
        Subscription theirs = fixtures.subscription(otherProfile, otherCategory, "Their Netflix", "10", "EUR",
                BillingPeriod.MONTHLY, SEP_3, SubscriptionStatus.ACTIVE);
        mockMvc.perform(delete("/api/subscriptions/{id}", theirs.getId()).with(fixtures.in(profile)))
                .andExpect(status().isNotFound());
    }
}
