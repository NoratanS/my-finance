package com.myfinance.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.myfinance.backend.model.Profile;
import com.myfinance.backend.model.User;
import com.myfinance.backend.support.IntegrationTest;
import com.myfinance.backend.support.PlanExecutorDouble;
import com.myfinance.backend.support.TestFixtures;

import tools.jackson.databind.JsonNode;

/**
 * POST /api/insights/execute against {@link PlanExecutorDouble} (docs/API.md "Insights"), started
 * before the Spring context is built and pointed at by analytics.base-url — no test here needs the
 * real Python service. Every executor answer asserted here is read from a recorded exchange.
 */
@IntegrationTest
class InsightExecuteControllerTest {

    private static final String PLAN = """
            {"version": 1, "metric": "spend", "filters": {}, "groupBy": null,
             "interval": "month", "range": {"type": "lastMonths", "n": 12}}
            """;

    @RegisterExtension
    static final PlanExecutorDouble EXECUTOR = PlanExecutorDouble.start();

    private static final PlanExecutorDouble.Exchange TIMESERIES = EXECUTOR.exchange("executes-a-monthly-timeseries");
    private static final PlanExecutorDouble.Exchange UNKNOWN_CATEGORY =
            EXECUTOR.exchange("rejects-an-unknown-category");
    private static final PlanExecutorDouble.Exchange VERSION_7 = EXECUTOR.exchange("rejects-an-unsupported-version");
    private static final PlanExecutorDouble.Exchange SMUGGLED_PROFILE_ID =
            EXECUTOR.exchange("rejects-a-profile-id-inside-the-plan");

    // The token too, so an ANALYTICS_TOKEN exported in the developer's shell cannot break the tests.
    @DynamicPropertySource
    static void analytics(DynamicPropertyRegistry registry) {
        registry.add("analytics.base-url", EXECUTOR::baseUrl);
        registry.add("analytics.token", () -> PlanExecutorDouble.TOKEN);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    private User user;
    private Profile profile;

    @BeforeEach
    void setUp() {
        user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
    }

    @Test
    void executeReturnsTheEnvelopeVerbatim() throws Exception {
        mockMvc.perform(post("/api/insights/execute")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(TIMESERIES.plan().toString()))
                .andExpect(status().isOk())
                // Byte-for-byte: "passed through verbatim" is the contract, not "equivalent JSON".
                .andExpect(content().string(TIMESERIES.body()))
                .andExpect(jsonPath("$.results[0].points[0].value").value("0.0000"));
    }

    @Test
    void executeForwardsTheSessionProfileAndThePlan() throws Exception {
        mockMvc.perform(post("/api/insights/execute")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(TIMESERIES.plan().toString()))
                .andExpect(status().isOk());

        JsonNode sent = EXECUTOR.receivedRequests().getFirst();
        assertThat(sent.path("profileId").asLong()).isEqualTo(profile.getId());
        assertThat(sent.path("plan")).isEqualTo(TIMESERIES.plan());
    }

    @Test
    void aProfileIdSmuggledIntoThePlanIsNeitherTrustedNorAccepted() throws Exception {
        mockMvc.perform(post("/api/insights/execute")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(SMUGGLED_PROFILE_ID.plan().toString()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-plan"))
                .andExpect(jsonPath("$.problems").value(SMUGGLED_PROFILE_ID.problems()));

        // The security fact: scoping comes from the session, whatever the plan carries.
        JsonNode sent = EXECUTOR.receivedRequests().getFirst();
        assertThat(sent.path("profileId").asLong()).isEqualTo(profile.getId());
    }

    @Test
    void executeWithANonObjectBodyIs400InvalidPlanWithoutCallingAnalytics() throws Exception {
        mockMvc.perform(post("/api/insights/execute")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[1, 2]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-plan"))
                .andExpect(jsonPath("$.problems", contains("plan: must be a JSON object")));

        assertThat(EXECUTOR.receivedRequests()).isEmpty();
    }

    @Test
    void anExecutorRejectionIs400WithTheProblemsPassedThrough() throws Exception {
        mockMvc.perform(post("/api/insights/execute")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(UNKNOWN_CATEGORY.plan().toString()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("/errors/invalid-plan"))
                .andExpect(jsonPath("$.problems").value(UNKNOWN_CATEGORY.problems()));
    }

    @Test
    void anUnsupportedVersionIsTheExecutorsRejection() throws Exception {
        // D7: the backend does not know the version set; it forwards and reports what comes back.
        mockMvc.perform(post("/api/insights/execute")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VERSION_7.plan().toString()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.problems").value(VERSION_7.problems()));
    }

    @Test
    void executeWithoutActiveProfileIs409() throws Exception {
        mockMvc.perform(post("/api/insights/execute")
                        .with(fixtures.as(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PLAN))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("/errors/no-active-profile"));
    }

    @Test
    void unauthenticatedIs401() throws Exception {
        // A CSRF token is supplied so this exercises the authentication check, not the CSRF
        // gate: TestFixtures.csrf() exists precisely for unauthenticated mutating requests
        // (see AuthControllerTest's register/login tests) since CSRF is checked before auth.
        mockMvc.perform(post("/api/insights/execute")
                        .with(TestFixtures.csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PLAN))
                .andExpect(status().isUnauthorized());
    }
}
