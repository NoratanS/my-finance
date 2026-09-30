package com.myfinance.backend.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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

/**
 * The degraded path: analytics is simply not running (docs/API.md "POST /api/insights/execute").
 * analytics.base-url points at a port nothing listens on, so the connection is refused.
 */
@IntegrationTest
class InsightExecuteUnavailableTest {

    private static final String PLAN = "{\"version\": 1, \"metric\": \"spend\"}";
    private static final String UNREACHABLE = PlanExecutorDouble.unreachableBaseUrl();

    @DynamicPropertySource
    static void analyticsBaseUrl(DynamicPropertyRegistry registry) {
        registry.add("analytics.base-url", () -> UNREACHABLE);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TestFixtures fixtures;

    private Profile profile;

    @BeforeEach
    void setUp() {
        User user = fixtures.user("kasia@example.com");
        profile = fixtures.profile(user, "Personal", "PLN");
    }

    @Test
    void executeIs503WhenAnalyticsIsNotRunning() throws Exception {
        mockMvc.perform(post("/api/insights/execute")
                        .with(fixtures.in(profile))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PLAN))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.type").value("/errors/analytics-unavailable"))
                .andExpect(jsonPath("$.title").value("Analytics service unavailable"));
    }
}
