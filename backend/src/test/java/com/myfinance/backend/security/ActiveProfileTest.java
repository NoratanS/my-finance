package com.myfinance.backend.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.params.provider.Arguments.arguments;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.function.Function;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.session.Session;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.myfinance.backend.model.Category;
import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.TransactionType;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.TestFixtures;

/**
 * The active profile is re-verified every time a request uses it (docs/API.md "Active profile:
 * server-side, never client-supplied"). A session whose stored profile no longer resolves to one
 * of the user's profiles — deleted from another session, or someone else's — is in the same state
 * as a session with no profile selected: {@code 409 no-active-profile}, and the stored id is
 * forgotten. Every row is created before the profile is deleted.
 */
@IntegrationTest
class ActiveProfileTest {

    private static final String PLAN = """
            {"version": 1, "metric": "spend", "filters": {}, "groupBy": null,
             "interval": "month", "range": {"type": "lastMonths", "n": 12}}
            """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    private User user;
    private Profile personal;
    private Profile business;
    private Category groceries;

    @BeforeEach
    void setUp() {
        user = fixtures.user("chris@example.com");
        personal = fixtures.profile(user, "Personal", "PLN");
        business = fixtures.profile(user, "Business", "EUR"); // deleting the only profile is refused
        groceries = fixtures.category(personal, null, "Groceries");
    }

    /** Session A (on Business) deletes Personal, which other sessions still have selected. */
    private void deletePersonalFromAnotherSession() throws Exception {
        mockMvc.perform(delete("/api/profiles/{id}", personal.getId()).with(fixtures.in(business)))
                .andExpect(status().isNoContent());
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder, String body) {
        return builder.contentType(MediaType.APPLICATION_JSON).content(body);
    }

    /** A read and a write of every profile-scoped resource; each takes the id of a Category of the deleted profile. */
    static Stream<Arguments> profileScopedRequests() {
        return Stream.of(
                arguments("category list", request(id -> get("/api/categories"))),
                arguments("category create", request(id -> json(post("/api/categories"), "{\"name\":\"Rent\"}"))),
                arguments("transaction list", request(id -> get("/api/transactions"))),
                arguments("transaction create", request(id -> json(post("/api/transactions"), """
                                {"categoryId": %d, "amount": "34.99", "currency": "PLN", "type": "EXPENSE",
                                 "occurredOn": "2026-09-01", "description": null}
                                """.formatted(id)))),
                arguments("budget list", request(id -> get("/api/budgets"))),
                arguments("budget create", request(id -> json(post("/api/budgets"), """
                                {"categoryId": %d, "amountLimit": "500", "currency": "PLN",
                                 "periodStart": "2026-09-01", "periodEnd": "2026-09-30"}
                                """.formatted(id)))),
                arguments("subscription list", request(id -> get("/api/subscriptions"))),
                arguments("subscription dashboard", request(id -> get("/api/subscriptions/dashboard"))),
                arguments("subscription create", request(id -> json(post("/api/subscriptions"), """
                                {"name": "Netflix", "categoryId": %d, "amount": "43.00", "currency": "PLN",
                                 "billingPeriod": "MONTHLY", "nextBillingOn": "2026-09-03", "notes": null}
                                """.formatted(id)))),
                arguments("insight list", request(id -> get("/api/insights"))),
                arguments("insight create", request(id -> json(post("/api/insights"), """
                                {"name": "Spend", "plan": %s, "viz": null, "pinned": false}
                                """.formatted(PLAN)))),
                arguments("insight execute", request(id -> json(post("/api/insights/execute"), PLAN))));
    }

    /** Only here to give the lambdas in {@link #profileScopedRequests} a target type. */
    private static Function<Long, MockHttpServletRequestBuilder> request(
            Function<Long, MockHttpServletRequestBuilder> request) {
        return request;
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("profileScopedRequests")
    void requestInASessionWhoseProfileWasDeletedElsewhereIs409NoActiveProfile(
            String label, Function<Long, MockHttpServletRequestBuilder> request) throws Exception {
        deletePersonalFromAnotherSession();

        mockMvc.perform(request.apply(groceries.getId()).with(fixtures.in(personal)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }

    @Test
    void theDanglingSelectionIsForgottenButTheSessionIsKept() throws Exception {
        String session = fixtures.createSessionWithActiveProfile(personal.getId());
        deletePersonalFromAnotherSession();

        mockMvc.perform(get("/api/transactions")
                        .with(fixtures.withSession(session))
                        .with(fixtures.as(user)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));

        Session stored = fixtures.findSession(session);
        assertThat(stored).isNotNull();
        assertThat(stored.<Long>getAttribute(ActiveProfile.SESSION_KEY)).isNull();
    }

    /** Unreachable through the API (the switch checks ownership), but a session must never be trusted on its own. */
    @Test
    void aSessionNamingAnotherUsersProfileIs409AndSeesNoneOfItsRows() throws Exception {
        User mallory = fixtures.user("mallory@example.com");
        Profile theirs = fixtures.profile(mallory, "Personal", "PLN");
        Category theirCategory = fixtures.category(theirs, null, "Secrets");
        fixtures.transaction(
                theirs,
                theirCategory,
                "999.00",
                "PLN",
                TransactionType.EXPENSE,
                LocalDate.of(2026, 9, 1),
                "mallory's private spend",
                null);
        String session = fixtures.createSessionWithActiveProfile(theirs.getId());

        mockMvc.perform(get("/api/transactions")
                        .with(fixtures.withSession(session))
                        .with(fixtures.as(user)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"))
                .andExpect(content().string(not(containsString("mallory's private spend"))));

        assertThat(fixtures.findSession(session).<Long>getAttribute(ActiveProfile.SESSION_KEY))
                .isNull();
    }

    @Test
    void aValidActiveProfileIsServedAndKept() throws Exception {
        String session = fixtures.createSessionWithActiveProfile(personal.getId());

        mockMvc.perform(get("/api/categories")
                        .with(fixtures.withSession(session))
                        .with(fixtures.as(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Groceries"));

        assertThat(fixtures.findSession(session).<Long>getAttribute(ActiveProfile.SESSION_KEY))
                .isEqualTo(personal.getId());
    }
}
